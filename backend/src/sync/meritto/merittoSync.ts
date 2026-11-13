import { getDecryptedCredentials, updateIntegrationStatus } from '../../repositories/integrationsRepo.js';
import { getClientById } from '../../repositories/clientsRepo.js';
import {
  upsertMerittoLeads,
  upsertMerittoActivities,
  upsertMerittoPayments,
  applyEnrollmentFromPayments,
  applyEnrollmentFromDisposition,
  applyAutoFeeFromCourseMode,
  getPersistedCallActivityHistory,
  getPersistedRegistrationTimestamps,
  type LeadUpsertInput,
} from '../../repositories/merittoRepo.js';
import { listLeadStatusRules } from '../../repositories/leadStatusRulesRepo.js';
import { loadAttributionMaps, resolveAttribution, normalizeCourseMode } from '../../repositories/attributionLookupRepo.js';
import { getOrCreateSalesRepsByName, loadMerittoOwnerNames } from '../../repositories/salesRepsRepo.js';
import { MerittoClient, type MerittoCredentials } from '../../integrations/meritto/merittoClient.js';
import {
  transformActivity,
  transformLead,
  transformPayment,
  summarizeCallActivity,
  buildCallCodeIndex,
  buildRegistrationCodeIndex,
  extractOwnerRef,
} from '../../integrations/meritto/merittoTransform.js';
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
      const [rules, attributionMaps, ownerNameByRef, dbClient] = await Promise.all([
        listLeadStatusRules(params.clientId),
        loadAttributionMaps(params.clientId),
        loadMerittoOwnerNames(params.clientId),
        getClientById(params.clientId),
      ]);
      // lead_age ("N d") counts whole calendar days as Meritto's own UI shows them - i.e. in this
      // client's own timezone, not UTC - see deriveCreatedAtFromLeadAge's doc comment.
      const timezone = dbClient?.timezone ?? 'UTC';

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

      // getActivityCodes (a small, single-call lookup) has been reliable even when the
      // multi-call streamActivities pull below hasn't - fetched up front so its
      // registrationCodeIndex is available for the first (persisted-only) pass too, not just the
      // second. Deliberate pause: live-tested, this account's rate limit reacts to sustained
      // request volume, not just a single endpoint - hitting this immediately after a long
      // streamLeads() pagination run 429s even though the endpoint is fine on its own (see
      // merittoClient.ts's BULK_ENDPOINT_RETRY comment).
      await new Promise((resolve) => setTimeout(resolve, 16_000));
      const activityCodes = await client.getActivityCodes();
      const callCodeIndex = buildCallCodeIndex(activityCodes);
      const registrationCodeIndex = buildRegistrationCodeIndex(activityCodes);

      // call_attempts/first_call_at/connect_attempt/connected must reflect a lead's FULL call
      // history, not just this run's fetch window - a lead last called before the reconciliation
      // window would otherwise have that history silently reset to "never called" below, even
      // though the real activity rows stay correctly in lead_activities the whole time. See
      // summarizeCallActivity's doc comment and getPersistedCallActivityHistory. Fetched from our
      // own DB, not Meritto, so this (and the registration timestamps below) are available even
      // if the Meritto activities pull further down fails.
      const [persistedCallHistory, persistedRegistrationTimestamps] = await Promise.all([
        getPersistedCallActivityHistory(params.clientId),
        getPersistedRegistrationTimestamps(params.clientId, registrationCodeIndex),
      ]);

      // Resolve owner ids -> real names (meritto_owner_names) -> sales_reps.id up front (batch
      // get-or-create), so the per-lead loop below is pure in-memory mapping. An owner id with no
      // matching row in meritto_owner_names resolves to no name here - see loadMerittoOwnerNames -
      // that lead's ownerId just stays unset rather than a sales rep getting invented from a raw id.
      const ownerNames = allRawLeads
        .map((l) => extractOwnerRef(l.owner))
        .map((ref) => (ref ? ownerNameByRef.get(ref) : undefined))
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      const salesRepIdByName = await getOrCreateSalesRepsByName(params.clientId, ownerNames);

      /**
       * Builds this run's lead upsert rows from whatever fresh activity data is available right
       * now - called twice: once immediately with an empty map (activitiesByLead), so leads land
       * with at least the persisted call/registration history even if the fresh Meritto
       * activities pull below fails entirely, then again with the fresh pull merged in if it
       * succeeds, to upgrade call_attempts/createdAtSource with anything new this run found.
       */
      function buildLeadInputs(activitiesByLead: Map<string, NormalizedMerittoActivity[]>): { leadInputs: LeadUpsertInput[]; enrolledMerittoLeadIds: string[] } {
        const enrolledMerittoLeadIds: string[] = [];
        const leadInputs = allRawLeads.map((rawLead) => {
          const normalized = transformLead(rawLead, timezone);
          const normalizedActivities = activitiesByLead.get(rawLead.lead_id) ?? [];

          const freshRegistration = normalizedActivities.find((a) => registrationCodeIndex.has(a.raw.activity_code));
          const registrationAt = freshRegistration?.activityAt ?? persistedRegistrationTimestamps.get(rawLead.lead_id);
          if (registrationAt) normalized.createdAtSource = registrationAt;

          const callActivityById = new Map<string, Pick<NormalizedMerittoActivity, 'activityType' | 'activityAt' | 'disposition'>>();
          for (const a of persistedCallHistory.get(rawLead.lead_id) ?? []) {
            callActivityById.set(a.merittoActivityId, { activityType: 'call', activityAt: a.activityAt, disposition: a.disposition });
          }
          for (const a of normalizedActivities) {
            if (a.merittoActivityId) callActivityById.set(a.merittoActivityId, a);
          }
          const callSummary = summarizeCallActivity([...callActivityById.values()]);

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

          const ownerName = normalized.ownerRef ? (ownerNameByRef.get(normalized.ownerRef) ?? null) : null;
          const ownerId = ownerName ? (salesRepIdByName.get(ownerName.trim().toLowerCase()) ?? null) : null;

          if (normalized.sourceDisposition === 'Enrolled') enrolledMerittoLeadIds.push(rawLead.lead_id);

          return { normalized, callSummary, disposition, attribution, ownerId };
        });
        return { leadInputs, enrolledMerittoLeadIds };
      }

      // First pass: persisted history only, no fresh Meritto activities yet - guarantees this
      // run's leads (new ones, and anything re-attributed/re-staged) land with at least the
      // timezone-correct day-level timestamp and whatever call/registration history we already
      // had, even if the activities pull below fails.
      const firstPass = buildLeadInputs(new Map());
      const { idByPlatformId: firstPassLeadIdMap, counts: firstPassCounts } = await upsertMerittoLeads(params.clientId, firstPass.leadInputs);
      counters.addUpsertResult(firstPassCounts.created, firstPassCounts.updated);
      logger.info({ clientId: params.clientId, count: firstPass.leadInputs.length }, 'Meritto leads upserted (first pass, persisted history only)');

      let leadIdMap = firstPassLeadIdMap;
      let enrolledMerittoLeadIds = firstPass.enrolledMerittoLeadIds;
      let finalLeadInputs = firstPass.leadInputs;
      let activitiesByLead = new Map<string, NormalizedMerittoActivity[]>();

      // Second pass: best-effort. A failure here (this account's activity-by-date-range endpoint
      // has live-confirmed intermittent connectivity issues under sustained sessions) no longer
      // loses the leads just upserted above - it just means this run didn't get the freshest
      // call/registration data, same as it already behaves for an old lead outside the
      // reconciliation window. counters.addFailed() marks the run 'partial' rather than a silent
      // 'success' that hides the incomplete enrichment.
      try {
        // Bulk activity pull (all leads at once, chunked into <=30-day windows by the client -
        // see merittoClient.ts::streamActivities) rather than one API call per lead: this
        // account's activity-by-date-range endpoint returns lead_id per row, so a single pass
        // covers every lead in the window instead of N+1 calls. activityCodes/registrationCodeIndex
        // were already fetched above (before the first pass), so this just needs its own pacing
        // pause before hitting the endpoint - streamActivities()'s very first request firing
        // immediately after another bulk call trips this account's volume-based rate limit
        // (live-tested - see merittoClient.ts's BULK_ENDPOINT_RETRY comment).
        await new Promise((resolve) => setTimeout(resolve, 16_000));
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

        const secondPass = buildLeadInputs(activitiesByLead);
        enrolledMerittoLeadIds = secondPass.enrolledMerittoLeadIds;
        finalLeadInputs = secondPass.leadInputs;

        const { idByPlatformId: secondPassLeadIdMap, counts: secondPassCounts } = await upsertMerittoLeads(params.clientId, secondPass.leadInputs);
        leadIdMap = secondPassLeadIdMap;
        counters.addUpsertResult(secondPassCounts.created, secondPassCounts.updated);

        const allActivitiesNormalized: NormalizedMerittoActivity[] = allRawLeads.flatMap(
          (rawLead) => activitiesByLead.get(rawLead.lead_id) ?? [],
        );
        const activityCounts = await upsertMerittoActivities(params.clientId, allActivitiesNormalized, leadIdMap);
        counters.addUpsertResult(activityCounts.created, activityCounts.updated);
      } catch (error) {
        counters.addFailed();
        activitiesByLead = new Map();
        logger.warn(
          { clientId: params.clientId, err: error },
          'Meritto activities pull failed - leads from this run were still saved (first pass, persisted history only); run marked partial',
        );
      }

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
      const newlyEnrolledLeadIds = enrolledAtCandidates.size > 0 ? await applyEnrollmentFromDisposition(enrolledAtCandidates) : new Set<string>();

      // Mode-aware fee, scoped to leads genuinely enrolling for the first time just now
      // (newlyEnrolledLeadIds, not every currently-"Enrolled" lead this run resubmits) per the
      // client's explicit "today onward" framing - never backfilled onto a lead that already
      // enrolled before this logic existed. Only EA/CPA have Online/Offline variants configured
      // (modeFeeByCode); National EA Program and anything else just use their course's own flat
      // fee via the existing effectiveFee() fallback, unaffected by this.
      const leadInputByMerittoId = new Map(finalLeadInputs.map((li) => [li.normalized.merittoLeadId, li]));
      const feeCandidates = new Map<string, number>();
      for (const merittoLeadId of enrolledMerittoLeadIds) {
        const leadId = leadIdMap.get(merittoLeadId);
        if (!leadId || !newlyEnrolledLeadIds.has(leadId)) continue;
        const input = leadInputByMerittoId.get(merittoLeadId);
        if (!input) continue;
        const courseCode = input.attribution.courseId ? attributionMaps.courseCodeById.get(input.attribution.courseId) : undefined;
        if (!courseCode) continue;
        const mode = normalizeCourseMode(input.normalized.courseMode);
        if (!mode) continue;
        const fee = attributionMaps.modeFeeByCode.get(courseCode)?.get(mode);
        if (fee !== undefined) feeCandidates.set(leadId, fee);
      }
      if (feeCandidates.size > 0) {
        await applyAutoFeeFromCourseMode(feeCandidates);
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
