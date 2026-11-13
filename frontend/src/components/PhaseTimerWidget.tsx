import { ChevronUp, Clock, Pause, Play, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { PhaseTimer, Power, TimerChoice } from '../types/diplomacy';
import {
  clockPillLabel,
  countVotes,
  formatClock,
  powerNames,
  powersNotReady,
  powersYetToVote,
  TIMER_OPTIONS,
} from '../utils/timerHelpers';
import styles from './PhaseTimerWidget.module.css';

export interface PhaseTimerWidgetProps {
  timer: PhaseTimer | null;
  seatPower: Power | null; // The claimed seat; null for someone only watching
  isHost: boolean;
  hypothetical: boolean;
  onStart: () => void;
  onVote: (choice: TimerChoice) => void;
  onExtend: (active: boolean) => void;
  onReady: (active: boolean) => void;
  onExpire?: () => void;
  /** Phone: start as a small pill at the top of the map, and open the full widget on a tap. */
  compact?: boolean;
}

const LOW_TIME_SECONDS = 60;

/** Counts down from what the server last reported, so a wrong device clock cannot matter. */
function useCountdown(
  remainingSeconds: number | null | undefined,
  onExpire?: () => void,
): number | null {
  const [seconds, setSeconds] = useState<number | null>(
    remainingSeconds ?? null,
  );
  const expiredRef = useRef(false);
  // Kept in a ref so a new callback identity never restarts the countdown
  // from a server value that may be minutes old.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    expiredRef.current = false;
    if (remainingSeconds === null || remainingSeconds === undefined) {
      setSeconds(null);
      return;
    }
    const receivedAt = performance.now();
    const tick = () => {
      const rem = Math.max(
        0,
        remainingSeconds - (performance.now() - receivedAt) / 1000,
      );
      setSeconds(rem);
      if (rem <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [remainingSeconds]);

  return seconds;
}

export const PhaseTimerWidget: React.FC<PhaseTimerWidgetProps> = ({
  timer,
  seatPower,
  isHost,
  hypothetical,
  onStart,
  onVote,
  onExtend,
  onReady,
  onExpire,
  compact = false,
}) => {
  const seconds = useCountdown(timer?.remaining_seconds, onExpire);
  const [expanded, setExpanded] = useState(false);
  const isPlayer = !!timer && !!seatPower && timer.players.includes(seatPower);
  // The whole vote is shorter than this, so only a phase clock can run low.
  const lowTime =
    timer?.stage === 'running' &&
    seconds !== null &&
    seconds <= LOW_TIME_SECONDS;

  const renderClock = () => (
    <div
      className={styles.phaseTimerClock}
      data-low={lowTime ? 'true' : undefined}
      role="timer"
    >
      {seconds === null ? '--:--' : formatClock(seconds)}
    </div>
  );

  const renderBody = () => {
    if (!timer) {
      return (
        <>
          <div className={styles.phaseTimerTitle}>
            <Clock size={14} /> Turn Clock
          </div>
          {isHost ? (
            <button
              type="button"
              data-testid="btn-timer-start"
              onClick={onStart}
            >
              <Play size={13} /> Start First Vote
            </button>
          ) : (
            <p className={styles.phaseTimerNote}>
              Waiting for the host to start the clock.
            </p>
          )}
        </>
      );
    }

    if (timer.stage === 'voting') {
      const pending = powersYetToVote(timer);
      const myVote = seatPower ? timer.votes[seatPower] : undefined;
      return (
        <>
          <div className={styles.phaseTimerTitle}>
            <Clock size={14} /> Vote: Phase Length
          </div>
          {renderClock()}
          <div className={styles.phaseTimerOptions}>
            {TIMER_OPTIONS.map(({ choice, label }) => (
              <button
                key={choice}
                type="button"
                data-selected={myVote === choice ? 'true' : undefined}
                aria-pressed={myVote === choice}
                disabled={!isPlayer}
                onClick={() => onVote(choice)}
              >
                <span>{label}</span>
                <strong>{countVotes(timer, choice)}</strong>
              </button>
            ))}
          </div>
          <p className={styles.phaseTimerNote}>
            <strong>Yet to vote:</strong> {powerNames(pending)}
          </p>
        </>
      );
    }

    if (timer.stage === 'paused') {
      const pending = powersNotReady(timer);
      const amReady = !!seatPower && timer.ready_powers.includes(seatPower);
      return (
        <>
          <div className={styles.phaseTimerTitle}>
            <Pause size={14} /> Game Paused
          </div>
          {isPlayer && (
            <button
              type="button"
              data-testid="btn-timer-ready"
              data-selected={amReady ? 'true' : undefined}
              aria-pressed={amReady}
              onClick={() => onReady(!amReady)}
            >
              {amReady ? 'Ready: Click to Undo' : 'Ready Up'}
            </button>
          )}
          <p className={styles.phaseTimerNote}>
            <strong>
              Ready {timer.ready_powers.length}/{timer.players.length}.
            </strong>{' '}
            Waiting on: {powerNames(pending)}. A new vote opens once everyone is
            ready.
          </p>
        </>
      );
    }

    const askedForMore =
      !!seatPower && timer.extend_requests.includes(seatPower);
    return (
      <>
        <div className={styles.phaseTimerTitle}>
          <Clock size={14} /> Time Left
        </div>
        {renderClock()}
        {isPlayer && (
          <button
            type="button"
            data-testid="btn-timer-extend"
            data-selected={askedForMore ? 'true' : undefined}
            aria-pressed={askedForMore}
            onClick={() => onExtend(!askedForMore)}
          >
            <Plus size={13} /> 5 Minutes ({timer.extend_requests.length}/
            {timer.extensions_needed})
          </button>
        )}
      </>
    );
  };

  if (compact && !expanded) {
    const Icon = timer?.stage === 'paused' ? Pause : Clock;
    return (
      <button
        type="button"
        data-testid="phase-timer-pill"
        className={styles.phaseTimerPill}
        data-low={lowTime ? 'true' : undefined}
        aria-label={`Turn clock: ${clockPillLabel(timer, seconds, isHost)}. Show details.`}
        aria-expanded={false}
        onClick={() => setExpanded(true)}
      >
        <Icon size={14} />
        <span role="timer">{clockPillLabel(timer, seconds, isHost)}</span>
        {hypothetical && timer && (
          <span
            className={styles.phaseTimerPillDot}
            data-testid="phase-timer-pill-dot"
            aria-hidden="true"
          />
        )}
      </button>
    );
  }

  return (
    <aside
      className={styles.phaseTimerWidget}
      data-testid="phase-timer-widget"
      aria-label="Turn clock"
    >
      {compact && (
        <button
          type="button"
          data-testid="phase-timer-collapse"
          className={styles.phaseTimerCollapse}
          aria-label="Hide turn clock"
          aria-expanded={true}
          onClick={() => setExpanded(false)}
        >
          <ChevronUp size={18} />
        </button>
      )}
      {renderBody()}
      {hypothetical && timer && (
        <p className={`${styles.phaseTimerNote} ${styles.phaseTimerWarning}`}>
          The real clock is still running. Exit Hypothetical Mode before it ends
          to keep your orders.
        </p>
      )}
    </aside>
  );
};
