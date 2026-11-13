import { describe, expect, it } from 'vitest';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
  ProvinceInfo,
} from '../types/diplomacy';
import {
  GRACE_PERIOD_MS,
  getCompletedCampaignStatus,
  getMyParticipant,
  getSupplyCenterCounts,
  isVisibleInMyActiveCampaigns,
} from './gameOverHelpers';

const USER: AuthUser = {
  id: 'usr-1',
  email: 'alice@example.com',
  displayName: 'Alice',
};

function makeSummary(
  overrides: Partial<MultiplayerGameSummary> = {},
  seenAt: string | null = null,
): MultiplayerGameSummary {
  return {
    game_id: 'mp_abc',
    name: 'Test Campaign',
    status: 'completed',
    winner: 'FRANCE',
    completed_at: '2026-11-12T00:00:00Z',
    season: 'Fall',
    year: 1908,
    phase: 'Retreats',
    created_by: 'alice@example.com',
    created_at: '2026-11-01T00:00:00Z',
    finalized_powers: [],
    is_sandbox: false,
    participants: {
      FRANCE: {
        user_id: 'usr-1',
        email: 'alice@example.com',
        display_name: 'Alice',
        power: 'FRANCE',
        joined_at: '2026-11-01T00:00:00Z',
        game_over_seen_at: seenAt,
      },
    },
    ...overrides,
  };
}

describe('gameOverHelpers', () => {
  it('finds the viewer participant by user_id or email', () => {
    const summary = makeSummary();
    expect(getMyParticipant(summary, USER)?.power).toBe('FRANCE');
    expect(
      getMyParticipant(summary, {
        id: 'other',
        email: 'ALICE@example.com',
        displayName: 'Alice',
      })?.power,
    ).toBe('FRANCE');
    expect(getMyParticipant(summary, null)).toBeNull();
  });

  it('classifies active, unwitnessed, grace-period, and archived campaigns', () => {
    const baseMs = Date.parse('2026-11-12T12:00:00Z');

    expect(
      getCompletedCampaignStatus(
        makeSummary({ status: 'active', winner: null }),
        USER,
        baseMs,
      ).phase,
    ).toBe('active');

    expect(
      getCompletedCampaignStatus(makeSummary({}, null), USER, baseMs).phase,
    ).toBe('unwitnessed');

    const tenHoursAgo = new Date(baseMs - 10 * 60 * 60 * 1000).toISOString();
    const grace = getCompletedCampaignStatus(
      makeSummary({}, tenHoursAgo),
      USER,
      baseMs,
    );
    expect(grace.phase).toBe('grace');
    expect(grace.hoursRemaining).toBe(14);
    expect(
      isVisibleInMyActiveCampaigns(makeSummary({}, tenHoursAgo), USER, baseMs),
    ).toBe(true);

    const twentyFourHoursAgo = new Date(baseMs - GRACE_PERIOD_MS).toISOString();
    const archived = getCompletedCampaignStatus(
      makeSummary({}, twentyFourHoursAgo),
      USER,
      baseMs,
    );
    expect(archived.phase).toBe('archived');
    expect(
      isVisibleInMyActiveCampaigns(
        makeSummary({}, twentyFourHoursAgo),
        USER,
        baseMs,
      ),
    ).toBe(false);
  });

  it('counts supply centers only for supply center provinces and sorts descending', () => {
    const state = {
      ownership: {
        PAR: 'FRANCE',
        BRE: 'FRANCE',
        PIC: 'FRANCE', // non-SC
        LON: 'ENGLAND',
      },
    } as unknown as GameState;
    const provinces = {
      PAR: { is_supply_center: true },
      BRE: { is_supply_center: true },
      PIC: { is_supply_center: false },
      LON: { is_supply_center: true },
    } as unknown as Record<string, ProvinceInfo>;

    const standings = getSupplyCenterCounts(state, provinces);
    expect(standings[0]).toEqual({ power: 'FRANCE', count: 2 });
    expect(standings[1]).toEqual({ power: 'ENGLAND', count: 1 });
  });
});
