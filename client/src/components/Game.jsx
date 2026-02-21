import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSocket } from '../useSocket';
import Board from './Board';
import TeamPanel from './TeamPanel';
import GameLog from './GameLog';
import GameOver from './GameOver';
import Chat from './Chat';

function getMajority(votes) {
  if (!votes) return null;
  let best = null, bestCount = 0, tied = false;
  for (const [idx, voters] of Object.entries(votes)) {
    if (voters.length > bestCount) { best = parseInt(idx, 10); bestCount = voters.length; tied = false; }
    else if (voters.length === bestCount) { tied = true; }
  }
  return (tied || bestCount === 0) ? null : best;
}

function getMyVote(votes, myId) {
  if (!votes) return null;
  for (const [idx, voters] of Object.entries(votes)) {
    if (voters.includes(myId)) return parseInt(idx, 10);
  }
  return null;
}

export default function Game() {
  const { gameState, emit } = useSocket();
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState(1);
  const [rightTab, setRightTab] = useState('chat');

  const me = gameState?.you;

  const voteInfo = useMemo(() => {
    if (!gameState || !me) return null;
    return {
      votes: gameState.votes || {},
      majority: getMajority(gameState.votes),
      myVote: getMyVote(gameState.votes, me.id),
      myId: me.id,
      isSolo: me.isSolo,
      showVotes: gameState.phase === 'operative' && gameState.currentTeam === me.team && (me.role === 'operative' || me.isSolo),
      playerAvatars: gameState.playerAvatars || {},
    };
  }, [gameState, me]);

  const handleCardClick = useCallback((idx) => {
    if (!gameState || !me) return;
    const canAct = me.role === 'operative' || me.isSolo;
    if (!canAct) return;
    if (gameState.currentTeam !== me.team) return;
    if (gameState.phase !== 'operative') return;
    const card = gameState.cards[idx];
    if (card.revealed) return;

    if (me.isSolo) {
      emit('make-guess', { cardIndex: idx });
      return;
    }

    const majority = getMajority(gameState.votes);
    const myVote = getMyVote(gameState.votes, me.id);
    if (majority === idx && myVote === idx) {
      emit('make-guess', { cardIndex: idx });
    } else {
      emit('cast-vote', { cardIndex: idx });
    }
  }, [gameState, me, emit]);

  const [timeLeft, setTimeLeft] = useState(null);
  const deadlineRef = useRef(null);

  useEffect(() => {
    const deadline = gameState?.turnDeadline ?? null;
    deadlineRef.current = deadline;
    if (deadline === null) {
      setTimeLeft(null);
      return;
    }
    function tick() {
      const dl = deadlineRef.current;
      if (dl === null) { setTimeLeft(null); return; }
      setTimeLeft(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gameState?.turnDeadline]);

  if (!gameState || !me) return null;

  const isSpectator = me.team === null;
  const isMyTurn = !isSpectator && gameState.currentTeam === me.team && !gameState.winner;
  const isSpymaster = me.role === 'spymaster';
  const isSolo = me.isSolo;

  const players = gameState.players || [];
  const redPlayers = players.filter((p) => p.team === 'red');
  const bluePlayers = players.filter((p) => p.team === 'blue');
  const spectators = players.filter((p) => p.team === null);

  function handleGiveClue() {
    const word = clueWord.trim();
    if (!word) return;
    emit('give-clue', { word, count: clueCount });
    setClueWord('');
  }

  const turnLabel = gameState.winner
    ? `${gameState.winner.toUpperCase()} WINS`
    : `${gameState.currentTeam.toUpperCase()} ${gameState.phase === 'spymaster' ? '- Spymaster' : '- Guessing'}`;

  return (
    <div className="screen game-screen">
      <div className="game-top-bar">
        <div className="top-bar-row">
          <span className="room-code-badge">ROOM {gameState.roomCode}</span>
          <div className="score-panel">
            <span className="red-score">{gameState.redRemaining} red</span>
            <span className={`turn-indicator team-${gameState.currentTeam}`}>{turnLabel}</span>
            <span className="blue-score">{gameState.blueRemaining} blue</span>
          </div>
          {timeLeft !== null && !gameState.winner && (
            <span className={`turn-timer ${timeLeft <= 30 ? 'warning' : ''}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
          {isSpectator && <span className="spectator-badge">SPECTATING</span>}
        </div>
        {gameState.currentClue && (
          <div className="clue-display">
            Clue: <strong>{gameState.currentClue.word}</strong> {gameState.currentClue.count}
            <span className="guesses-left">({gameState.guessesRemaining} guesses left)</span>
          </div>
        )}
      </div>

      <div className="game-body">
        <TeamPanel team="red" players={redPlayers} remaining={gameState.redRemaining} label="remaining" />

        <div className="board-wrapper">
          <Board
            gameState={gameState}
            isSpymaster={isSpymaster && !isSpectator}
            voteInfo={voteInfo}
            onCardClick={isSpectator ? undefined : handleCardClick}
          />
        </div>

        <div className="right-column">
          <TeamPanel team="blue" players={bluePlayers} remaining={gameState.blueRemaining} label="remaining" />
          {spectators.length > 0 && (
            <div className="game-team-panel team-spectators">
              <div className="panel-section">
                <div className="panel-section-title">Spectators</div>
                {spectators.map((p) => (
                  <div key={p.id} className="panel-player">
                    {p.avatarId && (
                      <img
                        className="panel-avatar"
                        src={`/assets/ui/avatar_${String(p.avatarId).padStart(2, '0')}.png`}
                        alt=""
                      />
                    )}
                    <span className="panel-player-name">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="right-tabs">
            <div className="tab-bar">
              <button className={`tab ${rightTab === 'chat' ? 'active' : ''}`} onClick={() => setRightTab('chat')}>Chat</button>
              <button className={`tab ${rightTab === 'log' ? 'active' : ''}`} onClick={() => setRightTab('log')}>Log</button>
            </div>
            <div className="tab-content">
              {rightTab === 'chat' ? <Chat /> : <GameLog log={gameState.log} cards={gameState.cards} />}
            </div>
          </div>
        </div>
      </div>

      <div className="game-controls">
        {!isSpectator && isSpymaster && isMyTurn && gameState.phase === 'spymaster' && (
          <div className="spymaster-controls">
            <input
              type="text"
              placeholder="One-word clue"
              maxLength={30}
              value={clueWord}
              onChange={(e) => setClueWord(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGiveClue()}
              autoComplete="off"
            />
            <input
              type="number"
              min={0}
              max={25}
              value={clueCount}
              onChange={(e) => setClueCount(parseInt(e.target.value, 10) || 0)}
            />
            <button className="btn btn-primary" onClick={handleGiveClue}>Give Clue</button>
          </div>
        )}
        {!isSpectator && isMyTurn && gameState.phase === 'operative' && (!isSpymaster || isSolo) && (
          <div className="operative-controls">
            <button className="btn btn-secondary" onClick={() => emit('end-turn')}>End Turn</button>
          </div>
        )}
      </div>

      <GameOver state={gameState} />
    </div>
  );
}
