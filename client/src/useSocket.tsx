import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameViewPayload, LobbyState, ChatMessage, WordlistStatus } from '@shared/types';

type Screen = 'landing' | 'lobby' | 'game';

export interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  disconnected: boolean;
  screen: Screen;
  setScreen: (s: Screen) => void;
  lobbyState: LobbyState | null;
  gameState: GameViewPayload | null;
  myId: string | null;
  error: string | null;
  wordlistStatus: WordlistStatus | null;
  chatMessages: ChatMessage[];
  createRoom: (name: string) => Promise<{ code: string; playerId: string }>;
  joinRoom: (code: string, name: string) => Promise<{ code: string; playerId: string; inGame: boolean }>;
  leaveRoom: () => void;
  emit: (event: string, data?: unknown) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

function setSessionCookie(token: string) {
  document.cookie = `keknames_session=${token}; path=/; max-age=86400; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

function clearSessionCookie() {
  document.cookie = 'keknames_session=; path=/; max-age=0; SameSite=Lax';
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const everConnected = useRef(false);
  const [screen, setScreen] = useState<Screen>('landing');
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [gameState, setGameState] = useState<GameViewPayload | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wordlistStatus, setWordlistStatus] = useState<WordlistStatus | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    let errorTimer: ReturnType<typeof setTimeout>;

    function resetRoom() {
      setMyId(null);
      setLobbyState(null);
      setGameState(null);
      setChatMessages([]);
      setWordlistStatus(null);
      setScreen('landing');
    }

    socket.on('connect', () => {
      everConnected.current = true;
      setConnected(true);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('rejoined', (data: { playerId: string; inGame: boolean }) => {
      setMyId(data.playerId);
      setScreen(data.inGame ? 'game' : 'lobby');
    });

    socket.on('session-expired', () => {
      clearSessionCookie();
      resetRoom();
    });

    socket.on('session-replaced', () => {
      // The new tab shares the cookie; clearing it would break its reconnection.
      everConnected.current = false;
      resetRoom();
      clearTimeout(errorTimer);
      setError('This session is active in another tab. Reload to continue here.');
    });

    socket.on('lobby-state', (state: LobbyState) => {
      setLobbyState(state);
      if (!state.inGame) {
        setGameState(null);
        setScreen('lobby');
      }
    });

    socket.on('game-state', (state: GameViewPayload) => {
      setGameState(state);
      setScreen('game');
      if (state.chatLog) setChatMessages(state.chatLog);
    });

    socket.on('chat-message', (msg: ChatMessage) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg].slice(-200);
      });
    });

    socket.on('wordlist-status', (status: WordlistStatus) => setWordlistStatus(status));

    socket.on('error-msg', (msg: string) => {
      setError(msg);
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => setError(null), 4000);
    });

    return () => {
      clearTimeout(errorTimer);
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    return new Promise<{ code: string; playerId: string }>((resolve, reject) => {
      if (!socketRef.current?.connected) return reject('Not connected. Please try again once reconnected.');
      socketRef.current
        .timeout(8000)
        .emit(
          'create-room',
          { name },
          (err: Error | null, res: { error?: string; code?: string; playerId?: string; sessionToken?: string }) => {
            if (err) return reject('Request timed out. Please try again.');
            if (res.error) {
              reject(res.error);
              return;
            }
            setMyId(res.playerId!);
            if (res.sessionToken) setSessionCookie(res.sessionToken);
            setScreen('lobby');
            resolve(res as { code: string; playerId: string });
          },
        );
    });
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    return new Promise<{ code: string; playerId: string; inGame: boolean }>((resolve, reject) => {
      if (!socketRef.current?.connected) return reject('Not connected. Please try again once reconnected.');
      socketRef.current
        .timeout(8000)
        .emit(
          'join-room',
          { code, name },
          (
            err: Error | null,
            res: { error?: string; code?: string; playerId?: string; sessionToken?: string; inGame?: boolean },
          ) => {
            if (err) return reject('Request timed out. Please try again.');
            if (res.error) {
              reject(res.error);
              return;
            }
            setMyId(res.playerId!);
            if (res.sessionToken) setSessionCookie(res.sessionToken);
            setScreen(res.inGame ? 'game' : 'lobby');
            resolve(res as { code: string; playerId: string; inGame: boolean });
          },
        );
    });
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    if (socketRef.current?.connected) socketRef.current.emit(event, data);
    else setError('Disconnected. Wait for reconnection before playing.');
  }, []);

  const leaveRoom = useCallback(() => {
    if (!window.confirm('Leave room? Your session will be ended.')) return;
    socketRef.current?.emit('leave-room');
    clearSessionCookie();
    setMyId(null);
    setLobbyState(null);
    setGameState(null);
    setChatMessages([]);
    setScreen('landing');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const value: SocketContextValue = {
    socket: socketRef.current,
    connected,
    disconnected: everConnected.current && !connected,
    screen,
    setScreen,
    lobbyState,
    gameState,
    myId,
    error,
    wordlistStatus,
    chatMessages,
    createRoom,
    joinRoom,
    leaveRoom,
    emit,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
