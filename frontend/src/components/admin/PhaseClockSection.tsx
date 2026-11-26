import { Clock, Pause, Play, Power as PowerIcon, Save } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../types/diplomacy';
import {
  adminClockStatus,
  clockEndsAt,
  DEFAULT_TIMER_SETTINGS,
  MAX_CLOCK_MINUTES,
  parseTimerSettings,
  toLocalInputValue,
} from '../../utils/adminClockHelpers';
import { useConfirm } from '../modal/ConfirmModal';
import { Button } from '../ui/Button';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { DurationPicker } from './DurationPicker';
import { usePhaseClockAdmin } from './hooks/usePhaseClockAdmin';
import styles from './PhaseClockSection.module.css';
import cardStyles from './TurnControlTab.module.css';
import { WholeNumberInput } from './WholeNumberInput';

export interface PhaseClockSectionProps {
  gameId: string;
  gameState: GameState;
  onStateUpdated: (state: GameState) => void;
  onToast: (msg: string) => void;
  onError: (msg: string | null) => void;
}

const NUDGES = [-5, -1, 1, 5];

type ClockState = 'running' | 'paused' | 'off';

const CLOCK_STATE_OPTIONS: SegmentedOption<ClockState>[] = [
  {
    value: 'running',
    label: 'Running',
    icon: <Play size={13} />,
    testId: 'btn-admin-clock-running',
  },
  {
    value: 'paused',
    label: 'Paused',
    icon: <Pause size={13} />,
    testId: 'btn-admin-clock-paused',
  },
  {
    value: 'off',
    label: 'Off',
    icon: <PowerIcon size={13} />,
    testId: 'btn-admin-clock-off',
  },
];

/**
 * The host's Turn Clock controls in Turn and Clock Settings (issue #393): pause (only the host
 * lifts it), resume, set the time left or the time it runs out (which also ends a vote), nudge a
 * running clock, turn it off, and the match's clock lengths. Every change is logged for players.
 */
