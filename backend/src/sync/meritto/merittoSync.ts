import { getDecryptedCredentials, updateIntegrationStatus } from '../../repositories/integrationsRepo.js';
import {
  upsertMerittoLeads,
  upsertMerittoActivities,
  upsertMerittoPayments,
  applyEnrollmentFromPayments,
  applyEnrollmentFromDisposition,
  type LeadUpsertInput,
} from '../../repositories/merittoRepo.js';
import { listLeadStatusRules } from '../../repositories/leadStatusRulesRepo.js';
import { loadAttributionMaps, resolveAttribution } from '../../repositories/attributionLookupRepo.js';
import { getOrCreateSalesRepsByName } from '../../repositories/salesRepsRepo.js';
import { MerittoClient, type MerittoCredentials } from '../../integrations/meritto/merittoClient.js';
import { transformActivity, transformLead, transformPayment, summarizeCallActivity, buildCallCodeIndex } from '../../integrations/meritto/merittoTransform.js';
import { resolveDispositionStatus } from '../../services/merittoDispositionMap.js';
import { runTrackedSync } from '../syncRunTracker.js';
import { MERITTO_RECONCILIATION_LOOKBACK_DAYS } from '../../config/constants.js';
import { IntegrationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { SyncJobParams } from '../../types/sync.js';
import type { MerittoLead, NormalizedMerittoActivity } from '../../types/meritto.js';

export async function syncMerittoForClient(params: SyncJobParams) {
  return runTrackedSync(
    {
      clientId: params.clientId,
      integrationId: params.integrationId,
      provider: 'meritto',
      runType: params.runType,
      triggeredBy: params.triggeredBy,
    },
    async (counters) => {
      const stored = await getDecryptedCredentials<MerittoCredentials>(params.clientId, 'meritto');
      if (!stored) {
        throw new IntegrationError('meritto', 'No connected Meritto integration for this client', false);
      }

      const client = new MerittoClient(stored.credentials);
      const [rules, attributionMaps] = await Promise.all([
        listLeadStatusRules(params.clientId),
        loadAttributionMaps(params.clientId),
      ]);

      // runType 'backfill' pulls full history (no date filter); 'scheduled'/'manual' pull a
      // reconciliation window that heals any missed updates from the previous N days.
      const lookbackDays = params.lookbackDays ?? MERITTO_RECONCILIATION_LOOKBACK_DAYS;
      const rangeStart = new Date(Date.now() - lookbackDays * 86_400_000);
      const rangeEnd = new Date();
      const fromEpoch = params.runType === 'backfill' ? undefined : Math.floor(rangeStart.getTime() / 1000);
      const toEpoch = params.runType === 'backfill' ? undefined : Math.floor(rangeEnd.getTime() / 1000);

      const allRawLeads: MerittoLead[] = [];
      for await (const page of client.streamLeads(fromEpoch, toEpoch)) {
        allRawLeads.push(...page);
      }
      counters.addFetched(allRawLeads.length);
      logger.info({ clientId: params.clientId, count: allRawLeads.length }, 'Meritto leads fetched');

      // Bulk activity pull (all leads at once, chunked into <=30-day windows by the client -
      // see merittoClient.ts::streamActivities) rather than one API call per lead: this
      // account's activity-by-date-range endpoint returns lead_id per row, so a single pass
      // covers every lead in the window instead of N+1 calls.
      //
      // Deliberate pause before the next call: live-tested, this account's rate limit reacts
      // to sustained request volume, not just a single endpoint - hitting getActivityCodes
      // immediately after a long streamLeads() pagination run 429s even though that endpoint
      // is fine on its own (see merittoClient.ts's BULK_ENDPOINT_RETRY comment).
      await new Promise((resolve) => setTimeout(resolve, 16_000));
      const callCodeIndex = buildCallCodeIndex(await client.getActivityCodes());

      // Same reasoning as the pause above: streamActivities()'s very first request would
      // otherwise fire immediately after getActivityCodes() with zero gap, tripping the
      // same volume-based limit again (live-tested - this exact sequence 429'd twice in a
      // row without this pause).
      await new Promise((resolve) => setTimeout(resolve, 16_000));
      const activitiesByLead = new Map<string, NormalizedMerittoActivity[]>();
      let activityFetchCount = 0;
      for await (const page of client.streamActivities(rangeStart, rangeEnd)) {
        activityFetchCount += page.length;
        for (const raw of page) {
          const normalized = transformActivity(raw, callCodeIndex);
          const existing = activitiesByLead.get(normalized.merittoLeadId);
          if (existing) existing.push(normalized);
          else activitiesByLead.set(normalized.merittoLeadId, [normalized]);
        }
      }
      counters.addFetched(activityFetchCount);
      logger.info({ clientId: params.clientId, count: activityFetchCount }, 'Meritto activities fetched');

      // Resolve owner names -> sales_reps.id up front (batch get-or-create),
      // so the per-lead loop below is pure in-memory mapping.
      // typeof check, not just truthiness: live-tested, this account has at least one lead
      // whose owner field isn't a string (getOrCreateSalesRepsByName expects string[] and
      // calls .trim() on each - a truthy non-string value slipping through crashed the sync).
      const ownerNames = allRawLeads.map((l) => l.owner).filter((n): n is string => typeof n === 'string' && n.length > 0);
      const salesRepIdByName = await getOrCreateSalesRepsByName(params.clientId, ownerNames);

      // Collected alongside leadInputs below so the enrollment-from-disposition pass (further
      // down) doesn't need to re-run transformLead() over every raw lead a second time.
      const enrolledMerittoLeadIds: string[] = [];

      const leadInputs: LeadUpsertInput[] = allRawLeads.map((rawLead) => {
        const normalized = transformLead(rawLead);
        const normalizedActivities = activitiesByLead.get(rawLead.lead_id) ?? [];
        const callSummary = summarizeCallActivity(normalizedActivities);

        const disposition = resolveDispositionStatus(
          {
            sourceDisposition: normalized.sourceDisposition,
            callAttempts: callSummary.callAttempts,
            connected: callSummary.connected,
            dqReasonProvided: normalized.dqReason,
          },
          rules,
        );

        if (disposition.usedFallbackHeuristic) {
          logger.debug(
            { clientId: params.clientId, leadId: rawLead.lead_id, sourceDisposition: normalized.sourceDisposition },
            'Meritto lead disposition resolved via fallback heuristic - no client rule matched',
          );
        }

        const attribution = resolveAttribution(attributionMaps, {
          productCode: normalized.productCode,
          source: normalized.source,
          campaign: normalized.campaign,
          adSet: normalized.adSet,
          creative: normalized.creative,
        });

        const ownerId = normalized.owner ? (salesRepIdByName.get(normalized.owner.trim().toLowerCase()) ?? null) : null;

        if (normalized.sourceDisposition === 'Enrolled') enrolledMerittoLeadIds.push(rawLead.lead_id);

        return { normalized, callSummary, disposition, attribution, ownerId };
      });

      const { idByPlatformId: leadIdMap, counts: leadCounts } = await upsertMerittoLeads(params.clientId, leadInputs);
      counters.addUpsertResult(leadCounts.created, leadCounts.updated);

      const allActivitiesNormalized: NormalizedMerittoActivity[] = allRawLeads.flatMap(
        (rawLead) => activitiesByLead.get(rawLead.lead_id) ?? [],
      );
      const activityCounts = await upsertMerittoActivities(params.clientId, allActivitiesNormalized, leadIdMap);
      counters.addUpsertResult(activityCounts.created, activityCounts.updated);

      // This account doesn't use Meritto's Payments API (see the try/catch below), so nothing
      // else ever sets enrolled_at - but Meritto's own lead_stage carries a real "Enrolled"
      // value, currently only collapsed into the generic 'qualified' status bucket. Use it as
      // the enrollment signal instead: real data, not fabricated. No exact enrollment timestamp
      // exists (same gap as lead creation - see deriveCreatedAtFromLeadAge), so this uses the
      // lead's most recent known activity as the closest real-dated proxy, falling back to this
      // sync's run time ("first observed enrolled on") only when the lead has no activity at
      // all. applyEnrollmentFromDisposition only fills a currently-null enrolled_at, so this
      // never overwrites a manual edit or a future real payments integration.
      const nowIso = new Date().toISOString();
      const enrolledAtCandidates = new Map<string, string>();
      for (const merittoLeadId of enrolledMerittoLeadIds) {
        const leadId = leadIdMap.get(merittoLeadId);
        if (!leadId) continue;
        const activities = activitiesByLead.get(merittoLeadId) ?? [];
        const mostRecentActivityAt = activities.reduce<string | null>(
          (latest, a) => (!latest || a.activityAt > latest ? a.activityAt : latest),
          null,
        );
        enrolledAtCandidates.set(leadId, mostRecentActivityAt ?? nowIso);
      }
      if (enrolledAtCandidates.size > 0) {
        await applyEnrollmentFromDisposition(enrolledAtCandidates);
      }

      // Payments API isn't wired up yet for this account (needs form_id/product_id enumeration
      // - see merittoClient.ts::streamPayments) - failure/emptiness here is non-fatal, it just
      // means enrolled_at/fee_paid stay whatever they already were.
      try {
        const allRawPayments = [];
        for await (const page of client.streamPayments(fromEpoch, toEpoch)) {
          allRawPayments.push(...page);
        }
        counters.addFetched(allRawPayments.length);

        const { counts: paymentCounts, enrolledByLeadUuid } = await upsertMerittoPayments(
          params.clientId,
          allRawPayments.map(transformPayment),
          leadIdMap,
        );
        counters.addUpsertResult(paymentCounts.created, paymentCounts.updated);
        await applyEnrollmentFromPayments(enrolledByLeadUuid);
      } catch (error) {
        logger.warn({ clientId: params.clientId, err: error }, 'Meritto Payments API unavailable or failed - enrollment/revenue not updated this run');
      }

      await updateIntegrationStatus(params.clientId, 'meritto', {
        status: 'connected',
        lastSyncAt: new Date().toISOString(),
      });
    },
  );
}
