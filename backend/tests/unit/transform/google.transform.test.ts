import { describe, it, expect } from 'vitest';
import { transformCampaign, transformDailyMetric } from '../../../src/integrations/google/googleTransform.js';
import campaignsFixture from '../../fixtures/google/campaigns.json' with { type: 'json' };
import metricsFixture from '../../fixtures/google/metrics.json' with { type: 'json' };
import type { GoogleCampaignRow, GoogleMetricsRow } from '../../../src/types/google.js';

describe('google transform', () => {
  it('maps campaign budget micros without converting to currency (conversion happens in reporting)', () => {
    const raw = campaignsFixture.results[0] as GoogleCampaignRow;
    const normalized = transformCampaign(raw, '1234567890');

    expect(normalized.googleCampaignId).toBe('19000001');
    expect(normalized.googleCustomerId).toBe('1234567890');
    expect(normalized.campaignBudgetMicros).toBe(50_000_000);
    expect(normalized.advertisingChannelType).toBe('SEARCH');
  });

  it('parses daily metrics, keeping cost in micros', () => {
    const raw = metricsFixture.results[0] as GoogleMetricsRow;
    const normalized = transformDailyMetric(raw);

    expect(normalized.googleAdId).toBe('77000001');
    expect(normalized.date).toBe('2026-08-10');
    expect(normalized.impressions).toBe(5400);
    expect(normalized.costMicros).toBe(3_125_000_000);
    expect(normalized.conversions).toBe(12);
  });

  it('never invents a campaign name for Performance Max ad groups lacking one', () => {
    const raw = campaignsFixture.results[1] as GoogleCampaignRow;
    const normalized = transformCampaign(raw, '1234567890');
    expect(normalized.name).toBe('EA - Performance Max');
  });
});
