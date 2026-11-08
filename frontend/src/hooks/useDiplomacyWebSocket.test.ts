import { describe, expect, it } from 'vitest';
import { getWebSocketUrl, resolveWebSocketPath, shouldReconnect } from './useDiplomacyWebSocket';

describe('useDiplomacyWebSocket helpers', () => {
  describe('resolveWebSocketPath', () => {
    it('returns /ws/lobby when viewMode is lobby', () => {
      expect(resolveWebSocketPath('lobby', 'proto_1901')).toBe('/ws/lobby');
      expect(resolveWebSocketPath('lobby', null)).toBe('/ws/lobby');
    });

    it('returns /ws/games/{id} when viewMode is multiplayer', () => {
      expect(resolveWebSocketPath('multiplayer', 'match_104')).toBe('/ws/games/match_104?handshake=1');
    });

    it('returns /ws/games/{id} when viewMode is sandbox', () => {
      expect(resolveWebSocketPath('sandbox', 'proto_1901')).toBe('/ws/games/proto_1901?handshake=1');
    });

    it('returns null when activeGameId is null in match modes', () => {
      expect(resolveWebSocketPath('multiplayer', null)).toBeNull();
      expect(resolveWebSocketPath('sandbox', null)).toBeNull();
    });

    it('asks for the auth handshake and never carries a token in the URL', () => {
      expect(resolveWebSocketPath('multiplayer', 'g1', 'FRANCE', 'pw')).toBe(
        '/ws/games/g1?handshake=1&power=FRANCE&passcode=pw'
      );
    });

    it('properly URI encodes complex game IDs', () => {
      expect(resolveWebSocketPath('multiplayer', 'game/room#1')).toBe(
        '/ws/games/game%2Froom%231?handshake=1'
      );
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
});
