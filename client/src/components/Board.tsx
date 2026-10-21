import { useRef, useEffect, useState, useId, type CSSProperties } from 'react';
import type { CardView, GameMode, BoardConfig, CardType } from '@shared/types';
import './Board.css';

interface VoteInfo {
  votes: Record<string, string[]>;
  majority: number | null;
  myVote: number | null;
  myId: string;
  isSolo: boolean;
  showVotes: boolean;
  playerAvatars: Record<string, number>;
}

interface BoardProps {
  gameState: {
    cards: CardView[];
    mode: GameMode;
    config: BoardConfig;
  };
  isSpymaster: boolean;
  voteInfo: VoteInfo | null;
  onCardClick?: (index: number) => void;
}

const TYPE_LABELS: Record<CardType, string> = {
  red: 'Red agent',
  blue: 'Blue agent',
  bystander: 'Bystander',
  assassin: 'Assassin',
};
const TYPE_ART: Record<CardType, string> = {
  red: 'red_agent',
  blue: 'blue_agent',
  bystander: 'bystander',
  assassin: 'assassin',
};

// Descriptions checked against the illustrations in public/assets/cards.
const PICTURE_DESCRIPTIONS: Record<string, string> = {
  card_01: 'Laughing man riding a tiny red bicycle with a flat rear tire',
  card_02: 'Laughing surgeon holding a wrench above a patient while two nurses look shocked',
  card_03: 'Laughing astronaut floating upside down above Earth in an orange spacesuit',
  card_04: 'Laughing chef with his tall hat covering his eyes, cooking a burning pan of paella',
  card_05: 'Laughing pirate with a parrot aboard a broken, sinking wooden boat',
  card_06: 'Laughing man sitting inside a vending machine, eating a bag of chips',
  card_07: 'Laughing conductor leading an orchestra of yellow rubber ducks',
  card_08: 'Laughing man tangled in a purple octopus on a tropical beach',
  card_09: 'Laughing teacher showing equations on a blackboard to cats seated at desks',
  card_10: 'Laughing man skydiving with a knife and fork toward a giant plate of paella and chicken',
  card_11: 'Laughing cowboy holding a beer while riding a mechanical bull in a saloon',
  card_12: 'Laughing matador holding a red cape in front of a tiny bull',
  card_13: 'Sleeping lifeguard in sunglasses on a tall chair while swimmers wave their arms',
  card_14: 'Laughing magician holding a top hat with an angry cat scratching his forehead',
  card_15: 'Laughing man wearing a seafood crown and holding a wooden spoon on a throne of pans',
  card_16: 'Laughing man tangled in a yoga pose while an instructor and other students watch',
  card_17: 'Laughing firefighter spraying a hose amid flames and splashing water',
  card_18: 'Laughing DJ with headphones and sparking turntables, with records flying through the air',
  card_19: 'Laughing painter beside a framed stick figure with paint splashes, watched by puzzled gallery visitors',
  card_20: 'Laughing scuba diver wearing a colander on his head, surrounded by fish and a shark',
  card_21: 'Laughing go-kart driver with a helmet perched above his head and a wheel flying off',
  card_22: 'Laughing man in a dentist chair holding dental tools in his own mouth while a dentist watches',
  card_23: 'Laughing man lifting a barbell while three muscular men watch in a gym',
  card_24: 'Laughing scientist with spiky hair and a scorched lab coat in front of a colorful laboratory explosion',
};

