// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  PIECE_STYLES,
  type PieceStyle,
  UNIT_MARKS,
  type UnitMark,
} from '../utils/displayPrefs';
import {
  getPieceFrame,
  MapPiece,
  makePiecePill,
  type PieceUnitType,
  type PieceVariant,
} from './MapPiece';

const UNIT_TYPES: PieceUnitType[] = ['A', 'F'];
const VARIANTS: PieceVariant[] = ['unit', 'ghost', 'build'];

interface DrawOptions {
  style?: PieceStyle;
  mark?: UnitMark;
  unitType?: PieceUnitType;
  variant?: PieceVariant;
  rim?: string;
  flagDirection?: 1 | -1;
  hasStar?: boolean;
  showStar?: boolean;
  starOwnerColor?: string;
  pillName?: string;
  pillAngle?: number;
}

function draw(options: DrawOptions = {}) {
  const { style = 'classic', pillName = 'Paris', pillAngle = 0 } = options;
  const pill =
    style === 'nameplate'
      ? makePiecePill(pillName, 11, pillAngle, options.hasStar ?? false)
      : null;
  const frame = getPieceFrame(style, options.flagDirection ?? 1, pill);
  const { container } = render(
    <svg>
      <MapPiece
        style={style}
        mark={options.mark ?? 'letters'}
        unitType={options.unitType ?? 'A'}
        color="#336699"
        variant={options.variant}
        rim={options.rim}
        frame={frame}
        flagDirection={options.flagDirection}
        hasStar={options.hasStar}
        showStar={options.showStar}
        starOwnerColor={options.starOwnerColor}
      />
    </svg>,
  );
  return container.querySelector('svg') as SVGSVGElement;
}

describe('MapPiece: every style, mark, unit type and variant', () => {
  for (const style of PIECE_STYLES) {
    for (const mark of UNIT_MARKS) {
      for (const unitType of UNIT_TYPES) {
        for (const variant of VARIANTS) {
          it(`draws ${style} / ${mark} / ${unitType} / ${variant}`, () => {
            const svg = draw({ style, mark, unitType, variant });
            expect(svg.children.length).toBeGreaterThan(0);
            // Every piece is coloured with the power's colour
            expect(svg.querySelector('[fill="#336699"]')).not.toBeNull();
            // and a letter mark is drawn exactly once (the other marks are pinned below)
            if (mark === 'letters') {
              const labels = [...svg.querySelectorAll('text')].map(
                (t) => t.textContent,
              );
              // Only discs carry the build plus; flags and plates ignore the variant
              const expected =
                variant === 'build' && !['flags', 'nameplate'].includes(style)
                  ? `+${unitType}`
                  : unitType;
              if (style === 'nameplate') {
                expect(labels).toEqual([unitType, 'Paris']);
              } else {
                expect(labels).toEqual([expected]);
              }
            }
          });
        }
      }
    }
  }
});

