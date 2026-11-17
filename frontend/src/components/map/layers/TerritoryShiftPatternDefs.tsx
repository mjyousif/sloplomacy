import { POWER_METADATA, type Power } from '../../../types/diplomacy';
import type { TerritoryShiftPattern } from '../../../utils/historyOwnershipChanges';

function stripeColor(power: Power | null): { fill: string; opacity: number } {
  if (!power) return { fill: '#f4d7b5', opacity: 0.25 };
  return {
    fill: POWER_METADATA[power].fillColor,
    opacity: power === 'ENGLAND' ? 0.68 : 0.54,
  };
}

/** SVG diagonal stripe patterns showing before/after ownership on changed territories. */
export function TerritoryShiftPatternDefs({
  patterns,
}: {
  patterns: readonly TerritoryShiftPattern[];
}) {
  return (
    <>
      {patterns.map((pat) => {
        const prev = stripeColor(pat.prevPower);
        const next = stripeColor(pat.nextPower);
        return (
          <pattern
            key={pat.id}
            id={pat.id}
            width="14"
            height="14"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
            data-testid="territory-shift-pattern"
          >
            <rect
              x="0"
              y="0"
              width="7"
              height="14"
              fill={prev.fill}
              fillOpacity={prev.opacity}
            />
            <rect
              x="7"
              y="0"
              width="7"
              height="14"
              fill={next.fill}
              fillOpacity={next.opacity}
            />
          </pattern>
        );
      })}
    </>
  );
}
