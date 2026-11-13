import { describe, expect, it } from 'vitest';
import mainSource from '../main.tsx?raw';

describe('stylesheet layer order', () => {
  it('has styles/index.css as the first import in main.tsx', () => {
    // styles/index.css declares `@layer base, components, compact;`. Vite orders CSS by first
    // import and its minifier drops that line once the blocks already come in order, so a CSS
    // module imported before it would fix the layer order by itself (compact, components, base
    // in a probe), with no error. See docs/frontend/styling-and-themes.md#stylesheet-layers.
    const imports = mainSource
      .split('\n')
      .filter((line: string) => line.startsWith('import '));
    expect(imports[0]).toBe("import './styles/index.css';");
  });
});
