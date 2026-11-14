// The project has no @types/node, and the stylesheet guard (styles/cssGuard.test.ts) is the one
// test that reads files from disk. These declare only what it calls.
declare module 'node:fs' {
  interface DirEntry {
    name: string;
    isDirectory(): boolean;
  }
  export function readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): DirEntry[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}
