import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Eye,
  Flag,
  Mail,
} from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { usePressState } from '../../hooks/usePress';
import { pressStore } from '../../lib/pressStore';
import { POWER_METADATA, type Power } from '../../types/diplomacy';
import { buildChannels, threadKey } from '../../utils/pressHelpers';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { CountBadge } from '../ui/CountBadge';
import { PowerFlag } from '../ui/PowerFlag';
import { SegmentedControl } from '../ui/SegmentedControl';
import styles from './StandingsSection.module.css';
import type { ToolsSidebarProps } from './toolsSidebarProps';
import { useStandingsSort } from './useStandingsSort';

export type StandingsSectionProps = Pick<
  ToolsSidebarProps,
  | 'activePower'
  | 'onSelectPower'
  | 'ownership'
  | 'units'
  | 'finalizedPowers'
  | 'surrenderedPowers'
  | 'issues'
  | 'isMultiplayer'
  | 'participants'
  | 'showAllMoves'
  | 'onChangeShowAllMoves'
  | 'sandboxMode'
  | 'viewingHistory'
  | 'adminOverrideActive'
  | 'pressPower'
> & {
  /** Phone drawer only: clicking a country envelope ensures it is selected and opens Press. */
  onPressPick?: () => void;
};

export const StandingsSection: React.FC<StandingsSectionProps> = ({
  activePower,
  onSelectPower,
  ownership,
  units,
  finalizedPowers,
  surrenderedPowers = [],
  issues,
  isMultiplayer = false,
  participants,
  showAllMoves,
  onChangeShowAllMoves,
  sandboxMode,
  viewingHistory = false,
  adminOverrideActive = false,
  pressPower,
  onPressPick,
}) => {
  const { sortMode, setSortMode, displayedPowers } = useStandingsSort(
    ownership,
    units,
  );
  const canSwitchPower =
    (!isMultiplayer || Boolean(sandboxMode)) && !viewingHistory;

  // Press: each other country's row has a letter button that picks it as a recipient, with
  // the unread count of the player's one-to-one thread with that country.
  const press = usePressState();
  const pressOn = pressPower !== undefined && press.power === pressPower;
  const unreadByThread = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!pressOn || !pressPower) return counts;
    for (const channel of buildChannels(
      press.messages,
      pressPower,
      press.lastRead,
    )) {
      counts[channel.key] = channel.unread;
    }
    return counts;
  }, [pressOn, pressPower, press.messages, press.lastRead]);

  return (
    <CollapsibleSection
      title={isMultiplayer ? 'DIPLOMATIC STANDING' : 'COMMAND NATION (SELECT)'}
      collapsible={true}
      defaultOpen={true}
    >
      {/* Standings sort toggle */}
      <SegmentedControl
        value={sortMode}
        onChange={setSortMode}
        ariaLabel="Sort standings"
        semantics="toggle"
        tone="sky"
        size="sm"
        fullWidth
        className={styles.powersSortTrack}
        options={[
          {
            value: 'score',
            label: 'By Score',
            icon: <ArrowUpDown size={10} />,
            title: 'Sort by Victory Points (Supply Centers & Units)',
            testId: 'standings-sort-score',
          },
          {
            value: 'default',
            label: 'Default',
            title: 'Standard canonical power order',
            testId: 'standings-sort-default',
          },
        ]}
      />

      {/* Sandbox / Hypothetical move visibility toggle */}
      {(!isMultiplayer || sandboxMode) &&
        showAllMoves !== undefined &&
        onChangeShowAllMoves && (
          <div className={styles.powersFilterRow}>
            <span className={styles.powersSortLabel}>Map Moves</span>
            <SegmentedControl
              value={showAllMoves ? 'all' : 'selected'}
              onChange={(val) => onChangeShowAllMoves(val === 'all')}
              ariaLabel="Map move visibility"
              semantics="toggle"
              tone="sky"
              size="sm"
              fullWidth
              className={styles.powersFilterSegmented}
              options={[
                {
                  value: 'all',
                  label: 'All Moves',
                  icon: <Eye size={10} />,
                  title: 'Show planned orders for all 7 powers on the map',
                  testId: 'standings-moves-all',
                },
                {
                  value: 'selected',
                  label: 'Selected Nation',
                  title: "Show only the selected nation's orders on the map",
                  testId: 'standings-moves-selected',
                },
              ]}
            />
          </div>
        )}

      <div className={styles.powersStandingList}>
        {displayedPowers.map(
          ({ power: pwr, rank, scCount: scs, unitCount: un }) => {
            const meta = POWER_METADATA[pwr];
            const isSelected = pwr === activePower;
            const isFinal = finalizedPowers.includes(pwr);
            const isSurr = surrenderedPowers.includes(pwr);
            const canSeePowerIssues =
              isSelected || sandboxMode || adminOverrideActive;
            const pwrIssues = canSeePowerIssues
              ? issues.filter((i) => i.power === pwr && i.severity !== 'info')
              : [];
            const occupant = participants?.[pwr];
            const playerName =
              occupant?.display_name ||
              (isMultiplayer && !occupant ? 'Open' : undefined);

            return (
              <div
                key={pwr}
                role={canSwitchPower ? 'button' : undefined}
                tabIndex={canSwitchPower ? 0 : undefined}
                aria-pressed={canSwitchPower ? isSelected : undefined}
                data-testid="power-standing-card"
                data-power={pwr}
                data-selected={isSelected ? 'true' : undefined}
                data-clickable={canSwitchPower ? 'true' : undefined}
                className={styles.powerStandingCard}
                onClick={() => {
                  if (canSwitchPower) onSelectPower(pwr);
                }}
                onKeyDown={
                  canSwitchPower
                    ? (e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectPower(pwr);
                        }
                      }
                    : undefined
                }
                title={
                  viewingHistory
                    ? `${meta.name}${playerName ? ` (${playerName})` : ''}`
                    : canSwitchPower
                      ? `Click to command ${meta.name}`
                      : `${meta.name}${playerName ? ` (${playerName})` : ''}: ${isFinal ? 'Orders Finalized' : 'Drafting'}`
                }
                style={{
                  borderLeftColor: meta.color,
                  background: isSelected ? meta.lightBg : undefined,
                }}
              >
                <div className={styles.powerCardLeft}>
                  {rank !== null && (
                    <span
                      className={styles.powerCardRank}
                      data-testid="power-rank"
                      title={`Rank ${rank}`}
                    >
                      {rank}
                    </span>
                  )}
                  <span className={styles.powerCardCrest}>
                    <PowerFlag power={pwr} width={20} height={14} />
                  </span>
                  <div className={styles.powerCardInfo}>
                    <div className={styles.powerCardName}>
                      <span
                        className={styles.powerDot}
                        style={{ backgroundColor: meta.color }}
                      />
                      <strong>{meta.shortName}</strong>
                      {playerName && (
                        <span
                          className={styles.powerCardPlayer}
                          title={`Player: ${playerName}`}
                        >
                          ({playerName})
                        </span>
                      )}
                    </div>
                    <div
                      className={styles.powerCardMetrics}
                      data-testid="power-card-metrics"
                    >
                      <span>{scs} SC</span>
                      <span className={styles.metricDot}>•</span>
                      <span>{un} Units</span>
                      {isSelected && (
                        <span
                          className={styles.activeTag}
                          data-testid="active-tag"
                        >
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.powerCardStatus}>
                  {isSurr ? (
                    <span
                      className={styles.miniStatusTag}
                      data-status="surrendered"
                      title="Civil Disorder"
                    >
                      <Flag size={10} /> CD
                    </span>
                  ) : isFinal ? (
                    <span
                      className={styles.miniStatusTag}
                      data-status="finalized"
                      title="Finalized"
                    >
                      <CheckCircle2 size={11} />
                    </span>
                  ) : pwrIssues.length > 0 ? (
                    <span
                      className={styles.miniStatusTag}
                      data-status="warning"
                      title={`${pwrIssues.length} issues`}
                    >
                      {pwrIssues.length}
                      <AlertTriangle size={10} />
                    </span>
                  ) : null}
                  {pressOn &&
                    pressPower &&
                    (pwr === pressPower ? (
                      // Keeps the status marks of every row in one column.
                      <span className={styles.pressPickSpacer} />
                    ) : (
                      <PressPickButton
                        power={pwr}
                        name={meta.shortName}
                        picked={press.recipients.includes(pwr)}
                        vacant={participants !== undefined && !occupant}
                        unread={
                          unreadByThread[threadKey([pressPower, pwr])] ?? 0
                        }
                        onPressPick={onPressPick}
                      />
                    ))}
                </div>
              </div>
            );
          },
        )}
      </div>
    </CollapsibleSection>
  );
};

