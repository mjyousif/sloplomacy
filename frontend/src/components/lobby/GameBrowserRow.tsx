import { ChevronDown, ChevronUp, Lock, Play } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type LobbyGameRow,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { relativeTime, shortDate, shortTurn } from '../../utils/lobbyBrowse';
import { PowerFlag } from '../PowerFlag';

export interface GameBrowserRowProps {
  row: LobbyGameRow;
  expanded: boolean;
  onToggle: () => void;
  /** The power the player holds in this game, if they are in it. */
  myPower: Power | null;
  /** `${game_id}_${power}` while that seat is being claimed. */
  joiningKey: string | null;
  onClaim: (power: Power) => void;
  now: number;
}

/** One public game: a compact row that opens into the seats you can claim. */
export const GameBrowserRow: React.FC<GameBrowserRowProps> = ({
  row,
  expanded,
  onToggle,
  myPower,
  joiningKey,
  onClaim,
  now,
}) => {
  const isOpen = row.open_powers.length > 0 && row.status !== 'completed';
  const fullTurn = `${row.season} ${row.year} · ${row.phase}`;

  return (
    <li
      className={`browser-row ${expanded ? 'expanded' : ''}`}
      data-testid={`browser-row-${row.game_id}`}
    >
      <div className="browser-row-main">
        <div className="browser-cell browser-name">
          <span className="browser-game-name">{row.name}</span>
          <span className="browser-host">by {row.host_name}</span>
        </div>
        <span className="browser-cell browser-turn" title={fullTurn}>
          {shortTurn(row.season, row.year, row.phase)}
        </span>
        <span
          className="browser-cell browser-open-seats"
          title={
            isOpen
              ? `Open: ${row.open_powers.map((p) => POWER_METADATA[p].shortName).join(', ')}`
              : 'No open seats'
          }
        >
          {isOpen ? (
            row.open_powers.map((p) => (
              <PowerFlag key={p} power={p} width={18} height={12} />
            ))
          ) : (
            <span className="browser-full-label">
              {row.status === 'completed' ? 'Finished' : 'Full'}
            </span>
          )}
        </span>
        <span
          className="browser-cell browser-date browser-moved"
          title={`Last move ${new Date(row.last_moved_at).toLocaleString()}`}
        >
          {relativeTime(row.last_moved_at, now)}
        </span>
        <span
          className="browser-cell browser-date browser-created"
          title={`Created ${new Date(row.created_at).toLocaleString()}`}
        >
          {shortDate(row.created_at, now)}
        </span>
        <span className="browser-cell browser-action">
          {myPower ? (
            <button
              type="button"
              className="browser-resume-btn"
              onClick={() => onClaim(myPower)}
            >
              <Play size={12} />
              <span>Resume</span>
            </button>
          ) : (
            <button
              type="button"
              className="browser-join-btn"
              aria-expanded={expanded}
              disabled={!isOpen}
              onClick={onToggle}
            >
              <span>{isOpen ? 'Join' : 'Full'}</span>
              {isOpen &&
                (expanded ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                ))}
            </button>
          )}
        </span>
      </div>

      {expanded && !myPower && (
        <div className="browser-row-seats lobby-power-slots-grid">
          {ALL_POWERS.map((power) => {
            const meta = POWER_METADATA[power];
            const free = row.open_powers.includes(power);
            const busy = joiningKey === `${row.game_id}_${power}`;
            return (
              <button
                key={power}
                type="button"
                disabled={!free || busy}
                onClick={() => onClaim(power)}
                className={`power-slot-btn ${free ? 'slot-open' : 'slot-taken'}`}
                style={{
                  borderColor: free ? meta.color : 'rgba(0,0,0,0.12)',
                }}
              >
                <div className="power-slot-top">
                  <span className="power-slot-crest">
                    <PowerFlag power={power} width={18} height={12} />
                  </span>
                  <span
                    className="power-slot-name"
                    style={{ color: free ? meta.color : '#7a756c' }}
                  >
                    {meta.shortName}
                  </span>
                </div>
                <div className="power-slot-status">
                  {busy ? (
                    'Entering...'
                  ) : free ? (
                    <span className="slot-claim-label">
                      + Claim {meta.shortName}
                    </span>
                  ) : (
                    <span className="slot-taken-label">
                      <Lock size={10} /> Taken
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
};
