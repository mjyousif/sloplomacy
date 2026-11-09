import { Flag, Lock, Users } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';

export interface GameRoomCardProps {
  game: MultiplayerGameSummary;
  user: AuthUser | null;
  joiningKey: string | null;
  onOpenSurrenderModal: (game: MultiplayerGameSummary, power: Power) => void;
  handlePowerSlotClick: (game: MultiplayerGameSummary, power: Power) => void;
}

export const GameRoomCard: React.FC<GameRoomCardProps> = ({
  game,
  user,
  joiningKey,
  onOpenSurrenderModal,
  handlePowerSlotClick,
}) => {
  const participants = game.participants || {};
  const claimedCount = Object.keys(participants).length;

  const myExistingClaim = user
    ? Object.values(participants).find((p) => p.user_id === user.id)
    : undefined;

  return (
    <div key={game.game_id} className="lobby-game-card">
      <div className="lobby-game-card-header">
        <div>
          <div className="lobby-game-title-row">
            <h3 className="lobby-game-title">{game.name}</h3>
            {game.is_private && (
              <span
                className="game-status-pill private"
                title="Private lobby protected by passcode"
              >
                <Lock size={11} /> Private
              </span>
            )}
          </div>
          <span className="lobby-game-meta">
            {game.season} {game.year} ({game.phase}) · Hosted by{' '}
            {game.created_by} ·{' '}
            <span className="game-id-mono">ID: {game.game_id}</span>
          </span>
        </div>
        <div className="lobby-game-badges">
          <span className="players-count-pill">
            <Users size={13} /> {claimedCount} / 7 Powers Claimed
          </span>
          <span
            className={`game-status-pill ${
              game.status === 'active' ? 'active' : 'waiting'
            }`}
          >
            {game.status === 'active' ? 'Active Match' : 'Recruiting Envoys'}
          </span>
        </div>
      </div>

      <div className="lobby-powers-instruction">
        {myExistingClaim ? (
          <div className="lobby-claim-alert-flex">
            <span>
              You are commanding{' '}
              <strong>
                {POWER_METADATA[myExistingClaim.power].crest}{' '}
                {POWER_METADATA[myExistingClaim.power].shortName}
              </strong>{' '}
              in this campaign. Click your country below to enter, or select an
              unclaimed nation to switch.
            </span>
            <button
              type="button"
              className="lobby-claim-leave-btn"
              title="Surrender command and leave this match"
              onClick={() => onOpenSurrenderModal(game, myExistingClaim.power)}
            >
              <Flag size={12} />
              <span>
                {game.status === 'active' ? 'Surrender & Leave' : 'Leave Match'}
              </span>
            </button>
          </div>
        ) : (
          <span>
            Select an available Great Power below to claim it and enter the
            match
            {game.has_passcode ? ' (Passcode Required)' : ''}:
          </span>
        )}
      </div>

      <div className="lobby-power-slots-grid">
        {ALL_POWERS.map((pwr) => {
          const meta = POWER_METADATA[pwr];
          const occupant = participants[pwr];
          const isMine = Boolean(user) && occupant?.user_id === user?.id;
          const isTakenByOther = Boolean(occupant) && !isMine;
          const isBusy = joiningKey === `${game.game_id}_${pwr}`;

          return (
            <button
              key={pwr}
              type="button"
              disabled={isTakenByOther || isBusy}
              onClick={() => handlePowerSlotClick(game, pwr)}
              className={`power-slot-btn ${
                isMine
                  ? 'slot-mine'
                  : isTakenByOther
                    ? 'slot-taken'
                    : 'slot-open'
              }`}
              style={{
                borderColor: isMine
                  ? meta.color
                  : isTakenByOther
                    ? 'rgba(0,0,0,0.12)'
                    : meta.color,
                backgroundColor: isMine ? meta.lightBg : undefined,
              }}
            >
              <div className="power-slot-top">
                <span className="power-slot-crest">{meta.crest}</span>
                <span
                  className="power-slot-name"
                  style={{
                    color: isTakenByOther ? '#7a756c' : meta.color,
                  }}
                >
                  {meta.shortName}
                </span>
              </div>
              <div className="power-slot-status">
                {isBusy ? (
                  'Entering...'
                ) : isMine ? (
                  <span className="slot-yours-label">
                    ★ Your Country (Enter)
                  </span>
                ) : isTakenByOther ? (
                  <span className="slot-taken-label">
                    🔒 {occupant.display_name}
                  </span>
                ) : (
                  <span className="slot-claim-label">
                    {game.has_passcode ? '🔒' : '+'} Claim {meta.shortName}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
