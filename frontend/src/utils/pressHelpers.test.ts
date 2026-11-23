// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Power, PressMessage, ProvinceInfo } from '../types/diplomacy';
import {
  BACKCHANNEL,
  buildChannels,
  channelOf,
  destinationOf,
  loadReadMarks,
  MAX_READ_MARK_GAMES,
  mergeMessages,
  PUBLIC_CHANNEL,
  saveReadMarks,
  splitProvinceRefs,
  threadKey,
  totalUnread,
} from './pressHelpers';

const msg = (
  seq: number,
  sender: Power | null,
  recipients: Power[] = [],
  extra: Partial<PressMessage> = {},
): PressMessage => ({
  id: `m${seq}`,
  seq,
  sender,
  anonymous: sender === null,
  recipients,
  body: `message ${seq}`,
  sent_at: '2026-11-13T12:00:00+00:00',
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  orders: [],
  ...extra,
});

const province = (id: string, name: string): ProvinceInfo =>
  ({ id, name }) as ProvinceInfo;
const PROVINCES: Record<string, ProvinceInfo> = {
  BUR: province('BUR', 'Burgundy'),
  PAR: province('PAR', 'Paris'),
  WAR: province('WAR', 'Warsaw'),
  NTH: province('NTH', 'North Sea'),
  NAO: province('NAO', 'North Atlantic Ocean'),
  RUM: province('RUM', 'Rum'),
};

beforeEach(() => localStorage.clear());

describe('channels', () => {
  it('names a thread by its powers, whoever writes', () => {
    expect(threadKey(['GERMANY', 'FRANCE'])).toBe(
      threadKey(['FRANCE', 'GERMANY']),
    );
    expect(channelOf(msg(1, 'FRANCE', ['GERMANY']))).toBe(
      channelOf(msg(2, 'GERMANY', ['FRANCE'])),
    );
  });

  it('keeps a group apart from the one-to-one threads inside it', () => {
    expect(channelOf(msg(1, 'FRANCE', ['GERMANY', 'ITALY']))).not.toBe(
      channelOf(msg(2, 'FRANCE', ['GERMANY'])),
    );
  });

  it('puts public press, anonymous or not, in the public box', () => {
    expect(channelOf(msg(1, 'FRANCE'))).toBe(PUBLIC_CHANNEL);
    expect(channelOf(msg(2, null))).toBe(PUBLIC_CHANNEL);
  });

  it('puts an anonymous private message in its thread, hidden or revealed', () => {
    const thread = threadKey(['FRANCE', 'GERMANY', 'ITALY']);
    // While the author is hidden the server lists the whole thread as the recipients.
    expect(channelOf(msg(1, null, ['FRANCE', 'GERMANY', 'ITALY']))).toBe(
      thread,
    );
    expect(
      channelOf(msg(2, 'GERMANY', ['FRANCE', 'ITALY'], { anonymous: true })),
    ).toBe(thread);
  });

  it('routes incoming one-to-one anonymous messages to the Backchannel inbox', () => {
    expect(channelOf(msg(1, null, ['FRANCE']))).toBe(BACKCHANNEL);
    // The sender still sees their own sent message in their thread with the recipient.
    expect(channelOf(msg(2, 'FRANCE', ['GERMANY'], { anonymous: true }))).toBe(
      threadKey(['FRANCE', 'GERMANY']),
    );
  });

  it('places Backchannel right after Public when incoming anonymous DMs exist', () => {
    const channels = buildChannels(
      [msg(1, 'GERMANY', ['FRANCE']), msg(2, null, ['FRANCE'])],
      'FRANCE',
      {},
    );
    expect(channels.map((c) => c.key)).toEqual([
      PUBLIC_CHANNEL,
      BACKCHANNEL,
      'FRANCE+GERMANY',
    ]);
    expect(channels[1].kind).toBe('backchannel');
    expect(channels[1].members).toEqual([]);
  });

  it('says where a message being written will land', () => {
    expect(destinationOf([], 'FRANCE')).toBe(PUBLIC_CHANNEL);
    expect(destinationOf(['GERMANY'], 'FRANCE')).toBe(
      threadKey(['FRANCE', 'GERMANY']),
    );
  });

  it('lists the public box first and the busiest threads next', () => {
    const channels = buildChannels(
      [
        msg(1, null, ['FRANCE', 'GERMANY', 'ITALY']),
        msg(2, 'ITALY', ['FRANCE']),
        msg(3, 'GERMANY', ['FRANCE']),
      ],
      'FRANCE',
      {},
    );
    expect(channels.map((c) => c.key)).toEqual([
      PUBLIC_CHANNEL,
      'FRANCE+GERMANY',
      'FRANCE+ITALY',
      'FRANCE+GERMANY+ITALY',
    ]);
    expect(channels[1].members).toEqual(['FRANCE', 'GERMANY']);
  });

  it('lists a thread that was just opened while it is still empty', () => {
    const keys = buildChannels([], 'FRANCE', {}, 'FRANCE+TURKEY').map(
      (c) => c.key,
    );
    expect(keys).toEqual([PUBLIC_CHANNEL, 'FRANCE+TURKEY']);
  });

  it("counts other players' messages past the read mark as unread, never the player's own", () => {
    const messages = [
      msg(1, 'GERMANY'),
      msg(2, 'FRANCE'),
      msg(3, 'GERMANY'),
      msg(4, 'GERMANY', ['FRANCE']),
    ];
    const [publicBox, thread] = buildChannels(messages, 'FRANCE', {
      [PUBLIC_CHANNEL]: 1,
    });
    expect(publicBox.unread).toBe(1);
    expect(thread.unread).toBe(1);
    expect(totalUnread(messages, 'FRANCE', { [PUBLIC_CHANNEL]: 1 })).toBe(2);
  });
});

