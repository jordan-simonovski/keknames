import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameViewPayload, LobbyState, ChatMessage, WordlistStatus } from '@shared/types';

type Screen = 'landing' | 'lobby' | 'game';

export interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
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
  document.cookie = `keknames_session=${token}; path=/; max-age=86400; SameSite=Lax`;
}

function clearSessionCookie() {
  document.cookie = 'keknames_session=; path=/; max-age=0; SameSite=Lax';
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
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

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('rejoined', (data: { playerId: string; inGame: boolean }) => {
      setMyId(data.playerId);
      setScreen(data.inGame ? 'game' : 'lobby');
    });

    socket.on('session-expired', () => {
      clearSessionCookie();
      setMyId(null);
      setScreen('landing');
    });

    socket.on('lobby-state', (state: LobbyState) => {
      setLobbyState(state);
      setGameState((prev) => {
        if (prev && !state.inGame) {
          setScreen('lobby');
          setChatMessages([]);
        }
        return prev;
      });
    });

    socket.on('game-state', (state: GameViewPayload) => {
      setGameState(state);
      setScreen('game');
      if (state.chatLog) setChatMessages(state.chatLog);
    });

    socket.on('chat-message', (msg: ChatMessage) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    socket.on('wordlist-status', (status: WordlistStatus) => setWordlistStatus(status));

    socket.on('error-msg', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = useCallback((name: string) => {
    return new Promise<{ code: string; playerId: string }>((resolve, reject) => {
      socketRef.current!.emit(
        'create-room',
        { name },
        (res: { error?: string; code?: string; playerId?: string; sessionToken?: string }) => {
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
      socketRef.current!.emit(
        'join-room',
        { code, name },
        (res: { error?: string; code?: string; playerId?: string; sessionToken?: string; inGame?: boolean }) => {
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
    socketRef.current?.emit(event, data);
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