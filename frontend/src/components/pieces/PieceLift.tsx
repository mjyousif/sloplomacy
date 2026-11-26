import type { ReactNode } from 'react';
import { DEFAULT_RIM, HOVER_RIM, OWN_RIM } from './marks';

/**
 * How the map shows the piece you are pointing at or have picked: the piece itself rises,
 * instead of a ring being drawn around it, so it reads the same on a token, a flag or a
 * name plate. A selected piece also casts a deep shadow.
 */
export type PieceLiftState = 'selected' | 'hovered' | null;

export const PIECE_LIFT_FILTER_ID = 'piece-lift-shadow';

const LIFT_SCALE: Record<'selected' | 'hovered', number> = {
  selected: 1.25,
  hovered: 1.1,
};

/**
 * The scale a lifted piece grows by. It is about the unit point, the token's origin: the
 * middle of a disc or a plate, and the foot of a flag's pole, so a flag grows upward from
 * where it stands. Rings that hug the piece use it too, so the piece never outgrows them.
 */
export function liftTransform(lift: PieceLiftState): string | undefined {
  return lift ? `scale(${LIFT_SCALE[lift]})` : undefined;
}

/**
 * The rim a unit's piece wears: trouble first (dislodged, then disbanding), then being
 * picked or pointed at, then gold if it is the player's own.
 */
export function pieceRim({
  dislodged,
  disbanding,
  lift,
  own,
}: {
  dislodged: boolean;
  disbanding: boolean;
  lift: PieceLiftState;
  own: boolean;
}): string {
  if (dislodged) return '#fdba74';
  if (disbanding) return '#fca5a5';
  if (lift === 'selected') return OWN_RIM;
  if (lift === 'hovered') return HOVER_RIM;
  return own ? OWN_RIM : DEFAULT_RIM;
}

/** Wraps one piece's body. Badges and banners stay outside, so they don't move. */
export function PieceLift({
  lift,
  children,
}: {
  lift: PieceLiftState;
  children: ReactNode;
}) {
  return (
    <g
      transform={liftTransform(lift)}
      filter={lift === 'selected' ? `url(#${PIECE_LIFT_FILTER_ID})` : undefined}
      data-lift={lift ?? undefined}
    >
      {children}
    </g>
  );
}

/** The selected piece's shadow. The map draws it once in its `<defs>`. */
export function PieceLiftFilter() {
  return (
    <filter
      id={PIECE_LIFT_FILTER_ID}
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"
    >
      <feDropShadow
        dx="0"
        dy="5"
        stdDeviation="3.2"
        floodColor="#0f0a02"
        floodOpacity="0.7"
      />
    </filter>
  );
}
