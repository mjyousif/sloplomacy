import { useMemo, useRef, useState } from 'react';
import { getAuthHeaders } from '../lib/supabase';
import type {
  GameState,
  MultiplayerGameSummary,
  Power,
  ProvinceInfo,
  SimulationResult,
} from '../types/diplomacy';
import { resolvePlayerPower } from '../utils/adminHelpers';
import {
  readStoredSoloSandboxId,
  writeStoredSoloSandboxId,
} from '../utils/soloSandboxStorage';

const API_BASE = '/api';

export interface GameSessionOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  /** Where a server state's `last_resolution` goes. */
  setSimulationResult: (result: SimulationResult) => void;
}

/**
 * The game this player has open and the lobby around it: which game, its summary and the
 * player's seat, the board from the server, and the list of games. It also loads them.
 * It runs no effects: the socket, the first load and the fallback poll are `useGameSync`,
 * which App calls later so they keep their place among App's effects.
 */
export function useGameSession({
  viewMode,
  setSimulationResult,
}: GameSessionOptions) {
  const [activeGameId, setActiveGameId] = useState<string>(
    () => readStoredSoloSandboxId() ?? 'proto_1901',
  );
  const [activeGameSummary, setActiveGameSummary] =
    useState<MultiplayerGameSummary | null>(null);
  const [lockedPower, setLockedPower] = useState<Power | null>(null);

  // Lobby Games State. The public lobby (`GET /api/games` and the lobby socket) holds public
  // matches only; the player's own games, private campaigns included, come from `/games/mine`.
  const [gamesList, setGamesList] = useState<MultiplayerGameSummary[]>([]);
  const [myGamesList, setMyGamesList] = useState<MultiplayerGameSummary[]>([]);
  const [loadingGames, setLoadingGames] = useState<boolean>(false);
  const lobbyGames = useMemo(
    () => mergeGames(myGamesList, gamesList),
    [myGamesList, gamesList],
  );

  // Board & Tactical Engine State
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [provinces, setProvinces] = useState<Record<string, ProvinceInfo>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const playerPower = resolvePlayerPower(
    viewMode,
    lockedPower,
    gameState?.active_power,
  );

  const applyServerState = (st: GameState) => {
    setGameState(st);
    if (st.last_resolution) {
      setSimulationResult(st.last_resolution);
    }
  };

  /** The signed-in player's own games. A guest has none, and a failed read keeps the last list. */
  const fetchMyGames = async () => {
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders.Authorization) {
        setMyGamesList([]);
        return;
      }
      const res = await fetch(`${API_BASE}/games/mine`, {
        headers: { ...authHeaders },
      });
      if (res.ok) {
        setMyGamesList(await res.json());
      } else if (res.status === 401) {
        setMyGamesList([]);
      }
    } catch (e) {
      console.error('Failed to fetch your games:', e);
    }
  };

  const fetchGamesList = async () => {
    try {
      setLoadingGames(true);
      const [res] = await Promise.all([
        fetch(`${API_BASE}/games`),
        fetchMyGames(),
      ]);
      if (res.ok) {
        const list: MultiplayerGameSummary[] = await res.json();
        setGamesList(list);
      }
    } catch (e) {
      console.error('Failed to fetch games list:', e);
    } finally {
      setLoadingGames(false);
    }
  };

  // Bumped by every fetchGame and every join, so an older reply still in flight
  // (such as the startup load of proto_1901) cannot replace a board opened since.
  const boardRequestSeq = useRef(0);

  const fetchGame = async (
    gid: string = activeGameId,
    targetPower?: Power | null,
  ) => {
    const seq = ++boardRequestSeq.current;
    try {
      setLoading(true);
      const effectivePower =
        targetPower !== undefined ? targetPower : playerPower;
      const params = new URLSearchParams({ game_id: gid });
      if (effectivePower) {
        params.set('power', effectivePower);
      }
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/game?${params.toString()}`, {
        headers: { ...authHeaders },
      });
      if (!res.ok) {
        if (gid !== 'proto_1901' && gid === readStoredSoloSandboxId()) {
          writeStoredSoloSandboxId(null);
          setActiveGameId('proto_1901');
          return fetchGame('proto_1901', targetPower);
        }
        throw new Error(`Backend returned ${res.status}`);
      }
      const data = await res.json();
      if (seq !== boardRequestSeq.current) return;
      applyServerState(data.state);
      setProvinces(data.provinces);
      if (data.summary) {
        setActiveGameSummary(data.summary);
      }
      setErrorMsg(null);
    } catch (err: any) {
      if (seq === boardRequestSeq.current) {
        setErrorMsg(
          err.message || 'Failed to connect to Diplomacy backend server.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    activeGameId,
    setActiveGameId,
    activeGameSummary,
    setActiveGameSummary,
    lockedPower,
    setLockedPower,
    playerPower,
    /** The player's own games first, then the public lobby, each game once. */
    gamesList: lobbyGames,
    /** Replaces the public lobby list, as the lobby socket does. */
    setGamesList,
    fetchMyGames,
    loadingGames,
    gameState,
    setGameState,
    provinces,
    setProvinces,
    loading,
    setLoading,
    errorMsg,
    boardRequestSeq,
    applyServerState,
    fetchGame,
    fetchGamesList,
  };
}

/** Each game once: the player's own copy wins, since only it can hold a private match. */
export function mergeGames(
  mine: MultiplayerGameSummary[],
  lobby: MultiplayerGameSummary[],
): MultiplayerGameSummary[] {
  const own = new Set(mine.map((g) => g.game_id));
  return [...mine, ...lobby.filter((g) => !own.has(g.game_id))];
}
