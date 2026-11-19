import type React from 'react';
import { useMemo, useState } from 'react';
import {
  ALL_POWERS,
  POWER_METADATA,
  type Power,
  type PowerStats,
} from '../../types/diplomacy';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './CampaignStats.module.css';

export interface DiplomaticSupportMatrixProps {
  powers: Record<Power, PowerStats>;
  supportMatrix: Record<Power, Record<Power, number>>;
  attackMatrix: Record<Power, Record<Power, number>>;
}

export const DiplomaticSupportMatrix: React.FC<
  DiplomaticSupportMatrixProps
> = ({ powers, supportMatrix, attackMatrix }) => {
  const [mode, setMode] = useState<'support' | 'attack'>('support');
  const activeMatrix = mode === 'support' ? supportMatrix : attackMatrix;

  const totals = useMemo(() => {
    let convoys = 0;
    let foreignConvoys = 0;
    let cuts = 0;
    let selfBounces = 0;
    let waived = 0;

    for (const p of ALL_POWERS) {
      const ps = powers[p];
      if (!ps) continue;
      convoys += ps.convoys_executed;
      foreignConvoys += ps.foreign_convoys;
      cuts += ps.supports_cut;
      selfBounces += ps.self_bounces;
      waived += ps.builds_waived;
    }

    return {
      convoys,
      foreignConvoys: Math.floor(foreignConvoys / 2),
      cuts,
      selfBounces,
      waived,
    };
  }, [powers]);

  return (
    <div className={styles.sectionCard} data-testid="diplomatic-support-matrix">
      <div className={styles.matrixHeader}>
        <span className={styles.sectionHeading}>
          {mode === 'support'
            ? 'Bilateral Foreign Support Matrix (Row → Column)'
            : 'Bilateral Offensive Conflict Matrix (Row → Column)'}
        </span>

        <div className={styles.modeToggle}>
          <button
            type="button"
            className={styles.modeBtn}
            data-active={String(mode === 'support')}
            data-testid="matrix-mode-support"
            onClick={() => setMode('support')}
          >
            Support Ledger
          </button>
          <button
            type="button"
            className={styles.modeBtn}
            data-active={String(mode === 'attack')}
            data-testid="matrix-mode-attack"
            onClick={() => setMode('attack')}
          >
            Conflict Ledger
          </button>
        </div>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th>From \ To</th>
              {ALL_POWERS.map((colPower) => (
                <th key={colPower} title={POWER_METADATA[colPower].shortName}>
                  <PowerFlag power={colPower} width={16} height={11} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_POWERS.map((rowPower) => (
              <tr key={rowPower}>
                <td>
                  <span className={styles.matrixRowLabel}>
                    <PowerFlag power={rowPower} width={15} height={10} />
                    <span>{POWER_METADATA[rowPower].shortName}</span>
                  </span>
                </td>
                {ALL_POWERS.map((colPower) => {
                  const isSelf = rowPower === colPower;
                  const count = activeMatrix?.[rowPower]?.[colPower] ?? 0;
                  return (
                    <td
                      key={colPower}
                      className={styles.matrixCell}
                      data-diagonal={String(isSelf)}
                      data-nonzero={String(!isSelf && count > 0)}
                      data-testid={`matrix-cell-${rowPower.toLowerCase()}-${colPower.toLowerCase()}`}
                      style={
                        !isSelf && count > 0
                          ? {
                              backgroundColor:
                                mode === 'support'
                                  ? 'rgba(16, 185, 129, 0.16)'
                                  : 'rgba(239, 68, 68, 0.16)',
                            }
                          : undefined
                      }
                    >
                      {isSelf ? '·' : count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.logisticsStrip}>
        <div className={styles.logisticsStat}>
          <span className={styles.logisticsLabel}>Convoys Run</span>
          <span className={styles.logisticsValue}>{totals.convoys}</span>
        </div>
        <div className={styles.logisticsStat}>
          <span className={styles.logisticsLabel}>Allied Convoys</span>
          <span className={styles.logisticsValue}>{totals.foreignConvoys}</span>
        </div>
        <div className={styles.logisticsStat}>
          <span className={styles.logisticsLabel}>Supports Cut</span>
          <span className={styles.logisticsValue}>{totals.cuts}</span>
        </div>
        <div className={styles.logisticsStat}>
          <span className={styles.logisticsLabel}>Self-Bounces</span>
          <span className={styles.logisticsValue}>{totals.selfBounces}</span>
        </div>
        <div className={styles.logisticsStat}>
          <span className={styles.logisticsLabel}>Builds Waived</span>
          <span className={styles.logisticsValue}>{totals.waived}</span>
        </div>
      </div>
    </div>
  );
};
