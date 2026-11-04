import { describe, expect, it } from 'vitest';
import { getWebSocketUrl, resolveWebSocketPath } from './useDiplomacyWebSocket';

describe('useDiplomacyWebSocket helpers', () => {
  describe('resolveWebSocketPath', () => {
    it('returns /ws/lobby when viewMode is lobby', () => {
      expect(resolveWebSocketPath('lobby', 'proto_1901')).toBe('/ws/lobby');
      expect(resolveWebSocketPath('lobby', null)).toBe('/ws/lobby');
    });

    it('returns /ws/games/{id} when viewMode is multiplayer', () => {
      expect(resolveWebSocketPath('multiplayer', 'match_104')).toBe('/ws/games/match_104');
    });

    it('returns /ws/games/{id} when viewMode is sandbox', () => {
      expect(resolveWebSocketPath('sandbox', 'proto_1901')).toBe('/ws/games/proto_1901');
    });

    it('returns null when activeGameId is null in match modes', () => {
      expect(resolveWebSocketPath('multiplayer', null)).toBeNull();
      expect(resolveWebSocketPath('sandbox', null)).toBeNull();
    });

    it('properly URI encodes complex game IDs', () => {
      expect(resolveWebSocketPath('multiplayer', 'game/room#1')).toBe(
        '/ws/games/game%2Froom%231'
      );
    });
  });

  describe('getWebSocketUrl', () => {
    it('formats a ws or wss url corresponding to host and path', () => {
      const url = getWebSocketUrl('/ws/lobby');
      expect(url).toMatch(/^wss?:\/\/.*\/ws\/lobby$/);
    });
  });
});
