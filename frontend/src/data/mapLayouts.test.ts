import { describe, expect, it } from 'vitest';
import { getPieceFrame } from '../components/MapPiece';
import { PIECE_STYLES, type PieceStyle } from '../utils/displayPrefs';
import { EUROPE_PROVINCE_GEOMETRY, type Point } from './europeMapGeometry';
import {
  getMapLayout,
  SEA_SHORT_NAMES,
  SHARED_MAP_NAMES_SVG,
} from './mapLayouts';
import { measureMapName } from './mapTextMetrics';

const SEAS = Object.keys(SEA_SHORT_NAMES);
const LAND = Object.keys(EUROPE_PROVINCE_GEOMETRY).filter(
  (id) => id !== 'SWI' && !SEAS.includes(id),
);
const FITTED_STYLES = PIECE_STYLES.filter((style) => style !== 'classic');

// The screen shows the map below full size, so smaller text gets too small to read at default zoom
const MIN_NAME_SIZE = 12;
// The few provinces too small for that, which all sit on thin coastlines
const NAME_SIZE_EXCEPTIONS = ['EDI', 'DEN', 'LVP'];
const SMALLEST_NAME_SIZE = 11;
const STEEPEST_NAME_ANGLE = 85;

/** The drawn radius of each style's token around the unit point, plus its stroke. */
const TOKEN_REACH: Partial<Record<PieceStyle, number>> = {
  seated: 14,
  compact: 12,
};
const STAR_REACH: Partial<Record<PieceStyle, number>> = { compact: 6.5 };
const BASE_REACH = 5;

const NAMES: Record<string, string> = {
  ALB: 'Albania',
  ANK: 'Ankara',
  APU: 'Apulia',
  ARM: 'Armenia',
  BEL: 'Belgium',
  BER: 'Berlin',
  BOH: 'Bohemia',
  BRE: 'Brest',
  BUD: 'Budapest',
  BUL: 'Bulgaria',
  BUR: 'Burgundy',
  CLY: 'Clyde',
  CON: 'Constantinople',
  DEN: 'Denmark',
  EDI: 'Edinburgh',
  FIN: 'Finland',
  GAL: 'Galicia',
  GAS: 'Gascony',
  GRE: 'Greece',
  HOL: 'Holland',
  KIE: 'Kiel',
  LON: 'London',
  LVN: 'Livonia',
  LVP: 'Liverpool',
  MAR: 'Marseilles',
  MOS: 'Moscow',
  MUN: 'Munich',
  NAF: 'North Africa',
  NAP: 'Naples',
  NWY: 'Norway',
  PAR: 'Paris',
  PIC: 'Picardy',
  PIE: 'Piedmont',
  POR: 'Portugal',
  PRU: 'Prussia',
  ROM: 'Rome',
  RUH: 'Ruhr',
  RUM: 'Rumania',
  SER: 'Serbia',
  SEV: 'Sevastopol',
  SIL: 'Silesia',
  SMY: 'Smyrna',
  SPA: 'Spain',
  STP: 'St. Petersburg',
  SWE: 'Sweden',
  SYR: 'Syria',
  TRI: 'Trieste',
  TUN: 'Tunis',
  TUS: 'Tuscany',
  TYR: 'Tyrolia',
  UKR: 'Ukraine',
  VEN: 'Venice',
  VIE: 'Vienna',
  WAL: 'Wales',
  WAR: 'Warsaw',
  YOR: 'Yorkshire',
};