/** The letter button on a standings row: lit while that country is a recipient. */
const PressPickButton: React.FC<{
  power: Power;
  name: string;
  picked: boolean;
  /** Nobody holds the seat, so there is nobody to write to. */
  vacant: boolean;
  unread: number;
  onPressPick?: () => void;
}> = ({ power, name, picked, vacant, unread, onPressPick }) => {
  const label = vacant
    ? `${name} has no player to write to`
    : onPressPick
      ? `Write to ${name}`
      : picked
        ? `Stop sending privately to ${name}`
        : `Send privately to ${name}`;
  return (
    <button
      type="button"
      className={styles.pressPickBtn}
      data-testid={`press-recipient-${power}`}
      data-active={picked ? 'true' : undefined}
      aria-pressed={picked}
      aria-label={unread ? `${label}, ${unread} unread` : label}
      title={label}
      disabled={vacant && !picked}
      onClick={(e) => {
        // The row itself selects a power in the sandbox.
        e.stopPropagation();
        if (onPressPick) {
          if (!picked) pressStore.toggleRecipient(power);
          onPressPick();
          return;
        }
        pressStore.toggleRecipient(power);
      }}
    >
      <Mail size={13} aria-hidden="true" />
      <CountBadge
        count={unread}
        max={9}
        placement="floating"
        size="xs"
        testId="press-pick-unread"
      />
    </button>
  );
};
