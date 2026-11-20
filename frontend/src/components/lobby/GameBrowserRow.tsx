import { ChevronDown, ChevronUp, Eye, Lock, Play, Plus } from 'lucide-react';
import type React from 'react';
import {
  ALL_POWERS,
  type LobbyGameRow,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import {
  isRowJoinable,
  relativeTime,
  type SeatState,
  seatState,
  shortTurn,
} from '../../utils/lobbyBrowse';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './GameBrowserRow.module.css';

const SEAT_WORD: Record<SeatState, string> = {
  mine: 'yours',
  free: 'free',
  taken: 'taken',
};

export interface GameBrowserRowProps {
  row: LobbyGameRow;
  expanded: boolean;
  onToggle: () => void;
  /** The power the player holds in this game, if they are in it. */
  myPower: Power | null;
  /** `${game_id}_${power}` while that seat is being claimed. */
  joiningKey: string | null;
  onClaim: (power: Power) => void;
  /** Opens the game to watch without a seat. Not offered in a game the player is in. */
  onWatch?: () => void;
  now: number;
}

/**
 * One public game: name, turn, host and a strip of its seven seats, with its buttons.
 * Join opens the row into the seats a newcomer can claim, and Watch opens the game without
 * a seat; a game the player is already in offers Resume instead.
 */
export const GameBrowserRow: React.FC<GameBrowserRowProps> = ({
  row,
  expanded,
  onToggle,
  myPower,
  joiningKey,
  onClaim,
  onWatch,
  now,
}) => {
  const joinable = isRowJoinable(row);
  const showSeats = expanded && !myPower && joinable;

  return (
    <li
      className={styles.row}
      data-expanded={showSeats}
      data-testid={`browser-row-${row.game_id}`}
    >
      <div className={styles.main}>
        <div className={styles.name}>
          <span className={styles.gameName}>{row.name}</span>
          <span
            className={styles.meta}
            title={`Last move ${new Date(row.last_moved_at).toLocaleString()}`}
          >
            by {row.host_name} · {relativeTime(row.last_moved_at, now)}
          </span>
        </div>
        <span
          className={styles.turn}
          title={`${row.season} ${row.year} · ${row.phase}`}
        >
          {shortTurn(row.season, row.year, row.phase)}
        </span>
        <ul className={styles.seats} aria-label="Seats">
          {ALL_POWERS.map((power) => {
            const state = seatState(row, power, myPower);
            const label = `${POWER_METADATA[power].shortName}: ${SEAT_WORD[state]}`;
            return (
              <li
                key={power}
                className={styles.seat}
                data-seat={state}
                data-testid={`seat-${power}`}
                title={label}
                aria-label={label}
                style={
                  {
                    '--seat-color': POWER_METADATA[power].color,
                  } as React.CSSProperties
                }
              >
                <PowerFlag power={power} width={18} height={12} />
              </li>
            );
          })}
        </ul>
        <span className={styles.action}>
          {myPower ? (
            <button
              type="button"
              className={styles.button}
              data-variant="resume"
              onClick={() => onClaim(myPower)}
            >
              <Play size={12} />
              <span>Resume</span>
            </button>
          ) : (
            <>
              {onWatch && (
                <button
                  type="button"
                  className={styles.button}
                  data-variant="watch"
                  data-testid="browser-row-watch"
                  onClick={onWatch}
                  title={`Watch "${row.name}" without a seat`}
                >
                  <Eye size={12} />
                  <span>Watch</span>
                </button>
              )}
              <button
                type="button"
                className={styles.button}
                data-variant="join"
                aria-expanded={joinable ? showSeats : undefined}
                disabled={!joinable}
                onClick={onToggle}
              >
                <span>
                  {joinable
                    ? 'Join'
                    : row.status === 'completed'
                      ? 'Finished'
                      : 'Full'}
                </span>
                {joinable &&
                  (showSeats ? (
                    <ChevronUp size={13} />
                  ) : (
                    <ChevronDown size={13} />
                  ))}
              </button>
            </>
          )}
        </span>
      </div>

      {showSeats && (
        <div className={styles.claimGrid} data-testid="browser-row-claims">
          {ALL_POWERS.map((power) => {
            const meta = POWER_METADATA[power];
            const free = row.open_powers.includes(power);
            const busy = joiningKey === `${row.game_id}_${power}`;
            return (
              <button
                key={power}
                type="button"
                className={styles.claim}
                data-seat={free ? 'free' : 'taken'}
                disabled={!free || busy}
                onClick={() => onClaim(power)}
                style={{ '--seat-color': meta.color } as React.CSSProperties}
              >
                <span className={styles.claimTop}>
                  <PowerFlag power={power} width={18} height={12} />
                  <span className={styles.claimName}>{meta.shortName}</span>
                </span>
                <span className={styles.claimStatus}>
                  {busy ? (
                    'Entering...'
                  ) : free ? (
                    <>
                      <Plus size={11} /> Claim {meta.shortName}
                    </>
                  ) : (
                    <>
                      <Lock size={10} /> Taken
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
};
