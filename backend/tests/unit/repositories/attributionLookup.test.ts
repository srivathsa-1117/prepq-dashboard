import { describe, it, expect } from 'vitest';
import { resolveAttribution, type AttributionMaps } from '../../../src/repositories/attributionLookupRepo.js';

/**
 * Builds a maps fixture modeling the real bug found live in this account: two campaigns each
 * have their own ad-set named "EA UG Ad Set", and within each, an ad/creative named "Poster 01" -
 * identical names, genuinely different entities. A bare name-based lookup can only keep one
 * "EA UG Ad Set" id and one "Poster 01" id (whichever loads last), silently merging every other
 * same-named entity's leads onto it. The compound-key maps below are what loadAttributionMaps
 * builds in production; this fixture exercises resolveAttribution's consumption of them directly.
 */
function buildMaps(): AttributionMaps {
  return {
    courseIdByCode: new Map([
      ['CPA', 'course-cpa'],
      ['EA', 'course-ea'],
    ]),
    metaCampaignIdByName: new Map([
      ['campaign a', 'campaign-a-id'],
      ['campaign b', 'campaign-b-id'],
    ]),
    metaAdSetIdByCompoundKey: new Map([
      ['campaign a|ea ug ad set', 'adset-a-id'],
      ['campaign b|ea ug ad set', 'adset-b-id'],
    ]),
    metaAdIdByCompoundKey: new Map([
      ['campaign a|ea ug ad set|poster 01', 'ad-a-id'],
      ['campaign b|ea ug ad set|poster 01', 'ad-b-id'],
    ]),
    googleCampaignIdByName: new Map([['google campaign a', 'g-campaign-a-id']]),
    googleAdGroupIdByCompoundKey: new Map([['google campaign a|ad group 1', 'g-adgroup-a-id']]),
    googleAdIdByCompoundKey: new Map([['google campaign a|ad group 1|search ad 1', 'g-ad-a-id']]),
    creativeIdByMetaAdId: new Map([
      ['ad-a-id', 'creative-a-id'],
      ['ad-b-id', 'creative-b-id'],
    ]),
    creativeIdByGoogleAdId: new Map([['g-ad-a-id', 'g-creative-a-id']]),
  };
}

