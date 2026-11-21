import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import { API_BASE } from '../lib/api';
import { authedFetch } from '../lib/supabase';
import { DEFAULT_GAME_ID } from '../utils/gameIds';
import { writeStoredSoloSandboxId } from '../utils/soloSandboxStorage';

export async function confirmAndDeleteLocalSandbox(opts: {
  activeGameId: string;
  confirm: (
    options: ConfirmOptions,
    event?: { shiftKey?: boolean } | null,
  ) => Promise<boolean>;
  event?: React.MouseEvent;
}): Promise<boolean> {
  const ok = await opts.confirm(
    {
      title: 'Delete Local Sandbox?',
      message:
        'Delete your local Solo Sandbox draft and return to the main lobby?',
      confirmLabel: 'Delete Sandbox',
    },
    opts.event,
  );
  if (!ok) return false;
  writeStoredSoloSandboxId(null);
  if (
    opts.activeGameId &&
    !opts.activeGameId.startsWith('local_') &&
    opts.activeGameId !== DEFAULT_GAME_ID
  ) {
    await authedFetch(
      `${API_BASE}/games/${encodeURIComponent(opts.activeGameId)}`,
      { method: 'DELETE' },
    ).catch(() => {});
  }
  return true;
}
