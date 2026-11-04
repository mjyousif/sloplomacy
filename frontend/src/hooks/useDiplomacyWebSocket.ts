import { useEffect, useRef, useState } from 'react';
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
  activeGameId: string | null
): string | null {
  if (viewMode === 'lobby') {
    return '/ws/lobby';
  }
  if (activeGameId) {
    return `/ws/games/${encodeURIComponent(activeGameId)}`;
  }
  return null;
}

interface UseDiplomacyWebSocketProps {
  activeGameId: string | null;
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  onGameUpdate: (update: WebSocketGameUpdate) => void;
  onLobbyUpdate: (update: WebSocketLobbyUpdate) => void;
}

export function useDiplomacyWebSocket({
  activeGameId,
  viewMode,
  onGameUpdate,
  onLobbyUpdate,
}: UseDiplomacyWebSocketProps) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Keep callback refs fresh without resetting websocket connection
  const onGameUpdateRef = useRef(onGameUpdate);
  onGameUpdateRef.current = onGameUpdate;
  const onLobbyUpdateRef = useRef(onLobbyUpdate);
  onLobbyUpdateRef.current = onLobbyUpdate;

  useEffect(() => {
    let isCancelled = false;

    // Determine target WS endpoint based on current viewMode & activeGameId
    const targetPath = resolveWebSocketPath(viewMode, activeGameId);

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

        ws.onopen = () => {
          if (isCancelled) {
            ws.close(1000);
            return;
          }
          setIsConnected(true);

          // Heartbeat ping every 25 seconds to keep proxies & Cloud Run alive
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
          }
          heartbeatIntervalRef.current = window.setInterval(() => {
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
          setIsConnected(false);
          if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
          }
          // Only attempt reconnect if not intentionally closed by navigation/unmount
          if (!isCancelled && event.code !== 1000) {
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
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [viewMode, activeGameId]);

  return { isConnected };
}