describe('resolveAttribution', () => {
  it('resolves two identically-named ads/creatives in different campaigns to their own distinct ids, not merged', () => {
    const maps = buildMaps();

    const leadFromCampaignA = resolveAttribution(maps, {
      productCode: null,
      source: 'Facebook',
      campaign: 'Campaign A',
      adSet: 'EA UG Ad Set',
      creative: 'Poster 01',
    });
    const leadFromCampaignB = resolveAttribution(maps, {
      productCode: null,
      source: 'Facebook',
      campaign: 'Campaign B',
      adSet: 'EA UG Ad Set',
      creative: 'Poster 01',
    });

    expect(leadFromCampaignA.metaAdSetId).toBe('adset-a-id');
    expect(leadFromCampaignA.metaAdId).toBe('ad-a-id');
    expect(leadFromCampaignA.creativeId).toBe('creative-a-id');

    expect(leadFromCampaignB.metaAdSetId).toBe('adset-b-id');
    expect(leadFromCampaignB.metaAdId).toBe('ad-b-id');
    expect(leadFromCampaignB.creativeId).toBe('creative-b-id');

    // The actual regression this guards: before the compound-key fix, both leads above would
    // have resolved to whichever one of the two ids happened to load last into a name-only map.
    expect(leadFromCampaignA.metaAdId).not.toBe(leadFromCampaignB.metaAdId);
    expect(leadFromCampaignA.creativeId).not.toBe(leadFromCampaignB.creativeId);
  });

  it('leaves ad-set/ad/creative unresolved when the campaign does not match, even if the ad-set/ad name alone would', () => {
    const maps = buildMaps();
    const resolved = resolveAttribution(maps, {
      productCode: null,
      source: 'Facebook',
      campaign: 'Some Other Campaign',
      adSet: 'EA UG Ad Set',
      creative: 'Poster 01',
    });

    expect(resolved.metaCampaignId).toBeNull();
    expect(resolved.metaAdSetId).toBeNull();
    expect(resolved.metaAdId).toBeNull();
    expect(resolved.creativeId).toBeNull();
  });

  it('resolves the Google branch through the same compound-key chain', () => {
    const maps = buildMaps();
    const resolved = resolveAttribution(maps, {
      productCode: null,
      source: 'google',
      campaign: 'Google Campaign A',
      adSet: 'Ad Group 1',
      creative: 'Search Ad 1',
    });

    expect(resolved.attributionPlatform).toBe('google');
    expect(resolved.googleCampaignId).toBe('g-campaign-a-id');
    expect(resolved.googleAdGroupId).toBe('g-adgroup-a-id');
    expect(resolved.googleAdId).toBe('g-ad-a-id');
    expect(resolved.creativeId).toBe('g-creative-a-id');
    expect(resolved.metaCampaignId).toBeNull();
  });

  it('resolves course via word-boundary match and platform detection is case/substring insensitive', () => {
    const maps = buildMaps();
    const resolved = resolveAttribution(maps, {
      productCode: 'Certified Public Accountant (US CPA)',
      source: 'Instagram',
      campaign: 'Campaign A',
      adSet: 'EA UG Ad Set',
      creative: 'Poster 01',
    });

    expect(resolved.courseId).toBe('course-cpa');
    expect(resolved.attributionPlatform).toBe('meta');
  });

  describe('course mode variants (EA/CPA Online vs Offline)', () => {
    function buildMapsWithVariants(): AttributionMaps {
      const maps = buildMaps();
      maps.courseIdByCode.set('EA_ONLINE', 'course-ea-online');
      maps.courseIdByCode.set('EA_OFFLINE', 'course-ea-offline');
      maps.courseIdByCode.set('CPA_ONLINE', 'course-cpa-online');
      return maps; // CPA_OFFLINE deliberately left unconfigured, to exercise the "no variant configured" fallback below
    }

    it('resolves to the specific Online/Offline course when cf_course_mode is unambiguous, case-insensitively', () => {
      const maps = buildMapsWithVariants();

      expect(resolveAttribution(maps, { productCode: 'Enrolled Agent (EA)', courseMode: 'Online', source: 'Organic', campaign: null, adSet: null, creative: null }).courseId).toBe(
        'course-ea-online',
      );
      expect(resolveAttribution(maps, { productCode: 'Enrolled Agent (EA)', courseMode: 'offline', source: 'Organic', campaign: null, adSet: null, creative: null }).courseId).toBe(
        'course-ea-offline',
      );
      expect(
        resolveAttribution(maps, { productCode: 'Certified Public Accountant (US CPA)', courseMode: 'online', source: 'Organic', campaign: null, adSet: null, creative: null }).courseId,
      ).toBe('course-cpa-online');
    });

    it('falls back to the plain base course when the matched variant has no configured course row', () => {
      const maps = buildMapsWithVariants();
      // CPA_OFFLINE isn't in courseIdByCode here - should land on the generic 'CPA' course, not null.
      const resolved = resolveAttribution(maps, {
        productCode: 'Certified Public Accountant (US CPA)',
        courseMode: 'Offline',
        source: 'Organic',
        campaign: null,
        adSet: null,
        creative: null,
      });
      expect(resolved.courseId).toBe('course-cpa');
    });

    it.each(['Both', 'yes', '?????', '', undefined])('falls back to the plain base course when cf_course_mode is ambiguous/garbage (%s)', (courseMode) => {
      const maps = buildMapsWithVariants();
      const resolved = resolveAttribution(maps, { productCode: 'Enrolled Agent (EA)', courseMode: courseMode ?? null, source: 'Organic', campaign: null, adSet: null, creative: null });
      expect(resolved.courseId).toBe('course-ea');
    });

    it('still resolves the plain base course when courseMode is omitted entirely (optional field)', () => {
      const maps = buildMapsWithVariants();
      const resolved = resolveAttribution(maps, { productCode: 'Enrolled Agent (EA)', source: 'Organic', campaign: null, adSet: null, creative: null });
      expect(resolved.courseId).toBe('course-ea');
    });
  });

  it('leaves everything platform-related null for a source that is neither Meta nor Google', () => {
    const maps = buildMaps();
    const resolved = resolveAttribution(maps, {
      productCode: null,
      source: 'Organic',
      campaign: 'Campaign A',
      adSet: 'EA UG Ad Set',
      creative: 'Poster 01',
    });

    expect(resolved.attributionPlatform).toBeNull();
    expect(resolved.metaAdId).toBeNull();
    expect(resolved.googleAdId).toBeNull();
    expect(resolved.creativeId).toBeNull();
  });
});
