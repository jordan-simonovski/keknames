import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [screen, setScreen] = useState('landing');
  const [lobbyState, setLobbyState] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [myId, setMyId] = useState(null);
  const [error, setError] = useState(null);
  const [wordlistStatus, setWordlistStatus] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setMyId(socket.id);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('lobby-state', (state) => {
      setLobbyState(state);
      setGameState((prev) => {
        if (prev && !state.inGame) {
          setScreen('lobby');
          setChatMessages([]);
        }
        return prev;
      });
    });

    socket.on('game-state', (state) => {
      setGameState(state);
      setScreen('game');
      if (state.chatLog) setChatMessages(state.chatLog);
    });

    socket.on('chat-message', (msg) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    socket.on('wordlist-status', (status) => setWordlistStatus(status));

    socket.on('error-msg', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    });

    return () => socket.disconnect();
  }, []);

  const createRoom = useCallback((name) => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit('create-room', { name }, (res) => {
        if (res.error) { reject(res.error); return; }
        setMyId(socketRef.current.id);
        setScreen('lobby');
        resolve(res);
      });
    });
  }, []);

  const joinRoom = useCallback((code, name) => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit('join-room', { code, name }, (res) => {
        if (res.error) { reject(res.error); return; }
        setMyId(socketRef.current.id);
        setScreen(res.inGame ? 'game' : 'lobby');
        resolve(res);
      });
    });
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const value = {
    socket: socketRef.current,
    connected,
    screen, setScreen,
    lobbyState,
    gameState,
    myId,
    error,
    wordlistStatus,
    chatMessages,
    createRoom,
    joinRoom,
    emit,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
