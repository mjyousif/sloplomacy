import { memo } from 'react';
import {
  AUTHENTIC_BACKGROUND_SVG,
  AUTHENTIC_DEFS_SVG,
  AUTHENTIC_FOREGROUND_SVG,
  AUTHENTIC_NAMES_SVG,
} from '../../../data/europeMapGeometry';

export const StaticBackgroundLayer = memo(() => (
  <g
    className="authentic-background-layer"
    pointerEvents="none"
    dangerouslySetInnerHTML={{ __html: AUTHENTIC_BACKGROUND_SVG }}
  />
));

export const StaticForegroundLayer = memo(() => (
  <g
    className="authentic-foreground-layer"
    pointerEvents="none"
    dangerouslySetInnerHTML={{ __html: AUTHENTIC_FOREGROUND_SVG }}
  />
));

export const StaticNamesLayer = memo(() => (
  <g
    className="authentic-names-layer"
    pointerEvents="none"
    dangerouslySetInnerHTML={{ __html: AUTHENTIC_NAMES_SVG }}
  />
));

export const StaticDefsLayer = memo(() => (
  <g dangerouslySetInnerHTML={{ __html: AUTHENTIC_DEFS_SVG }} />
));
