// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Game, type FrameScheduler } from '../game/Game';
import { PLAY_AREA } from '../game/playArea';
import { ROUND_DURATION, createInitialState, type GameState } from '../game/state';
import { ResultsScreen, performanceMessage } from './screens';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('performanceMessage', () => {
  it.each([
    [0, 'Small small, e go better.'],
    [1999, 'Small small, e go better.'],
    [2000, 'Market champion in the making.'],
    [3500, 'Market champion in the making.'],
    [5000, 'Market champion in the making.'],
    [5001, 'Oga of the market!'],
    [48_000, 'Oga of the market!'],
  ])('₦%i → %s', (cash, message) => {
    expect(performanceMessage(cash)).toBe(message);
  });
});

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  let playAgain = 0;
  const screen = new ResultsScreen(root, { onPlayAgain: () => playAgain++ });
  const text = (name: string) => root.querySelector(`[data-field="${name}"]`)!.textContent;
  const badge = () => root.querySelector<HTMLElement>('[data-badge]')!;
  return { root, screen, text, badge, playAgainCount: () => playAgain };
}

const ended = (overrides: Partial<GameState>): GameState => ({
  ...createInitialState(),
  status: 'gameOver',
  endReason: 'time',
  ...overrides,
});

describe('ResultsScreen', () => {
  it('shows final cash, fresh and rotten counts, lives left and the end reason', () => {
    const { screen, text } = mount();
    screen.show(ended({ cash: 3450, freshCaught: 31, rottenCaught: 4, lives: 1, endReason: 'time', timeRemaining: 0 }));
    expect(text('title')).toBe("Time's up!");
    expect(text('reason')).toBe('The market is closing for the day.');
    expect(text('cash')).toBe('₦3,450');
    expect(text('fresh')).toBe('31');
    expect(text('rotten')).toBe('4');
    expect(text('lives')).toBe('1 of 3');
    expect(text('message')).toBe('Market champion in the making.');
  });

  it('names an out-of-lives ending', () => {
    const { screen, text } = mount();
    screen.show(ended({ endReason: 'lives', lives: 0, cash: 800 }));
    expect(text('title')).toBe('Out of lives!');
    expect(text('lives')).toBe('0 of 3');
    expect(text('message')).toBe('Small small, e go better.');
  });

  it('shows the New best badge only for a new best', () => {
    const { screen, badge } = mount();
    screen.show(ended({ cash: 6000, isNewBest: true }));
    expect(badge().hidden).toBe(false);
    expect(badge().textContent).toBe('New best!');
    screen.show(ended({ cash: 6000, isNewBest: false }));
    expect(badge().hidden).toBe(true);
  });

  it('focuses Play Again and calls back when pressed', () => {
    const { screen, root, playAgainCount } = mount();
    screen.show(ended({}));
    const button = root.querySelector<HTMLButtonElement>('[data-play-again]')!;
    expect(document.activeElement).toBe(button);
    button.click();
    expect(playAgainCount()).toBe(1);
  });

  it('removes itself and its listener on dispose', () => {
    const { screen, root, playAgainCount } = mount();
    const button = root.querySelector<HTMLButtonElement>('[data-play-again]')!;
    screen.dispose();
    button.click();
    expect(playAgainCount()).toBe(0);
    expect(root.children).toHaveLength(0);
  });
});

// The game with the results screen wired like main.ts: shown on gameOver, Play Again = reset + start.
function playThrough(bestScore = 0) {
  let time = 0;
  let queued: (() => void) | null = null;
  const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
  const root = document.createElement('div');
  document.body.append(root);
  let game: Game;
  const screen = new ResultsScreen(root, {
    onPlayAgain: () => {
      game.reset();
      game.start();
    },
  });
  game = new Game({
    scheduler,
    bestScore,
    // 0.5: fresh items in the centre lane under the still basket, so rounds run to time.
    random: () => 0.5,
    onStatusChange: (status) => {
      if (status === 'gameOver') screen.show(game.state);
      else screen.hide();
    },
  });
  const frame = (ms = 50) => {
    time += ms;
    const cb = queued;
    queued = null;
    cb?.();
  };
  frame();
  const state = () => game.state as GameState;
  // Ends the current round with `cash` on the board, by time.
  const finishWith = (cash: number) => {
    state().cash = cash;
    state().items = [];
    state().timeRemaining = 0.01;
    frame();
    frame();
  };
  const playAgain = () => root.querySelector<HTMLButtonElement>('[data-play-again]')!.click();
  return { game, screen, frame, state, finishWith, playAgain, root };
}

describe('results with the game', () => {
  it('appears once per round, even with many frames after the end', () => {
    const { game, screen, finishWith, frame, playAgain } = playThrough();
    for (let round = 1; round <= 3; round++) {
      if (round === 1) game.start(); // later rounds are started by Play Again
      finishWith(100 * round);
      for (let i = 0; i < 100; i++) frame();
      expect(screen.shows).toBe(round);
      expect(screen.isVisible).toBe(true);
      playAgain();
      expect(screen.isVisible).toBe(false);
    }
  });

  it('appears once when the last life and the timer go in the same frame', () => {
    const { game, screen, state, frame, root } = playThrough();
    game.start();
    frame();
    state().lives = 1;
    state().timeRemaining = 0.01;
    state().items = [{ id: 999_999, type: 'tomato', x: 3.6, y: PLAY_AREA.bottom - 0.39, speed: 8, resolved: false }];
    frame(16);
    for (let i = 0; i < 50; i++) frame();
    expect(screen.shows).toBe(1);
    expect(root.querySelector('[data-field="title"]')!.textContent).toBe('Out of lives!');
  });

  it('badges a new best only when final cash beats the best from before the round', () => {
    const { game, finishWith, playAgain, root } = playThrough(3000);
    const badgeShown = () => !root.querySelector<HTMLElement>('[data-badge]')!.hidden;
    game.start();

    finishWith(2500); // below the saved best
    expect(badgeShown()).toBe(false);
    expect(game.state.bestScore).toBe(3000);

    playAgain();
    finishWith(3000); // equal is not a new best
    expect(badgeShown()).toBe(false);

    playAgain();
    finishWith(4200); // beats it
    expect(badgeShown()).toBe(true);
    expect(game.state.bestScore).toBe(4200);

    playAgain();
    finishWith(4000); // would have beaten the old best, but not this session's 4,200
    expect(badgeShown()).toBe(false);
    expect(game.state.bestScore).toBe(4200);
  });

  it('does not badge a ₦0 first round', () => {
    const { game, finishWith, root } = playThrough(0);
    game.start();
    finishWith(0);
    expect(root.querySelector<HTMLElement>('[data-badge]')!.hidden).toBe(true);
  });

  it('Play Again starts a fresh round that keeps the best score', () => {
    const { game, finishWith, playAgain, frame } = playThrough(0);
    game.start();
    for (let i = 0; i < 40; i++) frame();
    finishWith(1800);
    playAgain();
    expect(game.state.status).toBe('playing');
    expect(game.state.timeRemaining).toBe(ROUND_DURATION);
    expect(game.state.items).toEqual([]);
    expect([game.state.cash, game.state.lives, game.state.freshCaught, game.state.rottenCaught]).toEqual([0, 3, 0, 0]);
    expect([game.state.endReason, game.state.isNewBest]).toEqual([null, false]);
    expect(game.state.bestScore).toBe(1800);
    frame();
    frame();
    expect(game.state.timeRemaining).toBeLessThan(ROUND_DURATION);
  });
});
