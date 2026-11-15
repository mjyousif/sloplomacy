// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Power, PressMessage } from '../types/diplomacy';
import {
  loadReadMarks,
  PUBLIC_CHANNEL,
  saveReadMarks,
  totalUnread,
} from '../utils/pressHelpers';
import { pressStore } from './pressStore';

const msg = (seq: number, sender: Power, body = `m${seq}`): PressMessage => ({
  id: `${body}-${seq}`,
  seq,
  sender,
  anonymous: false,
  recipients: [],
  body,
  sent_at: '2026-11-15T12:00:00+00:00',
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  orders: [],
});

beforeEach(() => {
  localStorage.clear();
  pressStore.reset();
});

describe('press read marks when the game ends', () => {
  it('switch to the revealed numbering and start with everything read', () => {
    saveReadMarks('g1', 'FRANCE', { [PUBLIC_CHANNEL]: 1 });
    pressStore.open('g1', 'FRANCE');
    pressStore.setFeed('g1', {
      power: 'FRANCE',
      revealed: false,
      messages: [msg(1, 'GERMANY'), msg(2, 'ENGLAND')],
    });
    expect(pressStore.getState().lastRead).toEqual({ [PUBLIC_CHANNEL]: 1 });

    // The revealed feed is renumbered for the whole game, private press included.
    const revealed = [msg(1, 'GERMANY'), msg(4, 'ENGLAND'), msg(7, 'ITALY')];
    pressStore.setFeed('g1', {
      power: 'FRANCE',
      revealed: true,
      messages: revealed,
    });

    const { lastRead } = pressStore.getState();
    expect(lastRead).toEqual({ [PUBLIC_CHANNEL]: 7 });
    expect(totalUnread(revealed, 'FRANCE', lastRead)).toBe(0);
    expect(loadReadMarks('g1', 'FRANCE', true)).toEqual({
      [PUBLIC_CHANNEL]: 7,
    });
    // The marks from before the end are left as they were.
    expect(loadReadMarks('g1', 'FRANCE')).toEqual({ [PUBLIC_CHANNEL]: 1 });
  });

  it('keep what was read after the end on the next load', () => {
    saveReadMarks('g1', 'FRANCE', { [PUBLIC_CHANNEL]: 5 }, true);
    pressStore.open('g1', 'FRANCE');
    pressStore.setFeed('g1', {
      power: 'FRANCE',
      revealed: true,
      messages: [msg(5, 'GERMANY'), msg(8, 'ENGLAND', 'Good game')],
    });
    expect(pressStore.getState().lastRead).toEqual({ [PUBLIC_CHANNEL]: 5 });
  });
});
