import { Flag, LogOut, ShieldAlert, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';

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
    <div className="surrender-modal-backdrop" onClick={onClose}>
      <div
        className="surrender-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="surrender-modal-header">
          <div className="surrender-header-title-group">
            <div
              className={`surrender-hazard-badge ${isSandbox ? 'trash' : 'flag'}`}
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
              <div className="surrender-overline">
                {isSandbox
                  ? 'TACTICAL SANDBOX REMOVAL'
                  : isActiveMatch
                    ? 'SURRENDER SOVEREIGN COMMAND'
                    : 'VACATE POWER IN LOBBY'}
              </div>
              <h2 className="surrender-main-title">
                {isSandbox
                  ? `Delete "${game.name}"?`
                  : isActiveMatch
                    ? `Surrender & Leave ${meta.shortName}?`
                    : `Leave Campaign Lobby for ${meta.shortName}?`}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="surrender-close-x"
            onClick={onClose}
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        {/* Campaign & Power Identity Chip */}
        <div
          className="surrender-power-banner"
          style={{
            borderColor: meta.color,
            backgroundColor: meta.lightBg,
          }}
        >
          <div className="surrender-power-crest">{meta.crest}</div>
          <div className="surrender-power-info">
            <strong style={{ color: meta.color }}>
              {meta.name} ({meta.shortName})
            </strong>
            <span className="surrender-campaign-name">
              Campaign: <strong>{game.name}</strong> ({game.season} {game.year}{' '}
              · {game.phase})
            </span>
          </div>
        </div>

        {/* Warning Explanations */}
        <div className="surrender-body-content">
          {isSandbox ? (
            <p>
              Are you sure you want to remove this saved tactical study from
              your profile? All recorded movements, pre-moves, and scenarios in
              this saved game will be permanently deleted.
            </p>
          ) : isActiveMatch ? (
            <div className="surrender-consequences-box">
              <div className="consequence-item">
                <ShieldAlert size={18} className="warn-icon" />
                <div>
                  <strong>Forces Enter Civil Disorder:</strong>
                  <p>
                    All military units under {meta.shortName}&apos;s flag will
                    immediately stand down to <code>HOLD</code> orders. Any
                    explicit attack plans or supports will be discarded.
                  </p>
                </div>
              </div>
              <div className="consequence-item">
                <LogOut size={18} className="warn-icon" />
                <div>
                  <strong>Vacating Sovereign Seat:</strong>
                  <p>
                    Your claim to {meta.shortName} will be vacated, allowing
                    another envoy from the Chancellery to claim it, or leaving
                    the power in neutral civil disorder.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p>
              This campaign has not commenced yet. Vacating your seat will
              release <strong>{meta.shortName}</strong> so another diplomat can
              claim it. You can re-join at any time before the campaign begins
              if seats remain open.
            </p>
          )}
        </div>

        {/* Modal Actions */}
        <div className="surrender-modal-footer">
          <button
            type="button"
            className="surrender-cancel-btn"
            onClick={onClose}
            disabled={loading}
          >
            Cancel &amp; Keep Position
          </button>

          {isSandbox ? (
            <button
              type="button"
              className="surrender-danger-btn"
              onClick={handleLeaveOnly}
              disabled={loading}
            >
              <Trash2 size={15} />
              <span>{loading ? 'Deleting...' : 'Delete Saved Study'}</span>
            </button>
          ) : isActiveMatch ? (
            <div className="surrender-btn-group">
              <button
                type="button"
                className="surrender-secondary-btn"
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
                className="surrender-danger-btn"
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
              className="surrender-danger-btn"
              onClick={handleLeaveOnly}
              disabled={loading}
            >
              <LogOut size={15} />
              <span>{loading ? 'Leaving...' : 'Vacate & Leave Lobby'}</span>
            </button>
          )}

          {/* Touch screens can't show the buttons' tooltips, so the difference is spelled out. */}
          {isActiveMatch && (
            <p className="surrender-choice-note compact-only">
              Both hand your units to Civil Disorder. Spectate keeps you in the
              room as an observer; Leave returns you to the lobby.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
