import { Flag, LogOut, ShieldAlert, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import { cx } from '../utils/cx';
import { Modal, ModalCloseButton, ModalFooter } from './modal/Modal';
import { PowerFlag } from './PowerFlag';
import styles from './SurrenderModal.module.css';

interface SurrenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: MultiplayerGameSummary | null;
  power: Power | null;
  onSurrender: (gameId: string, power: Power, leave: boolean) => Promise<void>;
  onLeave: (gameId: string, power: Power) => Promise<void>;
}

export const SurrenderModal: React.FC<SurrenderModalProps> = ({
  isOpen,
  onClose,
  game,
  power,
  onSurrender,
  onLeave,
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen || !game || !power) return null;

  const meta = POWER_METADATA[power];
  const isSandbox = Boolean(game.is_sandbox);
  const isActiveMatch = game.status === 'active' && !isSandbox;

  const handleSurrenderAndLeave = async () => {
    setLoading(true);
    try {
      await onSurrender(game.game_id, power, true);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSurrenderSpectate = async () => {
    setLoading(true);
    try {
      await onSurrender(game.game_id, power, false);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveOnly = async () => {
    setLoading(true);
    try {
      await onLeave(game.game_id, power);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      scrim="emphatic"
      onBackdropClick={onClose}
      cardClassName={styles.surrenderModalCard}
    >
      {/* Modal Header */}
      <div className={styles.surrenderModalHeader}>
        <div className={styles.surrenderHeaderTitleGroup}>
          <div
            className={styles.surrenderHazardBadge}
            data-variant={isSandbox ? 'trash' : 'flag'}
          >
            {isSandbox ? (
              <Trash2 size={24} />
            ) : isActiveMatch ? (
              <Flag size={24} />
            ) : (
              <LogOut size={24} />
            )}
          </div>
          <div>
            <div className={styles.surrenderOverline}>
              {isSandbox
                ? 'TACTICAL SANDBOX REMOVAL'
                : isActiveMatch
                  ? 'SURRENDER SOVEREIGN COMMAND'
                  : 'VACATE POWER IN LOBBY'}
            </div>
            <h2 className={styles.surrenderMainTitle}>
              {isSandbox
                ? `Delete "${game.name}"?`
                : isActiveMatch
                  ? `Surrender & Leave ${meta.shortName}?`
                  : `Leave Campaign Lobby for ${meta.shortName}?`}
            </h2>
          </div>
        </div>
        <ModalCloseButton
          className={styles.surrenderCloseX}
          onClick={onClose}
          disabled={loading}
        >
          <X size={18} />
        </ModalCloseButton>
      </div>

      {/* Campaign & Power Identity Chip */}
      <div
        className={styles.surrenderPowerBanner}
        style={{
          borderColor: meta.color,
          backgroundColor: meta.lightBg,
        }}
      >
        <div className={styles.surrenderPowerCrest}>
          <PowerFlag power={power} width={42} height={28} />
        </div>
        <div className={styles.surrenderPowerInfo}>
          <strong style={{ color: meta.color }}>
            {meta.name} ({meta.shortName})
          </strong>
          <span className={styles.surrenderCampaignName}>
            Campaign: <strong>{game.name}</strong> ({game.season} {game.year} ·{' '}
            {game.phase})
          </span>
        </div>
      </div>

      {/* Warning Explanations */}
      <div className={styles.surrenderBodyContent}>
        {isSandbox ? (
          <p>
            Are you sure you want to remove this saved tactical study from your
            profile? All recorded movements, pre-moves, and scenarios in this
            saved game will be permanently deleted.
          </p>
        ) : isActiveMatch ? (
          <div className={styles.surrenderConsequencesBox}>
            <div className={styles.consequenceItem}>
              <ShieldAlert size={18} className={styles.warnIcon} />
              <div>
                <strong>Forces Enter Civil Disorder:</strong>
                <p>
                  All military units under {meta.shortName}&apos;s flag will
                  immediately stand down to <code>HOLD</code> orders. Any
                  explicit attack plans or supports will be discarded.
                </p>
              </div>
            </div>
            <div className={styles.consequenceItem}>
              <LogOut size={18} className={styles.warnIcon} />
              <div>
                <strong>Vacating Sovereign Seat:</strong>
                <p>
                  Your claim to {meta.shortName} will be vacated, allowing
                  another envoy from the Chancellery to claim it, or leaving the
                  power in neutral civil disorder.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p>
            This campaign has not commenced yet. Vacating your seat will release{' '}
            <strong>{meta.shortName}</strong> so another diplomat can claim it.
            You can re-join at any time before the campaign begins if seats
            remain open.
          </p>
        )}
      </div>

      {/* Modal Actions */}
      <ModalFooter className={styles.surrenderModalFooter}>
        <button
          type="button"
          className={styles.surrenderCancelBtn}
          onClick={onClose}
          disabled={loading}
        >
          Cancel &amp; Keep Position
        </button>

        {isSandbox ? (
          <button
            type="button"
            className={styles.surrenderDangerBtn}
            onClick={handleLeaveOnly}
            disabled={loading}
          >
            <Trash2 size={15} />
            <span>{loading ? 'Deleting...' : 'Delete Saved Study'}</span>
          </button>
        ) : isActiveMatch ? (
          <div className={styles.surrenderBtnGroup}>
            <button
              type="button"
              className={styles.surrenderSecondaryBtn}
              onClick={handleSurrenderSpectate}
              disabled={loading}
              title="Concede command to Civil Disorder, but remain in the room as an observer"
            >
              <Flag size={14} />
              <span>
                {loading ? 'Surrendering...' : 'Surrender (Spectate)'}
              </span>
            </button>
            <button
              type="button"
              className={styles.surrenderDangerBtn}
              onClick={handleSurrenderAndLeave}
              disabled={loading}
              title="Surrender command to Civil Disorder and return to the main lobby"
            >
              <LogOut size={15} />
              <span>
                {loading ? 'Processing...' : 'Surrender & Leave Game'}
              </span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.surrenderDangerBtn}
            onClick={handleLeaveOnly}
            disabled={loading}
          >
            <LogOut size={15} />
            <span>{loading ? 'Leaving...' : 'Vacate & Leave Lobby'}</span>
          </button>
        )}

        {/* Touch screens can't show the buttons' tooltips, so the difference is spelled out. */}
        {isActiveMatch && (
          <p
            className={cx(styles.surrenderChoiceNote, 'compact-only')}
            data-testid="surrender-choice-note"
          >
            Both hand your units to Civil Disorder. Spectate keeps you in the
            room as an observer; Leave returns you to the lobby.
          </p>
        )}
      </ModalFooter>
    </Modal>
  );
};
