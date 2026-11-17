import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = dirname(fileURLToPath(import.meta.url));

/** The extensions an extensionless import (`./Foo`) can resolve to. */
const MODULE_EXT = /\.(?:[cm]?[jt]sx?)$/;

/** Every module file under `dir`, by path relative to src/. */
function findModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findModules(full);
    return MODULE_EXT.test(entry.name)
      ? [relative(srcDir, full).split('\\').join('/')]
      : [];
  });
}

describe('module file names', () => {
  // macOS and Windows ignore case, so `import './ImpassableLand'` can open
  // `impassableLand.ts` there while Linux (and CI) opens `ImpassableLand.tsx`.
  it('never has two modules in one folder whose names differ only in case', () => {
    const byKey = new Map<string, Set<string>>();
    for (const file of findModules(srcDir)) {
      const stem = file.replace(MODULE_EXT, '');
      const key = stem.toLowerCase();
      byKey.set(key, (byKey.get(key) ?? new Set()).add(stem));
    }
    const clashes = [...byKey.values()]
      .filter((stems) => stems.size > 1)
      .map((stems) => [...stems].sort().join(' vs '));
    expect(clashes).toEqual([]);
  });
});
