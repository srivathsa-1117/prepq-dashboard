import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression guard for the "today onward" guarantee: the mode-aware auto-fee added 2026-11-13 must
 * only ever apply to a lead the exact moment it's FIRST observed enrolled, never retroactively onto
 * a lead that already enrolled before this logic existed (even if that older lead's fee_paid
 * happens to still be null). applyEnrollmentFromDisposition's returned set is how the sync tells
 * "genuinely enrolling right now" apart from "already enrolled, this update was a no-op" - see
 * sync/meritto/merittoSync.ts's use of it.
 */

const mocks = vi.hoisted(() => {
  const updateCalls: Array<{ leadId: string; guardColumn: string; guardValue: unknown }> = [];
  // Keyed by leadId -> whether the `.is(guardColumn, null)` guard should "match" (simulating the
  // guard column currently being null in the DB) for this test.
  const guardMatches = new Map<string, boolean>();

  function makeBuilder(leadId: string) {
    let guardColumn = '';
    const builder = {
      update: () => builder,
      eq: () => builder,
      is: (column: string) => {
        guardColumn = column;
        return builder;
      },
      select: async () => {
        const matched = guardMatches.get(leadId) ?? false;
        updateCalls.push({ leadId, guardColumn, guardValue: null });
        return { data: matched ? [{ id: leadId }] : [], error: null };
      },
      then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
    };
    return builder;
  }

  return { updateCalls, guardMatches, from: (_table: string) => ({ update: () => ({ eq: (_col: string, leadId: string) => makeBuilder(leadId) }) }) };
});

vi.mock('../../../src/database/supabaseClient.js', () => ({
  supabaseAdmin: { from: mocks.from },
}));

const { applyEnrollmentFromDisposition, applyAutoFeeFromCourseMode } = await import('../../../src/repositories/merittoRepo.js');

describe('applyEnrollmentFromDisposition', () => {
  beforeEach(() => {
    mocks.updateCalls.length = 0;
    mocks.guardMatches.clear();
  });

  it('returns only the leads whose enrolled_at guard actually matched (genuinely new enrollments), not every lead submitted', async () => {
    mocks.guardMatches.set('lead-new', true); // enrolled_at was null -> this is a first-time enrollment
    mocks.guardMatches.set('lead-already-enrolled', false); // enrolled_at already set -> guard no-ops

    const result = await applyEnrollmentFromDisposition(
      new Map([
        ['lead-new', '2026-11-13T00:00:00.000Z'],
        ['lead-already-enrolled', '2026-11-13T00:00:00.000Z'],
      ]),
    );

    expect(result.has('lead-new')).toBe(true);
    expect(result.has('lead-already-enrolled')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns an empty set when nothing was newly enrolled', async () => {
    mocks.guardMatches.set('lead-already-enrolled', false);
    const result = await applyEnrollmentFromDisposition(new Map([['lead-already-enrolled', '2026-11-13T00:00:00.000Z']]));
    expect(result.size).toBe(0);
  });
});

describe('applyAutoFeeFromCourseMode', () => {
  it('runs without throwing for a normal fee map (guarded update, same pattern as applyEnrollmentFromDisposition)', async () => {
    await expect(applyAutoFeeFromCourseMode(new Map([['lead-new', 49000]]))).resolves.toBeUndefined();
  });
});
