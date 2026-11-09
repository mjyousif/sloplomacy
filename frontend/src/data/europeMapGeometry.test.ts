import { describe, expect, it } from 'vitest';
import { POWER_METADATA } from '../types/diplomacy';
import {
  AUTHENTIC_BACKGROUND_SVG,
  AUTHENTIC_FOREGROUND_SVG,
  AUTHENTIC_NAMES_SVG,
  EUROPE_PROVINCE_GEOMETRY,
} from './europeMapGeometry';

describe('Map Cartography & Aesthetics (Issues #42-#48)', () => {
  it('defines England with darker navy blue matching Wales (#46)', () => {
    const england = POWER_METADATA.ENGLAND;
    expect(england.color).toBe('#183668');
    expect(england.fillColor).toBe('#1e3e73');
    expect(england.borderColor).toBe('#0e2244');
    expect(england.lightBg).toContain('rgba(24, 54, 104');
  });

  it('defines Russia with authentic deep imperial purple matching Moscow badge (#45)', () => {
    const russia = POWER_METADATA.RUSSIA;
    expect(russia.color).toBe('#67387e');
    expect(russia.fillColor).toBe('#754e85');
    expect(russia.borderColor).toBe('#431d56');
    expect(russia.lightBg).toContain('rgba(103, 56, 126');
  });

  it('removes wave overlay lines from ocean sections to eliminate UI artifacts (#47)', () => {
    expect(AUTHENTIC_BACKGROUND_SVG).not.toContain('id="water-wave-texture"');
  });

  it('removes the water pond cutout between Finland and St. Petersburg and fills it with purple (#48)', () => {
    expect(AUTHENTIC_BACKGROUND_SVG).not.toContain('m 654.27195,-72.10929');
    expect(EUROPE_PROVINCE_GEOMETRY.STP.path).toContain('M 1013.88,376.35');
  });

  it('scales down water location font sizes by 20% (#43)', () => {
    const maxSeaSize = Math.max(
      ...seaLabels.map((l) => parseFloat(l.size || '0')),
    );
    expect(maxSeaSize).toBe(16); // reduced from 20px
    const standardSeaLabels = seaLabels.filter((l) => l.size === '12.8px');
    expect(standardSeaLabels.length).toBeGreaterThanOrEqual(10); // reduced from 16px
  });

  it('centers the Helgoland Bight text within the dashed boundary lines (#42, #71)', () => {
    expect(AUTHENTIC_NAMES_SVG).toContain(
      'transform="translate(-18 8) rotate(-8)" id="Helgoland-Bight"',
    );
  });

  it('moves Skagerrak text away from the dashed boundary (#70)', () => {
    expect(AUTHENTIC_NAMES_SVG).toContain(
      'transform="translate(6 0) rotate(-13)" id="SKA"',
    );
  });

  it('keeps Belgium star decoupled from the Belgium text label (#74)', () => {
    expect(EUROPE_PROVINCE_GEOMETRY.BEL.scPos).toEqual({ x: 515.0, y: 754.0 });
    expect(AUTHENTIC_NAMES_SVG).toContain(
      '<tspan id="tspan48" y="392.0" x="798.0">Belgium</tspan>',
    );
  });
});

interface MapLabel {
  id: string;
  text: string;
  size: string | undefined;
  fonts: string[];
}

const styleValue = (style: string, property: string) =>
  style.match(new RegExp(`(?:^|;)${property}:([^;]+)`))?.[1]?.trim();

const fontOf = (markup: string) => {
  const style = markup.match(/style="([^"]*)"/)?.[1] ?? '';
  return ['font-family', 'font-weight', 'font-style']
    .map((property) => styleValue(style, property) ?? 'inherit')
    .join(' | ');
};

const labels: MapLabel[] = [
  ...AUTHENTIC_NAMES_SVG.matchAll(/<text\b([^>]*)>(.*?)<\/text>/gs),
].map(([, attributes, inner]) => {
  const spans = [...inner.matchAll(/<tspan\b([^>]*)>(.*?)<\/tspan>/gs)];
  return {
    id: attributes.match(/\bid="([^"]*)"/)?.[1] ?? '',
    text: spans
      .map(([, , content]) => content.replace(/<[^>]+>/g, '').trim())
      .join(' '),
    size: styleValue(
      attributes.match(/style="([^"]*)"/)?.[1] ?? '',
      'font-size',
    ),
    fonts: [
      fontOf(attributes),
      ...spans.map(([, spanAttributes]) => fontOf(spanAttributes)),
    ],
  };
});

// Sea names are the only all-caps labels longer than a coast tag such as "NC".
const isSea = (label: MapLabel) =>
  label.text.length > 3 && label.text === label.text.toUpperCase();
const landLabels = labels.filter((label) => !isSea(label));
const seaLabels = labels.filter(isSea);

describe('map label typography', () => {
  it('finds every label', () => {
    expect(labels).toHaveLength(81);
    expect(seaLabels).toHaveLength(19);
  });

  it('uses one font for every land label', () => {
    const fonts = new Set(
      landLabels
        .flatMap((label) => label.fonts)
        .filter((font) => font !== 'inherit | inherit | inherit'),
    );
    expect([...fonts]).toHaveLength(1);
  });

  it('shows every land label in bold, so provinces with a star always are', () => {
    const fonts = landLabels.flatMap((label) => label.fonts);
    expect(fonts.filter((font) => font.includes('700')).length).toBe(
      landLabels.length,
    );
  });

  it('uses one font for every sea label', () => {
    const fonts = new Set(
      seaLabels
        .flatMap((label) => label.fonts)
        .filter((font) => font !== 'inherit | inherit | inherit'),
    );
    expect([...fonts]).toHaveLength(1);
  });

  it('keeps all land names at the standard 16px size (#85)', () => {
    const provinceNames = landLabels.filter((label) => label.text.length > 3);
    const unusual = provinceNames
      .filter((label) => label.size !== '16px')
      .map((label) => label.text);
    expect(unusual).toEqual([]);
  });

  it('labels Liverpool by name alone at standard size (#85)', () => {
    const names = labels.map((label) => label.text);
    expect(names).toContain('Liverpool');
    expect(names).not.toContain('LVP');
  });

  it('spells out North Africa', () => {
    const names = labels.map((label) => label.text);
    expect(names).toContain('North Africa');
    expect(names).not.toContain('N. Africa');
  });

  it('labels Livonia by name alone', () => {
    const names = labels.map((label) => label.text);
    expect(names).toContain('Livonia');
    expect(names).not.toContain('LVN');
  });
});

describe('Helgoland Bight border', () => {
  it('starts the dashed line and both sea areas from the same point on the coast', () => {
    const dashed = AUTHENTIC_FOREGROUND_SVG.match(
      /id="Path-38"[^>]*?\bd="M ([\d.]+),([\d.]+)/,
    );
    const dashedAlt = AUTHENTIC_FOREGROUND_SVG.match(
      /\bd="M ([\d.]+),([\d.]+)[^"]*"[^>]*id="Path-38"/,
    );
    const [, x, y] = (dashed ?? dashedAlt) as RegExpMatchArray;
    const point = `${Number(x).toFixed(3)} ${Number(y).toFixed(3)}`;

    expect(EUROPE_PROVINCE_GEOMETRY.HEL.path.startsWith(`M ${point} C`)).toBe(
      true,
    );
    expect(EUROPE_PROVINCE_GEOMETRY.NTH.path).toContain(point);
  });
});
