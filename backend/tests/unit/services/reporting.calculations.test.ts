import { describe, it, expect } from 'vitest';
import * as calc from '../../../src/services/metricCalculations.js';
import type { LeadRow } from '../../../src/repositories/reportingRepo.js';

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: crypto.randomUUID(),
    created_at: '2026-08-10T05:00:00.000Z',
    course_id: crypto.randomUUID(),
    source: 'meta',
    dqReason: null,
    owner: 'Anjali Rao',
    status: 'qualified',
    call_attempts: 1,
    first_call_at: '2026-08-10T05:30:00.000Z',
    connect_attempt: 1,
    connected: true,
    demo_booked_at: null,
    demo_attended_at: null,
    enrolled_at: null,
    fee_paid: null,
    ...overrides,
  };
}

describe('metricCalculations', () => {
  describe('rates', () => {
    it('computes qualified/junk rate as a fraction of total leads, and 0 with no leads', () => {
      const leads = [makeLead({ status: 'qualified' }), makeLead({ status: 'junk' }), makeLead({ status: 'not_qualified' })];
      expect(calc.qualifiedRate(leads)).toBeCloseTo(1 / 3);
      expect(calc.junkRate(leads)).toBeCloseTo(1 / 3);
      expect(calc.qualifiedRate([])).toBe(0);
    });
  });

  describe('speedToLead', () => {
    it('buckets leads by hours from creation to first call', () => {
      const leads = [
        makeLead({ created_at: '2026-08-10T00:00:00Z', first_call_at: '2026-08-10T00:30:00Z', connected: true }), // <1h
        makeLead({ created_at: '2026-08-10T00:00:00Z', first_call_at: '2026-08-10T02:00:00Z', connected: false }), // 1-4h
        makeLead({ created_at: '2026-08-10T00:00:00Z', first_call_at: '2026-08-10T10:00:00Z', connected: true }), // 4-24h
        makeLead({ created_at: '2026-08-10T00:00:00Z', first_call_at: '2026-08-11T05:00:00Z', connected: false }), // >24h
        makeLead({ created_at: '2026-08-10T00:00:00Z', first_call_at: null }), // never called - excluded
      ];

      const result = calc.speedToLead(leads);
      const byBucket = Object.fromEntries(result.buckets.map((b) => [b.bucket, b]));

      expect(byBucket['<1h']!.leads).toBe(1);
      expect(byBucket['1-4h']!.leads).toBe(1);
      expect(byBucket['4-24h']!.leads).toBe(1);
      expect(byBucket['>24h']!.leads).toBe(1);
      expect(byBucket['<1h']!.connectRate).toBe(1);
      expect(byBucket['1-4h']!.connectRate).toBe(0);
      expect(result.medianHours).not.toBeNull();
      expect(result.neverCalled).toBe(1);
      expect(result.notTimeable).toBe(0);
    });

    it('returns null median when no lead has been called yet', () => {
      const result = calc.speedToLead([makeLead({ first_call_at: null })]);
      expect(result.medianHours).toBeNull();
    });

    it('excludes leads where first_call_at predates created_at, instead of fabricating a <1h bucket entry', () => {
      // Real scenario for this account: created_at is synthesized at midnight UTC from a
      // whole-day lead_age (no true per-lead creation time exists), so a same-day call can look
      // like it happened *before* creation. That's calendar-day imprecision, not a real <1h
      // response - see deriveCreatedAtFromLeadAge in merittoTransform.ts.
      const leads = [
        makeLead({ created_at: '2026-08-10T00:00:00Z', first_call_at: '2026-08-09T18:00:00Z' }), // negative hours
        makeLead({ created_at: '2026-08-10T00:00:00Z', first_call_at: '2026-08-10T02:00:00Z' }), // real 2h, kept
      ];

      const result = calc.speedToLead(leads);
      const totalBucketed = result.buckets.reduce((sum, b) => sum + b.leads, 0);

      expect(totalBucketed).toBe(1);
      expect(result.buckets.find((b) => b.bucket === '<1h')!.leads).toBe(0);
      expect(result.medianHours).toBeCloseTo(2);
      expect(result.notTimeable).toBe(1);
      expect(result.neverCalled).toBe(0);
    });
  });

  describe('uncalledAging', () => {
    it('buckets by age since creation and aggregates a per-owner backlog', () => {
      const now = new Date('2026-08-17T12:00:00.000Z');
      const leads = [
        makeLead({ owner: 'Anjali', created_at: '2026-08-17T06:00:00.000Z' }), // 6h -> <24h
        makeLead({ owner: 'Anjali', created_at: '2026-08-15T06:00:00.000Z' }), // 54h -> >48h
        makeLead({ owner: 'Rahul', created_at: '2026-08-16T00:00:00.000Z' }), // 36h -> 24-48h
        makeLead({ owner: null, created_at: '2026-08-17T00:00:00.000Z' }), // 12h -> <24h, unassigned
      ];

      const result = calc.uncalledAging(leads, now);
      const byBucket = Object.fromEntries(result.buckets.map((b) => [b.bucket, b.leads]));

      expect(byBucket['<24h']).toBe(2);
      expect(byBucket['24-48h']).toBe(1);
      expect(byBucket['>48h']).toBe(1);

      const anjali = result.byOwner.find((o) => o.owner === 'Anjali');
      expect(anjali?.leads).toBe(2);
      expect(result.byOwner.find((o) => o.owner === 'Unassigned')?.leads).toBe(1);
    });
  });

  describe('funnel', () => {
    it('computes each stage as % of total and % of the previous stage', () => {
      const leads = [
        makeLead({ connected: true, status: 'qualified', demo_booked_at: '2026-08-11T00:00:00Z', demo_attended_at: '2026-08-11T01:00:00Z', enrolled_at: '2026-08-12T00:00:00Z' }),
        makeLead({ connected: true, status: 'qualified', demo_booked_at: '2026-08-11T00:00:00Z', demo_attended_at: null, enrolled_at: null }),
        makeLead({ connected: true, status: 'not_qualified', demo_booked_at: null, enrolled_at: null }),
        makeLead({ connected: false, status: 'not_reachable', demo_booked_at: null, enrolled_at: null }),
      ];

      const stages = calc.funnel(leads);
      const byStage = Object.fromEntries(stages.map((s) => [s.stage, s]));

      expect(byStage.leads!.count).toBe(4);
      expect(byStage.connected!.count).toBe(3);
      expect(byStage.connected!.pctOfTotal).toBeCloseTo(0.75);
      expect(byStage.qualified!.count).toBe(2);
      expect(byStage.qualified!.pctOfPrevious).toBeCloseTo(2 / 3);
      expect(byStage.enrolled!.count).toBe(1);
      expect(byStage.enrolled!.pctOfTotal).toBeCloseTo(0.25);
    });

    it('does not divide by zero when there are no leads at all', () => {
      const stages = calc.funnel([]);
      expect(stages.every((s) => s.pctOfTotal === 0)).toBe(true);
      expect(stages[0]!.pctOfPrevious).toBeNull();
    });

    it('caps pctOfPrevious at 100% when a later stage outnumbers an earlier one', () => {
      // Stages are independent flags on a lead (connected/status/demo_*/enrolled_at), not a
      // strictly nested pipeline - a lead can be marked qualified via a disposition rule without
      // `connected` ever being set (e.g. imported already-Warm). With a small enough sample this
      // makes a later stage's raw count exceed the previous stage's, which would otherwise render
      // as a nonsensical >100% "conversion from previous stage".
      const leads = [
        makeLead({ connected: false, status: 'qualified' }),
        makeLead({ connected: false, status: 'qualified' }),
        makeLead({ connected: true, status: 'not_qualified' }),
      ];

      const stages = calc.funnel(leads);
      const byStage = Object.fromEntries(stages.map((s) => [s.stage, s]));

      expect(byStage.connected!.count).toBe(1);
      expect(byStage.qualified!.count).toBe(2);
      expect(byStage.qualified!.pctOfPrevious).toBe(1);
    });
  });

  describe('spend-derived metrics', () => {
    it('returns null (not Infinity) when dividing by zero leads/qualified/enrolled/spend', () => {
      expect(calc.costPerLead(500, 0)).toBeNull();
      expect(calc.costPerQualified(500, 0)).toBeNull();
      expect(calc.costPerEnrollment(500, 0)).toBeNull();
      expect(calc.returnOnAdSpend(1000, 0)).toBeNull();
    });

    it('computes CPL/CPQ/CPE/ROAS normally otherwise', () => {
      expect(calc.costPerLead(1000, 10)).toBe(100);
      expect(calc.costPerQualified(1000, 5)).toBe(200);
      expect(calc.costPerEnrollment(1000, 2)).toBe(500);
      expect(calc.returnOnAdSpend(4000, 1000)).toBe(4);
    });

    it('falls back to the course fee only when fee_paid is null, never overriding an actual amount', () => {
      expect(calc.effectiveFee(75000, 40000)).toBe(75000);
      expect(calc.effectiveFee(null, 40000)).toBe(40000);
      expect(calc.effectiveFee(null, undefined)).toBe(0);
    });
  });

  describe('periodOverPeriodDelta', () => {
    it('computes absolute and percentage delta, with null pct when previous is zero', () => {
      expect(calc.periodOverPeriodDelta(120, 100)).toEqual({ current: 120, previous: 100, deltaAbs: 20, deltaPct: 0.2 });
      expect(calc.periodOverPeriodDelta(10, 0).deltaPct).toBeNull();
    });
  });

  describe('targetPacing', () => {
    it('flags ahead-of-pace when actual exceeds the pro-rated expected value', () => {
      const result = calc.targetPacing({ target: 600, actualMtdLeads: 350, dayOfMonth: 17, daysInMonth: 31, daysRemaining: 14 });
      // expected by day 17 of 31 = 600 * 17/31 ~= 329
      expect(result.expectedByNow).toBeCloseTo(329.03, 1);
      expect(result.aheadBehind).toBeGreaterThan(0);
      expect(result.requiredDailyRunRate).toBeCloseTo((600 - 350) / 14);
    });

    it('required run rate is 0 once the target is already met', () => {
      const result = calc.targetPacing({ target: 600, actualMtdLeads: 650, dayOfMonth: 17, daysInMonth: 31, daysRemaining: 14 });
      expect(result.requiredDailyRunRate).toBe(0);
    });
  });

  describe('cohortConversion', () => {
    it('groups by created-month and computes enrolled-so-far rate per cohort', () => {
      const leads = [
        makeLead({ created_at: '2026-05-01T00:00:00Z', enrolled_at: '2026-05-20T00:00:00Z' }),
        makeLead({ created_at: '2026-05-15T00:00:00Z', enrolled_at: null }),
        makeLead({ created_at: '2026-08-01T00:00:00Z', enrolled_at: null }),
      ];
      const now = new Date('2026-08-17T00:00:00Z');

      const cohorts = calc.cohortConversion(leads, 'UTC', now);
      const may = cohorts.find((c) => c.month === '2026-05')!;
      const aug = cohorts.find((c) => c.month === '2026-08')!;

      expect(may.leads).toBe(2);
      expect(may.enrolledRate).toBeCloseTo(0.5);
      expect(may.maturity).toBe('matured'); // 3 months old
      expect(aug.maturity).toBe('still_maturing'); // same month
    });
  });

  describe('leadQualityBreakdown', () => {
    it('counts every one of the five statuses, even ones with zero leads', () => {
      const leads = [
        makeLead({ status: 'qualified' }),
        makeLead({ status: 'qualified' }),
        makeLead({ status: 'junk' }),
      ];
      const buckets = calc.leadQualityBreakdown(leads);

      expect(buckets).toHaveLength(5);
      const qualified = buckets.find((b) => b.status === 'qualified')!;
      expect(qualified.count).toBe(2);
      expect(qualified.pctOfTotal).toBeCloseTo(2 / 3);
      expect(buckets.find((b) => b.status === 'uncalled')!.count).toBe(0);
    });
  });

  describe('disqualificationReasons', () => {
    it('counts not_qualified leads with a reason, grouped by that reason', () => {
      const leads = [
        makeLead({ status: 'not_qualified', dqReason: "Can't afford" }),
        makeLead({ status: 'not_qualified', dqReason: "Can't afford" }),
        makeLead({ status: 'not_qualified', dqReason: 'Not eligible' }),
        makeLead({ status: 'not_qualified', dqReason: null }), // no reason logged - excluded
        makeLead({ status: 'qualified', dqReason: null }), // wrong status - excluded even if it somehow had a reason
      ];

      const reasons = calc.disqualificationReasons(leads);

      expect(reasons[0]).toEqual({ reason: "Can't afford", count: 2, pctOfDisqualified: 2 / 3 });
      expect(reasons[1]).toEqual({ reason: 'Not eligible', count: 1, pctOfDisqualified: 1 / 3 });
      expect(reasons).toHaveLength(2);
    });

    it('also counts junk leads with a reason, not just not_qualified', () => {
      // merittoDispositionMap.ts assigns a dqReason to both not_qualified and junk statuses
      // (junk = call attempts exhausted without ever connecting) - excluding junk here
      // undercounted real disqualifications and skewed the shown percentages.
      const leads = [
        makeLead({ status: 'not_qualified', dqReason: 'Not eligible' }),
        makeLead({ status: 'junk', dqReason: 'Unreachable' }),
        makeLead({ status: 'junk', dqReason: 'Unreachable' }),
        makeLead({ status: 'not_reachable', dqReason: 'Unreachable' }), // wrong status - excluded
      ];

      const reasons = calc.disqualificationReasons(leads);

      expect(reasons).toContainEqual({ reason: 'Unreachable', count: 2, pctOfDisqualified: 2 / 3 });
      expect(reasons).toContainEqual({ reason: 'Not eligible', count: 1, pctOfDisqualified: 1 / 3 });
      expect(reasons).toHaveLength(2);
    });

    it('never invents a reason vocabulary - only reasons actually present in the data appear', () => {
      const reasons = calc.disqualificationReasons([makeLead({ status: 'not_qualified', dqReason: 'Timing' })]);
      expect(reasons.map((r) => r.reason)).toEqual(['Timing']);
    });
  });

  describe('followUpDepth', () => {
    it('buckets by connect_attempt, treats a lead who never connected (with real call attempts) separately, and surfaces zero-call-attempt leads as noActivity instead of dropping them', () => {
      const leads = [
        makeLead({ call_attempts: 1, connect_attempt: 1, connected: true }),
        makeLead({ call_attempts: 2, connect_attempt: 2, connected: true }),
        makeLead({ call_attempts: 3, connect_attempt: null, connected: false }),
        makeLead({ call_attempts: 0, connect_attempt: null, connected: false }), // never called - now counted as noActivity, not dropped
      ];

      const result = calc.followUpDepth(leads);

      expect(result.byAttempt[1]).toBe(1);
      expect(result.byAttempt[2]).toBe(1);
      expect(result.neverConnected).toBe(1);
      expect(result.noActivity).toBe(1);
    });

    it('folds a connect_attempt of 5 or more into a single 5+ bucket instead of dropping the lead', () => {
      // Previously: a connected lead with connect_attempt >= 5 matched neither the fixed 1-4
      // range check nor the neverConnected branch (`!lead.connected` is false for them), so they
      // silently vanished from the widget's total - not double-counted, not undercounted
      // visibly, just gone.
      const leads = [
        makeLead({ call_attempts: 7, connect_attempt: 7, connected: true }),
        makeLead({ call_attempts: 5, connect_attempt: 5, connected: true }),
        makeLead({ call_attempts: 2, connect_attempt: 2, connected: true }),
      ];

      const result = calc.followUpDepth(leads);
      const total = Object.values(result.byAttempt).reduce((sum, n) => sum + n, 0) + result.neverConnected;

      expect(total).toBe(3);
      expect(result.byAttempt[5]).toBe(2);
      expect(result.byAttempt[2]).toBe(1);
    });
  });

  describe('salesTeamBreakdown', () => {
    it('computes per-owner assigned/connected/qualified/enrolled from ranged leads, and uncalled>24h from the live queue', () => {
      const now = new Date('2026-08-17T12:00:00.000Z');
      const ranged = [
        makeLead({ owner: 'Anjali', connected: true, status: 'qualified', enrolled_at: '2026-08-11T00:00:00Z' }),
        makeLead({ owner: 'Anjali', connected: false, status: 'not_reachable' }),
        makeLead({ owner: 'Rahul', connected: true, status: 'qualified' }),
      ];
      const uncalled = [
        makeLead({ owner: 'Anjali', created_at: '2026-08-15T00:00:00.000Z', call_attempts: 0 }), // 60h old -> counts
        makeLead({ owner: 'Anjali', created_at: '2026-08-17T11:00:00.000Z', call_attempts: 0 }), // 1h old -> doesn't count
      ];

      const rows = calc.salesTeamBreakdown(ranged, uncalled, now);
      const anjali = rows.find((r) => r.owner === 'Anjali')!;

      expect(anjali.leadsAssigned).toBe(2);
      expect(anjali.connected).toBe(1);
      expect(anjali.qualified).toBe(1);
      expect(anjali.enrolled).toBe(1);
      expect(anjali.uncalledOver24h).toBe(1);
      expect(anjali.leadToEnrolmentRate).toBeCloseTo(0.5);
    });

    it('sorts by lead-to-enrolment rate, best first', () => {
      const ranged = [
        makeLead({ owner: 'Low', enrolled_at: null }),
        makeLead({ owner: 'Low', enrolled_at: null }),
        makeLead({ owner: 'High', enrolled_at: '2026-08-11T00:00:00Z' }),
      ];
      const rows = calc.salesTeamBreakdown(ranged, [], new Date());
      expect(rows[0]!.owner).toBe('High');
    });
  });

  describe('creativeFatigue', () => {
    it('suppresses a fatigue conclusion when either window has fewer than 10 leads', () => {
      const result = calc.creativeFatigue({ leads: 9, qualified: 5 }, { leads: 20, qualified: 10 });
      expect(result.trend).toBe('insufficient_data');
      expect(result.deltaPp).toBeNull();
    });

    it('reports declining when qualified rate drops by 3pp or more', () => {
      const result = calc.creativeFatigue({ leads: 100, qualified: 30 }, { leads: 100, qualified: 40 }); // 30% vs 40%
      expect(result.trend).toBe('declining');
      expect(result.deltaPp).toBeCloseTo(-10);
    });

    it('reports improving when qualified rate rises by 3pp or more', () => {
      const result = calc.creativeFatigue({ leads: 100, qualified: 45 }, { leads: 100, qualified: 30 });
      expect(result.trend).toBe('improving');
    });

    it('reports steady when the delta is within +-3pp', () => {
      const result = calc.creativeFatigue({ leads: 100, qualified: 31 }, { leads: 100, qualified: 30 }); // 1pp delta
      expect(result.trend).toBe('steady');
    });
  });

  describe('arrivalHeatmap', () => {
    it('buckets leads into day-of-week x 3-hour blocks and computes per-cell connect rate', () => {
      const leads = [
        makeLead({ created_at: '2026-08-17T09:15:00.000Z', connected: true }), // Monday, 09:00 block
        makeLead({ created_at: '2026-08-17T09:45:00.000Z', connected: false }),
      ];
      const cells = calc.arrivalHeatmap(leads, 'UTC');
      const cell = cells.find((c) => c.dayOfWeek === 1 && c.blockStartHour === 9)!;

      expect(cell.leads).toBe(2);
      expect(cell.connected).toBe(1);
      expect(cell.connectRate).toBeCloseTo(0.5);
    });

    it('always returns all 7x8 cells, even when empty', () => {
      const cells = calc.arrivalHeatmap([], 'UTC');
      expect(cells.length).toBe(56);
      expect(cells.every((c) => c.leads === 0)).toBe(true);
    });
  });
});
