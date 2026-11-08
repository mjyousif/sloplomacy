import { useCallback, useEffect, useRef, useState } from 'react';
import {
  WebSocketGameUpdate,
  WebSocketLobbyUpdate,
  WebSocketMessage,
} from '../types/diplomacy';

export function getWebSocketUrl(path: string): string {
  const protocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'wss:'
      : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5173';
  return `${protocol}//${host}${path}`;
}

export function resolveWebSocketPath(
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
  activeGameId: string | null,
  power?: string | null,
  passcode?: string | null
): string | null {
  if (viewMode === 'lobby') {
    return '/ws/lobby';
  }
  if (activeGameId) {
    const params = new URLSearchParams();
    if (power) params.set('power', power);
    if (passcode) params.set('passcode', passcode);
    const qs = params.toString();
    return `/ws/games/${encodeURIComponent(activeGameId)}${qs ? `?${qs}` : ''}`;
  }
  return null;
}

/**
 * Close codes the server sends when retrying cannot help: the game is gone (4004)
 * or the passcode is missing or wrong (4403). The hook stops reconnecting and the
 * caller falls back to HTTP polling, which knows who the player is.
 */
export const PERMANENT_CLOSE_CODES: ReadonlySet<number> = new Set([4004, 4403]);

export function shouldReconnect(closeCode: number): boolean {
  return closeCode !== 1000 && !PERMANENT_CLOSE_CODES.has(closeCode);
}

interface UseDiplomacyWebSocketProps {
  activeGameId: string | null;
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  power?: string | null;
  passcode?: string | null;
  onGameUpdate: (update: WebSocketGameUpdate) => void;
  onLobbyUpdate: (update: WebSocketLobbyUpdate) => void;
}

export function useDiplomacyWebSocket({
  activeGameId,
  viewMode,
  power,
  passcode,
  onGameUpdate,
  onLobbyUpdate,
}: UseDiplomacyWebSocketProps) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Keep callback refs fresh without resetting websocket connection
  const onGameUpdateRef = useRef(onGameUpdate);
  onGameUpdateRef.current = onGameUpdate;
  const onLobbyUpdateRef = useRef(onLobbyUpdate);
  onLobbyUpdateRef.current = onLobbyUpdate;

  useEffect(() => {
    let isCancelled = false;

    // Determine target WS endpoint based on current viewMode & activeGameId
    const targetPath = resolveWebSocketPath(viewMode, activeGameId, power, passcode);

    if (!targetPath) {
      setIsConnected(false);
      return;
    }

    const connect = () => {
      if (isCancelled) return;

      const wsUrl = getWebSocketUrl(targetPath);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        // Each socket owns its heartbeat, so a late close from an old socket
        // cannot stop the heartbeat of the one that replaced it.
        let heartbeat: number | null = null;

        ws.onopen = () => {
          if (isCancelled || wsRef.current !== ws) {
            ws.close(1000);
            return;
          }
          setIsConnected(true);

          // Heartbeat ping every 25 seconds to keep proxies & Cloud Run alive
          heartbeat = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          try {
            const data: WebSocketMessage = JSON.parse(event.data);
            if (data.type === 'game_update') {
              onGameUpdateRef.current(data);
            } else if (data.type === 'lobby_update') {
              onLobbyUpdateRef.current(data);
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = (event) => {
          if (heartbeat !== null) {
            clearInterval(heartbeat);
            heartbeat = null;
          }
          // A socket that has already been replaced says nothing about the current one.
          if (wsRef.current !== ws) return;
          wsRef.current = null;
          setIsConnected(false);
          // Only attempt reconnect if not intentionally closed by navigation/unmount,
          // and not refused for a reason a retry cannot fix.
          if (!isCancelled && shouldReconnect(event.code)) {
            reconnectTimeoutRef.current = window.setTimeout(() => {
              connect();
            }, 2000);
          }
        };

        ws.onerror = (err) => {
          console.warn('WebSocket connection error:', err);
          // onclose will trigger next and handle reconnection
        };
      } catch (e) {
        console.error('WebSocket connection instantiation error:', e);
        if (!isCancelled) {
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        // Its onclose still clears its own heartbeat.
        ws.close(1000);
      }
      setIsConnected(false);
    };
  }, [viewMode, activeGameId, power, passcode]);

  const sendPing = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  /** Asks the server to run the turn clock and send the current state back. */
  const sendRefresh = useCallback((): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh' }));
      return true;
    }
    return false;
  }, []);

  return { isConnected, sendPing, sendRefresh };
}
