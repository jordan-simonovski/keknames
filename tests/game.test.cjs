const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGame, submitClue, getPlayerView, endTurn } = require('../dist/server/game');
const { createDuetGame, submitDuetClue, processDuetGuess, getDuetPlayerView } = require('../dist/server/duet');
const { SetCategorySchema } = require('../dist/server/types');
const { CATEGORY_LIST } = require('../dist/server/wordlists');
const { voteMajority } = require('../dist/shared/voting');
const words = Array.from({ length: 25 }, (_, i) => `WORD${i}`);

test('every advertised category can actually be selected', () => {
  for (const category of CATEGORY_LIST) {
    assert.ok(SetCategorySchema.safeParse({ categoryId: category.id, difficulty: 'easy' }).success, category.id);
  }
});

test('zero clue permits continued guessing, and multiword clues are rejected', () => {
  const game = createGame('words', words);
  assert.ok('error' in submitClue(game, game.currentTeam, 'two words', 2));
  assert.equal(submitClue(game, game.currentTeam, 'ZXQ', 0).result, 'ok');
  assert.equal(game.guessesRemaining, 25);
});

test('operative and spectator payloads contain no hidden card types or image variants', () => {
  for (const mode of ['words', 'pictures']) {
    const game = createGame(mode, words);
    for (const role of ['operative', 'spectator']) {
      const view = getPlayerView(game, role);
      assert.ok(view.cards.every((c) => c.type === null && c.typeVariant === null));
    }
    assert.ok(getPlayerView(game, 'spymaster').cards.every((c) => c.type));
  }
});

test('one impatient voter cannot override the rest of the team', () => {
  assert.equal(voteMajority({ 0: ['a'] }, ['a', 'b', 'c']), null);
  assert.equal(voteMajority({ 0: ['a', 'b'] }, ['a', 'b', 'c']), 0);
  assert.equal(voteMajority({ 0: ['outsider', 'a', 'a'] }, ['a', 'b', 'c']), null);
});

test('repeated passes cannot grow broadcast history without a bound', () => {
  const game = createGame('words', words);
  for (let i = 0; i < 600; i++) {
    submitClue(game, game.currentTeam, 'ZXQ', 1);
    endTurn(game, game.currentTeam);
  }
  assert.equal(game.log.length, 500);
});

function duetCard(typeA, typeB) {
  const state = createDuetGame(words);
  state.currentTurn = 'A';
  state.cards[0] = { ...state.cards[0], typeA, typeB };
  submitDuetClue(state, 'ZXQ', 1);
  return state;
}

test('Duet guesses use the clue giver key even when the guesser sees an assassin', () => {
  const state = duetCard('green', 'assassin');
  assert.equal(processDuetGuess(state, 0).result, 'correct');
  assert.equal(state.greenFound, 1);
  assert.equal(state.winner, null);
});

test('Duet neutral guesses do not count hidden greens or permanently cover them', () => {
  const state = duetCard('neutral', 'green');
  assert.equal(processDuetGuess(state, 0).result, 'neutral');
  assert.equal(state.greenFound, 0);
  assert.equal(state.cards[0].revealed, false);
  assert.equal(state.currentTurn, 'B');
  submitDuetClue(state, 'ZXQ', 1);
  assert.equal(processDuetGuess(state, 0).result, 'correct');
  assert.equal(state.greenFound, 1);
});

test('Duet never serializes either hidden key to spectators or the partner', () => {
  const state = duetCard('green', 'assassin');
  processDuetGuess(state, 0);
  for (const side of ['A', 'B', null]) {
    const view = getDuetPlayerView(state, side);
    assert.equal(view.duetKey, undefined);
    assert.ok(view.cards.every((c) => c.typeA === undefined && c.typeB === undefined));
  }
});
