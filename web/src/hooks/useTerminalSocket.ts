import { useCallback, useEffect, useRef, useState } from 'react';

import { AppConnectionState, ClientWsMessage, ServerWsMessage } from '@shared/protocol';

interface UseTerminalSocketOptions {
  enabled: boolean;
  onMessage(message: ServerWsMessage): void;
  onOpen(): void;
  onAuthError(): void;
}

export function useTerminalSocket({
  enabled,
  onMessage,
  onOpen,
  onAuthError,
}: UseTerminalSocketOptions) {
  const [connectionState, setConnectionState] = useState<AppConnectionState>(
    enabled ? 'connecting' : 'logged_out',
  );
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const latestOnMessageRef = useRef(onMessage);
  const latestOnOpenRef = useRef(onOpen);
  const latestOnAuthErrorRef = useRef(onAuthError);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const pongTimeoutRef = useRef<number | null>(null);
  const retryDelayRef = useRef(1000);
  const reconnectNowRef = useRef(false);

  // 用 ref 持有最新回调，避免纯 UI 状态变化触发整条 WebSocket 生命周期重建。
  useEffect(() => {
    latestOnMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    latestOnOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    latestOnAuthErrorRef.current = onAuthError;
  }, [onAuthError]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (pongTimeoutRef.current) {
      window.clearTimeout(pongTimeoutRef.current);
      pongTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      setConnectionState('logged_out');
      return;
    }

    let disposed = false;

    const connect = () => {
      setConnectionState('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (disposed) {
          return;
        }
        retryDelayRef.current = 1000;
        setConnectionState('connected');
        setConnectionEpoch((current) => current + 1);
        reconnectNowRef.current = false;
        latestOnOpenRef.current();
        // Cloudflare 和移动网络都可能留下半开连接。
        // 定时 ping 并等待 pong，可以让客户端主动恢复，而不是一直挂在死连接上。
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' } satisfies ClientWsMessage));
            if (pongTimeoutRef.current) {
              window.clearTimeout(pongTimeoutRef.current);
            }
            pongTimeoutRef.current = window.setTimeout(() => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.close();
              }
            }, 45_000);
          }
        }, 20_000);
      });

      socket.addEventListener('message', (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as ServerWsMessage;
          if (parsed.type === 'pong' && pongTimeoutRef.current) {
            window.clearTimeout(pongTimeoutRef.current);
            pongTimeoutRef.current = null;
          }
          latestOnMessageRef.current(parsed);
        } catch {
          return;
        }
      });

      socket.addEventListener('close', (event) => {
        clearTimers();
        socketRef.current = null;
        if (disposed) {
          return;
        }
        if (
          event.code === 1008 &&
          (event.reason === 'unauthorized' || event.reason === 'expired')
        ) {
          setConnectionState('auth_error');
          latestOnAuthErrorRef.current();
          return;
        }
        if (reconnectNowRef.current) {
          // 用户主动点击 reconnect 时，不走退避等待，直接重连。
          reconnectNowRef.current = false;
          connect();
          return;
        }
        setConnectionState('disconnected');
        reconnectTimerRef.current = window.setTimeout(connect, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 1.5, 5000);
      });
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clearTimers, enabled, retryNonce]);

  const sendMessage = useCallback((message: ClientWsMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return false;
    }
    socketRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  const reconnect = useCallback(() => {
    clearTimers();
    if (socketRef.current) {
      reconnectNowRef.current = true;
      socketRef.current.close();
      return;
    }
    setRetryNonce((current) => current + 1);
  }, [clearTimers]);

  return {
    connectionState,
    connectionEpoch,
    sendMessage,
    reconnect,
  };
}
