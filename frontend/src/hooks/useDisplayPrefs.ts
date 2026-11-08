import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAccountDisplayPrefs,
  saveAccountDisplayPrefs,
} from '../lib/supabase';
import { AuthUser } from '../types/diplomacy';
import {
  DEFAULT_DISPLAY_PREFS,
  DisplayPrefs,
  readStoredDisplayPrefs,
  resolveSignInPrefs,
  writeStoredDisplayPrefs,
} from '../utils/displayPrefs';

/** Where the current choice is saved, which the settings menu tells the player. */
export type DisplayPrefsSaveState = 'device' | 'saving' | 'account' | 'failed';

const ACCOUNT_SAVE_DELAY_MS = 600;

export interface UseDisplayPrefsResult {
  prefs: DisplayPrefs;
  saveState: DisplayPrefsSaveState;
  updatePrefs: (change: Partial<DisplayPrefs>) => void;
}

/**
 * Holds this player's display preferences. A change applies at once and is saved
 * on the device right away, then to the account after a short delay so clicking
 * through the options doesn't send a request per click.
 */
export function useDisplayPrefs(user: AuthUser | null): UseDisplayPrefsResult {
  const [prefs, setPrefs] = useState<DisplayPrefs>(
    () => readStoredDisplayPrefs() ?? DEFAULT_DISPLAY_PREFS,
  );
  const [saveState, setSaveState] = useState<DisplayPrefsSaveState>('device');

  const prefsRef = useRef<DisplayPrefs>(prefs);
  prefsRef.current = prefs;
  const userRef = useRef<AuthUser | null>(user);
  userRef.current = user;
  const editsRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveToAccount = useCallback(
    async (account: AuthUser, value: DisplayPrefs) => {
      setSaveState('saving');
      const { error } = await saveAccountDisplayPrefs(account, value);
      // Ignore the result if the player has since signed out or switched accounts
      if (userRef.current?.id === account.id) {
        setSaveState(error ? 'failed' : 'account');
      }
    },
    [],
  );

  const userId = user?.id ?? null;

  useEffect(() => {
    const account = userRef.current;
    if (!account) {
      setSaveState('device');
      return;
    }

    let cancelled = false;
    const editsAtStart = editsRef.current;
    setSaveState('saving');

    fetchAccountDisplayPrefs(account).then(({ prefs: accountPrefs, error }) => {
      if (cancelled) return;
      if (error) {
        // A failed read must not be mistaken for an empty account, so nothing is uploaded
        setSaveState('failed');
        return;
      }

      const { apply, upload } = resolveSignInPrefs({
        accountPrefs,
        devicePrefs: readStoredDisplayPrefs(),
        editedDuringFetch: editsRef.current !== editsAtStart,
      });

      if (apply) {
        setPrefs(apply);
        writeStoredDisplayPrefs(apply);
      }
      if (upload) {
        void saveToAccount(account, upload);
      } else {
        setSaveState('account');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId, saveToAccount]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const updatePrefs = useCallback(
    (change: Partial<DisplayPrefs>) => {
      editsRef.current += 1;
      const next = { ...prefsRef.current, ...change };
      prefsRef.current = next;
      setPrefs(next);
      writeStoredDisplayPrefs(next);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const account = userRef.current;
      if (account) {
        setSaveState('saving');
        saveTimerRef.current = setTimeout(() => {
          void saveToAccount(account, next);
        }, ACCOUNT_SAVE_DELAY_MS);
      }
    },
    [saveToAccount],
  );

  return { prefs, saveState, updatePrefs };
}
