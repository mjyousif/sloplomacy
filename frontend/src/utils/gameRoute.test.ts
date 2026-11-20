import { describe, expect, it } from 'vitest';
import { isLinkableGameId, parseGameRoute, urlFor } from './gameRoute';

const at = (pathname: string, search = '', hash = '') => ({
  pathname,
  search,
  hash,
});

describe('parseGameRoute', () => {
  it('reads a match link, with or without a trailing slash', () => {
    expect(parseGameRoute(at('/game/mp_a1b2c3'))).toEqual({
      kind: 'game',
      gameId: 'mp_a1b2c3',
    });
    expect(parseGameRoute(at('/game/mp_a1b2c3/'))).toEqual({
      kind: 'game',
      gameId: 'mp_a1b2c3',
    });
  });

  it.each(['solo_123', 'saved_123', 'sbx_123', 'proto_1901'])(
    'treats a link to %s as the lobby',
    (id) => {
      expect(parseGameRoute(at(`/game/${id}`))).toEqual({ kind: 'lobby' });
      expect(isLinkableGameId(id)).toBe(false);
    },
  );

  it('refuses ids with other characters and deeper paths', () => {
    expect(parseGameRoute(at('/game/mp_a-b'))).toEqual({ kind: 'lobby' });
    expect(parseGameRoute(at('/game/mp_a/extra'))).toEqual({ kind: 'lobby' });
    expect(parseGameRoute(at('/game/'))).toEqual({ kind: 'lobby' });
    expect(parseGameRoute(at('/'))).toEqual({ kind: 'lobby' });
  });

  it('keeps ?view=sandbox and #sandbox', () => {
    expect(parseGameRoute(at('/', '?view=sandbox'))).toEqual({
      kind: 'sandbox',
    });
    expect(parseGameRoute(at('/', '', '#sandbox'))).toEqual({
      kind: 'sandbox',
    });
  });
});

describe('urlFor', () => {
  const lobby = { kind: 'lobby' } as const;
  it('puts a match at its link and the lobby at /', () => {
    expect(urlFor('multiplayer', 'mp_1', lobby)).toBe('/game/mp_1');
    expect(urlFor('lobby', 'mp_1', lobby)).toBe('/');
  });

  it('leaves a sandbox opened by ?view=sandbox where it is', () => {
    expect(urlFor('sandbox', 'solo_1', { kind: 'sandbox' })).toBeNull();
    expect(urlFor('sandbox', 'solo_1', { kind: 'game', gameId: 'mp_1' })).toBe(
      '/',
    );
  });
});
