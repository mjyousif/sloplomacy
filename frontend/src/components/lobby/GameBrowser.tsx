import { Globe, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { hasActiveFilters, pageCount } from '../../utils/lobbyBrowse';
import { GameBrowserFilters } from './GameBrowserFilters';
import { GameBrowserPager } from './GameBrowserPager';
import { GameBrowserRow } from './GameBrowserRow';
import { useLobbyBrowse } from './hooks/useLobbyBrowse';

export interface GameBrowserProps {
  user: AuthUser | null;
  /** The player's own games, so a row they are in offers Resume instead of Join. */
  myGames: MultiplayerGameSummary[];
  /** Changes whenever the lobby does, which reloads the open page. */
  refreshSignal: unknown;
  loadingGames: boolean;
  onRefreshGames: () => void;
  onOpenAuth: (reason?: string, tab?: 'signin' | 'signup') => void;
  onJoinOrEnterGame: (gameId: string, power: Power) => Promise<void>;
  /** Where the Host form is, for the empty state: "on the right" or "below". */
  hostFormPlace: string;
}

/** The public games, paged and filtered: open seats first, then most recently played. */
export const GameBrowser: React.FC<GameBrowserProps> = ({
  user,
  myGames,
  refreshSignal,
  loadingGames,
  onRefreshGames,
  onOpenAuth,
  onJoinOrEnterGame,
  hostFormPlace,
}) => {
  const { filters, setFilters, page, setPage, result, loading, error } =
    useLobbyBrowse(refreshSignal);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [joiningKey, setJoiningKey] = useState<string | null>(null);
  const now = Date.now();

  const myPowerIn = (gameId: string): Power | null => {
    if (!user) return null;
    const game = myGames.find((g) => g.game_id === gameId);
    const seat = Object.values(game?.participants ?? {}).find(
      (p) => p.user_id === user.id,
    );
    return seat?.power ?? null;
  };

  const claim = async (gameId: string, gameName: string, power: Power) => {
    if (!user) {
      onOpenAuth(
        `Sign in or create an account to claim ${POWER_METADATA[power].shortName} in "${gameName}".`,
        'signin',
      );
      return;
    }
    setJoiningKey(`${gameId}_${power}`);
    try {
      await onJoinOrEnterGame(gameId, power);
    } catch (err) {
      console.error(err);
    } finally {
      setJoiningKey(null);
    }
  };

  const rows = result?.games ?? [];
  const pages = pageCount(result?.total ?? 0, result?.page_size);

  return (
    <section className="lobby-section" data-testid="game-browser">
      <div className="lobby-section-header">
        <div className="lobby-section-title">
          <Globe size={18} />
          <h2>Multiplayer Lobbies — Pick Your Country</h2>
        </div>
        <button
          type="button"
          className="lobby-refresh-btn"
          onClick={onRefreshGames}
          disabled={loadingGames || loading}
        >
          <RefreshCw
            size={14}
            className={loadingGames || loading ? 'spin-icon' : ''}
          />
          <span>Refresh</span>
        </button>
      </div>

      <GameBrowserFilters filters={filters} onChange={setFilters} />

      {error && rows.length === 0 ? (
        <div className="lobby-empty-box">Could not load games: {error}</div>
      ) : rows.length === 0 && !loading ? (
        <div className="lobby-empty-box no-lobbies">
          <Globe size={28} className="empty-globe-icon" />
          <div>
            <strong>
              {hasActiveFilters(filters)
                ? 'No Games Match These Filters'
                : 'No Open Campaigns Right Now'}
            </strong>
            <p>
              {hasActiveFilters(filters)
                ? 'Try clearing a filter, or host your own match.'
                : `Host a new public or private match ${hostFormPlace}, or join a friend's game using their Game ID and passcode!`}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="browser-head" aria-hidden="true">
            <span>Game</span>
            <span>Turn</span>
            <span>Open seats</span>
            <span>Last move</span>
            <span>Created</span>
            <span />
          </div>
          <ul className="browser-list">
            {rows.map((row) => (
              <GameBrowserRow
                key={row.game_id}
                row={row}
                now={now}
                expanded={expandedId === row.game_id}
                onToggle={() =>
                  setExpandedId((id) =>
                    id === row.game_id ? null : row.game_id,
                  )
                }
                myPower={myPowerIn(row.game_id)}
                joiningKey={joiningKey}
                onClaim={(power) => claim(row.game_id, row.name, power)}
              />
            ))}
          </ul>
          {pages > 1 && (
            <GameBrowserPager page={page} pages={pages} onPage={setPage} />
          )}
        </>
      )}
    </section>
  );
};
