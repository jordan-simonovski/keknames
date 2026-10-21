import { SocketProvider, useSocket } from './useSocket';
import Landing from './components/Landing';
import Lobby from './components/Lobby';
import Game from './components/Game';
import RoomAccess from './components/RoomAccess';
import PauseBanner from './components/PauseBanner';

function Screens() {
  const { screen, disconnected, error, pendingCode, leaveRoom } = useSocket();

  return (
    <>
      {disconnected && <div className="connection-banner visible">Disconnected. Reconnecting...</div>}
      {error && <div className="toast-error">{error}</div>}
      {screen === 'landing' && <Landing />}
      {screen === 'waiting' && (
        <main className="waiting-room">
          <h1>Waiting for host approval</h1>
          <p>Your request to join room {pendingCode} is pending. Requests expire after two minutes.</p>
          <button className="btn btn-secondary" onClick={leaveRoom}>
            Cancel request
          </button>
        </main>
      )}
      {(screen === 'lobby' || screen === 'game') && <RoomAccess />}
      {screen === 'game' && <PauseBanner />}
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
