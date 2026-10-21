import { useSocket } from '../useSocket';
import type { AccessMode } from '@shared/types';

export default function RoomAccess() {
  const { roomControls, lobbyState, myId, emit } = useSocket();
  if (!lobbyState || lobbyState.hostId !== myId || roomControls?.code !== lobbyState.code) return null;
  function remove(targetId: string, name: string, ban: boolean) {
    if (window.confirm(`${ban ? 'Block' : 'Remove'} ${name}? Removing an essential player ends the current game.`)) {
      emit('remove-player', { targetId, ban });
    }
  }
  return (
    <details className="room-access">
      <summary>
        Room access: {roomControls.accessMode}
        {roomControls.requests.length > 0 && ` · ${roomControls.requests.length} waiting`}
      </summary>
      <div className="room-access-content">
        <label>
          New arrivals (including spectators)
          <select
            value={roomControls.accessMode}
            onChange={(e) => emit('set-access', { mode: e.target.value as AccessMode })}
          >
            <option value="open">Open — anyone with the code</option>
            <option value="approval">Host approval required</option>
            <option value="locked">Locked — returning players only</option>
          </select>
        </label>
        <p>
          Returning players can reconnect. Blocking applies to the current browser session; use approval or locked
          access to control new identities.
        </p>
        {roomControls.requests.map((request) => (
          <div className="access-person" key={request.id}>
            <span>{request.name} wants to join</span>
            <button onClick={() => emit('review-join', { requestId: request.id, approve: true })}>Accept</button>
            <button onClick={() => emit('review-join', { requestId: request.id, approve: false })}>Decline</button>
          </div>
        ))}
        {lobbyState.players
          .filter((p) => p.id !== myId)
          .map((player) => (
            <div className="access-person" key={player.id}>
              <span>
                {player.name}
                {!player.connected && ' · reconnecting'}
              </span>
              <button onClick={() => remove(player.id, player.name, false)}>Remove</button>
              <button onClick={() => remove(player.id, player.name, true)}>Block</button>
            </div>
          ))}
        {roomControls.blockedPlayers.map((player) => (
          <div className="access-person" key={player.id}>
            <span>{player.name} · blocked</span>
            <button onClick={() => emit('unblock-player', { targetId: player.id })}>Unblock</button>
          </div>
        ))}
      </div>
    </details>
  );
}
