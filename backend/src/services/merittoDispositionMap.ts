import type { LeadStatusRule } from '../repositories/leadStatusRulesRepo.js';

export interface DispositionInput {
  sourceDisposition: string | null;
  callAttempts: number;
  connected: boolean;
  /** Meritto's own DQ reason field, when the account tracks it as a distinct field rather than folding it into the disposition string. */
  dqReasonProvided: string | null;
}

export interface DispositionResolution {
  /** A lead_statuses.code value for this client (default catalog: uncalled/not_reachable/junk/not_qualified/qualified, seeded by seed_default_lead_statuses()). */
  status: string;
  dqReason: string | null;
  /** True when no explicit client rule (lead_status_rules) matched and the fallback heuristic (call_attempts/connected) was used - worth surfacing for disposition-cleanup follow-up. */
  usedFallbackHeuristic: boolean;
}

const MAX_ATTEMPTS_BEFORE_JUNK = 4;

/**
 * Resolves a lead's status code. Client-specific `rules` (from
 * lead_status_rules) take priority - an exact, case-insensitive match on
 * source_disposition always wins. Absent a rule, falls back to the
 * attempts/connected heuristic documented in the handoff brief (Section 5.2):
 *   uncalled        -> zero call attempts
 *   not_reachable   -> attempted, never connected, < 4 attempts
 *   junk            -> 4 attempts exhausted, never connected
 *   not_qualified   -> connected, disqualified (needs dq_reason)
 *   qualified       -> connected, qualified
 * The heuristic alone cannot distinguish "qualified" from "not_qualified"
 * for a connected lead without a disposition string - that case is treated
 * as not_qualified with a null dq_reason and flagged via usedFallbackHeuristic
 * so it surfaces in sync logs rather than silently miscounting as qualified.
 */
export function resolveDispositionStatus(input: DispositionInput, rules: LeadStatusRule[]): DispositionResolution {
  if (input.sourceDisposition) {
    const rule = rules.find((r) => r.sourceDisposition.toLowerCase() === input.sourceDisposition!.toLowerCase());
    if (rule) {
      const isDisqualifying = rule.statusCode === 'not_qualified' || rule.statusCode === 'junk';
      return {
        status: rule.statusCode,
        // requiresDqReason=true: this account has a real, distinct DQ-reason field - trust it
        // as-is (including null, if the API genuinely returned nothing for this lead).
        // requiresDqReason=false: it doesn't (this account's case - dqReasonProvided is always
        // null, see merittoTransform.ts). Falling back to null here used to discard the one
        // thing that *is* a real, human-readable reason for a disqualifying status: the
        // disposition label itself ("Cold", "Closed", "No Enquiry", ...). Using it instead took
        // disqualificationReasons() (requires status='not_qualified' AND a non-null dqReason)
        // from always-empty to reflecting the ~295/month leads that actually are disqualified.
        dqReason: rule.requiresDqReason ? input.dqReasonProvided : isDisqualifying ? input.sourceDisposition : null,
        usedFallbackHeuristic: false,
      };
    }
  }

  if (input.callAttempts === 0) {
    return { status: 'uncalled', dqReason: null, usedFallbackHeuristic: true };
  }

  if (!input.connected) {
    const status = input.callAttempts >= MAX_ATTEMPTS_BEFORE_JUNK ? 'junk' : 'not_reachable';
    return { status, dqReason: null, usedFallbackHeuristic: true };
  }

  // Connected, but no disposition rule matched: conservatively treat as
  // not_qualified rather than assuming qualified, and flag the fallback.
  return { status: 'not_qualified', dqReason: input.dqReasonProvided, usedFallbackHeuristic: true };
}
