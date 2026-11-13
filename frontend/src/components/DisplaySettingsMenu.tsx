import { SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { DisplayPrefsSaveState } from '../hooks/useDisplayPrefs';
import {
  type DisplayPrefs,
  PIECE_STYLE_LABELS,
  PIECE_STYLES,
  type PieceStyle,
  UNIT_MARK_LABELS,
  UNIT_MARKS,
  type UnitMark,
} from '../utils/displayPrefs';
import { getPieceFrame, MapPiece, makePiecePill, SupplyStar } from './MapPiece';

const PREVIEW_COLOR = '#2f6e49';
const PREVIEW_LAND = '#c9c9a0';

const SAVE_MESSAGES: Record<DisplayPrefsSaveState, string> = {
  device: 'Saved on this device. Sign in to keep it across devices.',
  saving: 'Saving to your account…',
  account: 'Saved to your account.',
  failed: 'Couldn’t reach your account. Saved on this device.',
};

function PieceStylePreview({
  style,
  mark,
}: {
  style: PieceStyle;
  mark: UnitMark;
}) {
  const pill =
    style === 'nameplate' ? makePiecePill('Rome', 12, 0, true) : null;
  const frame = getPieceFrame(style, 1, pill);
  // Star seat and Name as piece carry the star, so only the others draw one beside the piece
  const separateStar: Record<
    PieceStyle,
    { x: number; y: number; scale: number } | null
  > = {
    classic: { x: 21, y: 9, scale: 1 },
    seated: null,
    compact: { x: 19, y: 7, scale: 0.65 },
    flags: { x: -10, y: 13, scale: 0.72 },
    nameplate: null,
  };
  const star = separateStar[style];
  const pieceX = style === 'flags' ? -10 : style === 'nameplate' ? 0 : -6;
  const pieceY = style === 'flags' ? 13 : 0;

  return (
    <svg
      className="display-option-preview"
      viewBox="-36 -22 72 44"
      aria-hidden="true"
    >
      <rect x="-36" y="-22" width="72" height="44" fill={PREVIEW_LAND} />
      {star && (
        <g transform={`translate(${star.x}, ${star.y})`}>
          <SupplyStar ownerColor={PREVIEW_COLOR} scale={star.scale} />
        </g>
      )}
      <g transform={`translate(${pieceX}, ${pieceY})`}>
        <MapPiece
          style={style}
          mark={mark}
          unitType="A"
          color={PREVIEW_COLOR}
          frame={frame}
          hasStar={style === 'flags'}
          showStar={style === 'seated'}
          starOwnerColor={PREVIEW_COLOR}
        />
      </g>
    </svg>
  );
}

function UnitMarkPreview({ mark }: { mark: UnitMark }) {
  const frame = getPieceFrame('classic');
  return (
    <svg
      className="display-option-preview"
      viewBox="-38 -22 76 44"
      aria-hidden="true"
    >
      <rect x="-38" y="-22" width="76" height="44" fill={PREVIEW_LAND} />
      <g transform="translate(-18, 0)">
        <MapPiece
          style="classic"
          mark={mark}
          unitType="A"
          color={PREVIEW_COLOR}
          frame={frame}
        />
      </g>
      <g transform="translate(18, 0)">
        <MapPiece
          style="classic"
          mark={mark}
          unitType="F"
          color={PREVIEW_COLOR}
          frame={frame}
        />
      </g>
    </svg>
  );
}

interface DisplaySettingsMenuProps {
  prefs: DisplayPrefs;
  saveState: DisplayPrefsSaveState;
  onChange: (change: Partial<DisplayPrefs>) => void;
}

/**
 * The choices themselves. The desktop top bar shows them in its own popover, and the
 * phone top bar shows them inside its ⋯ menu.
 */
export function DisplaySettingsOptions({
  prefs,
  saveState,
  onChange,
}: DisplaySettingsMenuProps) {
  return (
    <>
      <h2 className="display-settings-title">Display settings</h2>
      <p className="display-settings-note">These only change what you see.</p>

      <fieldset className="display-settings-group">
        <legend>Piece style</legend>
        {PIECE_STYLES.map((style) => (
          <label key={style} className="display-option">
            <input
              type="radio"
              name="display-piece-style"
              checked={prefs.pieceStyle === style}
              onChange={() => onChange({ pieceStyle: style })}
            />
            <span className="display-option-card">
              <PieceStylePreview style={style} mark={prefs.unitMark} />
              <span className="display-option-text">
                <span className="display-option-name">
                  {PIECE_STYLE_LABELS[style].name}
                </span>
                <span className="display-option-description">
                  {PIECE_STYLE_LABELS[style].description}
                </span>
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="display-settings-group">
        <legend>Army and fleet marks</legend>
        <div className="display-mark-grid">
          {UNIT_MARKS.map((mark) => (
            <label key={mark} className="display-option">
              <input
                type="radio"
                name="display-unit-mark"
                checked={prefs.unitMark === mark}
                onChange={() => onChange({ unitMark: mark })}
              />
              <span className="display-option-card stacked">
                <UnitMarkPreview mark={mark} />
                <span className="display-option-name">
                  {UNIT_MARK_LABELS[mark]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="display-settings-group">
        <legend>Notifications</legend>
        <label className="display-option">
          <input
            type="checkbox"
            checked={prefs.soundNotifications}
            onChange={(event) =>
              onChange({ soundNotifications: event.target.checked })
            }
          />
          <span className="display-option-card">
            <span className="display-option-icon" aria-hidden="true">
              {prefs.soundNotifications ? (
                <Volume2 size={18} />
              ) : (
                <VolumeX size={18} />
              )}
            </span>
            <span className="display-option-text">
              <span className="display-option-name">Turn &amp; vote chime</span>
              <span className="display-option-description">
                Play an audio chime when a turn or vote needs your attention in
                a background tab.
              </span>
            </span>
          </span>
        </label>
      </fieldset>

      <p className="display-settings-status" role="status">
        {SAVE_MESSAGES[saveState]}
      </p>
    </>
  );
}

/** The top bar control for this player's own map display. It stays open so changes show live. */
export function DisplaySettingsMenu({
  prefs,
  saveState,
  onChange,
}: DisplaySettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    panelRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="display-settings" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className={`display-settings-toggle ${open ? 'open' : ''}`}
        aria-label="Display settings"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Display settings"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <SlidersHorizontal size={15} />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="display-settings-panel"
          role="dialog"
          aria-label="Display settings"
        >
          <DisplaySettingsOptions
            prefs={prefs}
            saveState={saveState}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}
