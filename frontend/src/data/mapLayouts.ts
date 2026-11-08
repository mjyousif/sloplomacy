import {
  AUTHENTIC_NAMES_SVG,
  EUROPE_PROVINCE_GEOMETRY,
  Point,
} from './europeMapGeometry';
import { PieceStyle } from '../utils/displayPrefs';

/**
 * Where each piece style puts things on the map. Tokens and stars are drawn first
 * and the names are fitted around them, so every style has its own placements.
 *
 * The classic layout is `EUROPE_PROVINCE_GEOMETRY` and `AUTHENTIC_NAMES_SVG` as they
 * always were. The rows below only record what a style changes: a province with no
 * `unit` keeps its `unitPos`, and one with no `star` keeps its `scPos`.
 *
 * Note that `EUROPE_PROVINCE_GEOMETRY.CLY.unitPos` lies in the North Atlantic. Classic
 * keeps it to stay identical to the original map, and the other styles move it ashore.
 *
 * `mapLayouts.test.ts` checks every placement against the province outlines, so a
 * value can be edited here by hand and the test will say if it stops fitting.
 */

export interface MapNamePlacement {
  /** Centre of the name. */
  x: number;
  y: number;
  angle: number;
  size: number;
}

export type FlagDirection = 1 | -1;

export interface ProvinceLayout {
  unit: Point;
  star?: Point;
  /** Absent in classic, whose names are all in `AUTHENTIC_NAMES_SVG`, and for seas. */
  name?: MapNamePlacement;
  flagDirection: FlagDirection;
}

export type MapLayout = Record<string, ProvinceLayout>;

interface LayoutRow {
  /** Centre x, centre y, angle, size. */
  name?: [number, number, number, number];
  unit?: [number, number];
  star?: [number, number];
  flag?: -1;
}

const SEATED_ROWS: Record<string, LayoutRow> = {
  ALB: { name: [884, 1121.5, 60, 13], unit: [871, 1143] },
  ANK: { name: [1259.6, 1085.4, -14, 16] },
  APU: { name: [776, 1132, 25, 16], unit: [738, 1108] },
  ARM: { name: [1437, 1111, 0, 16] },
  BEL: { name: [511, 774.5, 35, 16], unit: [536, 764] },
  BER: { name: [708, 698.5, 0, 16] },
  BOH: { name: [754.1, 831, 0, 16] },
  BRE: { name: [347.5, 832.5, 0, 16] },
  BUD: { name: [915.9, 930.6, 0, 16] },
  BUL: { name: [1007.5, 1056.6, -1, 16] },
  BUR: { name: [488, 917, -20, 16] },
  CLY: { name: [383, 480, -35, 15], unit: [363, 545] },
  CON: { name: [1128.5, 1140.5, -35, 16], unit: [1072, 1144] },
  DEN: { name: [636, 590, -55, 11], unit: [648, 615] },
  EDI: { name: [403, 524, -43, 11.5], unit: [401, 576] },
  FIN: { name: [945, 304, 0, 16] },
  GAL: { name: [915, 823, 0, 16] },
  GAS: { name: [375.5, 969, 0, 16] },
  GRE: { name: [926, 1183, 5, 16] },
  HEL: { unit: [577, 621] },
  HOL: { name: [539.5, 720, -20, 15], unit: [546, 742] },
  KIE: { name: [623.5, 732, 0, 16] },
  LON: { name: [406.5, 717.5, -20, 16], unit: [420, 737] },
  LVN: { name: [963.4, 567.4, 0, 16] },
  LVP: { name: [387, 639.5, -60, 11], unit: [379, 600] },
  MAR: { name: [477, 990, 0, 16] },
  MOS: { name: [1296.3, 493.4, -3, 16] },
  MUN: { name: [645.3, 861.2, 0, 16] },
  NAF: { name: [290, 1298, 0, 16] },
  NAP: { name: [749.5, 1142.5, 30, 16] },
  NWY: { name: [663, 411, 0, 16] },
  PAR: { name: [429.5, 857, 0, 16] },
  PIC: { name: [459.5, 806, 0, 16] },
  PIE: { name: [586, 986, 0, 16] },
  POR: { name: [140, 1039, -30, 16] },
  PRU: { name: [829.8, 686.6, -23, 16] },
  ROM: { name: [682, 1085.5, -20, 14] },
  RUH: { name: [579, 808.5, 0, 16] },
  RUM: { name: [1022, 977, 0, 16] },
  SER: { name: [904, 1046, 0, 16] },
  SEV: { name: [1410.9, 781.6, -1, 16] },
  SIL: { name: [735, 769, -5, 16] },
  SKA: { unit: [675, 528] },
  SMY: { name: [1238.3, 1198.1, -11, 16] },
  SPA: { name: [243, 1097, 0, 16] },
  STP: { name: [1150, 300, 0, 16] },
  SWE: { name: [757.2, 463.6, 0, 16] },
  SYR: { name: [1435, 1281, 0, 16] },
  TRI: { name: [780, 1000, 10, 16] },
  TUN: { name: [582, 1290, 0, 16] },
  TUS: { name: [644, 1032, 40, 16], unit: [642, 1060] },
  TYR: { name: [676.5, 919.5, 0, 16] },
  UKR: { name: [1137.1, 777.5, -19, 16] },
  VEN: { name: [657, 1013, 40, 15] },
  VIE: { name: [810, 871.5, 0, 16] },
  WAL: { name: [339, 727.5, 5, 15] },
  WAR: { name: [948, 720, 0, 16] },
  WES: { unit: [424, 1190] },
  YOR: { name: [409.5, 658.5, -60, 14], unit: [419, 686] },
};

