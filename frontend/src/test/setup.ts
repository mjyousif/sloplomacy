/**
 * Runs before every test file. Tests stay in node unless a file starts with
 * `// @vitest-environment jsdom`, which is how hook and component tests get a DOM.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest globals are off, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup();
});
