import { Flag, Lock, Plus, Users } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { PowerFlag } from '../PowerFlag';
import styles from './GameRoomCard.module.css';

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
    <div
      key={game.game_id}
      className={styles.lobbyGameCard}
      data-testid="lobby-game-card"
    >
      <div className={styles.lobbyGameCardHeader}>
        <div>
          <div className={styles.lobbyGameTitleRow}>
            <h3 className={styles.lobbyGameTitle}>{game.name}</h3>
            {game.is_private && (
              <span
                className={styles.gameStatusPill}
                data-status="private"
                title="Private lobby protected by passcode"
              >
                <Lock size={11} /> Private
              </span>
            )}
          </div>
          <span className={styles.lobbyGameMeta}>
            {game.season} {game.year} ({game.phase}) · Hosted by{' '}
            {game.created_by} ·{' '}
            <span className={styles.gameIdMono}>ID: {game.game_id}</span>
          </span>
        </div>
        <div className={styles.lobbyGameBadges}>
          <span className={styles.playersCountPill}>
            <Users size={13} /> {claimedCount} / 7 Powers Claimed
          </span>
          <span
            className={styles.gameStatusPill}
            data-status={game.status === 'active' ? 'active' : 'waiting'}
          >
            {game.status === 'active' ? 'Active Match' : 'Recruiting Envoys'}
          </span>
        </div>
      </div>

      <div className={styles.lobbyPowersInstruction}>
        {myExistingClaim ? (
          <div className={styles.lobbyClaimAlertFlex}>
            <span>
              You are commanding{' '}
              <strong>
                <PowerFlag
                  power={myExistingClaim.power}
                  width={18}
                  height={12}
                  style={{ marginRight: 5 }}
                />
                {POWER_METADATA[myExistingClaim.power].shortName}
              </strong>{' '}
              in this campaign. Click your country below to enter, or select an
              unclaimed nation to switch.
            </span>
            <button
              type="button"
              className={styles.lobbyClaimLeaveBtn}
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

      <div className={styles.lobbyPowerSlotsGrid}>
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
              data-state={isMine ? 'mine' : isTakenByOther ? 'taken' : 'open'}
              className={styles.powerSlotBtn}
              style={{
                borderColor: isMine
                  ? meta.color
                  : isTakenByOther
                    ? 'rgba(0,0,0,0.12)'
                    : meta.color,
                backgroundColor: isMine ? meta.lightBg : undefined,
              }}
            >
              <div className={styles.powerSlotTop}>
                <span>
                  <PowerFlag power={pwr} width={18} height={12} />
                </span>
                <span
                  className={styles.powerSlotName}
                  style={{
                    color: isTakenByOther ? '#7a756c' : meta.color,
                  }}
                >
                  {meta.shortName}
                </span>
              </div>
              <div className={styles.powerSlotStatus}>
                {isBusy ? (
                  'Entering...'
                ) : isMine ? (
                  <span className={styles.slotYoursLabel}>
                    ★ Your Country (Enter)
                  </span>
                ) : isTakenByOther ? (
                  <span className={styles.slotTakenLabel}>
                    <Lock size={11} /> {occupant.display_name}
                  </span>
                ) : (
                  <span className={styles.slotClaimLabel}>
                    {game.has_passcode ? (
                      <Lock size={11} />
                    ) : (
                      <Plus size={11} />
                    )}{' '}
                    Claim {meta.shortName}
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
