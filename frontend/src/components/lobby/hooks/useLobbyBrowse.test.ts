// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BROWSE_FILTERS } from '../../../utils/lobbyBrowse';
import {
  browseFetch,
  browsePage,
  browseRow,
  lastBrowseQuery,
} from '../lobby.testkit';
import { useLobbyBrowse } from './useLobbyBrowse';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = browseFetch(() => browsePage([browseRow()], 23));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useLobbyBrowse', () => {
  it('loads the first page of open games from the browse endpoint', async () => {
    const { result } = renderHook(() => useLobbyBrowse(1));
    await waitFor(() => expect(result.current.result?.total).toBe(23));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^\/api\/games\/browse\?/,
    );
    expect(lastBrowseQuery(fetchMock).get('seats')).toBe('open');
    expect(lastBrowseQuery(fetchMock).get('page')).toBe('1');
    expect(result.current.loading).toBe(false);
  });

  it('asks for another page, and a filter change goes back to page 1', async () => {
    const { result } = renderHook(() => useLobbyBrowse(1));
    await waitFor(() => expect(result.current.result).not.toBeNull());
    act(() => result.current.setPage(3));
    await waitFor(() =>
      expect(lastBrowseQuery(fetchMock).get('page')).toBe('3'),
    );
    act(() =>
      result.current.setFilters({ ...DEFAULT_BROWSE_FILTERS, seats: 'all' }),
    );
    await waitFor(() =>
      expect(lastBrowseQuery(fetchMock).get('seats')).toBe('all'),
    );
    expect(lastBrowseQuery(fetchMock).get('page')).toBe('1');
    expect(result.current.page).toBe(1);
  });

  it('reloads the open page when the refresh signal changes', async () => {
    const { result, rerender } = renderHook(
      ({ signal }) => useLobbyBrowse(signal),
      { initialProps: { signal: 1 as unknown } },
    );
    await waitFor(() => expect(result.current.result).not.toBeNull());
    act(() => result.current.setPage(2));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    rerender({ signal: 2 });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(lastBrowseQuery(fetchMock).get('page')).toBe('2');
    // The same signal again asks for nothing.
    rerender({ signal: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports a failed request and clears it on the next good one', async () => {
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    const { result, rerender } = renderHook(
      ({ signal }) => useLobbyBrowse(signal),
      { initialProps: { signal: 1 as unknown } },
    );
    await waitFor(() =>
      expect(result.current.error).toBe('Backend returned 503'),
    );
    expect(result.current.loading).toBe(false);
    rerender({ signal: 2 });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.result?.total).toBe(23);
  });

  it('steps back to the last page when the open one emptied', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const page = Number(new URLSearchParams(url.split('?')[1]).get('page'));
      return {
        ok: true,
        json: async () =>
          page === 4
            ? browsePage([], 12, 4)
            : browsePage([browseRow()], 12, page),
      };
    });
    const { result } = renderHook(() => useLobbyBrowse(1));
    await waitFor(() => expect(result.current.result).not.toBeNull());
    act(() => result.current.setPage(4));
    await waitFor(() => expect(result.current.page).toBe(2));
    await waitFor(() => expect(result.current.result?.page).toBe(2));
  });

  it('ignores an older reply that lands after a newer one', async () => {
    let releaseFirst: () => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = () =>
            resolve({
              ok: true,
              json: async () => browsePage([browseRow({ name: 'Stale' })], 1),
            });
        }),
    );
    const { result, rerender } = renderHook(
      ({ signal }) => useLobbyBrowse(signal),
      { initialProps: { signal: 1 as unknown } },
    );
    rerender({ signal: 2 });
    await waitFor(() => expect(result.current.result?.total).toBe(23));
    await act(async () => releaseFirst());
    expect(result.current.result?.games[0].name).toBe('Friday Night');
  });
});