describe('MapPiece: discs (classic, seated, compact)', () => {
  it('draws a classic army as a circle with a shadow and no scale', () => {
    const svg = draw();
    const g = svg.querySelector(':scope > g') as SVGGElement;
    expect(g.hasAttribute('transform')).toBe(false);
    const circles = g.querySelectorAll(':scope > circle');
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveAttribute('r', '18.2');
    expect(circles[1]).toHaveAttribute('r', '17');
    expect(circles[1]).toHaveAttribute('stroke', '#fef3c7');
    expect(circles[1]).toHaveAttribute('stroke-width', '2.8');
  });

  it('draws a classic fleet as a five-point shield', () => {
    const svg = draw({ unitType: 'F' });
    const polygons = svg.querySelectorAll('polygon');
    expect(polygons).toHaveLength(2);
    expect(polygons[0]).toHaveAttribute(
      'points',
      '0,-15.8 19,-3.8 15,18.2 -15,18.2 -19,-3.8',
    );
    expect(polygons[1]).toHaveAttribute(
      'points',
      '0,-19 18,-7 14,15 -14,15 -18,-7',
    );
  });

  it('has no shadow for ghost and build variants and sizes them differently', () => {
    const ghost = draw({ variant: 'ghost' });
    expect(ghost.querySelectorAll('circle')).toHaveLength(1);
    expect(ghost.querySelector('circle')).toHaveAttribute('r', '15');
    expect(ghost.querySelector('circle')).toHaveAttribute(
      'stroke-width',
      '2.5',
    );
    const build = draw({ variant: 'build' });
    expect(build.querySelectorAll('circle')).toHaveLength(1);
    expect(build.querySelector('circle')).toHaveAttribute('r', '16');
  });

  it.each([
    ['classic', undefined],
    ['seated', 'scale(0.76)'],
    ['compact', 'scale(0.65)'],
  ] as const)('%s scales its disc by %s', (style, transform) => {
    const g = draw({ style }).querySelector(':scope > g') as SVGGElement;
    if (transform) expect(g).toHaveAttribute('transform', transform);
    else expect(g.hasAttribute('transform')).toBe(false);
  });

  it('prefixes a build letter with a plus', () => {
    const svg = draw({ variant: 'build', unitType: 'F' });
    expect(svg.querySelector('text')?.textContent).toBe('+F');
  });

  it('carries no star unless asked, even in the seated style', () => {
    const svg = draw({ style: 'seated' });
    expect(svg.querySelector('g[transform="translate(11, 11)"]')).toBeNull();
  });

  it('shapes ghost and build fleets smaller than a live one', () => {
    const points = (variant: PieceVariant) =>
      draw({ unitType: 'F', variant })
        .querySelector('polygon')
        ?.getAttribute('points');
    expect(points('ghost')).toBe('0,-17 16,-6 12,13 -12,13 -16,-6');
    expect(points('build')).toBe('0,-18 17,-6 13,14 -13,14 -17,-6');
    expect(
      draw({ unitType: 'F', variant: 'build' }).querySelector('polygon'),
    ).toHaveAttribute('stroke-width', '2.8');
  });

  it('uses the given rim colour', () => {
    const svg = draw({ rim: '#ff0000' });
    expect(svg.querySelectorAll('circle')[1]).toHaveAttribute(
      'stroke',
      '#ff0000',
    );
  });

  it('carries the supply star only in the seated style, and only when asked', () => {
    const star = (style: PieceStyle, showStar: boolean) =>
      draw({ style, showStar, starOwnerColor: '#abcdef' }).querySelector(
        'g[transform="translate(11, 11)"]',
      );
    expect(star('seated', true)).not.toBeNull();
    expect(
      star('seated', true)?.querySelector('g')?.getAttribute('transform'),
    ).toBe('scale(0.62)');
    expect(star('seated', true)?.querySelector('circle')).toHaveAttribute(
      'fill',
      '#abcdef',
    );
    expect(star('seated', false)).toBeNull();
    expect(star('classic', true)).toBeNull();
    expect(star('compact', true)).toBeNull();
  });
});

describe('MapPiece: marks', () => {
  const glyph = (mark: UnitMark, unitType: PieceUnitType) =>
    draw({ mark, unitType, variant: 'ghost' }).innerHTML;

  it('draws a different glyph for each mark and unit type', () => {
    const seen = new Set<string>();
    for (const mark of UNIT_MARKS) {
      for (const unitType of UNIT_TYPES) seen.add(glyph(mark, unitType));
    }
    expect(seen.size).toBe(8);
  });

  it('draws crossed swords for an army and a sailing ship for a fleet', () => {
    expect(draw({ mark: 'icons' }).querySelectorAll('line')).toHaveLength(4);
    expect(
      draw({ mark: 'icons', unitType: 'F' }).querySelectorAll('rect'),
    ).toHaveLength(1);
  });

  it('cuts the tank track details out in the piece colour', () => {
    const svg = draw({ mark: 'vehicles' });
    expect(
      svg.querySelectorAll('g[fill="#336699"] circle[r="1.5"]'),
    ).toHaveLength(4);
  });

  it('draws the NATO armour box and naval ring', () => {
    expect(draw({ mark: 'nato' }).querySelector('ellipse')).not.toBeNull();
    expect(
      draw({ mark: 'nato', unitType: 'F' }).querySelector('circle[r="10.5"]'),
    ).not.toBeNull();
  });

  it('uses Cinzel letters sized for the variant', () => {
    const text = draw({ variant: 'unit' }).querySelector('text');
    expect(text).toHaveAttribute('font-size', '14.5');
    expect(text).toHaveAttribute('y', '5.5');
    expect(text).toHaveAttribute('font-family', 'Cinzel, serif');
    const ghost = draw({ variant: 'ghost' }).querySelector('text');
    expect(ghost).toHaveAttribute('font-size', '12.5');
    expect(ghost).toHaveAttribute('y', '5');
  });
});

