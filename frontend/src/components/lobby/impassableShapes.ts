import { AUTHENTIC_FOREGROUND_SVG } from '../../data/europeMapGeometry';

/** One piece of land nobody can enter, as the board's foreground layer draws it. */
export interface ImpassableShape {
  id: string;
  kind: 'path' | 'polygon';
  /** The `d` of a path or the `points` of a polygon. */
  geometry: string;
  transform?: string;
}

// The board fills Iceland, Ireland, Switzerland, Cyprus and a few small islands with
// `url(#impassableStripes)`. None of them is a province, so they are read from that layer, where
// the rest of the board's geometry has them.
const IMPASSABLE_TAG =
  /<(path|polygon)\b[^>]*fill:url\(#impassableStripes\)[^>]*>/g;

const attribute = (tag: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

export const IMPASSABLE_LAND: ImpassableShape[] = Array.from(
  AUTHENTIC_FOREGROUND_SVG.matchAll(IMPASSABLE_TAG),
).flatMap(([tag, kind]) => {
  const id = attribute(tag, 'id');
  const geometry = attribute(tag, kind === 'path' ? 'd' : 'points');
  if (!id || !geometry) return [];
  return [
    {
      id,
      kind: kind as ImpassableShape['kind'],
      geometry,
      transform: attribute(tag, 'transform'),
    },
  ];
});
