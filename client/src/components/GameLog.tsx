import type { LogEntry, DuetLogEntry, CardView, DuetCardView } from '@shared/types';

interface GameLogProps {
  log: (LogEntry | DuetLogEntry)[];
  cards: (CardView | DuetCardView)[];
}

export default function GameLog({ log, cards }: GameLogProps) {
  if (!log || log.length === 0)
    return (
      <div className="game-log">
        <div className="log-empty">Waiting for first clue...</div>
      </div>
    );

  const entries = [...log].reverse();

  return (
    <div className="game-log">
      <div className="log-entries">
        {entries.map((entry, i) => {
          if ('clue' in entry) {
            const team = 'team' in entry ? entry.team : entry.side;
            return (
              <div key={`${i}-clue`} className={`log-entry log-clue team-${team}`}>
                <span className="log-icon">{'\u{1F4AC}'}</span>
                <span className="log-text">
                  <strong>{entry.clue}</strong> {entry.count}
                </span>
              </div>
            );
          }
          if ('cardIndex' in entry) {
            const card = cards?.[entry.cardIndex];
            const content = card ? card.content : `#${entry.cardIndex}`;
            return (
              <div key={`${i}-guess`} className={`log-entry log-guess type-${entry.cardType}`}>
                <span className="log-icon">
                  {entry.cardType === 'assassin'
                    ? '\u{1F480}'
                    : entry.cardType === 'bystander'
                      ? '\u{1F464}'
                      : '\u{1F575}\u{FE0F}'}
                </span>
                <span className="log-text">{content}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
