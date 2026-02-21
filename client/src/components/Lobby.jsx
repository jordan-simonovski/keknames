import { useState, useCallback } from 'react';
import { useSocket } from '../useSocket';

function PlayerCard({ player, canControl, myId, emit }) {
  const isSelf = player.id === myId;
  const avSrc = player.avatarId
    ? `/assets/ui/avatar_${String(player.avatarId).padStart(2, '0')}.png`
    : null;

  function toggleRole() {
    const next = player.role === 'spymaster' ? 'operative' : 'spymaster';
    emit('assign-team', { targetId: player.id, role: next });
  }

  function moveTo(team) {
    emit('assign-team', { targetId: player.id, team });
  }

  return (
    <div className={`player-card ${isSelf ? 'is-self' : ''}`}>
      {avSrc && <img className="player-avatar" src={avSrc} alt="" />}
      <span className="player-name">
        {player.name}
        {player.isHost && <span className="host-badge">HOST</span>}
      </span>
      {player.team ? (
        <span
          className={`player-role ${player.role === 'spymaster' ? 'spymaster' : ''}`}
          onClick={canControl ? toggleRole : undefined}
          style={{ cursor: canControl ? 'pointer' : 'default' }}
        >
          {player.role === 'spymaster' ? 'SPYMASTER' : 'operative'}
        </span>
      ) : (
        <span className="player-role spectator">spectator</span>
      )}
      {canControl && (
        <span className="team-btns">
          {player.team !== 'red' && (
            <button className="to-red" onClick={() => moveTo('red')}>Red</button>
          )}
          {player.team !== 'blue' && (
            <button className="to-blue" onClick={() => moveTo('blue')}>Blue</button>
          )}
          {player.team !== null && (
            <button className="to-spectate" onClick={() => moveTo(null)}>Spectate</button>
          )}
        </span>
      )}
    </div>
  );
}

function DuetSlotCard({ player, avSrc }) {
  return (
    <div className="player-card">
      {avSrc && <img className="player-avatar" src={avSrc} alt="" />}
      <span className="player-name">
        {player.name}
        {player.isHost && <span className="host-badge">HOST</span>}
      </span>
    </div>
  );
}