const COMPACT_ROWS: Record<string, LayoutRow> = {
  ALB: { name: [884, 1121.5, 60, 13], unit: [871, 1139] },
  ANK: { name: [1259.6, 1085.4, -14, 16] },
  APU: { name: [776, 1132, 25, 16], unit: [740, 1110] },
  ARM: { name: [1437, 1111, 0, 16] },
  BEL: { name: [511, 774.5, 35, 16], unit: [538, 768], star: [516, 760] },
  BER: { name: [700.5, 723.5, 5, 16] },
  BOH: { name: [754.1, 831, 0, 16] },
  BRE: { name: [350, 835, 0, 16] },
  BUD: { name: [915.9, 930.6, 0, 16] },
  BUL: { name: [1007.5, 1056.6, -1, 16] },
  BUR: { name: [488, 917, -20, 16] },
  CLY: { name: [383, 480, -35, 15], unit: [361, 543] },
  CON: { name: [1128.5, 1160.5, -20, 14] },
  DEN: { name: [636, 590, -55, 11], unit: [648, 615], star: [652, 589] },
  EDI: { name: [403, 524, -43, 11.5], unit: [401, 576], star: [396, 505] },
  FIN: { name: [935, 314, 0, 16] },
  GAL: { name: [915, 823, 0, 16] },
  GAS: { name: [375.5, 966.5, 0, 16] },
  GRE: { name: [926.9, 1173.6, 33, 16] },
  HEL: { unit: [577, 623] },
  HOL: { name: [539.5, 720, -20, 15], unit: [544, 740], star: [560, 728] },
  KIE: { name: [623.5, 744.5, 0, 16] },
  LON: { name: [406.5, 717.5, -20, 16], unit: [420, 735], star: [400, 737] },
  LVN: { name: [963.4, 567.4, 0, 16] },
  LVP: { name: [387, 637, -65, 12], unit: [381, 604], star: [393, 654] },
  MAR: { name: [477, 990, 0, 16] },
  MOS: { name: [1296.3, 493.4, -3, 16] },
  MUN: { name: [645.3, 861.2, 0, 16] },
  NAF: { name: [290, 1318, 0, 16] },
  NAP: { name: [749.5, 1142.5, 30, 16] },
  NWY: { name: [663, 411, 0, 16] },
  PAR: { name: [429.5, 859.5, 0, 16] },
  PIC: { name: [459.5, 803.5, 0, 16] },
  PIE: { name: [586, 986, 0, 16] },
  POR: { name: [140, 1039, -30, 16] },
  PRU: { name: [829.8, 686.6, -23, 16] },
  ROM: { name: [692, 1100.5, 30, 16], unit: [695, 1078], star: [683, 1112] },
  RUH: { name: [579, 806, 0, 16] },
  RUM: { name: [1016.7, 982.9, -4, 16] },
  SER: { name: [901.5, 1023.5, 0, 16] },
  SEV: { name: [1410.9, 781.6, -1, 16] },
  SIL: { name: [740, 769, 0, 16] },
  SKA: { unit: [673, 528] },
  SMY: { name: [1238.3, 1198.1, -11, 16] },
  SPA: { name: [243, 1087, 0, 16] },
  STP: { name: [1150, 300, 0, 16] },
  SWE: { name: [757.2, 463.6, 0, 16] },
  SYR: { name: [1435, 1276, 0, 16] },
  TRI: { name: [800, 1005, 0, 16] },
  TUN: { name: [582, 1337.5, 0, 16] },
  TUS: { name: [646.5, 1034.5, 40, 16], unit: [640, 1056] },
  TYR: { name: [681.5, 919.5, 0, 16] },
  UKR: { name: [1137.1, 777.5, -19, 16] },
  VEN: { name: [682, 1035.5, 40, 14] },
  VIE: { name: [810, 871.5, 0, 16] },
  WAL: { name: [339, 727.5, 5, 15] },
  WAR: { name: [928, 700, 0, 16] },
  WES: { unit: [424, 1192] },
  YOR: { name: [409.5, 658.5, -60, 14], unit: [421, 680] },
};

