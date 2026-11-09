import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ADJECTIVES, defaultCampaignName } from './campaignName';

describe('defaultCampaignName', () => {
  it('uses the first adjective when rng returns 0', () => {
    expect(defaultCampaignName('Gage', () => 0)).toBe(
      `Gage's ${CAMPAIGN_ADJECTIVES[0]} Campaign`,
    );
  });

  it('uses the last adjective when rng is just below 1', () => {
    const last = CAMPAIGN_ADJECTIVES[CAMPAIGN_ADJECTIVES.length - 1];
    expect(defaultCampaignName('Gage', () => 0.999999)).toBe(
      `Gage's ${last} Campaign`,
    );
  });

  it('stays in range even if rng returns exactly 1', () => {
    const last = CAMPAIGN_ADJECTIVES[CAMPAIGN_ADJECTIVES.length - 1];
    expect(defaultCampaignName('Gage', () => 1)).toBe(
      `Gage's ${last} Campaign`,
    );
  });

  it('keeps every adjective a single non-empty word', () => {
    for (const adjective of CAMPAIGN_ADJECTIVES) {
      expect(adjective).toMatch(/^\S+$/);
    }
    expect(new Set(CAMPAIGN_ADJECTIVES).size).toBe(CAMPAIGN_ADJECTIVES.length);
  });

  it('uses Math.random by default', () => {
    expect(defaultCampaignName('Gage')).toMatch(/^Gage's \S+ Campaign$/);
  });
});
