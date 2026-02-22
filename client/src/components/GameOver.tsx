import { useSocket } from '../useSocket';
import type { ClassicGameView } from '@shared/types';

interface GameOverProps {
  state: ClassicGameView;
}

export default function GameOver({ state }: GameOverProps) {
  const { emit } = useSocket();
  const me = state.you;
  if (!state.winner) return null;

  const lastLog = state.log[state.log.length - 1];
  const reason = lastLog && 'cardType' in lastLog && lastLog.cardType === 'assassin' ? ' (Assassin)' : '';
  const iLost = me.team && me.team !== state.winner;

  return (
    <div className="overlay">
      <div className={`overlay-content ${iLost ? 'lose-screen' : ''}`}>
        {iLost && <img className="lose-gif" src="/assets/ui/el-risitas-lose.gif" alt="" />}
        <h2 className={`winner-text team-${state.winner} ${iLost ? 'lose-text-wobble' : ''}`}>
          {iLost ? 'YOU LOSE' : `${state.winner.toUpperCase()} TEAM WINS`}
          {reason}
        </h2>
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
    </div>
  );
}
