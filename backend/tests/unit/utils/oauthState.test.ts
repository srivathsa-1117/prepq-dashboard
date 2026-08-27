import { describe, it, expect, vi } from 'vitest';
import { signOAuthState, verifyOAuthState } from '../../../src/utils/oauthState.js';

describe('signOAuthState / verifyOAuthState', () => {
  it('round-trips the payload it was signed with', () => {
    const state = signOAuthState({ clientId: 'client-1', provider: 'meta', userId: 'user-1' });
    expect(verifyOAuthState(state)).toEqual({ clientId: 'client-1', provider: 'meta', userId: 'user-1' });
  });

  it('rejects a state whose payload was swapped to a different client, keeping the original signature', () => {
    const state = signOAuthState({ clientId: 'client-1', provider: 'meta', userId: 'user-1' });
    const [, signature] = state.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ clientId: 'attacker-client', provider: 'meta', userId: 'user-1', iat: Date.now() })).toString(
      'base64url',
    );
    expect(() => verifyOAuthState(`${tamperedBody}.${signature}`)).toThrow(/invalid oauth state signature/i);
  });

  it('rejects a state signed with a different key (forged signature)', () => {
    const state = signOAuthState({ clientId: 'client-1', provider: 'google_ads', userId: 'user-1' });
    const [body] = state.split('.');
    expect(() => verifyOAuthState(`${body}.not-a-real-signature`)).toThrow(/invalid oauth state signature/i);
  });

  it('rejects a malformed state missing the signature segment', () => {
    expect(() => verifyOAuthState('not-a-valid-token')).toThrow(/malformed oauth state/i);
  });

  it('rejects a state older than the 10-minute TTL', () => {
    vi.useFakeTimers();
    try {
      const state = signOAuthState({ clientId: 'client-1', provider: 'meta', userId: 'user-1' });
      vi.advanceTimersByTime(11 * 60_000);
      expect(() => verifyOAuthState(state)).toThrow(/oauth state expired/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a state just inside the TTL window', () => {
    vi.useFakeTimers();
    try {
      const state = signOAuthState({ clientId: 'client-1', provider: 'meta', userId: 'user-1' });
      vi.advanceTimersByTime(9 * 60_000);
      expect(() => verifyOAuthState(state)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
