// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readStoredSoloSandboxId,
  SOLO_SANDBOX_STORAGE_KEY,
  writeStoredSoloSandboxId,
} from './soloSandboxStorage';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readStoredSoloSandboxId', () => {
  it('uses the key the app has always used', () => {
    expect(SOLO_SANDBOX_STORAGE_KEY).toBe('sloplomacy_solo_sandbox_id');
  });

  it('is null when nothing is stored', () => {
    expect(readStoredSoloSandboxId()).toBeNull();
  });

  it('reads a solo sandbox id, trimmed', () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, '  solo_ab12  ');
    expect(readStoredSoloSandboxId()).toBe('solo_ab12');
  });

  it('ignores anything that is not a solo sandbox', () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'mp_ab12');
    expect(readStoredSoloSandboxId()).toBeNull();
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'xsolo_ab12');
    expect(readStoredSoloSandboxId()).toBeNull();
  });

  it('is null when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredSoloSandboxId()).toBeNull();
  });
});

describe('writeStoredSoloSandboxId', () => {
  it('remembers a solo sandbox id', () => {
    writeStoredSoloSandboxId('solo_ab12');
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBe('solo_ab12');
  });

  it('forgets on null or any other id', () => {
    writeStoredSoloSandboxId('solo_ab12');
    writeStoredSoloSandboxId('saved_ab12');
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBeNull();
    writeStoredSoloSandboxId('solo_cd34');
    writeStoredSoloSandboxId(null);
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBeNull();
  });

  it('does not throw when storage is full or blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeStoredSoloSandboxId('solo_ab12')).not.toThrow();
  });
});
