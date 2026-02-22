import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useSocket } from '../useSocket';
import { useMuted, useMusicMuted, useBackgroundMusic, useSounds, useGameSounds, useTickSound, useTimeUpSound } from '../useSounds';
import Board from './Board';
import TeamPanel from './TeamPanel';
import GameLog from './GameLog';
import GameOver from './GameOver';
import Chat from './Chat';
import RoundSplash from './RoundSplash';
import RulesModal from './RulesModal';
import type { DuetGameView, ClassicGameView, GameViewPayload } from '@shared/types';
import { avatarUrl } from '@shared/constants';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVolumeHigh, faVolumeXmark, faMusic } from '@fortawesome/free-solid-svg-icons';

function InfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="info-btn" onClick={onClick} title="Spymaster rules" type="button">
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-1.5 3a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

interface MobileChatOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: ReactNode;
}

function MobileChatOverlay({ isOpen, onClose, activeTab, setActiveTab, children }: MobileChatOverlayProps) {
  if (!isOpen) return null;
  return (
    <div className="mobile-overlay open" onClick={onClose}>
      <div className="mobile-overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-overlay-header">
          <div className="tab-bar">
            <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
              Chat
            </button>
            <button className={`tab ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>
              Log
            </button>
          </div>
          <button className="mobile-overlay-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="mobile-overlay-body">{children}</div>
      </div>
    </div>
  );
}

function getMajority(votes: Record<string, string[]> | undefined): number | null {
  if (!votes) return null;
  let best: number | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [idx, voters] of Object.entries(votes)) {
    if (voters.length > bestCount) {
      best = parseInt(idx, 10);
      bestCount = voters.length;
      tied = false;
    } else if (voters.length === bestCount) {
      tied = true;
    }
  }
  return tied || bestCount === 0 ? null : best;
}

function getMyVote(votes: Record<string, string[]> | undefined, myId: string): number | null {
  if (!votes) return null;
  for (const [idx, voters] of Object.entries(votes)) {
    if (voters.includes(myId)) return parseInt(idx, 10);
  }
  return null;
}

interface DuetGameProps {
  gameState: DuetGameView;
  emit: (event: string, data?: unknown) => void;
  muted: boolean;
  toggleMute: () => void;
  musicMuted: boolean;
  toggleMusic: () => void;
}

function DuetGame({ gameState, emit, muted, toggleMute, musicMuted, toggleMusic }: DuetGameProps) {
  const { chatMessages, leaveRoom } = useSocket();
  const me = gameState.you;
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState(1);
  const [rightTab, setRightTab] = useState('chat');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [seenChat, setSeenChat] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSpymaster, setRulesSpymaster] = useState(false);
  const unreadChat = chatMessages ? chatMessages.length - seenChat : 0;

  const play = useSounds(muted);
  const prevRef = useRef<GameViewPayload | null>(null);
  useGameSounds(gameState, prevRef, play);
  useBackgroundMusic(!gameState.winner, musicMuted);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  useEffect(() => {
    const deadline = gameState?.turnDeadline ?? null;
    deadlineRef.current = deadline;
    if (deadline === null) {
      setTimeLeft(null);
      return;
    }
    function tick() {
      const dl = deadlineRef.current;
      if (dl === null) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gameState?.turnDeadline]);

  useTickSound(timeLeft, muted);
  useTimeUpSound(timeLeft, play);

  const mySide = me.duetSide;
  const isSpectator = !mySide;
  const clueGiver = gameState.currentTurn;
  const guesser = clueGiver === 'A' ? 'B' : 'A';
  const amClueGiver = mySide === clueGiver;
  const amGuesser = mySide === guesser;
  const isOver = !!gameState.winner;

  function handleGiveClue() {
    const word = clueWord.trim();
    if (!word) return;
    emit('give-clue', { word, count: clueCount });
    setClueWord('');
  }

  function handleCardClick(idx: number) {
    if (isSpectator || !amGuesser || isOver) return;
    if (gameState.phase !== 'operative') return;
    const card = gameState.cards[idx];
    if (card?.revealed) return;
    emit('make-guess', { cardIndex: idx });
  }

  const turnLabel = isOver
    ? gameState.winner === 'win'
      ? 'YOU WIN'
      : 'YOU LOSE'
    : gameState.phase === 'spymaster'
      ? `Player ${clueGiver} giving clue`
      : `Player ${guesser} guessing`;

  return (
    <div className="screen game-screen duet-game">
      <RoundSplash gameState={gameState} />
      <div className="game-top-bar">
        <div className="top-bar-row">
          <span className="room-code-badge">ROOM {gameState.roomCode}</span>
          <div className="score-panel duet-score">
            <span className="duet-tokens">Tokens: {gameState.turnsRemaining}</span>
            <span className={`turn-indicator ${isOver ? (gameState.winner === 'win' ? 'duet-win' : 'duet-lose') : ''}`}>
              {turnLabel}
            </span>
            <span className="duet-found">
              Found: {gameState.greenFound}/{gameState.greenTotal}
            </span>
          </div>
          {timeLeft !== null && !isOver && (
            <span className={`turn-timer ${timeLeft <= 30 ? 'warning' : ''}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
          <button className="btn btn-mute" onClick={toggleMute} title={muted ? 'Unmute SFX' : 'Mute SFX'}>
            <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh} />
          </button>
          <button className={`btn btn-mute${musicMuted ? ' muted' : ''}`} onClick={toggleMusic} title={musicMuted ? 'Unmute Music' : 'Mute Music'}>
            <FontAwesomeIcon icon={faMusic} />
          </button>
          <button
            className="rules-btn"
            onClick={() => {
              setRulesOpen(true);
              setRulesSpymaster(false);
            }}
          >
            RULES
          </button>
          <button className="rules-btn btn-leave-game" onClick={leaveRoom}>
            LEAVE
          </button>
          {isSpectator && <span className="spectator-badge">SPECTATING</span>}
          {!isSpectator && <span className="duet-side-badge">You are Player {mySide}</span>}
        </div>
        {gameState.currentClue && (
          <div className="clue-display">
            Clue: <strong>{gameState.currentClue.word}</strong> {gameState.currentClue.count}
            <span className="guesses-left">({gameState.guessesRemaining} guesses left)</span>
          </div>
        )}
      </div>

      {rulesOpen && <RulesModal mode="duet" spymasterTip={rulesSpymaster} onClose={() => setRulesOpen(false)} />}

      <div className="game-body duet-body">
        <div className="duet-board">
          {gameState.cards.map((card, idx) => {
            let colorClass = 'duet-neutral';
            if (card.revealed) {
              if (card.typeA === 'green' || card.typeB === 'green') colorClass = 'duet-green';
              else if (card.revealedType === 'assassin') colorClass = 'duet-assassin';
            } else if (!isSpectator && card.myType) {
              if (card.myType === 'green') colorClass = 'duet-mygreen';
              else if (card.myType === 'assassin') colorClass = 'duet-myassassin';
            }
            const clickable = !card.revealed && amGuesser && gameState.phase === 'operative' && !isOver;
            return (
              <div
                key={card.id}
                className={`duet-card ${colorClass} ${card.revealed ? 'revealed' : ''} ${clickable ? 'clickable' : ''}`}
                onClick={clickable ? () => handleCardClick(idx) : undefined}
              >
                <span className="duet-card-word">{card.content}</span>
              </div>
            );
          })}
        </div>

        <div className="right-column">
          <div className="right-tabs">
            <div className="tab-bar">
              <button className={`tab ${rightTab === 'chat' ? 'active' : ''}`} onClick={() => setRightTab('chat')}>
                Chat
              </button>
              <button className={`tab ${rightTab === 'log' ? 'active' : ''}`} onClick={() => setRightTab('log')}>
                Log
              </button>
            </div>
            <div className="tab-content">
              {rightTab === 'chat' ? <Chat /> : <GameLog log={gameState.log} cards={gameState.cards} />}
            </div>
          </div>
        </div>
      </div>

      <div className="game-controls">
        {!isSpectator && amClueGiver && !isOver && gameState.phase === 'spymaster' && (
          <div className="spymaster-controls">
            <span className="turn-prompt">Your turn — give a clue</span>
            <InfoButton
              onClick={() => {
                setRulesSpymaster(true);
                setRulesOpen(true);
              }}
            />
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
            <button className="btn btn-primary" onClick={handleGiveClue}>
              Give Clue
            </button>
          </div>
        )}
        {!isSpectator && amGuesser && !isOver && gameState.phase === 'operative' && (
          <div className="operative-controls">
            <span className="turn-prompt">Your turn — pick a card</span>
            <button className="btn btn-secondary" onClick={() => emit('end-turn')}>
              End Turn
            </button>
          </div>
        )}
      </div>

      <button
        className="mobile-chat-toggle"
        onClick={() => {
          setMobileOpen(true);
          setSeenChat(chatMessages?.length ?? 0);
        }}
      >
        {'\u{1F4AC}'}
        {unreadChat > 0 && <span className="mobile-chat-badge">{unreadChat}</span>}
      </button>
      <MobileChatOverlay
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        activeTab={rightTab}
        setActiveTab={setRightTab}
      >
        {rightTab === 'chat' ? <Chat /> : <GameLog log={gameState.log} cards={gameState.cards} />}
      </MobileChatOverlay>

      {isOver && (
        <div className={`duet-game-over ${gameState.winner === 'win' ? 'duet-win-overlay' : 'duet-lose-overlay'}`}>
          <h2>{gameState.winner === 'win' ? 'Victory' : 'Defeat'}</h2>
          <p>{gameState.winner === 'win' ? 'All agents found.' : 'Mission failed.'}</p>
          {me.isHost && (
            <>
              <button className="btn btn-primary" onClick={() => emit('play-again')}>
                Play Again
              </button>
              <button className="btn btn-secondary" onClick={() => emit('back-to-lobby')}>
                Back to Lobby
              </button>
            </>
          )}
          {!me.isHost && <p className="waiting-host">Waiting for host...</p>}
        </div>
      )}
    </div>
  );
}