const FLAG_ROWS: Record<string, LayoutRow> = {
  AEG: { flag: -1 },
  ALB: { name: [884, 1121.5, 60, 13], unit: [867, 1137], flag: -1 },
  ANK: { name: [1274, 1098, 0, 16], flag: -1 },
  APU: { name: [771, 1129.5, 25, 16], unit: [768, 1112], flag: -1 },
  ARM: { name: [1448.7, 1104.5, 0, 16] },
  BEL: { name: [511, 774.5, 35, 16], unit: [528, 770], flag: -1 },
  BER: { name: [708, 698.5, 0, 16] },
  BLA: { unit: [1258, 1028] },
  BOH: { name: [731.5, 817, 0, 16] },
  BRE: { name: [325, 825, 10, 16] },
  BUD: { name: [915, 911, 0, 16] },
  BUL: { name: [1024, 1061.5, 0, 16], flag: -1 },
  BUR: { name: [488, 917, -20, 16] },
  CLY: { name: [383, 480, -35, 15], unit: [357, 549], flag: -1 },
  CON: { name: [1128.5, 1140.5, -35, 16] },
  DEN: { name: [636, 590, -55, 11], unit: [648, 615] },
  EDI: { name: [403, 524, -43, 11.5], unit: [399, 585] },
  ENG: { unit: [375, 768], flag: -1 },
  FIN: { name: [944.2, 356.1, -7, 16] },
  GAL: { name: [946, 830.4, 22, 16] },
  GAS: { name: [381.9, 960.8, -14, 16] },
  GRE: { name: [936, 1138, -25, 16] },
  HOL: { name: [554.5, 720, -60, 15], flag: -1 },
  IRI: { unit: [288, 719] },
  KIE: { name: [623.5, 722, 0, 16] },
  LON: { name: [399, 735, 10, 14] },
  LVN: { name: [963.4, 567.4, 0, 16] },
  LVP: { name: [384.5, 629.5, -75, 13], unit: [403, 622] },
  LYO: { unit: [491, 1136] },
  MAO: { unit: [132, 890] },
  MAR: { name: [427, 1005, -40, 15] },
  MOS: { name: [1324, 390, 0, 16] },
  MUN: { name: [645.3, 861.2, 0, 16] },
  NAF: { name: [288.8, 1313.7, 0, 16] },
  NAO: { unit: [157, 466] },
  NAP: { name: [747, 1142.5, 35, 16], unit: [778, 1180] },
  NWY: { name: [647.1, 404.9, -8, 16] },
  PAR: { name: [437, 864.5, 0, 16], flag: -1 },
  PIC: { name: [463.2, 797.9, -2, 16], flag: -1 },
  PIE: { name: [586, 986, 0, 16] },
  POR: { name: [105, 1124, -40, 15] },
  PRU: { name: [829.8, 686.6, -23, 16], flag: -1 },
  ROM: { name: [692, 1100.5, 30, 16], unit: [707, 1092] },
  RUH: { name: [582.2, 798.9, -25, 16] },
  RUM: { name: [972, 1002, 30, 16] },
  SER: { name: [901.5, 1028.5, 0, 16] },
  SEV: { name: [1410.9, 781.6, -1, 16] },
  SIL: { name: [771.8, 766.8, 10, 16] },
  SMY: { name: [1238.3, 1198.1, -11, 16], flag: -1 },
  SPA: { name: [243.4, 1082.1, -4, 16] },
  STP: { name: [1142.9, 365.5, -24, 16] },
  SWE: { name: [759, 362, 0, 16] },
  SYR: { name: [1447.6, 1272.6, 0, 16] },
  TRI: { name: [780, 1005, 15, 16] },
  TUN: { name: [582, 1330, 0, 16] },
  TUS: { name: [646.5, 1037, 40, 16], unit: [642, 1014], flag: -1 },
  TYR: { name: [696.9, 915.6, -1, 16] },
  TYS: { unit: [674, 1223] },
  UKR: { name: [1136, 761, 0, 16] },
  VEN: { name: [657, 1013, 40, 15] },
  VIE: { name: [810, 871.5, 0, 16] },
  WAL: { name: [339, 727.5, 5, 15], flag: -1 },
  WAR: { name: [926.8, 741.3, -2, 16] },
  YOR: { name: [409.5, 658.5, -60, 14], unit: [425, 678] },
};

