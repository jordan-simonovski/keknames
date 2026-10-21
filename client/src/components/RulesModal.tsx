import { useEffect } from 'react';

const CLASSIC_RULES = [
  'Two teams (Red & Blue) each have a Spymaster and Operatives.',
  '25 word cards on the board: some belong to Red, some to Blue, some are neutral Bystanders, and one is the Assassin.',
  'Spymasters take turns giving a one-word clue plus a number indicating how many cards relate to that clue.',
  'Operatives guess cards based on the clue. Correct guesses let them continue; wrong guesses end the turn.',
  'With multiple operatives, more than half must vote for a card before it can be confirmed.',
  'Guessing a Bystander or the other team\u2019s card ends your turn. Guessing the Assassin loses the game instantly.',
  'First team to reveal all their cards wins.',
];

const DUET_RULES = [
  'Two players (A & B) work together cooperatively.',
  '25 word cards, each with a hidden color only the other player can see.',
  'Players alternate as Spymaster, giving clues for their partner to guess.',
  'Guesses are checked against the clue giver’s key. Your own colors are for clues you give, not guesses you make.',
  'A neutral guess ends the turn, but the card can still be an agent for the other player. Green cards are shared progress.',
  'Keep guessing as long as you find green cards, or end your turn. An assassin loses the game immediately.',
  'Find all 15 agents within 9 turns. This version ends the game when the tokens run out (no sudden death).',
];

const SPYMASTER_TIPS = [
  'You can see every card\u2019s color. Your teammates cannot.',
  'Give a single-word clue and a number. The number tells your team how many cards relate to your clue.',
  'Your clue must not contain or match any unrevealed word on the board.',
  'Use 0 to let your team guess freely based on previous clues (unlimited guesses).',
  'Think carefully \u2014 a clue that accidentally points to the Assassin or the other team\u2019s cards can cost you the game.',
];

interface RulesModalProps {
  mode: 'classic' | 'duet';
  spymasterTip: boolean;
  onClose: () => void;
}

export default function RulesModal({ mode, spymasterTip, onClose }: RulesModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rules = mode === 'duet' ? DUET_RULES : CLASSIC_RULES;
  const title = mode === 'duet' ? 'Duet Rules' : 'Classic Rules';

  return (
    <div className="rules-backdrop" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rules-close" onClick={onClose}>
          &times;
        </button>
        <h2 className="rules-title">{title}</h2>
        <ul className="rules-list">
          {rules.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {spymasterTip && (
          <>
            <h3 className="rules-subtitle">Spymaster Tips</h3>
            <ul className="rules-list tips">
              {SPYMASTER_TIPS.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