describe('mergeMessages', () => {
  it('adds new messages in order and ignores ones already held', () => {
    const held = [msg(1, 'FRANCE'), msg(3, 'FRANCE')];
    const merged = mergeMessages(held, [msg(3, 'FRANCE'), msg(2, 'GERMANY')]);
    expect(merged.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(mergeMessages(held, [msg(1, 'FRANCE')])).toBe(held);
  });
});

describe('splitProvinceRefs', () => {
  const refs = (body: string) =>
    splitProvinceRefs(body, PROVINCES)
      .filter((p) => p.kind === 'province')
      .map((p) => (p.kind === 'province' ? p.province : ''));

  it('links codes in capitals and full names in any case', () => {
    expect(
      refs('Support me into BUR from Paris, then burgundy holds.'),
    ).toEqual(['BUR', 'PAR', 'BUR']);
  });

  it('leaves ordinary words alone', () => {
    expect(refs('This means war. A bur under the saddle; drink rum.')).toEqual(
      [],
    );
    expect(refs('BURN the SPAR')).toEqual([]);
  });

  it('prefers the longest name', () => {
    expect(refs('Sail to the North Atlantic Ocean, not the North Sea')).toEqual(
      ['NAO', 'NTH'],
    );
  });

  it('gives back the whole text, in order', () => {
    const body = 'A PAR - BUR (please)';
    const parts = splitProvinceRefs(body, PROVINCES);
    expect(parts.map((p) => p.text).join('')).toBe(body);
    expect(splitProvinceRefs(body, {})).toEqual([{ kind: 'text', text: body }]);
  });
});

describe('read marks', () => {
  it('are remembered per game and seat', () => {
    saveReadMarks('g1', 'FRANCE', { public: 4 });
    expect(loadReadMarks('g1', 'FRANCE')).toEqual({ public: 4 });
    expect(loadReadMarks('g1', 'GERMANY')).toEqual({});
    expect(loadReadMarks('g2', 'FRANCE')).toEqual({});
  });

  it('ignore anything that is not a count', () => {
    localStorage.setItem(
      'sloplomacy_press_read_v2:g1:FRANCE',
      JSON.stringify({ public: 'x', notes: -1, 'FRANCE+ITALY': 2 }),
    );
    expect(loadReadMarks('g1', 'FRANCE')).toEqual({ 'FRANCE+ITALY': 2 });
    localStorage.setItem('sloplomacy_press_read_v2:g1:FRANCE', 'not json');
    expect(loadReadMarks('g1', 'FRANCE')).toEqual({});
  });

  it('keep only the most recent games, every seat of an old game going together', () => {
    saveReadMarks('old', 'FRANCE', { public: 1 });
    for (let i = 0; i < MAX_READ_MARK_GAMES - 1; i++) {
      saveReadMarks(`g${i}`, 'FRANCE', { public: i });
    }
    expect(loadReadMarks('old', 'FRANCE')).toEqual({ public: 1 });
    // Using an old game again makes it recent, so the next new game pushes out another.
    saveReadMarks('old', 'GERMANY', { public: 2 });
    saveReadMarks('newest', 'FRANCE', { public: 3 });
    expect(loadReadMarks('g0', 'FRANCE')).toEqual({});
    expect(loadReadMarks('old', 'FRANCE')).toEqual({ public: 1 });
    expect(loadReadMarks('newest', 'FRANCE')).toEqual({ public: 3 });
    const kept = Object.keys(localStorage).filter((k) =>
      k.startsWith('sloplomacy_press_read_v2:'),
    );
    expect(new Set(kept.map((k) => k.split(':')[1])).size).toBe(
      MAX_READ_MARK_GAMES,
    );
  });

  it('drop marks saved before there was an index first, and leave other keys alone', () => {
    localStorage.setItem(
      'sloplomacy_press_read_v2:legacy:FRANCE',
      '{"public":1}',
    );
    localStorage.setItem('unrelated', 'keep');
    for (let i = 0; i < MAX_READ_MARK_GAMES; i++) {
      saveReadMarks(`g${i}`, 'FRANCE', { public: 1 });
    }
    expect(loadReadMarks('legacy', 'FRANCE')).toEqual({});
    expect(loadReadMarks('g0', 'FRANCE')).toEqual({ public: 1 });
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