const NAMEPLATE_ROWS: Record<string, LayoutRow> = {
  ALB: { name: [884, 1121.5, 60, 13] },
  ANK: { name: [1264, 1098, 0, 13] },
  APU: { name: [776, 1132, 30, 13] },
  ARM: { name: [1437, 1101, 0, 13] },
  BEL: { name: [513.5, 759.5, 10, 13] },
  BER: { name: [703, 731, 0, 13] },
  BOH: { name: [746.5, 832, 0, 13] },
  BRE: { name: [350, 835, 0, 13] },
  BUD: { name: [915, 921, 0, 13] },
  BUL: { name: [1011.5, 1066.5, 0, 13] },
  BUR: { name: [478, 932, 0, 13] },
  CLY: { name: [383, 480, -40, 13] },
  CON: { name: [1121, 1153, 0, 13] },
  DEN: { name: [636, 590, -55, 11] },
  EDI: { name: [403, 524, -45, 11] },
  FIN: { name: [935, 304, 0, 13] },
  GAL: { name: [935, 828, 0, 13] },
  GAS: { name: [373, 964, 0, 13] },
  GRE: { name: [926, 1178, 10, 13] },
  HOL: { name: [544.5, 717.5, -35, 13] },
  KIE: { name: [623.5, 717, 0, 13] },
  LON: { name: [409, 717.5, -15, 13] },
  LVN: { name: [954, 568, 0, 13] },
  LVP: { name: [385, 629, -75, 12] },
  MAR: { name: [477, 1000, 0, 13] },
  MOS: { name: [1324, 390, 0, 13] },
  MUN: { name: [640.5, 848, 0, 13] },
  NAF: { name: [290, 1308, 0, 13] },
  NAP: { name: [749.5, 1142.5, 30, 13] },
  NWY: { name: [663, 381, 0, 13] },
  PAR: { name: [429.5, 869.5, 0, 13] },
  PIC: { name: [459.5, 798.5, 0, 13] },
  PIE: { name: [586, 976, 0, 13] },
  POR: { name: [120, 1069, -30, 13] },
  PRU: { name: [822, 683, 0, 13] },
  ROM: { name: [689.5, 1098, 15, 13] },
  RUH: { name: [576.5, 798.5, 0, 13] },
  RUM: { name: [1022, 977, 0, 13] },
  SER: { name: [909, 1056, 0, 13] },
  SEV: { name: [1385, 782, 0, 13] },
  SIL: { name: [760, 769, 0, 13] },
  SMY: { name: [1225, 1201, 0, 13] },
  SPA: { name: [243, 1087, 0, 13] },
  STP: { name: [1140, 290, 0, 13] },
  SWE: { name: [759, 362, 0, 13] },
  SYR: { name: [1435, 1266, 0, 13] },
  TRI: { name: [795, 1010, 0, 13] },
  TUN: { name: [582, 1310, 0, 13] },
  TUS: { name: [646.5, 1034.5, 40, 13] },
  TYR: { name: [696.5, 917, 0, 13] },
  UKR: { name: [1136, 781, 0, 13] },
  VEN: { name: [669.5, 968, -35, 13] },
  VIE: { name: [810, 871.5, 0, 13] },
  WAL: { name: [339, 727.5, 0, 13] },
  WAR: { name: [923, 720, 0, 13] },
  YOR: { name: [402, 673.5, -35, 13] },
};

