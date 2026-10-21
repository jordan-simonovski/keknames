import { readdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CardView } from '@shared/types';
import Board from './Board';

const config = { rows: 5, cols: 5, total: 25, starting: 9, other: 8, bystanders: 7, assassins: 1 };
const card: CardView = { id: 0, content: 'MOON', type: null, typeVariant: null, revealed: false };
const votes = {
  votes: { '0': ['me', 'teammate'] },
  majority: 0,
  myVote: 0,
  myId: 'me',
  isSolo: false,
  showVotes: true,
  playerAvatars: { me: 1, teammate: 2 },
};

function render(cards: CardView[] = [card], options: Partial<Parameters<typeof Board>[0]> = {}) {
  return renderToStaticMarkup(
    <Board gameState={{ cards, mode: 'words', config }} isSpymaster={false} voteInfo={null} {...options} />,
  );
}

function buttons(markup: string) {
  return markup.match(/<button\b[^>]*>/g) ?? [];
}

describe('classic board accessibility', () => {
  it('renders every card as a native button with its word, position and reveal state', () => {
    const cards = Array.from({ length: 25 }, (_, id) => ({ ...card, id, content: `WORD ${id + 1}` }));
    const markup = render(cards, { onCardClick: () => {} });
    const controls = buttons(markup);
    expect(controls).toHaveLength(25);
    expect(controls[0]).toContain('type="button"');
    expect(controls[0]).toContain('aria-label="WORD 1, row 1, column 1, unrevealed"');
    expect(controls[24]).toContain('aria-label="WORD 25, row 5, column 5, unrevealed"');
    expect(controls.every((control) => control.includes('aria-disabled="false"'))).toBe(true);
    expect(markup).not.toContain('<canvas');
  });

  it('keeps inactive and revealed cards focusable and readable', () => {
    for (const markup of [
      render(),
      render([{ ...card, revealed: true, type: 'red', typeVariant: 2 }], { onCardClick: () => {} }),
    ]) {
      const control = buttons(markup)[0]!;
      expect(control).toContain('aria-disabled="true"');
      expect(control).not.toMatch(/\sdisabled[=\s>]/);
      expect(control).not.toContain('tabindex="-1"');
    }
    const markup = render([{ ...card, revealed: true, type: 'red', typeVariant: 2 }]);
    expect(markup).toContain('MOON, row 1, column 1, revealed, Red agent');
    expect(markup).toContain('/assets/ui/red_agent_2.png');
    expect(markup).toContain('>Revealed<');
  });

  it('never substitutes an ownership type or art for server-hidden information', () => {
    for (const isSpymaster of [false, true]) {
      const markup = render([card], { isSpymaster });
      expect(markup).not.toContain('classic-card-type');
      expect(markup).not.toMatch(/Red agent|Blue agent|Bystander|Assassin/);
      expect(markup).not.toContain('/assets/ui/');
    }
  });

  it('provides visible text cues for every known ownership type', () => {
    const types = ['red', 'blue', 'bystander', 'assassin'] as const;
    const markup = render(
      types.map((type, id) => ({ ...card, id, type })),
      { isSpymaster: true },
    );
    for (const label of ['Red agent', 'Blue agent', 'Bystander', 'Assassin']) {
      expect(markup).toContain(`class="classic-card-type">${label}</span>`);
    }
    expect(markup).not.toContain('/assets/ui/');
  });

  it('exposes vote counts, own selection and majority without relying on avatars or color', () => {
    const markup = render([card], { voteInfo: votes, onCardClick: () => {} });
    expect(buttons(markup)[0]).toContain('aria-pressed="true"');
    expect(markup).toContain('2 votes, your vote, majority reached');
    expect(markup).toContain('>Majority<span>Your vote</span>');
    expect(markup).toContain('/assets/ui/avatar_01.png');
    expect(markup).toContain('/assets/ui/avatar_02.png');
  });

  it('omits private voting indicators when votes are hidden, solo or the card is revealed', () => {
    for (const markup of [
      render([card], { voteInfo: { ...votes, showVotes: false } }),
      render([card], { voteInfo: { ...votes, isSolo: true } }),
      render([{ ...card, revealed: true }], { voteInfo: votes }),
    ]) {
      expect(markup).not.toContain('aria-pressed');
      expect(markup).not.toContain('2 votes');
      expect(markup).not.toContain('your vote');
      expect(markup).not.toContain('/assets/ui/avatar_');
      expect(markup).not.toContain('classic-card--majority');
    }
  });

  it('gives every shipped picture a distinct description and card number', () => {
    const files = readdirSync(new URL('../../public/assets/cards/', import.meta.url)).filter((file) =>
      file.endsWith('.png'),
    );
    expect(files.length).toBeGreaterThan(0);
    const cards = files.map((file, id) => ({ ...card, id, content: file.replace('.png', '') }));
    const markup = render(cards, { gameState: { cards, mode: 'pictures', config } });
    const labels = buttons(markup).map((control) => control.match(/aria-label="([^"]+)"/)![1]!);
    expect(labels).toHaveLength(files.length);
    expect(new Set(labels.map((label) => label.split(', row')[0])).size).toBe(files.length);
    expect(labels.every((label) => /^Picture \d+: .+, row/.test(label))).toBe(true);
    expect(markup).toContain('Picture 1: Laughing man riding a tiny red bicycle with a flat rear tire');
    expect(markup).toContain('Picture 24: Laughing scientist with spiky hair');
    expect(markup).toContain('/assets/cards/card_01.png');
    expect(markup).toContain('>#1</span>');
  });
});
