import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_DISCONNECT_MS,
  buildAuthMessage,
  getReconnectDelayMs,
  getWebSocketUrl,
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  resolveWebSocketPath,
  shouldReconnect,
} from './useDiplomacyWebSocket';

describe('useDiplomacyWebSocket helpers', () => {
  describe('BACKGROUND_DISCONNECT_MS', () => {
    it('is configured for 5 minutes of background inactivity before disconnect', () => {
      expect(BACKGROUND_DISCONNECT_MS).toBe(5 * 60 * 1000);
    });
  });
  describe('resolveWebSocketPath', () => {
    it('returns /ws/lobby when viewMode is lobby', () => {
      expect(resolveWebSocketPath('lobby', 'proto_1901')).toBe('/ws/lobby');
      expect(resolveWebSocketPath('lobby', null)).toBe('/ws/lobby');
    });

    it('returns /ws/games/{id} when viewMode is multiplayer', () => {
      expect(resolveWebSocketPath('multiplayer', 'match_104')).toBe(
        '/ws/games/match_104?handshake=1',
      );
    });

    it('returns null when viewMode is sandbox', () => {
      expect(resolveWebSocketPath('sandbox', 'proto_1901')).toBeNull();
      expect(resolveWebSocketPath('sandbox', 'solo_1234')).toBeNull();
    });

    it('returns null when activeGameId is null in match modes', () => {
      expect(resolveWebSocketPath('multiplayer', null)).toBeNull();
      expect(resolveWebSocketPath('sandbox', null)).toBeNull();
    });

    it('asks for the auth handshake and carries no token or passcode in the URL', () => {
      expect(resolveWebSocketPath('multiplayer', 'g1', 'FRANCE')).toBe(
        '/ws/games/g1?handshake=1&power=FRANCE',
      );
    });

    it('properly URI encodes complex game IDs', () => {
      expect(resolveWebSocketPath('multiplayer', 'game/room#1')).toBe(
        '/ws/games/game%2Froom%231?handshake=1',
      );
    });
  });

  describe('buildAuthMessage', () => {
    it('sends the token and the passcode in the first message', () => {
      expect(JSON.parse(buildAuthMessage('tok', 'pw'))).toEqual({
        type: 'auth',
        token: 'tok',
        passcode: 'pw',
      });
    });

    it('sends a passcode for a signed-out spectator and none when there is none', () => {
      expect(JSON.parse(buildAuthMessage(null, 'pw'))).toEqual({
        type: 'auth',
        token: null,
        passcode: 'pw',
      });
      expect(JSON.parse(buildAuthMessage('tok'))).toEqual({
        type: 'auth',
        token: 'tok',
      });
    });
  });

  describe('getWebSocketUrl', () => {
    it('formats a ws or wss url corresponding to host and path', () => {
      const url = getWebSocketUrl('/ws/lobby');
      expect(url).toMatch(/^wss?:\/\/.*\/ws\/lobby$/);
    });
  });

  describe('shouldReconnect', () => {
    it('retries dropped connections and servers that ask to try again', () => {
      expect(shouldReconnect(1006)).toBe(true);
      expect(shouldReconnect(1013)).toBe(true);
    });

    it('stops on a normal close, a deleted game or a refused passcode', () => {
      expect(shouldReconnect(1000)).toBe(false);
      expect(shouldReconnect(4004)).toBe(false);
      expect(shouldReconnect(4403)).toBe(false);
    });
  });

  describe('getReconnectDelayMs', () => {
    it('exports expected base and max backoff constants', () => {
      expect(RECONNECT_BASE_DELAY_MS).toBe(1000);
      expect(RECONNECT_MAX_DELAY_MS).toBe(30_000);
    });

    it('grows exponentially with equal jitter bounds across attempts', () => {
      expect(
        [0, 1, 2, 3, 4].map((a) => getReconnectDelayMs(a, () => 0)),
      ).toEqual([500, 1000, 2000, 4000, 8000]);
      expect(
        [0, 1, 2, 3, 4].map((a) => getReconnectDelayMs(a, () => 1)),
      ).toEqual([1000, 2000, 4000, 8000, 16000]);
      expect([0, 1, 2].map((a) => getReconnectDelayMs(a, () => 0.5))).toEqual([
        750, 1500, 3000,
      ]);
    });

    it('caps delay at RECONNECT_MAX_DELAY_MS for high attempt counts', () => {
      expect(getReconnectDelayMs(5, () => 0)).toBe(15_000);
      expect(getReconnectDelayMs(5, () => 1)).toBe(30_000);
      expect(getReconnectDelayMs(10, () => 0)).toBe(15_000);
      expect(getReconnectDelayMs(10, () => 1)).toBe(30_000);
      expect(getReconnectDelayMs(1000, () => 1)).toBe(30_000);
    });

    it('clamps negative/fractional attempts and out-of-range random values', () => {
      expect(getReconnectDelayMs(-3, () => 0)).toBe(500);
      expect(getReconnectDelayMs(1.9, () => 1)).toBe(2000);
      expect(getReconnectDelayMs(0, () => -0.5)).toBe(500);
      expect(getReconnectDelayMs(0, () => 1.5)).toBe(1000);
    });
  });
});
