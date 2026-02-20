export default function TeamPanel({ team, players, remaining, label }) {
  const spymasters = players.filter((p) => p.role === 'spymaster');
  const operatives = players.filter((p) => p.role === 'operative');

  return (
    <div className={`game-team-panel team-${team}`}>
      <div className="panel-remaining">
        <span className="remaining-count">{remaining}</span>
        <span className="remaining-label">{label}</span>
      </div>
      {operatives.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-title">Operatives</div>
          {operatives.map((p) => (
            <PanelPlayer key={p.id} player={p} />
          ))}
        </div>
      )}
      {spymasters.length > 0 && (
        <div className="panel-section">
          <div className="panel-section-title">Spymaster</div>
          {spymasters.map((p) => (
            <PanelPlayer key={p.id} player={p} spymaster />
          ))}
        </div>
      )}
    </div>
  );
}

function PanelPlayer({ player, spymaster }) {
  const avSrc = player.avatarId
    ? `/assets/ui/avatar_${String(player.avatarId).padStart(2, '0')}.png`
    : null;
  return (
    <div className={`panel-player ${spymaster ? 'is-spymaster' : ''}`}>
      {avSrc ? (
        <img className="panel-avatar" src={avSrc} alt="" />
      ) : (
        <div className="panel-avatar-placeholder" />
      )}
      <span className="panel-player-name">{player.name}</span>
    </div>
  );
}