describe('MapPiece: flags', () => {
  it('draws a pole, a four-corner flag and a hub for an army', () => {
    const svg = draw({ style: 'flags', mark: 'icons' });
    expect(svg.querySelector('line')).toHaveAttribute('y2', '-29');
    expect(svg.querySelector('polygon')).toHaveAttribute(
      'points',
      '0,-29 27,-29 20,-22 27,-15 0,-15',
    );
    expect(svg.querySelector('circle[r="3.4"]')).not.toBeNull();
    expect(
      svg.querySelector('g[transform="translate(9.5, -22) scale(0.6)"]'),
    ).not.toBeNull();
  });

  it('draws a tapering pennant with a smaller mark for a fleet', () => {
    const svg = draw({ style: 'flags', mark: 'icons', unitType: 'F' });
    expect(svg.querySelector('polygon')).toHaveAttribute(
      'points',
      '0,-29 30,-22 0,-15',
    );
    expect(
      svg.querySelector('g[transform="translate(8.5, -22) scale(0.5)"]'),
    ).not.toBeNull();
  });

  it('outlines the cloth in the rim colour', () => {
    const svg = draw({ style: 'flags', rim: '#ff0000' });
    expect(svg.querySelector('polygon')).toHaveAttribute('stroke', '#ff0000');
    expect(svg.querySelector('polygon')).toHaveAttribute('stroke-width', '1.3');
    expect(svg.querySelector('circle[r="3.4"]')).toHaveAttribute(
      'stroke-width',
      '1.2',
    );
  });

  it('mirrors for the other flag direction', () => {
    const svg = draw({ style: 'flags', flagDirection: -1 });
    expect(svg.querySelector('polygon')).toHaveAttribute(
      'points',
      '0,-29 -27,-29 -20,-22 -27,-15 0,-15',
    );
    expect(
      svg.querySelector('g[transform="translate(-9.5, -22) scale(0.6)"]'),
    ).not.toBeNull();
  });

  it('drops the hub when the province has a star for the pole to rise from', () => {
    expect(
      draw({ style: 'flags', hasStar: true }).querySelector('circle[r="3.4"]'),
    ).toBeNull();
    expect(
      draw({ style: 'flags', hasStar: false }).querySelector('circle[r="3.4"]'),
    ).not.toBeNull();
  });
});

describe('MapPiece: nameplate pills', () => {
  it('draws a rounded plate for an army and a pointed one for a fleet', () => {
    const army = draw({ style: 'nameplate' });
    expect(army.querySelector('rect')).not.toBeNull();
    expect(army.querySelector('polygon')).toBeNull();
    const fleet = draw({ style: 'nameplate', unitType: 'F' });
    expect(fleet.querySelector('rect')).toBeNull();
    expect(fleet.querySelector('polygon')).not.toBeNull();
  });

  it('writes the province name at the pill text position', () => {
    const svg = draw({ style: 'nameplate', pillName: 'Burgundy' });
    const name = [...svg.querySelectorAll('text')].find(
      (t) => t.textContent === 'Burgundy',
    );
    expect(name).toBeDefined();
    expect(name).toHaveAttribute('font-size', '11');
    expect(name).toHaveAttribute('dominant-baseline', 'central');
    expect(name).toHaveAttribute(
      'x',
      String(makePiecePill('Burgundy', 11, 0, false).textX),
    );
  });

  it('shapes the fleet plate with a point at each end, scaled to the height', () => {
    const pill = makePiecePill('Paris', 11, 0, false);
    const svg = draw({ style: 'nameplate', unitType: 'F' });
    const hw = pill.width / 2;
    const hh = pill.height / 2;
    const point = hh * 0.7;
    expect(svg.querySelector('polygon')).toHaveAttribute(
      'points',
      `${-hw},${-hh} ${hw},${-hh} ${hw + point},0 ${hw},${hh} ${-hw},${hh} ${-hw - point},0`,
    );
  });

  it('places the star a fixed distance from the right end', () => {
    const pill = makePiecePill('Paris', 11, 0, true);
    const svg = draw({ style: 'nameplate', hasStar: true });
    expect(
      svg.querySelector(`g[transform="translate(${pill.width / 2 - 7}, 0)"]`),
    ).not.toBeNull();
  });

  it('rotates by the pill angle', () => {
    const svg = draw({ style: 'nameplate', pillAngle: 20 });
    expect(svg.querySelector(':scope > g')).toHaveAttribute(
      'transform',
      'rotate(20)',
    );
  });

  it('shows a small supply star at the end only when the province has one', () => {
    const withStar = draw({
      style: 'nameplate',
      hasStar: true,
      starOwnerColor: '#123456',
    });
    expect(
      withStar.querySelector('g[transform^="translate("] circle[r="8.5"]'),
    ).not.toBeNull();
    expect(
      withStar.querySelector('g[transform="scale(0.5)"] circle'),
    ).toHaveAttribute('fill', '#123456');
    expect(
      draw({ style: 'nameplate', hasStar: false }).querySelector(
        'circle[r="8.5"]',
      ),
    ).toBeNull();
  });

  it('outlines the plate in the rim colour, one and a half units wide', () => {
    for (const unitType of ['A', 'F'] as const) {
      const shape = draw({
        style: 'nameplate',
        unitType,
        rim: '#ff0000',
      }).querySelector(unitType === 'A' ? 'rect' : 'polygon');
      expect(shape).toHaveAttribute('stroke', '#ff0000');
      expect(shape).toHaveAttribute('stroke-width', '1.4');
    }
  });

  it('puts the mark at the start of the pill', () => {
    const pill = makePiecePill('Paris', 11, 0, false);
    const svg = draw({ style: 'nameplate' });
    expect(
      svg.querySelector(
        `g[transform="translate(${-pill.width / 2 + 10}, 0) scale(0.56)"]`,
      ),
    ).not.toBeNull();
  });
});
