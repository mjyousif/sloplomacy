import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(stylesDir, '..');

/** The absolute path of every `.css` file under `dir`. */
function findSheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findSheets(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

/** Every stylesheet's text, by path relative to styles/ (a sheet of styles/ starts with "./"). */
const sheets: Record<string, string> = Object.fromEntries(
  findSheets(srcDir).map((file) => {
    const rel = relative(stylesDir, file).split('\\').join('/');
    return [rel.startsWith('.') ? rel : `./${rel}`, readFileSync(file, 'utf8')];
  }),
);
const indexSource = sheets['./index.css'];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The text before each top-level `{` and each top-level `;`, so rules and at-rules can be told apart. */
function topLevelStatements(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  const text = stripComments(css);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) out.push(text.slice(start, i).trim());
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) start = i + 1;
    } else if (ch === ';' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  // A brace inside a string would unbalance this, and hide the rules after it.
  if (depth !== 0) throw new Error('Unbalanced braces in a stylesheet');
  return out.filter(Boolean);
}

const paths = Object.keys(sheets).sort();
const isModule = (path: string) => path.endsWith('.module.css');
const isStyles = (path: string) => /^\.\/[^/]+\.css$/.test(path);
const LAYERS = ['components', 'compact'];

describe('stylesheets', () => {
  it('finds the stylesheets', () => {
    expect(paths.length).toBeGreaterThan(20);
  });

  it('keeps every stylesheet in styles/ or beside its component as a *.module.css', () => {
    // Paths here are relative to styles/, so a sheet in styles/ starts with "./".
    const stray = paths.filter((path) => !isModule(path) && !isStyles(path));
    expect(stray).toEqual([]);
  });

  it('puts every rule of a CSS module inside the components or compact layer', () => {
    // Unlayered rules beat every layer, and an unknown layer name creates a new layer that ranks
    // after compact, so either would outrank the phone layout.
    const unlayered = paths.filter(isModule).flatMap((path) =>
      topLevelStatements(sheets[path])
        .filter(
          (statement) =>
            !LAYERS.some((layer) => statement === `@layer ${layer}`),
        )
        .map((statement) => `${path}: ${statement}`),
    );
    expect(unlayered).toEqual([]);
  });

  it('imports every sheet of styles/ into the base layer from index.css', () => {
    const imports = [
      ...stripComments(indexSource).matchAll(
        /@import\s+["']([^"']+)["']\s+layer\(([^)]+)\)/g,
      ),
    ];
    const expected = paths.filter(
      (path) => isStyles(path) && path !== './index.css',
    );
    expect(imports.map((m) => m[1]).sort()).toEqual(expected.sort());
    expect(imports.filter((m) => m[2].trim() !== 'base')).toEqual([]);
  });

  it('declares the layers in index.css, and nothing else but imports', () => {
    const statements = topLevelStatements(indexSource);
    expect(statements[0]).toBe('@layer base, components, compact');
    expect(statements.slice(1).every((s) => s.startsWith('@import'))).toBe(
      true,
    );
  });
});
