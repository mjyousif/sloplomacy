import { Crown, Eye, Home, X } from 'lucide-react';
import type React from 'react';
import {
  type AuthUser,
  type GameState,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../types/diplomacy';
import {
  getMyParticipant,
  getSupplyCenterCounts,
} from '../utils/gameOverHelpers';
import { PowerFlag } from './PowerFlag';

export interface GameOverModalProps {
  isOpen: boolean;
  gameState: GameState;
  provinces: Record<string, ProvinceInfo>;
  summary: MultiplayerGameSummary | null;
  authUser: AuthUser | null;
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  onInspectBoard: () => void;
  onReturnToLobby: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  gameState,
  provinces,
  summary,
  authUser,
  viewMode,
  onInspectBoard,
  onReturnToLobby,
}) => {
  const winner = gameState.winner;
  if (!isOpen || !winner) return null;

  const winnerMeta = POWER_METADATA[winner];
  const winnerPowerName = winnerMeta.shortName;
  const standings = getSupplyCenterCounts(gameState, provinces);
  const winnerScCount = standings.find((s) => s.power === winner)?.count ?? 18;

  const myParticipant =
    viewMode === 'multiplayer' ? getMyParticipant(summary, authUser) : null;
  const viewerPower: Power | null = myParticipant?.power ?? null;
  const displayName =
    myParticipant?.display_name || authUser?.displayName || 'Envoy';

  const isVictory = viewMode === 'multiplayer' && viewerPower === winner;
  const isParticipantDefeat =
    viewMode === 'multiplayer' &&
    viewerPower !== null &&
    viewerPower !== winner;

  const seasonYear = `${gameState.season} ${gameState.year}`;
  const badgeText = isVictory
    ? `HEGEMONY ACHIEVED · ${seasonYear.toUpperCase()}`
    : `CAMPAIGN CONCLUDED · ${seasonYear.toUpperCase()}`;

  const title = isVictory
    ? 'Continental Hegemony Secured'
    : isParticipantDefeat
      ? `The Chancellery Recognizes ${winnerPowerName}`
      : `${winnerPowerName} Claims Continental Hegemony`;

  const inspectLabel = isParticipantDefeat
    ? 'Review Final Map & History'
    : 'Inspect Final Board';

  return (
    <div
      className="game-over-modal-backdrop"
      data-testid="game-over-modal-backdrop"
      onClick={onInspectBoard}
    >
      <div
        className={`game-over-modal-card ${isVictory ? 'victory' : ''}`}
        data-testid="game-over-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-over-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="game-over-modal-header">
          <span className="game-over-badge">
            <Crown size={14} />
            <span>{badgeText}</span>
          </span>
          <button
            type="button"
            className="game-over-close-btn"
            aria-label="Close Game Over modal"
            onClick={onInspectBoard}
          >
            <X size={18} />
          </button>
        </div>

        <div className="game-over-hero">
          <div
            className="game-over-crest"
            style={{
              borderColor: winnerMeta.color,
              backgroundColor: winnerMeta.lightBg,
            }}
          >
            <PowerFlag power={winner} width={38} height={26} />
          </div>
          <h2 id="game-over-modal-title" className="game-over-title">
            {title}
          </h2>
        </div>

        <p className="game-over-body">
          {isVictory ? (
            <>
              Congratulations, Envoy <strong>{displayName}</strong>. Under the
              banner of <strong>{winnerPowerName}</strong>, your General Staff
              has secured <strong>{winnerScCount} supply centers</strong> and
              established undisputed dominion across the European theatre. The
              Chancellery records this campaign in your honor.
            </>
          ) : isParticipantDefeat && viewerPower ? (
            <>
              Envoy <strong>{displayName}</strong>, the instruments of peace
              have been signed. <strong>{winnerPowerName}</strong> has secured{' '}
              <strong>{winnerScCount} supply centers</strong>, bringing the{' '}
              <strong>{seasonYear}</strong> campaign to a close. Though{' '}
              <strong>{POWER_METADATA[viewerPower].shortName}</strong> did not
              claim continental hegemony, your dispatches and maneuvers are
              preserved in the Chancellery archives.
            </>
          ) : (
            <>
              The campaign has concluded in <strong>{seasonYear}</strong>.{' '}
              <strong>{winnerPowerName}</strong> has secured{' '}
              <strong>{winnerScCount} supply centers</strong>, achieving the
              majority threshold required for victory.
            </>
          )}
        </p>

        <div className="game-over-standings">
          <div className="game-over-standings-label">
            Final Supply Center Standings
          </div>
          <div className="game-over-standings-grid">
            {standings.map(({ power, count }) => {
              const meta = POWER_METADATA[power];
              const isWinner = power === winner;
              return (
                <div
                  key={power}
                  className={`game-over-standing-chip ${isWinner ? 'winner' : ''}`}
                  style={
                    isWinner
                      ? {
                          borderColor: meta.color,
                          backgroundColor: meta.lightBg,
                        }
                      : undefined
                  }
                >
                  <PowerFlag power={power} width={16} height={11} />
                  <span className="game-over-standing-name">
                    {meta.shortName}
                  </span>
                  <span className="game-over-standing-count">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="game-over-actions">
          <button
            type="button"
            className="game-over-primary-btn"
            data-testid="game-over-inspect-btn"
            onClick={onInspectBoard}
          >
            <Eye size={15} />
            <span>{inspectLabel}</span>
          </button>
          <button
            type="button"
            className="game-over-secondary-btn"
            data-testid="game-over-lobby-btn"
            onClick={onReturnToLobby}
          >
            <Home size={15} />
            <span>Return to Chancellery</span>
          </button>
        </div>
      </div>
    </div>
  );
};