export default function Game() {
  const { gameState, emit, chatMessages, leaveRoom } = useSocket();
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState(1);
  const [rightTab, setRightTab] = useState('chat');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [seenChat, setSeenChat] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSpymaster, setRulesSpymaster] = useState(false);
  const unreadChat = chatMessages ? chatMessages.length - seenChat : 0;

  const [muted, toggleMute] = useMuted();
  const [musicMuted, toggleMusic] = useMusicMuted();
  const play = useSounds(muted);
  const prevGameRef = useRef<GameViewPayload | null>(null);
  useGameSounds(gameState, prevGameRef, play);

  const me = gameState?.you;

  const voteInfo = useMemo(() => {
    if (!gameState || !me) return null;
    if (gameState.mode === 'duet') return null;
    const classic = gameState as ClassicGameView;
    return {
      votes: classic.votes || {},
      majority: getMajority(classic.votes),
      myVote: getMyVote(classic.votes, me.id),
      myId: me.id,
      isSolo: me.isSolo,
      showVotes:
        classic.phase === 'operative' &&
        classic.currentTeam === me.team &&
        (me.role === 'operative' || me.isSolo),
      playerAvatars: classic.playerAvatars || {},
    };
  }, [gameState, me]);

  const handleCardClick = useCallback(
    (idx: number) => {
      if (!gameState || !me) return;
      const canAct = me.role === 'operative' || me.isSolo;
      if (!canAct) return;
      if (gameState.mode === 'duet') return;
      const classic = gameState as ClassicGameView;
      if (classic.currentTeam !== me.team) return;
      if (classic.phase !== 'operative') return;
      const card = classic.cards[idx];
      if (card?.revealed) return;

      if (me.isSolo) {
        emit('make-guess', { cardIndex: idx });
        return;
      }

      const majority = getMajority(classic.votes);
      const myVote = getMyVote(classic.votes, me.id);
      if (majority === idx && myVote === idx) {
        emit('make-guess', { cardIndex: idx });
      } else {
        emit('cast-vote', { cardIndex: idx });
      }
    },
    [gameState, me, emit],
  );

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  useEffect(() => {
    const deadline = gameState?.turnDeadline ?? null;
    deadlineRef.current = deadline;
    if (deadline === null) {
      setTimeLeft(null);
      return;
    }
    function tick() {
      const dl = deadlineRef.current;
      if (dl === null) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft(Math.max(0, Math.ceil((dl - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [gameState?.turnDeadline]);

  useTickSound(timeLeft, muted);
  useTimeUpSound(timeLeft, play);
  useBackgroundMusic(!!gameState && gameState.phase !== 'gameover', musicMuted);

  if (gameState?.mode === 'duet') {
    return <DuetGame gameState={gameState} emit={emit} muted={muted} toggleMute={toggleMute} musicMuted={musicMuted} toggleMusic={toggleMusic} />;
  }

  if (!gameState || !me) return null;

  const classic = gameState as ClassicGameView;
  const isSpectator = me.team === null;
  const isMyTurn = !isSpectator && classic.currentTeam === me.team && !classic.winner;
  const isSpymaster = me.role === 'spymaster';
  const isSolo = me.isSolo;

  const players = classic.players || [];
  const redPlayers = players.filter((p) => p.team === 'red');
  const bluePlayers = players.filter((p) => p.team === 'blue');
  const spectators = players.filter((p) => p.team === null);

  function handleGiveClue() {
    const word = clueWord.trim();
    if (!word) return;
    emit('give-clue', { word, count: clueCount });
    setClueWord('');
  }

  const turnLabel = classic.winner
    ? `${classic.winner.toUpperCase()} WINS`
    : `${classic.currentTeam.toUpperCase()} ${classic.phase === 'spymaster' ? '- Spymaster' : '- Guessing'}`;

  return (
    <div className="screen game-screen">
      <RoundSplash gameState={gameState} />
      <div className="game-top-bar">
        <div className="top-bar-row">
          <span className="room-code-badge">ROOM {classic.roomCode}</span>
          <div className="score-panel">
            <span className="red-score">{classic.redRemaining} red</span>
            <span className={`turn-indicator team-${classic.currentTeam}`}>{turnLabel}</span>
            <span className="blue-score">{classic.blueRemaining} blue</span>
          </div>
          {timeLeft !== null && !classic.winner && (
            <span className={`turn-timer ${timeLeft <= 30 ? 'warning' : ''}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          )}
          <button className="btn btn-mute" onClick={toggleMute} title={muted ? 'Unmute SFX' : 'Mute SFX'}>
            <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh} />
          </button>
          <button className={`btn btn-mute${musicMuted ? ' muted' : ''}`} onClick={toggleMusic} title={musicMuted ? 'Unmute Music' : 'Mute Music'}>
            <FontAwesomeIcon icon={faMusic} />
          </button>
          <button
            className="rules-btn"
            onClick={() => {
              setRulesOpen(true);
              setRulesSpymaster(false);
            }}
          >
            RULES
          </button>
          <button className="rules-btn btn-leave-game" onClick={leaveRoom}>
            LEAVE
          </button>
          {isSpectator && <span className="spectator-badge">SPECTATING</span>}
          {!isSpectator && me.team && (
            <span className={`team-badge team-badge-${me.team}`}>
              You are {me.team.toUpperCase()} {me.role === 'spymaster' ? '(Spymaster)' : ''}
            </span>
          )}
        </div>
        {classic.currentClue && (
          <div className="clue-display">
            Clue: <strong>{classic.currentClue.word}</strong> {classic.currentClue.count}
            <span className="guesses-left">({classic.guessesRemaining} guesses left)</span>
          </div>
        )}
      </div>

      {rulesOpen && <RulesModal mode="classic" spymasterTip={rulesSpymaster} onClose={() => setRulesOpen(false)} />}

      <div className="game-body">
        <TeamPanel team="red" players={redPlayers} remaining={classic.redRemaining} label="remaining" />

        <div className="board-wrapper">
          <Board
            gameState={classic}
            isSpymaster={isSpymaster && !isSpectator}
            voteInfo={voteInfo}
            onCardClick={isSpectator ? undefined : handleCardClick}
          />
        </div>

        <div className="right-column">
          <TeamPanel team="blue" players={bluePlayers} remaining={classic.blueRemaining} label="remaining" />
          {spectators.length > 0 && (
            <div className="game-team-panel team-spectators">
              <div className="panel-section">
                <div className="panel-section-title">Spectators</div>
                {spectators.map((p) => (
                  <div key={p.id} className="panel-player">
                    {p.avatarId != null && (
                      <img
                        className="panel-avatar"
                        src={avatarUrl(p.avatarId)}
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
              <button className={`tab ${rightTab === 'chat' ? 'active' : ''}`} onClick={() => setRightTab('chat')}>
                Chat
              </button>
              <button className={`tab ${rightTab === 'log' ? 'active' : ''}`} onClick={() => setRightTab('log')}>
                Log
              </button>
            </div>
            <div className="tab-content">
              {rightTab === 'chat' ? <Chat /> : <GameLog log={classic.log} cards={classic.cards} />}
            </div>
          </div>
        </div>
      </div>

      <div className="game-controls">
        {!isSpectator && isSpymaster && isMyTurn && classic.phase === 'spymaster' && (
          <div className="spymaster-controls">
            <span className="turn-prompt">Your turn — give a clue</span>
            <InfoButton
              onClick={() => {
                setRulesSpymaster(true);
                setRulesOpen(true);
              }}
            />
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
            <button className="btn btn-primary" onClick={handleGiveClue}>
              Give Clue
            </button>
          </div>
        )}
        {!isSpectator && isMyTurn && classic.phase === 'operative' && (!isSpymaster || isSolo) && (
          <div className="operative-controls">
            {isSolo ? (
              <span className="turn-prompt">Your turn — pick a card</span>
            ) : (
              (() => {
                const majority = getMajority(classic.votes);
                const myVote = getMyVote(classic.votes, me.id);
                const totalVoters = Object.values(classic.votes || {}).reduce(
                  (s, v) => { v.forEach((id) => { if (!s.has(id)) s.add(id); }); return s; },
                  new Set<string>(),
                ).size;
                const majorityWord = majority !== null ? classic.cards[majority]?.content : null;
                return (
                  <>
                    {majority === null && myVote === null && (
                      <span className="turn-prompt">Click a card to vote</span>
                    )}
                    {majority === null && myVote !== null && (
                      <span className="vote-status">
                        Voted — waiting for others ({totalVoters} voted)
                      </span>
                    )}
                    {majority !== null && myVote !== majority && (
                      <span className="vote-status vote-majority">
                        Majority on <strong>{majorityWord}</strong> — click it to agree
                      </span>
                    )}
                    {majority !== null && myVote === majority && (
                      <button
                        className="btn btn-primary btn-confirm-guess"
                        onClick={() => emit('make-guess', { cardIndex: majority })}
                      >
                        Confirm: {majorityWord}
                      </button>
                    )}
                  </>
                );
              })()
            )}
            <button className="btn btn-secondary" onClick={() => emit('end-turn')}>
              End Turn
            </button>
          </div>
        )}
      </div>

      <GameOver state={classic} />

      <button
        className="mobile-chat-toggle"
        onClick={() => {
          setMobileOpen(true);
          setSeenChat(chatMessages?.length ?? 0);
        }}
      >
        {'\u{1F4AC}'}
        {unreadChat > 0 && <span className="mobile-chat-badge">{unreadChat}</span>}
      </button>
      <MobileChatOverlay
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        activeTab={rightTab}
        setActiveTab={setRightTab}
      >
        {rightTab === 'chat' ? <Chat /> : <GameLog log={classic.log} cards={classic.cards} />}
      </MobileChatOverlay>
    </div>
  );
}