function DuetSlots({ lobbyState, myId, isHost, emit }) {
  const playerA = lobbyState.players.find((p) => p.id === lobbyState.playerA);
  const playerB = lobbyState.players.find((p) => p.id === lobbyState.playerB);
  const spectators = lobbyState.players.filter(
    (p) => p.id !== lobbyState.playerA && p.id !== lobbyState.playerB
  );

  function assignSlot(targetId, slot) {
    emit('assign-duet-slot', { targetId, team: slot });
  }

  function avSrc(p) {
    return p?.avatarId
      ? `/assets/ui/avatar_${String(p.avatarId).padStart(2, '0')}.png`
      : null;
  }

  return (
    <div className="teams-container duet-slots">
      <div className="team-panel duet-slot-panel">
        <h3>Player A</h3>
        <div className="player-list">
          {playerA ? (
            <DuetSlotCard player={playerA} avSrc={avSrc(playerA)} />
          ) : (
            <div className="duet-empty-slot">Empty</div>
          )}
        </div>
      </div>
      <div className="team-panel team-spectators">
        <h3>Unassigned</h3>
        <div className="player-list">
          {spectators.map((p) => {
            const canControl = isHost || p.id === myId;
            return (
              <div key={p.id} className={`player-card ${p.id === myId ? 'is-self' : ''}`}>
                {avSrc(p) && <img className="player-avatar" src={avSrc(p)} alt="" />}
                <span className="player-name">
                  {p.name}
                  {p.isHost && <span className="host-badge">HOST</span>}
                </span>
                {canControl && (
                  <span className="team-btns">
                    <button className="to-red" onClick={() => assignSlot(p.id, 'red')}>A</button>
                    <button className="to-blue" onClick={() => assignSlot(p.id, 'blue')}>B</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="team-panel duet-slot-panel">
        <h3>Player B</h3>
        <div className="player-list">
          {playerB ? (
            <DuetSlotCard player={playerB} avSrc={avSrc(playerB)} />
          ) : (
            <div className="duet-empty-slot">Empty</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Lobby() {
  const { lobbyState, myId, emit, wordlistStatus } = useSocket();
  const [customWords, setCustomWords] = useState('');
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(() => {
    if (!lobbyState) return;
    const url = `${window.location.origin}?room=${lobbyState.code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [lobbyState]);

  if (!lobbyState) return null;

  const currentUrlRoom = new URLSearchParams(window.location.search).get('room');
  if (currentUrlRoom !== lobbyState.code) {
    window.history.replaceState(null, '', `?room=${lobbyState.code}`);
  }

  const isHost = lobbyState.hostId === myId;
  const reds = lobbyState.players.filter((p) => p.team === 'red');
  const blues = lobbyState.players.filter((p) => p.team === 'blue');
  const unassigned = lobbyState.players.filter((p) => !p.team);

  function applyWordList() {
    const text = customWords.trim();
    if (!text) {
      emit('set-wordlist', { words: [] });
      return;
    }
    const words = text.split(/\n/).map((w) => w.trim()).filter(Boolean);
    emit('set-wordlist', { words });
  }

  return (
    <div className="screen lobby-screen">
      <div className="lobby-container">
        <div className="lobby-header">
          <h2>
            Room: <span className="room-code">{lobbyState.code}</span>
            <button className="btn btn-small btn-copy-link" onClick={copyLink}>
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </h2>
          {isHost && (
            <div className="host-controls">
              <div className="mode-toggle">
                <button
                  className={`btn btn-mode ${lobbyState.gameType === 'classic' ? 'active' : ''}`}
                  onClick={() => emit('set-game-type', { gameType: 'classic' })}
                >
                  Classic
                </button>
                <button
                  className={`btn btn-mode ${lobbyState.gameType === 'duet' ? 'active' : ''}`}
                  onClick={() => emit('set-game-type', { gameType: 'duet' })}
                >
                  Duet (2P Co-op)
                </button>
              </div>
              {lobbyState.gameType === 'classic' && (
                <div className="mode-toggle">
                  <button
                    className={`btn btn-mode ${lobbyState.mode === 'words' ? 'active' : ''}`}
                    onClick={() => emit('set-mode', { mode: 'words' })}
                  >
                    Words
                  </button>
                  <button
                    className={`btn btn-mode ${lobbyState.mode === 'pictures' ? 'active' : ''}`}
                    onClick={() => emit('set-mode', { mode: 'pictures' })}
                  >
                    Pictures
                  </button>
                </div>
              )}
              <div className="timeout-toggle">
                <span className="timeout-label">Turn Timer:</span>
                {[0, 60, 120, 180, 300].map((s) => (
                  <button
                    key={s}
                    className={`btn btn-mode ${lobbyState.turnTimeout === s ? 'active' : ''}`}
                    onClick={() => emit('set-timeout', { seconds: s })}
                  >
                    {s === 0 ? 'Off' : `${s / 60}m`}
                  </button>
                ))}
              </div>
              {(lobbyState.mode === 'words' || lobbyState.gameType === 'duet') && lobbyState.categories && (
                <div className="category-selector">
                  <label className="category-label">Category:</label>
                  <select
                    className="category-dropdown"
                    value={lobbyState.categoryId}
                    onChange={(e) => emit('set-category', { categoryId: e.target.value, difficulty: lobbyState.difficulty })}
                  >
                    {lobbyState.categories
                      .filter((c) => c.id !== 'custom')
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                  </select>
                  <span className="difficulty-toggle">
                    {['easy', 'hard'].map((d) => (
                      <button
                        key={d}
                        className={`btn btn-mode ${lobbyState.difficulty === d ? 'active' : ''}`}
                        onClick={() => emit('set-category', { categoryId: lobbyState.categoryId, difficulty: d })}
                      >
                        {d}
                      </button>
                    ))}
                  </span>
                </div>
              )}
              {(lobbyState.mode === 'words' || lobbyState.gameType === 'duet') && (
                <details className="wordlist-section">
                  <summary>Custom Word List</summary>
                  <textarea
                    rows={6}
                    placeholder="Paste words, one per line (min 25). Leave empty for default observability theme."
                    value={customWords}
                    onChange={(e) => setCustomWords(e.target.value)}
                  />
                  <button className="btn btn-small" onClick={applyWordList}>Apply</button>
                  {wordlistStatus && (
                    <span className="wordlist-status">
                      {wordlistStatus.status === 'default' && 'Using default (observability)'}
                      {wordlistStatus.status === 'custom' && `Custom: ${wordlistStatus.count} words`}
                      {wordlistStatus.status === 'error' && wordlistStatus.message}
                    </span>
                  )}
                </details>
              )}
            </div>
          )}
        </div>

        {!isHost && (
          <div className="lobby-settings-display">
            {lobbyState.gameType === 'duet' && <span>Duet (2P Co-op)</span>}
            {lobbyState.turnTimeout > 0 && <span>Turn Timer: {lobbyState.turnTimeout / 60}m</span>}
            {(lobbyState.mode === 'words' || lobbyState.gameType === 'duet') && lobbyState.categories && (
              <span>
                Category: {lobbyState.categories.find((c) => c.id === lobbyState.categoryId)?.label ?? lobbyState.categoryId}
                {' '}({lobbyState.difficulty})
              </span>
            )}
          </div>
        )}

        {lobbyState.gameType === 'duet' ? (
          <DuetSlots lobbyState={lobbyState} myId={myId} isHost={isHost} emit={emit} />
        ) : (
          <div className="teams-container">
            <div className="team-panel team-red">
              <h3>Red Team</h3>
              <div className="player-list">
                {reds.map((p) => (
                  <PlayerCard key={p.id} player={p} canControl={isHost || p.id === myId} myId={myId} emit={emit} />
                ))}
              </div>
            </div>
            <div className="team-panel team-spectators">
              <h3>Spectators</h3>
              <div className="player-list">
                {unassigned.map((p) => (
                  <PlayerCard key={p.id} player={p} canControl={isHost || p.id === myId} myId={myId} emit={emit} />
                ))}
              </div>
            </div>
            <div className="team-panel team-blue">
              <h3>Blue Team</h3>
              <div className="player-list">
                {blues.map((p) => (
                  <PlayerCard key={p.id} player={p} canControl={isHost || p.id === myId} myId={myId} emit={emit} />
                ))}
              </div>
            </div>
          </div>
        )}

        {isHost && (
          <div className="lobby-actions">
            <button className="btn btn-primary btn-start" onClick={() => emit('start-game')}>
              Start Game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
