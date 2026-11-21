import {
  ALL_POWERS,
  type Power,
  type PressMessage,
  type ProvinceInfo,
} from '../types/diplomacy';

/** The box every seated player reads. */
export const PUBLIC_CHANNEL = 'public';
/** The receive-only inbox for incoming one-to-one anonymous messages. */
export const BACKCHANNEL = 'backchannel';
export type PressChannelKind = 'public' | 'backchannel' | 'thread';

export interface PressChannel {
  key: string;
  kind: PressChannelKind;
  /** A thread's powers, the player's own included. Empty for the public box. */
  members: Power[];
  messages: PressMessage[];
  /** Messages from others the player has not read yet. */
  unread: number;
  /** The newest message's number, or 0 for a channel with none. */
  lastSeq: number;
}

/** A thread is the set of powers in it, whoever writes: "ENGLAND+FRANCE". */
export function threadKey(members: Power[]): string {
  return ALL_POWERS.filter((p) => members.includes(p)).join('+');
}

export function threadMembers(key: string): Power[] {
  return key
    .split('+')
    .filter((p): p is Power => ALL_POWERS.includes(p as Power));
}

/**
 * Which channel a message is shown in, signed or anonymous. While an anonymous author is hidden
 * (`sender` null), a group message lists the whole thread as its recipients; a one-to-one
 * anonymous message lists only the recipient and goes into the Backchannel inbox.
 */
export function channelOf(message: PressMessage): string {
  if (message.recipients.length === 0) return PUBLIC_CHANNEL;
  if (message.sender === null && message.recipients.length === 1) {
    return BACKCHANNEL;
  }
  const sender = message.sender ? [message.sender] : [];
  return threadKey([...sender, ...message.recipients]);
}

/** Where a message with these recipients will land, signed or anonymous. */
export function destinationOf(recipients: Power[], viewer: Power): string {
  if (recipients.length === 0) return PUBLIC_CHANNEL;
  return threadKey([viewer, ...recipients]);
}

function kindOf(key: string): PressChannelKind {
  if (key === PUBLIC_CHANNEL) return 'public';
  if (key === BACKCHANNEL) return 'backchannel';
  return 'thread';
}

/**
 * Sorts messages into channels: the public box first, then threads with the latest activity
 * first. The public box is always there; `keep` names a channel to list even
 * while it is empty (the thread the player has just ticked open).
 */
export function buildChannels(
  messages: PressMessage[],
  /** The reader's seat, or null for a spectator, who wrote none of them. */
  viewer: Power | null,
  lastRead: Record<string, number>,
  keep?: string,
): PressChannel[] {
  const byKey = new Map<string, PressMessage[]>([[PUBLIC_CHANNEL, []]]);
  if (keep) byKey.set(keep, []);
  for (const message of messages) {
    const key = channelOf(message);
    const list = byKey.get(key);
    if (list) list.push(message);
    else byKey.set(key, [message]);
  }
  const channels = [...byKey.entries()].map(([key, list]): PressChannel => {
    const read = lastRead[key] ?? 0;
    return {
      key,
      kind: kindOf(key),
      members: kindOf(key) === 'thread' ? threadMembers(key) : [],
      messages: list,
      unread: list.filter((m) => m.seq > read && !isOwn(m, viewer)).length,
      lastSeq: list.length ? list[list.length - 1].seq : 0,
    };
  });
  const rank = (c: PressChannel) =>
    c.kind === 'public' ? 0 : c.kind === 'backchannel' ? 1 : 2;
  return channels.sort(
    (a, b) =>
      rank(a) - rank(b) || b.lastSeq - a.lastSeq || a.key.localeCompare(b.key),
  );
}

export function totalUnread(
  messages: PressMessage[],
  viewer: Power | null,
  lastRead: Record<string, number>,
): number {
  return messages.filter(
    (m) => !isOwn(m, viewer) && m.seq > (lastRead[channelOf(m)] ?? 0),
  ).length;
}

/** The viewer wrote it. A spectator (no seat) wrote nothing, anonymous messages included. */
function isOwn(message: PressMessage, viewer: Power | null): boolean {
  return viewer !== null && message.sender === viewer;
}

/** Adds messages to a list, skipping ones already there, and keeps it oldest first. */
export function mergeMessages(
  current: PressMessage[],
  incoming: PressMessage[],
): PressMessage[] {
  const known = new Set(current.map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));
  if (fresh.length === 0) return current;
  return [...current, ...fresh].sort((a, b) => a.seq - b.seq);
}

export function sameTurn(a: PressMessage, b: PressMessage): boolean {
  return a.season === b.season && a.year === b.year && a.phase === b.phase;
}

