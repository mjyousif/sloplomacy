import type React from 'react';
import { useMemo, useState } from 'react';
import {
  ALL_POWERS,
  POWER_METADATA,
  type Power,
  type SCTimelinePoint,
} from '../../types/diplomacy';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './CampaignStats.module.css';

export interface SupplyCenterTimelineChartProps {
  timeline: SCTimelinePoint[];
  winner?: Power | null;
}

const SVG_WIDTH = 640;
const SVG_HEIGHT = 230;
const PAD_LEFT = 36;
const PAD_RIGHT = 18;
const PAD_TOP = 18;
const PAD_BOTTOM = 32;

function shortLabel(pt: SCTimelinePoint): string {
  const s = pt.season[0] || '';
  const yr = String(pt.year).slice(-2);
  return pt.label.startsWith('Final') ? `End '${yr}` : `${s}'${yr}`;
}

export const SupplyCenterTimelineChart: React.FC<
  SupplyCenterTimelineChartProps
> = ({ timeline, winner }) => {
  const [focusedPower, setFocusedPower] = useState<Power | null>(null);

  const plotWidth = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const maxSc = useMemo(() => {
    let highest = 18;
    for (const pt of timeline) {
      for (const p of ALL_POWERS) {
        const val = pt.counts[p] ?? 0;
        if (val > highest) highest = val;
      }
    }
    return highest;
  }, [timeline]);

  const xForIndex = (idx: number) => {
    if (timeline.length <= 1) return PAD_LEFT + plotWidth / 2;
    return PAD_LEFT + (idx / (timeline.length - 1)) * plotWidth;
  };

  const yForValue = (val: number) =>
    PAD_TOP + plotHeight - (val / maxSc) * plotHeight;

  const gridValues = useMemo(() => {
    const base = [0, 6, 12, 18];
    if (maxSc > 18) base.push(maxSc);
    return base;
  }, [maxSc]);

  const labelStep = Math.max(1, Math.ceil(timeline.length / 8));
  const latestPoint = timeline[timeline.length - 1];

  const orderedPowers = useMemo(() => {
    if (!latestPoint) return ALL_POWERS;
    return [...ALL_POWERS].sort(
      (a, b) => (latestPoint.counts[b] ?? 0) - (latestPoint.counts[a] ?? 0),
    );
  }, [latestPoint]);

  return (
    <div className={styles.sectionCard} data-testid="sc-timeline-chart">
      <div className={styles.chartHeader}>
        <span className={styles.sectionHeading}>
          Supply Center Trajectory ({timeline.length}{' '}
          {timeline.length === 1 ? 'Checkpoint' : 'Checkpoints'})
        </span>
        <span className={styles.chartNote}>
          Click a power below to isolate its trajectory
        </span>
      </div>

      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className={styles.timelineSvg}
        role="img"
        aria-label="Supply center count timeline per Great Power"
      >
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={plotWidth}
          height={plotHeight}
          rx={4}
          fill="rgba(255, 255, 255, 0.03)"
        />

        {gridValues.map((val) => {
          const y = yForValue(val);
          const isVictoryLine = val === 18;
          return (
            <g key={val}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={SVG_WIDTH - PAD_RIGHT}
                y2={y}
                stroke={
                  isVictoryLine
                    ? 'rgba(212, 175, 55, 0.55)'
                    : 'rgba(148, 163, 184, 0.18)'
                }
                strokeDasharray={isVictoryLine ? '4 4' : undefined}
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 7}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                fill={isVictoryLine ? '#fde68a' : '#94a3b8'}
                fontFamily="var(--font-mono)"
              >
                {val}
              </text>
            </g>
          );
        })}

        {timeline.map((pt, idx) => {
          const showLabel =
            idx === 0 || idx === timeline.length - 1 || idx % labelStep === 0;
          if (!showLabel) return null;
          return (
            <text
              key={pt.label}
              x={xForIndex(idx)}
              y={SVG_HEIGHT - 8}
              textAnchor="middle"
              fontSize={10}
              fill="#94a3b8"
            >
              {shortLabel(pt)}
            </text>
          );
        })}

        {ALL_POWERS.map((power) => {
          const meta = POWER_METADATA[power];
          const isSelected = focusedPower === power;
          const isMuted = focusedPower !== null && !isSelected;
          const points = timeline.map(
            (pt, idx) =>
              `${xForIndex(idx)},${yForValue(pt.counts[power] ?? 0)}`,
          );
          const strokeWidth = isSelected || power === winner ? 3 : 2;

          return (
            <g
              key={power}
              data-testid={`timeline-series-${power.toLowerCase()}`}
              opacity={isMuted ? 0.18 : 1}
            >
              {timeline.length > 1 && (
                <polyline
                  fill="none"
                  stroke={meta.color}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={points.join(' ')}
                />
              )}
              {timeline.map((pt, idx) => (
                <circle
                  key={`${power}-${pt.label}`}
                  cx={xForIndex(idx)}
                  cy={yForValue(pt.counts[power] ?? 0)}
                  r={isSelected || idx === timeline.length - 1 ? 3.5 : 2.3}
                  fill={meta.fillColor}
                  stroke={meta.color}
                  strokeWidth={1.2}
                >
                  <title>{`${meta.shortName} · ${pt.label}: ${pt.counts[power] ?? 0} SCs`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <div className={styles.chartLegend}>
        {orderedPowers.map((power) => {
          const meta = POWER_METADATA[power];
          const currentCount = latestPoint?.counts[power] ?? 0;
          const isSelected = focusedPower === power;
          const isMuted = focusedPower !== null && !isSelected;
          return (
            <button
              key={power}
              type="button"
              className={styles.legendChip}
              data-selected={String(isSelected)}
              data-muted={String(isMuted)}
              onClick={() =>
                setFocusedPower((prev) => (prev === power ? null : power))
              }
            >
              <span
                className={styles.legendSwatch}
                style={{ backgroundColor: meta.color }}
              />
              <PowerFlag power={power} width={14} height={9} />
              <span>{meta.shortName}</span>
              <span>({currentCount})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