const ROWS: Record<
  Exclude<PieceStyle, 'classic'>,
  Record<string, LayoutRow>
> = {
  seated: SEATED_ROWS,
  compact: COMPACT_ROWS,
  flags: FLAG_ROWS,
  nameplate: NAMEPLATE_ROWS,
};

const toPoint = ([x, y]: [number, number]): Point => ({ x, y });

function buildLayout(
  rows: Record<string, LayoutRow>,
  unitsOnNames = false,
): MapLayout {
  const layout: MapLayout = {};
  for (const [id, geom] of Object.entries(EUROPE_PROVINCE_GEOMETRY)) {
    const row = rows[id] ?? {};
    const namePoint =
      unitsOnNames && row.name ? { x: row.name[0], y: row.name[1] } : null;
    layout[id] = {
      unit: namePoint ?? (row.unit ? toPoint(row.unit) : geom.unitPos),
      star: row.star ? toPoint(row.star) : geom.scPos,
      name: row.name && {
        x: row.name[0],
        y: row.name[1],
        angle: row.name[2],
        size: row.name[3],
      },
      flagDirection: row.flag ?? 1,
    };
  }
  return layout;
}

const LAYOUTS: Record<PieceStyle, MapLayout> = {
  classic: buildLayout({}),
  seated: buildLayout(ROWS.seated),
  compact: buildLayout(ROWS.compact),
  flags: buildLayout(ROWS.flags),
  // The name is the piece here, so a unit stands exactly where its name does
  nameplate: buildLayout(ROWS.nameplate, true),
};

export function getMapLayout(style: PieceStyle): MapLayout {
  return LAYOUTS[style];
}

const COAST_TAGS = new Set(['NC', 'SC', 'EC']);

/**
 * Sea names and coast tags, which read the same in every style. They come out of
 * `AUTHENTIC_NAMES_SVG` so the classic map and the other styles can't drift apart.
 */
export const SHARED_MAP_NAMES_SVG = [
  ...AUTHENTIC_NAMES_SVG.matchAll(/<text\b[^>]*>.*?<\/text>/gs),
]
  .map(([markup]) => markup)
  .filter((markup) => {
    const text = [...markup.matchAll(/<tspan\b[^>]*>(.*?)<\/tspan>/gs)]
      .map(([, inner]) => inner.replace(/<[^>]+>/g, '').trim())
      .join(' ');
    return (
      COAST_TAGS.has(text) || (text.length > 3 && text === text.toUpperCase())
    );
  })
  .join('');

/** Sea names short enough to fit on a pill in the Name as piece style. */
export const SEA_SHORT_NAMES: Record<string, string> = {
  ADR: 'Adriatic',
  AEG: 'Aegean',
  BAL: 'Baltic',
  BAR: 'Barents',
  BLA: 'Black Sea',
  BOT: 'Bothnia',
  EAS: 'E. Med',
  ENG: 'Channel',
  HEL: 'Helgoland',
  ION: 'Ionian',
  IRI: 'Irish Sea',
  LYO: 'Lyon',
  MAO: 'Mid Atlantic',
  NAO: 'N. Atlantic',
  NTH: 'North Sea',
  NWG: 'Norwegian',
  SKA: 'Skagerrak',
  TYS: 'Tyrrhenian',
  WES: 'W. Med',
};
