import type { UnitMark } from '../../utils/displayPrefs';
import type { PieceUnitType } from './pieceFrame';

export const DEFAULT_RIM = '#fef3c7';

export function SupplyStar({
  ownerColor,
  scale = 1,
}: {
  ownerColor?: string;
  scale?: number;
}) {
  return (
    <g transform={scale === 1 ? undefined : `scale(${scale})`}>
      <circle
        r="8.5"
        fill={ownerColor ?? DEFAULT_RIM}
        stroke="#1c1917"
        strokeWidth="2"
      />
      <polygon
        points="0,-5.8 1.6,-1.7 6,-1.7 2.5,1.1 3.8,5.4 0,2.8 -3.8,5.4 -2.5,1.1 -6,-1.7 -1.6,-1.7"
        fill={ownerColor ? '#fde047' : '#57534e'}
      />
    </g>
  );
}

interface UnitMarkGlyphProps {
  unitType: PieceUnitType;
  mark: UnitMark;
  /** The piece's colour, for the details cut out of the tank's tracks. */
  color: string;
  fontSize?: number;
  textY?: number;
  letterPrefix?: string;
}

function CrossedSwords() {
  return (
    <g stroke="#ffffff" strokeLinecap="round" pointerEvents="none">
      <line x1="-7" y1="-7" x2="7" y2="7" strokeWidth="2.6" />
      <line x1="7" y1="-7" x2="-7" y2="7" strokeWidth="2.6" />
      <line x1="-7.5" y1="3" x2="-3" y2="7.5" strokeWidth="2.2" />
      <line x1="7.5" y1="3" x2="3" y2="7.5" strokeWidth="2.2" />
    </g>
  );
}

function SailingShip() {
  return (
    <g fill="#ffffff" pointerEvents="none">
      <path d="M-10 3L10 3L6.5 9L-6.5 9Z" />
      <rect x="-1" y="-10" width="2" height="13" />
      <path d="M1.8 -9.5L8.5 1.5L1.8 1.5Z" />
      <path d="M-1.8 -6.5L-7.5 1.5L-1.8 1.5Z" />
    </g>
  );
}

function Tank({ color }: { color: string }) {
  return (
    <g fill="#ffffff" pointerEvents="none">
      <rect x="-12" y="1.5" width="24" height="7.5" rx="3.75" />
      <rect x="-9.5" y="-3" width="19" height="5" rx="1" />
      <rect x="-5" y="-8" width="10" height="6" rx="1.8" />
      <rect x="3" y="-6.7" width="11" height="2.4" rx="0.6" />
      <g fill={color}>
        <circle cx="-8" cy="5.25" r="1.5" />
        <circle cx="-2.7" cy="5.25" r="1.5" />
        <circle cx="2.7" cy="5.25" r="1.5" />
        <circle cx="8" cy="5.25" r="1.5" />
      </g>
    </g>
  );
}

function Warship() {
  return (
    <g fill="#ffffff" pointerEvents="none">
      <path d="M-14 2.5L14 2.5L10.5 8.5L-10 8.5Z" />
      <rect x="-6.5" y="-2.5" width="9.5" height="5.5" />
      <rect x="-3.5" y="-7" width="4" height="5" />
      <rect x="-2.3" y="-11.5" width="1.6" height="5" />
      <rect x="-11" y="-0.5" width="3.2" height="3.5" />
      <rect x="4.5" y="-0.5" width="4.5" height="3.2" rx="0.6" />
      <rect x="8" y="0" width="5.5" height="1.3" />
    </g>
  );
}

/** The NATO map symbol for armour: a land unit's box around a tracked vehicle's oval. */
function NatoArmour() {
  return (
    <g fill="none" stroke="#ffffff" strokeWidth="2.3" pointerEvents="none">
      <rect x="-12.5" y="-8.5" width="25" height="17" />
      <ellipse rx="7.5" ry="4.2" />
    </g>
  );
}

/** Inspired by NATO naval symbols: the round frame used at sea, around an anchor. */
function NatoNaval() {
  return (
    <g fill="none" stroke="#ffffff" strokeLinecap="round" pointerEvents="none">
      <circle r="10.5" strokeWidth="2.3" />
      <circle cy="-5" r="1.5" strokeWidth="1.6" />
      <path d="M0 -3.5L0 6.5M-3.5 -1.5L3.5 -1.5" strokeWidth="1.8" />
      <path
        d="M-6 1.5C-5.5 5 -3 6.5 0 6.5C3 6.5 5.5 5 6 1.5"
        strokeWidth="1.8"
      />
    </g>
  );
}

export function UnitMarkGlyph({
  unitType,
  mark,
  color,
  fontSize = 14.5,
  textY = 5.5,
  letterPrefix = '',
}: UnitMarkGlyphProps) {
  if (mark === 'letters') {
    return (
      <text
        y={textY}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="Cinzel, serif"
        pointerEvents="none"
      >
        {letterPrefix}
        {unitType}
      </text>
    );
  }
  if (mark === 'vehicles') {
    return unitType === 'A' ? <Tank color={color} /> : <Warship />;
  }
  if (mark === 'nato') {
    return unitType === 'A' ? <NatoArmour /> : <NatoNaval />;
  }
  return unitType === 'A' ? <CrossedSwords /> : <SailingShip />;
}
