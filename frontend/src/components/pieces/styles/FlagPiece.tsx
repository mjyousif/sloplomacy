import type { FlagDirection } from '../../../data/mapLayouts';
import type { UnitMark } from '../../../utils/displayPrefs';
import { UnitMarkGlyph } from '../marks';
import type { PieceUnitType } from '../pieceFrame';

const FLAG_MARK_SCALE = 0.6;
// A fleet's pennant tapers, so its mark sits smaller and nearer the pole to stay inside it
const PENNANT_MARK_SCALE = 0.5;

export function FlagPiece({
  mark,
  unitType,
  color,
  rim,
  direction,
  hasStar,
}: {
  mark: UnitMark;
  unitType: PieceUnitType;
  color: string;
  rim: string;
  direction: FlagDirection;
  hasStar: boolean;
}) {
  const isArmy = unitType === 'A';
  const points = isArmy
    ? `0,-29 ${27 * direction},-29 ${20 * direction},-22 ${27 * direction},-15 0,-15`
    : `0,-29 ${30 * direction},-22 0,-15`;
  const markX = (isArmy ? 9.5 : 8.5) * direction;
  const markScale = isArmy ? FLAG_MARK_SCALE : PENNANT_MARK_SCALE;
  return (
    <g>
      <line x1="0" y1="0" x2="0" y2="-29" stroke="#2b2a22" strokeWidth="2.2" />
      <polygon points={points} fill={color} stroke={rim} strokeWidth="1.3" />
      <g transform={`translate(${markX}, -22) scale(${markScale})`}>
        <UnitMarkGlyph unitType={unitType} mark={mark} color={color} />
      </g>
      {!hasStar && (
        <circle r="3.4" fill={color} stroke={rim} strokeWidth="1.2" />
      )}
    </g>
  );
}