export const PhaseClockSection: React.FC<PhaseClockSectionProps> = ({
  gameId,
  gameState,
  onStateUpdated,
  onToast,
  onError,
}) => {
  const timer = gameState.timer ?? null;
  const settings = gameState.timer_settings ?? DEFAULT_TIMER_SETTINGS;
  const { busy, run, setDeadline, saveSettings } = usePhaseClockAdmin({
    gameId,
    onStateUpdated,
    onToast,
    onError,
  });
  const { confirm, confirmModal } = useConfirm();

  // When this copy of the clock arrived, so its end time does not drift while the panel is open.
  const receivedAt = useMemo(() => Date.now(), [timer]);
  const endsAt = timer ? clockEndsAt(timer, receivedAt) : null;

  const [minutesLeft, setMinutesLeft] = useState<number | null>(15);
  const [endAt, setEndAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  // A new turn starts the time boxes afresh, so an end time already past is never left showing.
  const turnKey = `${gameState.season} ${gameState.year} ${gameState.phase}`;
  useEffect(() => {
    setMinutesLeft(15);
    setEndAt(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  }, [turnKey]);

  const [voteMinutes, setVoteMinutes] = useState<(number | null)[]>([]);
  const [fixedMinutes, setFixedMinutes] = useState<number | null>(null);
  const [voteWindow, setVoteWindow] = useState('');

  // Refill the lengths form whenever the saved lengths change (here or from another tab).
  const settingsKey = JSON.stringify(settings);
  useEffect(() => {
    setVoteMinutes([0, 1, 2].map((i) => settings.vote_minutes[i] ?? null));
    setFixedMinutes(settings.fixed_phase_minutes);
    setVoteWindow(String(settings.vote_window_seconds));
  }, [settingsKey]);

  const stage = timer?.stage ?? null;
  const setLabel =
    stage === 'voting'
      ? 'End Vote & Set Time'
      : stage === 'paused'
        ? 'Unpause & Set Time'
        : 'Set Time Left';

  const handleSetLeft = () => {
    if (!minutesLeft || minutesLeft < 1 || minutesLeft > MAX_CLOCK_MINUTES) {
      onError('Pick a time left between 1 minute and 30 days.');
      return;
    }
    setDeadline({ seconds_left: minutesLeft * 60 });
  };

  const handleSetEnd = () => {
    const at = new Date(endAt);
    if (Number.isNaN(at.getTime())) {
      onError('Pick a date and time for the clock to run out.');
      return;
    }
    setDeadline({ deadline: at.getTime() / 1000 });
  };

  const clockState: ClockState = !timer
    ? 'off'
    : stage === 'paused'
      ? 'paused'
      : 'running';

  // Picking the state already shown does nothing; anything else starts, resumes, pauses or stops.
  const handleClockState = async (next: ClockState) => {
    if (busy || next === clockState) return;
    if (next === 'paused') {
      run('pause');
    } else if (next === 'running') {
      run(timer ? 'resume' : 'start');
    } else {
      const ok = await confirm({
        title: 'Turn the Clock Off?',
        message:
          'The match becomes untimed: no phase resolves on its own until you start the clock again. Players will be notified.',
        confirmLabel: 'Turn Off',
      });
      if (ok) run('stop');
    }
  };

  const handleSaveSettings = () => {
    const parsed = parseTimerSettings({
      voteMinutes,
      fixedPhaseMinutes: fixedMinutes,
      voteWindowSeconds: voteWindow,
    });
    if (typeof parsed === 'string') {
      onError(parsed);
      return;
    }
    saveSettings(parsed);
  };

  return (
    <>
      <section
        className={cardStyles.adminCardSection}
        data-testid="admin-phase-clock"
        aria-label="Turn clock"
      >
        <div className={cardStyles.adminCardTitleRow}>
          <Clock size={16} className={cardStyles.sectionIconGold} />
          <h4>Turn Clock</h4>
        </div>
        <p
          className={cardStyles.adminSectionDesc}
          data-testid="admin-clock-status"
          role="status"
        >
          {adminClockStatus(timer, receivedAt)}
        </p>

        <SegmentedControl<ClockState>
          ariaLabel="Turn clock state"
          testId="admin-clock-state"
          fullWidth
          value={clockState}
          options={CLOCK_STATE_OPTIONS}
          onChange={handleClockState}
        />
        {stage === 'paused' && gameState.phase === 'Movement' && (
          <p className={cardStyles.adminSectionDesc}>
            Running opens a new vote on the phase length.
          </p>
        )}

        {timer && (
          <>
            <div className={styles.timeLeftGroup}>
              <DurationPicker
                id="admin-clock-time-left"
                label="Time left"
                testId="picker-admin-clock-time-left"
                value={minutesLeft}
                onChange={setMinutesLeft}
              />
              <Button
                variant="secondary"
                fullWidth
                data-testid="btn-admin-clock-set-left"
                disabled={busy}
                onClick={handleSetLeft}
              >
                {setLabel}
              </Button>
            </div>

            {stage === 'running' && (
              <div className={styles.nudgeRow} aria-label="Move the deadline">
                {NUDGES.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="ghost"
                    data-testid={`btn-admin-clock-nudge-${n}`}
                    disabled={busy}
                    onClick={() => setDeadline({ adjust_seconds: n * 60 })}
                  >
                    {n > 0 ? `+${n}` : `−${-n}`} min
                  </Button>
                ))}
              </div>
            )}

            {/* Date and time get their own boxes on a full-width row: one datetime box is too
                wide to read in the sidebar, and its picker opened off the right of the screen. */}
            <fieldset className={styles.endAtGroup}>
              <legend className={styles.endAtLegend}>Runs out at</legend>
              <div className={styles.endAtRow}>
                <div className={cardStyles.adminFormGroup}>
                  <label htmlFor="admin-clock-end-date">Date</label>
                  <input
                    id="admin-clock-end-date"
                    data-testid="input-admin-clock-end-date"
                    type="date"
                    value={endAt.slice(0, 10)}
                    onChange={(e) =>
                      setEndAt(`${e.target.value}T${endAt.slice(11, 16)}`)
                    }
                  />
                </div>
                <div className={cardStyles.adminFormGroup}>
                  <label htmlFor="admin-clock-end-time">Time</label>
                  <input
                    id="admin-clock-end-time"
                    data-testid="input-admin-clock-end-time"
                    type="time"
                    value={endAt.slice(11, 16)}
                    onChange={(e) =>
                      setEndAt(`${endAt.slice(0, 10)}T${e.target.value}`)
                    }
                  />
                </div>
              </div>
              <Button
                variant="secondary"
                fullWidth
                data-testid="btn-admin-clock-set-end"
                disabled={busy}
                onClick={handleSetEnd}
              >
                Set End Time
              </Button>
            </fieldset>
            {endsAt && (
              <p className={cardStyles.adminSectionDesc}>
                Now set to run out at {endsAt.toLocaleString()}.
              </p>
            )}
          </>
        )}
      </section>

      <section
        className={cardStyles.adminCardSection}
        data-testid="admin-clock-lengths"
        aria-label="Clock lengths"
      >
        <div className={cardStyles.adminCardTitleRow}>
          <Clock size={16} className={cardStyles.sectionIconGold} />
          <h4>Clock Lengths</h4>
        </div>
        <p className={cardStyles.adminSectionDesc}>
          Apply from the next vote or phase. Leave vote option 2 or 3 empty to
          offer fewer lengths. Pause is always offered.
        </p>
        <div className={styles.lengthsStack}>
          {[0, 1, 2].map((i) => (
            <DurationPicker
              key={i}
              id={`admin-clock-vote-${i}`}
              label={`Vote option ${i + 1}`}
              testId={`picker-admin-clock-vote-${i}`}
              value={voteMinutes[i] ?? null}
              onChange={(minutes) =>
                setVoteMinutes((prev) =>
                  prev.map((v, j) => (j === i ? minutes : v)),
                )
              }
            />
          ))}
          <DurationPicker
            id="admin-clock-fixed"
            label="Retreats & Adjustments"
            testId="picker-admin-clock-fixed"
            value={fixedMinutes}
            onChange={setFixedMinutes}
          />
          <div className={cardStyles.adminFormGroup}>
            <label htmlFor="admin-clock-window">Vote lasts (sec)</label>
            <WholeNumberInput
              id="admin-clock-window"
              testId="input-admin-clock-window"
              maxDigits={4}
              value={voteWindow}
              onChange={setVoteWindow}
            />
          </div>
        </div>
        <div className={cardStyles.adminFormActionsRow}>
          <Button
            variant="secondary"
            fullWidth
            data-testid="btn-admin-clock-save-lengths"
            disabled={busy}
            onClick={handleSaveSettings}
          >
            <Save size={14} />
            <span>Save Lengths</span>
          </Button>
        </div>
      </section>
      {confirmModal}
    </>
  );
};
