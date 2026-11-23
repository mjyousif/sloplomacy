// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Power, PressMessage } from '../types/diplomacy';
import {
  loadReadMarks,
  PUBLIC_CHANNEL,
  saveReadMarks,
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

describe('press read marks', () => {
  it('keep per-player read marks unchanged across feeds', () => {
    saveReadMarks('g1', 'FRANCE', { [PUBLIC_CHANNEL]: 1 });
    pressStore.open('g1', 'FRANCE');
    pressStore.setFeed('g1', {
      power: 'FRANCE',
      messages: [msg(1, 'GERMANY'), msg(2, 'ENGLAND')],
    });
    expect(pressStore.getState().lastRead).toEqual({ [PUBLIC_CHANNEL]: 1 });
    expect(loadReadMarks('g1', 'FRANCE')).toEqual({ [PUBLIC_CHANNEL]: 1 });

    pressStore.markRead(PUBLIC_CHANNEL, 2);
    expect(pressStore.getState().lastRead).toEqual({ [PUBLIC_CHANNEL]: 2 });
    expect(loadReadMarks('g1', 'FRANCE')).toEqual({ [PUBLIC_CHANNEL]: 2 });
  });
});
