import {
  ALL_POWERS,
  type Power,
  type PressMessage,
  type ProvinceInfo,
} from '../types/diplomacy';

/** The box every seated player reads. */
export const PUBLIC_CHANNEL = 'public';
/** Anonymous private messages: one-way notes that cannot be answered. */
export const NOTES_CHANNEL = 'notes';

export type PressChannelKind = 'public' | 'notes' | 'thread';

export interface PressChannel {
  key: string;
  kind: PressChannelKind;
  /** A thread's powers, the player's own included. Empty for the public box and the notes. */
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

/** Which channel a message is shown in. */
export function channelOf(message: PressMessage): string {
  if (message.recipients.length === 0) return PUBLIC_CHANNEL;
  if (message.anonymous || message.sender === null) return NOTES_CHANNEL;
  return threadKey([message.sender, ...message.recipients]);
}

/** Where a message with these recipients will land. */
export function destinationOf(
  recipients: Power[],
  anonymous: boolean,
  viewer: Power,
): string {
  if (recipients.length === 0) return PUBLIC_CHANNEL;
  return anonymous ? NOTES_CHANNEL : threadKey([viewer, ...recipients]);
}

function kindOf(key: string): PressChannelKind {
  if (key === PUBLIC_CHANNEL) return 'public';
  return key === NOTES_CHANNEL ? 'notes' : 'thread';
}

/**
 * Sorts messages into channels: the public box first, then threads with the latest activity
 * first, then the notes. The public box is always there; `keep` names a channel to list even
 * while it is empty (the thread the player has just ticked open).
 */
export function buildChannels(
  messages: PressMessage[],
  viewer: Power,
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
      unread: list.filter((m) => m.seq > read && m.sender !== viewer).length,
      lastSeq: list.length ? list[list.length - 1].seq : 0,
    };
  });
  const rank = (c: PressChannel) =>
    c.kind === 'public' ? 0 : c.kind === 'thread' ? 1 : 2;
  return channels.sort(
    (a, b) =>
      rank(a) - rank(b) || b.lastSeq - a.lastSeq || a.key.localeCompare(b.key),
  );
}

export function totalUnread(
  messages: PressMessage[],
  viewer: Power,
  lastRead: Record<string, number>,
): number {
  return messages.filter(
    (m) => m.sender !== viewer && m.seq > (lastRead[channelOf(m)] ?? 0),
  ).length;
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

const READ_STORAGE_PREFIX = 'sloplomacy_press_read';

function readStorageKey(gameId: string, power: Power): string {
  return `${READ_STORAGE_PREFIX}:${gameId}:${power}`;
}

/** How far this browser has read each channel of a game, by channel key. */
export function loadReadMarks(
  gameId: string,
  power: Power,
): Record<string, number> {
  try {
    const raw = localStorage.getItem(readStorageKey(gameId, power));
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

export function saveReadMarks(
  gameId: string,
  power: Power,
  marks: Record<string, number>,
): void {
  try {
    localStorage.setItem(readStorageKey(gameId, power), JSON.stringify(marks));
  } catch {
    // Ignore storage quota / privacy mode restrictions
  }
}
