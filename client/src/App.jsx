import { SocketProvider, useSocket } from './useSocket';
import Landing from './components/Landing';
import Lobby from './components/Lobby';
import Game from './components/Game';

function Screens() {
  const { screen, connected, error } = useSocket();

  return (
    <>
      {!connected && (
        <div className="connection-banner visible">Disconnected. Reconnecting...</div>
      )}
      {error && <div className="toast-error">{error}</div>}
      {screen === 'landing' && <Landing />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <Game />}
    </>
  );
}

export default function App() {
  return (
    <SocketProvider>
      <Screens />
    </SocketProvider>
  );
}