export default function Board({ gameState, isSpymaster, voteInfo, onCardClick }: BoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState<number | null>(null);
  const instructionsId = useId();
  const {
    cards,
    mode,
    config: { rows, cols },
  } = gameState;
  const pictures = mode === 'pictures';
  const aspect = pictures ? 1 : 0.72;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => {
      const width = (viewport.clientWidth - 16 - (cols - 1) * 6) / cols;
      const height = (viewport.clientHeight - 16 - (rows - 1) * 6) / rows;
      // Small viewports scroll instead of shrinking text and targets indefinitely.
      setCardWidth(Math.max(56, Math.floor(Math.min(width, height / aspect))));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [cols, rows, aspect]);

  const style = {
    '--board-columns': cols,
    '--board-card-width': cardWidth === null ? '1fr' : `${cardWidth}px`,
    '--board-card-height': cardWidth === null ? '90px' : `${Math.max(80, Math.floor(cardWidth * aspect))}px`,
    '--board-word-size': cardWidth === null ? '14px' : `${Math.max(11, Math.min(18, cardWidth * 0.13))}px`,
  } as CSSProperties;

  return (
    <div ref={viewportRef} className="classic-board-viewport">
      <p id={instructionsId} className="classic-board-sr-only">
        Use Tab to move between cards. Press Enter or Space to{' '}
        {voteInfo && !voteInfo.isSolo ? 'vote for a card' : 'guess a card'}. Cards are read in row order. Unavailable
        cards can still be read.
      </p>
      <div
        className="classic-board"
        role="group"
        aria-label={`${rows} by ${cols} ${pictures ? 'picture' : 'word'} board`}
        aria-describedby={instructionsId}
        style={style}
      >
        {cards.map((card, index) => {
          const type = card.revealed || isSpymaster ? card.type : null;
          const voting = !card.revealed && !!voteInfo?.showVotes && !voteInfo.isSolo;
          const voters = voting ? (voteInfo.votes[index] ?? []) : [];
          const myVote = voting && voteInfo.myVote === index;
          const majority = voting && voteInfo.majority === index;
          const available = !!onCardClick && !card.revealed;
          const pictureNumber = card.content.replace(/^card_0*/, '');
          const content = pictures
            ? `Picture ${pictureNumber}${PICTURE_DESCRIPTIONS[card.content] ? `: ${PICTURE_DESCRIPTIONS[card.content]}` : ''}`
            : card.content;
          const label = [
            content,
            `row ${Math.floor(index / cols) + 1}, column ${(index % cols) + 1}`,
            card.revealed ? 'revealed' : 'unrevealed',
            type ? TYPE_LABELS[type] : null,
            voting ? `${voters.length} ${voters.length === 1 ? 'vote' : 'votes'}` : null,
            myVote ? 'your vote' : null,
            majority ? 'majority reached' : null,
          ]
            .filter(Boolean)
            .join(', ');
          const art =
            card.revealed && type
              ? `/assets/ui/${TYPE_ART[type]}${card.typeVariant && card.typeVariant > 1 ? `_${card.typeVariant}` : ''}.png`
              : pictures
                ? `/assets/cards/${card.content}.png`
                : null;

          return (
            <button
              key={card.id}
              type="button"
              className={`classic-card${type ? ` classic-card--${type}` : ''}${card.revealed ? ' classic-card--revealed' : ''}${pictures ? ' classic-card--picture' : ''}${majority ? ' classic-card--majority' : ''}`}
              aria-label={label}
              aria-disabled={!available}
              aria-pressed={voting ? myVote : undefined}
              onClick={() => {
                if (available) onCardClick(index);
              }}
            >
              {art && <img className="classic-card-art" src={art} alt="" draggable={false} />}
              <span className="classic-card-top" aria-hidden="true">
                {type && <span className="classic-card-type">{TYPE_LABELS[type]}</span>}
                {voters.length > 0 && (
                  <span className="classic-card-avatars">
                    {voters.map((id) => (
                      <span
                        key={id}
                        className={`classic-card-avatar${id === voteInfo?.myId ? ' classic-card-avatar--mine' : ''}`}
                      >
                        {voteInfo?.playerAvatars[id] != null && (
                          <img
                            src={`/assets/ui/avatar_${String(voteInfo.playerAvatars[id]).padStart(2, '0')}.png`}
                            alt=""
                          />
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="classic-card-content" aria-hidden="true">
                {pictures ? `#${pictureNumber}` : card.content}
              </span>
              <span className="classic-card-status" aria-hidden="true">
                {card.revealed
                  ? 'Revealed'
                  : majority
                    ? 'Majority'
                    : voters.length > 0
                      ? `${voters.length} ${voters.length === 1 ? 'vote' : 'votes'}`
                      : ''}
                {myVote && <span>Your vote</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
