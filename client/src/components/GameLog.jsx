export default function GameLog({ log, cards }) {
  if (!log || log.length === 0) return (
    <div className="game-log">
      <div className="log-empty">Waiting for first clue...</div>
    </div>
  );

  const entries = [...log].reverse();

  return (
    <div className="game-log">
      <div className="log-entries">
        {entries.map((entry, i) => {
          if (entry.clue) {
            return (
              <div key={`${i}-clue`} className={`log-entry log-clue team-${entry.team}`}>
                <span className="log-icon">💬</span>
                <span className="log-text">
                  <strong>{entry.clue}</strong> {entry.count}
                </span>
              </div>
            );
          }
          const card = cards?.[entry.cardIndex];
          const content = card ? card.content : `#${entry.cardIndex}`;
          return (
            <div key={`${i}-guess`} className={`log-entry log-guess type-${entry.cardType}`}>
              <span className="log-icon">
                {entry.cardType === 'assassin' ? '💀' : entry.cardType === 'bystander' ? '👤' : '🕵️'}
              </span>
              <span className="log-text">{content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
