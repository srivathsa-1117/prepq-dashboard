import { describe, it, expect } from 'vitest';
import { transformActivity, transformLead, summarizeCallActivity, buildCallCodeIndex } from '../../../src/integrations/meritto/merittoTransform.js';
import { resolveDispositionStatus } from '../../../src/services/merittoDispositionMap.js';
import leadsFixture from '../../fixtures/meritto/leads.json' with { type: 'json' };
import activitiesFixture from '../../fixtures/meritto/activities.json' with { type: 'json' };
import type { MerittoActivity, MerittoActivityCode, MerittoLead } from '../../../src/types/meritto.js';

describe('meritto transform', () => {
  it('normalizes lead_source into the dashboard source vocabulary', () => {
    const fb = transformLead(leadsFixture.data[0] as MerittoLead);
    expect(fb.source).toBe('meta');
    expect(fb.campaign).toBe('CPA - Lead Gen - Prospecting');
    expect(fb.creative).toBe('Video - Testimonial v3');

    const google = transformLead(leadsFixture.data[1] as MerittoLead);
    expect(google.source).toBe('google');
  });

  it('preserves attribution fields verbatim in attributionRaw without inventing missing ones', () => {
    const lead = transformLead(leadsFixture.data[2] as MerittoLead);
    expect(lead.attributionRaw.cf_ad_set_name).toBeNull();
    expect(lead.campaign).toBe('CPA - Lead Gen - Prospecting');
  });

  it('derives call_attempts / first_call_at / connect_attempt / connected from chronological call activities', () => {
    const callCodeIndex = buildCallCodeIndex(activitiesFixture.codes as MerittoActivityCode[]);
    const activities = (activitiesFixture.data as MerittoActivity[])
      .filter((a) => a.lead_id === 'MER-1001')
      .map((a) => transformActivity(a, callCodeIndex));

    const summary = summarizeCallActivity(activities);

    expect(summary.callAttempts).toBe(2);
    expect(summary.firstCallAt).toBe('2026-08-10T04:40:00.000Z');
    expect(summary.connectAttempt).toBe(2); // second call was the one that connected
    expect(summary.connected).toBe(true);
  });

  it('reports zero attempts and no connection for a lead with no call activity', () => {
    const summary = summarizeCallActivity([]);
    expect(summary).toEqual({ callAttempts: 0, firstCallAt: null, connectAttempt: null, connected: false });
  });

  describe('buildCallCodeIndex', () => {
    it('only indexes codes whose name mentions "call", ignoring unrelated activity types', () => {
      const codes: MerittoActivityCode[] = [
        { code: 1, name: 'Outbound Call Initiated', category: 'IVR' },
        { code: 2, name: 'Email Delivered', category: 'Communicate' },
        { code: 3, name: 'Print Application', category: 'Print' },
      ];
      const index = buildCallCodeIndex(codes);
      expect(index.has('1')).toBe(true);
      expect(index.has('2')).toBe(false);
      expect(index.has('3')).toBe(false);
    });

    it('classifies codes with a miss/failure hint in the name as missed, everything else call-related as connected', () => {
      const codes: MerittoActivityCode[] = [
        { code: 10, name: 'Missed Call - Outbound', category: 'IVR' },
        { code: 11, name: 'Call Busy', category: 'IVR' },
        { code: 12, name: 'Mio AI Call Not Answered', category: 'AI-Calling' },
        { code: 13, name: 'Outbound Call Initiated', category: 'IVR' },
        { code: 14, name: 'IVR Campaign Call Success', category: 'Conversation' },
      ];
      const index = buildCallCodeIndex(codes);
      expect(index.get('10')).toBe('missed');
      expect(index.get('11')).toBe('missed');
      expect(index.get('12')).toBe('missed');
      expect(index.get('13')).toBe('connected');
      expect(index.get('14')).toBe('connected');
    });
  });

  it('marks a lead not_reachable when never connected and under the attempt ceiling', () => {
    const resolution = resolveDispositionStatus(
      { sourceDisposition: null, callAttempts: 2, connected: false, dqReasonProvided: null },
      [],
    );
    expect(resolution.status).toBe('not_reachable');
    expect(resolution.usedFallbackHeuristic).toBe(true);
  });

  it('marks a lead junk once attempts are exhausted without connecting', () => {
    const resolution = resolveDispositionStatus(
      { sourceDisposition: null, callAttempts: 4, connected: false, dqReasonProvided: null },
      [],
    );
    expect(resolution.status).toBe('junk');
  });

  it('lets a client-configured disposition rule override the attempts/connected heuristic', () => {
    const resolution = resolveDispositionStatus(
      { sourceDisposition: 'Connected - Qualified', callAttempts: 2, connected: true, dqReasonProvided: null },
      [{ sourceDisposition: 'connected - qualified', statusCode: 'qualified', requiresDqReason: false }],
    );
    expect(resolution.status).toBe('qualified');
    expect(resolution.usedFallbackHeuristic).toBe(false);
  });
});
