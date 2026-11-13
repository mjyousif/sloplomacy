// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetAudioContextForTests,
  playAttentionChime,
  setupAudioUnlock,
  unlockAudio,
} from './soundEffects';

function makeFakeAudioContext(initialState: AudioContextState = 'running') {
  const osc = {
    type: 'sine' as OscillatorType,
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const ctx = {
    state: initialState,
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createOscillator: vi.fn(() => ({ ...osc })),
    createGain: vi.fn(() => ({ ...gain })),
  };
  return ctx;
}

function installFakeAudioContext(
  fakeCtx: ReturnType<typeof makeFakeAudioContext>,
) {
  const ctor = vi.fn();
  class FakeAudioContext {
    state = fakeCtx.state;
    currentTime = fakeCtx.currentTime;
    destination = fakeCtx.destination;
    createOscillator = fakeCtx.createOscillator;
    createGain = fakeCtx.createGain;
    resume = vi.fn(async () => {
      this.state = 'running';
      await fakeCtx.resume();
    });
    constructor() {
      ctor();
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext =
    FakeAudioContext;
  return ctor;
}

describe('soundEffects', () => {
  beforeEach(() => {
    _resetAudioContextForTests();
  });

  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    vi.restoreAllMocks();
  });

  it('no-ops gracefully when AudioContext is unavailable', async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    expect(unlockAudio()).toBe(false);
    expect(await playAttentionChime('turn')).toBe(false);
  });

  it('schedules two tones on AudioContext.currentTime for turn and vote chimes', async () => {
    const fakeCtx = makeFakeAudioContext('running');
    installFakeAudioContext(fakeCtx);

    expect(await playAttentionChime('turn')).toBe(true);
    expect(fakeCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(fakeCtx.createGain).toHaveBeenCalledTimes(2);

    fakeCtx.createOscillator.mockClear();
    expect(await playAttentionChime('vote')).toBe(true);
    expect(fakeCtx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('resumes a suspended AudioContext before playing', async () => {
    const fakeCtx = makeFakeAudioContext('suspended');
    installFakeAudioContext(fakeCtx);

    expect(await playAttentionChime('turn')).toBe(true);
    expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
  });

  it('unlocks AudioContext on first pointerdown gesture', () => {
    const fakeCtx = makeFakeAudioContext('running');
    const ctorSpy = installFakeAudioContext(fakeCtx);

    const cleanup = setupAudioUnlock();
    window.dispatchEvent(new Event('pointerdown'));
    expect(ctorSpy).toHaveBeenCalledTimes(1);
    cleanup();
  });
});
