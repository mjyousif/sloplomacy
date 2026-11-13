import { AlertTriangle, ArrowUpDown, CheckCircle2, Flag } from 'lucide-react';
import type React from 'react';
import { POWER_METADATA } from '../../types/diplomacy';
import { CollapsibleSection } from '../CollapsibleSection';
import { PowerFlag } from '../PowerFlag';
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
  | 'sandboxMode'
  | 'adminOverrideActive'
>;

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
  sandboxMode,
  adminOverrideActive = false,
}) => {
  const { sortMode, setSortMode, displayedPowers } = useStandingsSort(
    ownership,
    units,
  );

  return (
    <CollapsibleSection
      title={isMultiplayer ? 'DIPLOMATIC STANDING' : 'COMMAND NATION (SELECT)'}
      collapsible={true}
      defaultOpen={true}
    >
      {/* Standings sort toggle */}
      <div
        className={styles.powersSortSegmented}
        role="group"
        aria-label="Sort standings"
      >
        <button
          type="button"
          className={styles.powersSortPill}
          data-testid="standings-sort-score"
          data-active={sortMode === 'score' ? 'true' : undefined}
          onClick={() => setSortMode('score')}
          title="Sort by Victory Points (Supply Centers & Units)"
        >
          <ArrowUpDown size={10} />
          <span>By Score</span>
        </button>
        <button
          type="button"
          className={styles.powersSortPill}
          data-testid="standings-sort-default"
          data-active={sortMode === 'default' ? 'true' : undefined}
          onClick={() => setSortMode('default')}
          title="Standard canonical power order"
        >
          <span>Default</span>
        </button>
      </div>

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
                data-testid="power-standing-card"
                data-power={pwr}
                data-selected={isSelected ? 'true' : undefined}
                data-clickable={!isMultiplayer ? 'true' : undefined}
                className={styles.powerStandingCard}
                onClick={() => {
                  if (!isMultiplayer) onSelectPower(pwr);
                }}
                title={
                  !isMultiplayer
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
                  ) : (
                    <span
                      className={styles.miniStatusTag}
                      data-status="pending"
                      title="Drafting Orders"
                    >
                      Draft
                    </span>
                  )}
                </div>
              </div>
            );
          },
        )}
      </div>
    </CollapsibleSection>
  );
};
