/**
 * Per-player display preferences. They change only what this player sees on
 * their own map, so they never touch game state or the backend.
 *
 * Saved values come from localStorage and from Supabase `user_metadata`, both of
 * which the player can edit, so everything read back goes through
 * `sanitizeDisplayPrefs` before it reaches the map.
 */

export const PIECE_STYLES = [
  'classic',
  'seated',
  'compact',
  'flags',
  'nameplate',
] as const;
export type PieceStyle = (typeof PIECE_STYLES)[number];

export const UNIT_MARKS = ['icons', 'vehicles', 'nato', 'letters'] as const;
export type UnitMark = (typeof UNIT_MARKS)[number];

export interface DisplayPrefs {
  pieceStyle: PieceStyle;
  unitMark: UnitMark;
  soundNotifications: boolean;
}

/** What a player sees until they choose. Star seat clears the most names without any action. */
export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  pieceStyle: 'seated',
  unitMark: 'icons',
  soundNotifications: true,
};

export const PIECE_STYLE_LABELS: Record<
  PieceStyle,
  { name: string; description: string }
> = {
  classic: {
    name: 'Classic',
    description: 'The original large tokens and separate stars.',
  },
  seated: {
    name: 'Star seat',
    description: 'A smaller token that carries the star on its rim.',
  },
  compact: {
    name: 'Compact pieces',
    description: 'The smallest tokens, with a small separate star.',
  },
  flags: {
    name: 'Command flags',
    description: 'A flag on a pole that can fly over borders and sea.',
  },
  nameplate: {
    name: 'Name as piece',
    description: 'The province name lights up in the unit’s colour.',
  },
};

export const UNIT_MARK_LABELS: Record<UnitMark, string> = {
  icons: 'Swords and ship',
  vehicles: 'Tank and warship',
  nato: 'NATO symbols',
  letters: 'A and F letters',
};

const STORAGE_KEY = 'diplomacy_1901_display_prefs';

const isPieceStyle = (value: unknown): value is PieceStyle =>
  PIECE_STYLES.includes(value as PieceStyle);

const isUnitMark = (value: unknown): value is UnitMark =>
  UNIT_MARKS.includes(value as UnitMark);

/** Keeps each valid setting and falls back to the default for anything else. */
export function sanitizeDisplayPrefs(raw: unknown): DisplayPrefs {
  const candidate = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof DisplayPrefs, unknown>
  >;
  return {
    pieceStyle: isPieceStyle(candidate.pieceStyle)
      ? candidate.pieceStyle
      : DEFAULT_DISPLAY_PREFS.pieceStyle,
    unitMark: isUnitMark(candidate.unitMark)
      ? candidate.unitMark
      : DEFAULT_DISPLAY_PREFS.unitMark,
    soundNotifications:
      typeof candidate.soundNotifications === 'boolean'
        ? candidate.soundNotifications
        : DEFAULT_DISPLAY_PREFS.soundNotifications,
  };
}

/** Returns the choice saved on this device, or null if nothing was ever chosen here. */
export function readStoredDisplayPrefs(): DisplayPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeDisplayPrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeStoredDisplayPrefs(prefs: DisplayPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private windows can refuse storage. The choice still applies for this visit.
  }
}

export interface SignInPrefsInput {
  /** The raw value saved on the account, or null if the account has none. */
  accountPrefs: unknown | null;
  /** The choice saved on this device, or null if nothing was chosen here. */
  devicePrefs: DisplayPrefs | null;
  /** True if the player changed a setting while the account was being read. */
  editedDuringFetch: boolean;
}

export interface SignInPrefsResult {
  /** The value to apply, or null to leave the current display alone. */
  apply: DisplayPrefs | null;
  /** The value to save to the account, or null if the account is already right. */
  upload: DisplayPrefs | null;
}

/**
 * Decides what happens once an account's saved value has been read. Only call
 * this after a successful read: a failed read says nothing about the account,
 * and treating it as empty would overwrite the player's saved choice.
 */
export function resolveSignInPrefs({
  accountPrefs,
  devicePrefs,
  editedDuringFetch,
}: SignInPrefsInput): SignInPrefsResult {
  // A change made while waiting is newer than whatever the account holds
  if (editedDuringFetch) {
    return { apply: null, upload: devicePrefs };
  }
  if (accountPrefs !== null && accountPrefs !== undefined) {
    return { apply: sanitizeDisplayPrefs(accountPrefs), upload: null };
  }
  // Someone who never chose keeps following the default, so nothing is pinned for them
  return { apply: null, upload: devicePrefs };
}
