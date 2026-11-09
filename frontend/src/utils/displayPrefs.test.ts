import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DISPLAY_PREFS,
  type DisplayPrefs,
  PIECE_STYLE_LABELS,
  PIECE_STYLES,
  readStoredDisplayPrefs,
  resolveSignInPrefs,
  sanitizeDisplayPrefs,
  UNIT_MARK_LABELS,
  UNIT_MARKS,
  writeStoredDisplayPrefs,
} from './displayPrefs';

const FLAGS_AND_TANKS: DisplayPrefs = {
  pieceStyle: 'flags',
  unitMark: 'vehicles',
};
const CLASSIC_LETTERS: DisplayPrefs = {
  pieceStyle: 'classic',
  unitMark: 'letters',
};

describe('sanitizeDisplayPrefs', () => {
  it('keeps valid settings', () => {
    expect(sanitizeDisplayPrefs(FLAGS_AND_TANKS)).toEqual(FLAGS_AND_TANKS);
  });

  it('accepts every option the menu offers', () => {
    for (const pieceStyle of PIECE_STYLES) {
      for (const unitMark of UNIT_MARKS) {
        expect(sanitizeDisplayPrefs({ pieceStyle, unitMark })).toEqual({
          pieceStyle,
          unitMark,
        });
      }
    }
  });

  it('falls back to the default for anything that is not a settings object', () => {
    for (const junk of [null, undefined, 'seated', 7, [], true]) {
      expect(sanitizeDisplayPrefs(junk)).toEqual(DEFAULT_DISPLAY_PREFS);
    }
  });

  it('repairs a bad setting without losing the good one', () => {
    expect(
      sanitizeDisplayPrefs({ pieceStyle: 'hologram', unitMark: 'vehicles' }),
    ).toEqual({
      pieceStyle: DEFAULT_DISPLAY_PREFS.pieceStyle,
      unitMark: 'vehicles',
    });
    expect(sanitizeDisplayPrefs({ pieceStyle: 'flags' })).toEqual({
      pieceStyle: 'flags',
      unitMark: DEFAULT_DISPLAY_PREFS.unitMark,
    });
  });

  it('drops fields it does not recognise', () => {
    expect(
      sanitizeDisplayPrefs({ ...FLAGS_AND_TANKS, extra: 'value' }),
    ).toEqual(FLAGS_AND_TANKS);
  });
});

describe('option labels', () => {
  it('names every option', () => {
    expect(Object.keys(PIECE_STYLE_LABELS).sort()).toEqual(
      [...PIECE_STYLES].sort(),
    );
    expect(Object.keys(UNIT_MARK_LABELS).sort()).toEqual(
      [...UNIT_MARKS].sort(),
    );
  });
});

describe('device storage', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    });
  });

  it('reads back what was saved', () => {
    writeStoredDisplayPrefs(FLAGS_AND_TANKS);
    expect(readStoredDisplayPrefs()).toEqual(FLAGS_AND_TANKS);
  });

  it('reports nothing saved as null, which is different from choosing the default', () => {
    expect(readStoredDisplayPrefs()).toBeNull();
  });

  it('treats unreadable saved data as nothing saved', () => {
    localStorage.setItem('diplomacy_1901_display_prefs', '{not json');
    expect(readStoredDisplayPrefs()).toBeNull();
  });

  it('survives a browser that refuses storage', () => {
    const refuse = () => {
      throw new Error('storage disabled');
    };
    vi.stubGlobal('localStorage', { getItem: refuse, setItem: refuse });

    expect(readStoredDisplayPrefs()).toBeNull();
    expect(() => writeStoredDisplayPrefs(FLAGS_AND_TANKS)).not.toThrow();
  });
});

describe('resolveSignInPrefs', () => {
  it('lets the account win when it has a saved choice', () => {
    expect(
      resolveSignInPrefs({
        accountPrefs: FLAGS_AND_TANKS,
        devicePrefs: CLASSIC_LETTERS,
        editedDuringFetch: false,
      }),
    ).toEqual({ apply: FLAGS_AND_TANKS, upload: null });
  });

  it('cleans what the account holds, since players can edit their own metadata', () => {
    expect(
      resolveSignInPrefs({
        accountPrefs: { pieceStyle: 'hologram' },
        devicePrefs: null,
        editedDuringFetch: false,
      }).apply,
    ).toEqual(DEFAULT_DISPLAY_PREFS);
  });

  it('uploads the device choice to an account with none', () => {
    expect(
      resolveSignInPrefs({
        accountPrefs: null,
        devicePrefs: FLAGS_AND_TANKS,
        editedDuringFetch: false,
      }),
    ).toEqual({ apply: null, upload: FLAGS_AND_TANKS });
  });

  it('pins nothing for someone who never chose, so they keep following the default', () => {
    expect(
      resolveSignInPrefs({
        accountPrefs: null,
        devicePrefs: null,
        editedDuringFetch: false,
      }),
    ).toEqual({ apply: null, upload: null });
  });

  it('keeps a change made while the account was loading, over what the account held', () => {
    expect(
      resolveSignInPrefs({
        accountPrefs: CLASSIC_LETTERS,
        devicePrefs: FLAGS_AND_TANKS,
        editedDuringFetch: true,
      }),
    ).toEqual({ apply: null, upload: FLAGS_AND_TANKS });
  });
});
