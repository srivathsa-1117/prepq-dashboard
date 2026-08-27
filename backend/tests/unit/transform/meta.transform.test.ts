import { describe, it, expect } from 'vitest';
import { transformCampaign, transformDailyMetric } from '../../../src/integrations/meta/metaTransform.js';
import campaignsFixture from '../../fixtures/meta/campaigns.json' with { type: 'json' };
import insightsFixture from '../../fixtures/meta/insights.json' with { type: 'json' };
import type { MetaCampaign, MetaInsightsRow } from '../../../src/types/meta.js';

describe('meta transform', () => {
  it('parses campaign budgets from decimal-string minor units into numbers', () => {
    const raw = campaignsFixture.data[0] as MetaCampaign;
    const normalized = transformCampaign(raw);

    expect(normalized.metaCampaignId).toBe('120210000000001');
    expect(normalized.dailyBudget).toBe(5000);
    expect(normalized.lifetimeBudget).toBeNull();
    expect(normalized.status).toBe('ACTIVE');
  });

  it('leaves budget null when the field is absent rather than defaulting to 0', () => {
    const raw = campaignsFixture.data[1] as MetaCampaign;
    const normalized = transformCampaign(raw);
    expect(normalized.lifetimeBudget).toBeNull();
  });

  it('sums lead-shaped actions into the leads count', () => {
    const raw = insightsFixture.data[0] as MetaInsightsRow;
    const normalized = transformDailyMetric(raw);

    expect(normalized.impressions).toBe(12450);
    expect(normalized.clicks).toBe(312);
    expect(normalized.spend).toBeCloseTo(4520.75);
    expect(normalized.leads).toBe(18); // only the "lead" action_type counts, not "link_click"
  });

  it('recognizes the onsite_conversion.lead_grouped action type as a lead', () => {
    const raw = insightsFixture.data[1] as MetaInsightsRow;
    const normalized = transformDailyMetric(raw);
    expect(normalized.leads).toBe(5);
  });

  it('defaults missing numeric fields to 0/null instead of NaN', () => {
    const raw: MetaInsightsRow = { ad_id: '999', date_start: '2026-08-01', date_stop: '2026-08-01' };
    const normalized = transformDailyMetric(raw);

    expect(normalized.impressions).toBe(0);
    expect(normalized.clicks).toBe(0);
    expect(normalized.spend).toBe(0);
    expect(normalized.reach).toBeNull();
    expect(normalized.frequency).toBeNull();
    expect(normalized.leads).toBe(0);
  });
});