export type PressBodyPart =
  | { kind: 'text'; text: string }
  | { kind: 'province'; text: string; province: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const matcherCache = new WeakMap<
  Record<string, ProvinceInfo>,
  { pattern: RegExp; byName: Map<string, string> } | null
>();

function provinceMatcher(provinces: Record<string, ProvinceInfo>) {
  const cached = matcherCache.get(provinces);
  if (cached !== undefined) return cached;
  const ids = Object.keys(provinces);
  let matcher: { pattern: RegExp; byName: Map<string, string> } | null = null;
  if (ids.length > 0) {
    const byName = new Map<string, string>();
    for (const id of ids) {
      const name = provinces[id].name?.trim();
      // A short name ("Kiel" is fine, "Rum" is not) would match ordinary words.
      if (name && name.length >= 4) byName.set(name.toLowerCase(), id);
    }
    // Longest names first, so "North Atlantic Ocean" wins over "North Sea"-style prefixes.
    const names = [...byName.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);
    const namePart = names.length ? `|(?<name>${names.join('|')})` : '';
    matcher = {
      pattern: new RegExp(
        `(?<![\\p{L}\\p{N}])(?:(?<id>${ids.map(escapeRegExp).join('|')})${namePart})(?![\\p{L}\\p{N}])`,
        'giu',
      ),
      byName,
    };
  }
  matcherCache.set(provinces, matcher);
  return matcher;
}

/**
 * Splits a message into plain text and the provinces it names, so each can be linked to the
 * map. A province is named by its code in capitals ("BUR", so the word "bur" or "War" is left
 * alone) or by its full name in any case ("Burgundy").
 */
export function splitProvinceRefs(
  body: string,
  provinces: Record<string, ProvinceInfo>,
): PressBodyPart[] {
  const matcher = provinceMatcher(provinces);
  if (!matcher) return [{ kind: 'text', text: body }];
  const parts: PressBodyPart[] = [];
  let cursor = 0;
  const pushText = (end: number) => {
    if (end > cursor)
      parts.push({ kind: 'text', text: body.slice(cursor, end) });
  };
  for (const match of body.matchAll(matcher.pattern)) {
    const text = match[0];
    const start = match.index ?? 0;
    let province: string | undefined;
    if (match.groups?.id) {
      // Codes only count in capitals.
      if (text === text.toUpperCase() && provinces[text]) province = text;
    } else {
      province = matcher.byName.get(text.toLowerCase());
    }
    if (!province) continue;
    pushText(start);
    parts.push({ kind: 'province', text, province });
    cursor = start + text.length;
  }
  pushText(body.length);
  return parts;
}

// v2: `seq` became the reader's own number, so marks saved against the game-wide count are
// dropped rather than misread.
const READ_STORAGE_PREFIX = 'sloplomacy_press_read_v2';

/**
 * Revealed press is numbered for the whole game, not per reader, so its marks are kept apart
 * from the ones made while the game was on. A spectator (no seat) has marks of their own.
 */
function readStorageKey(
  gameId: string,
  power: Power | null,
  revealed: boolean,
): string {
  return `${READ_STORAGE_PREFIX}:${gameId}:${power ?? 'spectator'}${revealed ? ':revealed' : ''}`;
}

/** The newest `seq` in each channel: everything held, marked read. */
export function readUpToNow(messages: PressMessage[]): Record<string, number> {
  const marks: Record<string, number> = {};
  for (const m of messages) {
    const channel = channelOf(m);
    marks[channel] = Math.max(marks[channel] ?? 0, m.seq);
  }
  return marks;
}

/** How far this browser has read each channel of a game, by channel key. */
export function loadReadMarks(
  gameId: string,
  power: Power | null,
  revealed = false,
): Record<string, number> {
  try {
    const raw = localStorage.getItem(readStorageKey(gameId, power, revealed));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    const marks: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        marks[key] = value;
      }
    }
    return marks;
  } catch {
    return {};
  }
}

/**
 * How many games keep read marks in this browser. A game's marks are one key per seat, so
 * without a cap they pile up for every match a browser ever opened.
 */
export const MAX_READ_MARK_GAMES = 30;
const READ_INDEX_KEY = 'sloplomacy_press_read_index_v1';

/** The game id inside a read-mark key, or null for any other key. */
function gameIdOfReadKey(key: string): string | null {
  const head = `${READ_STORAGE_PREFIX}:`;
  if (!key.startsWith(head)) return null;
  const rest = key.slice(head.length);
  const end = rest.indexOf(':');
  return end === -1 ? null : rest.slice(0, end);
}

function readIndex(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(READ_INDEX_KEY) ?? 'null',
    );
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Notes that `gameId` was just used and forgets the marks of every game but the
 * `MAX_READ_MARK_GAMES` most recent. Marks saved before the index existed count as the
 * oldest, so they are the first to go.
 */
function touchReadMarkGame(gameId: string): void {
  const stored = new Map<string, string[]>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const id = key === null ? null : gameIdOfReadKey(key);
    if (key !== null && id !== null)
      stored.set(id, [...(stored.get(id) ?? []), key]);
  }
  const known = readIndex().filter((id) => stored.has(id) && id !== gameId);
  const unindexed = [...stored.keys()].filter(
    (id) => !known.includes(id) && id !== gameId,
  );
  const order = [...unindexed, ...known, gameId];
  const dropped = order.slice(
    0,
    Math.max(0, order.length - MAX_READ_MARK_GAMES),
  );
  for (const id of dropped) {
    for (const key of stored.get(id) ?? []) localStorage.removeItem(key);
  }
  localStorage.setItem(
    READ_INDEX_KEY,
    JSON.stringify(order.slice(dropped.length)),
  );
}

export function saveReadMarks(
  gameId: string,
  power: Power | null,
  marks: Record<string, number>,
  revealed = false,
): void {
  try {
    localStorage.setItem(
      readStorageKey(gameId, power, revealed),
      JSON.stringify(marks),
    );
    touchReadMarkGame(gameId);
  } catch {
    // Ignore storage quota / privacy mode restrictions
  }
}
