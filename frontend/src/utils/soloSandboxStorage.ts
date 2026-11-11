/** Where this browser remembers its personal draft solo sandbox, so it can be resumed. */
export const SOLO_SANDBOX_STORAGE_KEY = 'sloplomacy_solo_sandbox_id';

/** The remembered draft solo sandbox id, or null. Anything not a `solo_` id is ignored. */
export function readStoredSoloSandboxId(): string | null {
  try {
    const val = localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)?.trim();
    return val?.startsWith('solo_') ? val : null;
  } catch {
    return null;
  }
}

/** Remembers a draft solo sandbox id, or forgets it for anything else (null included). */
export function writeStoredSoloSandboxId(gameId: string | null): void {
  try {
    if (gameId?.startsWith('solo_')) {
      localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, gameId);
    } else {
      localStorage.removeItem(SOLO_SANDBOX_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode restrictions
  }
}
