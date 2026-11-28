import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = dirname(fileURLToPath(import.meta.url));
const MAX_LINES = 500;
// Static data with no logic (AGENTS.md section 5.2).
const ALLOWLIST = new Set([
  'data/europeMapGeometry.ts',
  'data/openings.ts',
  'types/diplomacy.ts',
]);

function isTestFile(relPath: string): boolean {
  return relPath.startsWith('test/') || /\.(test|testkit)\.tsx?$/.test(relPath);
}

/** Relative paths (POSIX) of all production `.ts`/`.tsx` files under `frontend/src/`. */
function findProductionSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findProductionSources(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    const rel = relative(srcDir, full).split('\\').join('/');
    return isTestFile(rel) ? [] : [rel];
  });
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.replace(/\r?\n$/, '').split(/\r?\n/).length;
}

describe('frontend modularity ceiling', () => {
  const files = findProductionSources(srcDir).sort();

  it('finds production source files and verifies the allowlist entries exist', () => {
    expect(files.length).toBeGreaterThan(20);
    for (const allowed of ALLOWLIST) {
      expect(files).toContain(allowed);
    }
  });

  it(`keeps every non-allowlisted production file at or below ${MAX_LINES} lines`, () => {
    const violations = files
      .filter((rel) => !ALLOWLIST.has(rel))
      .map((rel) => ({
        rel,
        lines: countLines(readFileSync(join(srcDir, rel), 'utf8')),
      }))
      .filter((entry) => entry.lines > MAX_LINES)
      .map(
        (entry) => `${entry.rel}: ${entry.lines} lines (ceiling: ${MAX_LINES})`,
      );

    expect(violations).toEqual([]);
  });
});
