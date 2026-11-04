import { describe, expect, it } from 'vitest';
import {
  AUTHENTIC_FOREGROUND_SVG,
  AUTHENTIC_NAMES_SVG,
  EUROPE_PROVINCE_GEOMETRY,
} from './europeMapGeometry';

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

const labels: MapLabel[] = [...AUTHENTIC_NAMES_SVG.matchAll(/<text\b([^>]*)>(.*?)<\/text>/gs)].map(
  ([, attributes, inner]) => {
    const spans = [...inner.matchAll(/<tspan\b([^>]*)>(.*?)<\/tspan>/gs)];
    return {
      id: attributes.match(/\bid="([^"]*)"/)?.[1] ?? '',
      text: spans.map(([, , content]) => content.replace(/<[^>]+>/g, '').trim()).join(' '),
      size: styleValue(attributes.match(/style="([^"]*)"/)?.[1] ?? '', 'font-size'),
      fonts: [fontOf(attributes), ...spans.map(([, spanAttributes]) => fontOf(spanAttributes))],
    };
  }
);

// Sea names are the only all-caps labels longer than a coast tag such as "NC".
const isSea = (label: MapLabel) => label.text.length > 3 && label.text === label.text.toUpperCase();
const landLabels = labels.filter((label) => !isSea(label));
const seaLabels = labels.filter(isSea);

describe('map label typography', () => {
  it('finds every label', () => {
    expect(labels).toHaveLength(82);
    expect(seaLabels).toHaveLength(19);
  });

  it('uses one font for every land label', () => {
    const fonts = new Set(
      landLabels.flatMap((label) => label.fonts).filter((font) => font !== 'inherit | inherit | inherit')
    );
    expect([...fonts]).toHaveLength(1);
  });

  it('shows every land label in bold, so provinces with a star always are', () => {
    const fonts = landLabels.flatMap((label) => label.fonts);
    expect(fonts.filter((font) => font.includes('700')).length).toBe(landLabels.length);
  });

  it('uses one font for every sea label', () => {
    const fonts = new Set(
      seaLabels.flatMap((label) => label.fonts).filter((font) => font !== 'inherit | inherit | inherit')
    );
    expect([...fonts]).toHaveLength(1);
  });

  it('keeps land names at the standard size, apart from the one under an abbreviation', () => {
    const provinceNames = landLabels.filter((label) => label.text.length > 3);
    const unusual = provinceNames.filter((label) => label.size !== '16px').map((label) => label.text);
    expect(unusual).toEqual(['Liverpool']);
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
    const dashed = AUTHENTIC_FOREGROUND_SVG.match(/id="Path-38"[^>]*?\bd="M ([\d.]+),([\d.]+)/);
    const dashedAlt = AUTHENTIC_FOREGROUND_SVG.match(/\bd="M ([\d.]+),([\d.]+)[^"]*"[^>]*id="Path-38"/);
    const [, x, y] = (dashed ?? dashedAlt) as RegExpMatchArray;
    const point = `${Number(x).toFixed(3)} ${Number(y).toFixed(3)}`;

    expect(EUROPE_PROVINCE_GEOMETRY.HEL.path.startsWith(`M ${point} C`)).toBe(true);
    expect(EUROPE_PROVINCE_GEOMETRY.NTH.path).toContain(point);
  });
});