/** Turns an SVG path into polygons, covering every command the map geometry uses. */
function flattenPath(path: string): Point[][] {
  const tokens = path.match(/[a-df-zA-DF-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const polygons: Point[][] = [];
  let polygon: Point[] = [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const next = () => parseFloat(tokens[index++]);

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    switch (command) {
      case 'M':
      case 'm': {
        const relative = command === 'm';
        x = next() + (relative ? x : 0);
        y = next() + (relative ? y : 0);
        startX = x;
        startY = y;
        polygon = [{ x, y }];
        polygons.push(polygon);
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L':
        x = next();
        y = next();
        polygon.push({ x, y });
        break;
      case 'l':
        x += next();
        y += next();
        polygon.push({ x, y });
        break;
      case 'H':
        x = next();
        polygon.push({ x, y });
        break;
      case 'h':
        x += next();
        polygon.push({ x, y });
        break;
      case 'V':
        y = next();
        polygon.push({ x, y });
        break;
      case 'v':
        y += next();
        polygon.push({ x, y });
        break;
      case 'C':
      case 'c': {
        const base = command === 'c' ? { x, y } : { x: 0, y: 0 };
        const [c1x, c1y, c2x, c2y, ex, ey] = [
          next() + base.x,
          next() + base.y,
          next() + base.x,
          next() + base.y,
          next() + base.x,
          next() + base.y,
        ];
        for (let step = 1; step <= 8; step++) {
          const t = step / 8;
          const u = 1 - t;
          polygon.push({
            x:
              u * u * u * x +
              3 * u * u * t * c1x +
              3 * u * t * t * c2x +
              t * t * t * ex,
            y:
              u * u * u * y +
              3 * u * u * t * c1y +
              3 * u * t * t * c2y +
              t * t * t * ey,
          });
        }
        x = ex;
        y = ey;
        break;
      }
      case 'Z':
      case 'z':
        x = startX;
        y = startY;
        break;
      default:
        throw new Error(`Unhandled path command ${command}`);
    }
  }
  return polygons;
}

const POLYGONS = Object.fromEntries(
  Object.entries(EUROPE_PROVINCE_GEOMETRY).map(([id, geom]) => [
    id,
    flattenPath(geom.path),
  ]),
);

/** Even-odd test across all of a province's polygons, matching how SVG fills it. */
function isInside(provinceId: string, { x, y }: Point): boolean {
  let inside = false;
  for (const polygon of POLYGONS[provinceId]) {
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (
        a.y > y !== b.y > y &&
        x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function nameBox(style: PieceStyle, provinceId: string): Point[] {
  const placement = getMapLayout(style)[provinceId].name!;
  const width = measureMapName(NAMES[provinceId], placement.size);
  const height = placement.size * 0.8;
  const cos = Math.cos((placement.angle * Math.PI) / 180);
  const sin = Math.sin((placement.angle * Math.PI) / 180);
  const samples = Math.max(6, Math.round(width / 4));
  const points: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    for (const v of [-0.5, 0, 0.5]) {
      const localX = (i / samples - 0.5) * width;
      const localY = v * height;
      points.push({
        x: placement.x + cos * localX - sin * localY,
        y: placement.y + sin * localX + cos * localY,
      });
    }
  }
  return points;
}

const nearestDistance = (points: Point[], to: Point) =>
  Math.min(
    ...points.map((point) => Math.hypot(point.x - to.x, point.y - to.y)),
  );

/** Failures read as a list of province ids, so a broken edit names what to fix. */
const failing = (provinces: string[], breaks: (id: string) => boolean) =>
  provinces.filter(breaks);

describe('map layouts', () => {
  it('checks every land province', () => {
    expect(Object.keys(NAMES).sort()).toEqual([...LAND].sort());
    expect(LAND).toHaveLength(56);
  });

  it('keeps classic exactly as the original map', () => {
    const layout = getMapLayout('classic');
    for (const [id, geom] of Object.entries(EUROPE_PROVINCE_GEOMETRY)) {
      expect(layout[id].unit).toBe(geom.unitPos);
      expect(layout[id].star).toBe(geom.scPos);
      expect(layout[id].name).toBeUndefined();
    }
  });

  it('shares the sea names and coast tags, and no land names, across the fitted styles', () => {
    const texts = [
      ...SHARED_MAP_NAMES_SVG.matchAll(/<tspan\b[^>]*>(.*?)<\/tspan>/gs),
    ].map(([, inner]) => inner.replace(/<[^>]+>/g, '').trim());
    expect(texts).toContain('NORTH SEA');
    expect(
      texts.filter((text) => ['NC', 'SC', 'EC'].includes(text)),
    ).toHaveLength(6);
    expect(texts).not.toContain('Liverpool');
    expect(texts).not.toContain('LVP');
  });

  describe.each(FITTED_STYLES)('%s', (style) => {
    const layout = getMapLayout(style);

    it('places a name in every land province, and none at sea', () => {
      expect(failing(LAND, (id) => !layout[id].name)).toEqual([]);
      expect(failing(SEAS, (id) => Boolean(layout[id].name))).toEqual([]);
    });

    it('keeps every land unit on its own province', () => {
      expect(failing(LAND, (id) => !isInside(id, layout[id].unit))).toEqual([]);
    });

    it('keeps every sea unit at sea', () => {
      expect(failing(SEAS, (id) => !isInside(id, layout[id].unit))).toEqual([]);
    });

    it('keeps names readable', () => {
      const tooSmall = failing(LAND, (id) => {
        const floor = NAME_SIZE_EXCEPTIONS.includes(id)
          ? SMALLEST_NAME_SIZE
          : MIN_NAME_SIZE;
        return layout[id].name!.size < floor;
      });
      const tooSteep = failing(
        LAND,
        (id) => Math.abs(layout[id].name!.angle) > STEEPEST_NAME_ANGLE,
      );
      expect(tooSmall).toEqual([]);
      expect(tooSteep).toEqual([]);
    });

    it('keeps every name inside its province', () => {
      const spilled = failing(LAND, (id) => {
        const points = nameBox(style, id);
        return (
          points.filter((point) => !isInside(id, point)).length /
            points.length >
          0.04
        );
      });
      expect(spilled).toEqual([]);
    });

    it('never lets two names overlap', () => {
      const clashes: string[] = [];
      const boxes = LAND.map((id) => ({ id, points: nameBox(style, id) }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const near = boxes[i].points.some(
            (point) => nearestDistance(boxes[j].points, point) < 1.5,
          );
          if (near) clashes.push(`${boxes[i].id}/${boxes[j].id}`);
        }
      }
      expect(clashes).toEqual([]);
    });

    const tokenReach = TOKEN_REACH[style];
    if (tokenReach) {
      it('never puts a token on its own province name', () => {
        const covered = failing(
          LAND,
          (id) =>
            nearestDistance(nameBox(style, id), layout[id].unit) < tokenReach,
        );
        expect(covered).toEqual([]);
      });
    }

    const starReach = STAR_REACH[style];
    if (starReach) {
      it('never puts a star on its own province name', () => {
        const covered = failing(LAND, (id) => {
          const star = layout[id].star;
          return (
            Boolean(star) &&
            nearestDistance(nameBox(style, id), star!) < starReach
          );
        });
        expect(covered).toEqual([]);
      });
    }

    if (style === 'flags') {
      it('flies each flag clear of its own name and keeps the base off it', () => {
        const covered = failing(LAND, (id) => {
          const { unit, flagDirection } = layout[id];
          const center = getPieceFrame('flags', flagDirection).center;
          const box = nameBox(style, id);
          const onFlag = box.some(
            (point) =>
              Math.abs(point.x - (unit.x + center.x)) < 13 &&
              Math.abs(point.y - (unit.y - 22)) < 7,
          );
          return onFlag || nearestDistance(box, unit) < BASE_REACH;
        });
        expect(covered).toEqual([]);
      });
    }

    if (style === 'nameplate') {
      it('stands each land unit exactly on its name', () => {
        const apart = failing(LAND, (id) => {
          const { unit, name } = layout[id];
          return unit.x !== name!.x || unit.y !== name!.y;
        });
        expect(apart).toEqual([]);
      });
    }
  });
});
