import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
  ALL_POWERS,
  POWER_METADATA,
  type Power,
  type PowerStats,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import { PowerFlag } from '../ui/PowerFlag';
import scrollbarStyles from '../ui/Scrollbars.module.css';
import styles from './CampaignStats.module.css';

export type StatsSortKey =
  | 'power'
  | 'current_scs'
  | 'units_built'
  | 'units_disbanded'
  | 'units_destroyed'
  | 'enemies_dislodged'
  | 'foreign_supports_given'
  | 'foreign_supports_received'
  | 'move_success_rate'
  | 'press_messages_sent';

export interface StatsOverviewTableProps {
  powers: Record<Power, PowerStats>;
  winner: Power | null | undefined;
}

interface ColumnDef {
  key: StatsSortKey;
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'power', label: 'Power' },
  { key: 'current_scs', label: 'SCs' },
  { key: 'units_built', label: 'Built' },
  { key: 'units_disbanded', label: 'Disbanded' },
  { key: 'units_destroyed', label: 'Destroyed' },
  { key: 'enemies_dislodged', label: 'Dislodged' },
  { key: 'foreign_supports_given', label: 'Supp. Given' },
  { key: 'foreign_supports_received', label: 'Supp. Recv' },
  { key: 'move_success_rate', label: 'Move %' },
  { key: 'press_messages_sent', label: 'Press' },
];

export const StatsOverviewTable: React.FC<StatsOverviewTableProps> = ({
  powers,
  winner,
}) => {
  const [sortKey, setSortKey] = useState<StatsSortKey>('current_scs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: StatsSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'power' ? 'asc' : 'desc');
    }
  };

  const rows = useMemo(() => {
    const list = ALL_POWERS.map((p) => powers[p]).filter(Boolean);
    return [...list].sort((a, b) => {
      if (sortKey === 'power') {
        const cmp = POWER_METADATA[a.power].shortName.localeCompare(
          POWER_METADATA[b.power].shortName,
        );
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      if (diff !== 0) {
        return sortDir === 'asc' ? diff : -diff;
      }
      return b.current_scs - a.current_scs;
    });
  }, [powers, sortKey, sortDir]);

  return (
    <div className={styles.sectionCard} data-testid="stats-overview-table">
      <div className={cx(styles.tableScroll, scrollbarStyles.thin)}>
        <table className={styles.ledgerTable}>
          <thead>
            <tr>
              {COLUMNS.map((col) => {
                const isActive = sortKey === col.key;
                const ariaSort = isActive
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
                return (
                  <th key={col.key} aria-sort={ariaSort}>
                    <button
                      type="button"
                      className={styles.sortButton}
                      data-active={String(isActive)}
                      data-testid={`sort-col-${col.key}`}
                      onClick={() => handleSort(col.key)}
                    >
                      <span>{col.label}</span>
                      {isActive ? (
                        sortDir === 'asc' ? (
                          <ArrowUp size={11} aria-hidden="true" />
                        ) : (
                          <ArrowDown size={11} aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown size={11} aria-hidden="true" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const meta = POWER_METADATA[row.power];
              const isWinner = row.power === winner;
              const statusBadge = isWinner
                ? { label: 'WON', attr: 'won' }
                : row.is_surrendered
                  ? { label: 'SURR', attr: 'surrendered' }
                  : row.is_eliminated
                    ? { label: 'ELIM', attr: 'eliminated' }
                    : null;
              const totalMoves = row.moves_succeeded + row.moves_bounced;

              return (
                <tr
                  key={row.power}
                  className={styles.ledgerRow}
                  data-winner={String(isWinner)}
                  data-eliminated={String(row.is_eliminated)}
                  data-testid={`stats-row-${row.power.toLowerCase()}`}
                >
                  <td>
                    <div className={styles.powerCell}>
                      <PowerFlag power={row.power} width={18} height={12} />
                      <div className={styles.powerNames}>
                        <span className={styles.powerTitleLine}>
                          <span>{meta.shortName}</span>
                          {statusBadge && (
                            <span
                              className={styles.statusPill}
                              data-status={statusBadge.attr}
                            >
                              {statusBadge.label}
                            </span>
                          )}
                        </span>
                        {row.player_name && (
                          <span className={styles.playerSubname}>
                            {row.player_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span>{row.current_scs}</span>
                    <span className={styles.subMetric}>
                      Peak {row.peak_scs}
                    </span>
                  </td>
                  <td>
                    <span>{row.units_built}</span>
                    {row.units_built > 0 && (
                      <span className={styles.subMetric}>
                        {row.armies_built}A · {row.fleets_built}F
                      </span>
                    )}
                  </td>
                  <td>{row.units_disbanded}</td>
                  <td>{row.units_destroyed}</td>
                  <td>{row.enemies_dislodged}</td>
                  <td>
                    <span>{row.foreign_supports_given}</span>
                    {row.foreign_supports_given > 0 && (
                      <span className={styles.subMetric}>
                        {row.foreign_supports_effective} eff
                      </span>
                    )}
                  </td>
                  <td>{row.foreign_supports_received}</td>
                  <td>
                    {totalMoves > 0 ? (
                      <>
                        <span>{row.move_success_rate}%</span>
                        <span className={styles.subMetric}>
                          {row.moves_succeeded}/{totalMoves}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{row.press_messages_sent}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
