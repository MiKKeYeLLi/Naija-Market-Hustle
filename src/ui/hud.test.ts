// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Game, type FrameScheduler } from '../game/Game';
import { ROUND_DURATION, createInitialState, type GameState } from '../game/state';
import { Hud, hudValues } from './hud';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount() {
  const root = document.createElement('div');
  document.body.append(root);
  const hud = new Hud(root);
  hud.show();
  const text = (selector: string) => root.querySelector(selector)!.textContent;
  const lostHearts = () => root.querySelectorAll('.heart.is-lost').length;
  return { root, hud, text, lostHearts };
}

const stateWith = (overrides: Partial<GameState>): GameState => ({ ...createInitialState(), ...overrides });

describe('hudValues', () => {
  it('rounds the timer up: 90 for the first second, 0 only at the end', () => {
    expect(hudValues(stateWith({ timeRemaining: 90 })).seconds).toBe(90);
    expect(hudValues(stateWith({ timeRemaining: 89.01 })).seconds).toBe(90);
    expect(hudValues(stateWith({ timeRemaining: 89 })).seconds).toBe(89);
    expect(hudValues(stateWith({ timeRemaining: 0.2 })).seconds).toBe(1);
    expect(hudValues(stateWith({ timeRemaining: 0 })).seconds).toBe(0);
  });
});

describe('Hud', () => {
  it('shows the timer, cash with the naira sign and thousands separators, and three hearts', () => {
    const { hud, text, root, lostHearts } = mount();
    hud.update(stateWith({ timeRemaining: 90, cash: 1250, lives: 3 }));
    expect(text('[data-timer]')).toBe('90');
    expect(text('[data-cash]')).toBe('₦1,250');
    expect(root.querySelectorAll('.heart')).toHaveLength(3);
    expect(lostHearts()).toBe(0);
  });

  it('formats large cash totals', () => {
    const { hud, text } = mount();
    hud.update(stateWith({ cash: 1234567 }));
    expect(text('[data-cash]')).toBe('₦1,234,567');
  });

  it('reflects lives from 3 down to 0 by emptying hearts, with a spoken label', () => {
    const { hud, root, lostHearts } = mount();
    for (const lives of [3, 2, 1, 0]) {
      hud.update(stateWith({ lives }));
      expect(lostHearts()).toBe(3 - lives);
      expect(root.querySelector('[data-lives]')!.getAttribute('aria-label')).toBe(`Lives: ${lives} of 3`);
    }
    // The first hearts stay filled: lives empty from the right.
    const hearts = [...root.querySelectorAll('.heart')];
    hud.update(stateWith({ lives: 1 }));
    expect(hearts.map((h) => h.classList.contains('is-lost'))).toEqual([false, true, true]);
  });

  it('marks the last ten seconds as urgent', () => {
    const { hud, root } = mount();
    hud.update(stateWith({ timeRemaining: 11 }));
    expect(root.querySelector('.hud')!.classList.contains('is-urgent')).toBe(false);
    hud.update(stateWith({ timeRemaining: 10 }));
    expect(root.querySelector('.hud')!.classList.contains('is-urgent')).toBe(true);
  });

  it('touches the DOM only when a shown value changes', () => {
    const { hud, root } = mount();
    const element = root.querySelector('.hud')!;
    const observer = new MutationObserver(() => {});
    observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
    // takeRecords() reads pending mutations synchronously (callbacks would arrive later).
    const mutationsSince = () => observer.takeRecords().length;

    const state = stateWith({ timeRemaining: 90, cash: 0, lives: 3 });
    hud.update(state);
    expect(hud.writes).toBe(3); // timer, cash, lives once each
    expect(mutationsSince()).toBeGreaterThan(0);

    // Two seconds at 60 fps with only time moving: one timer write per second, nothing else.
    const firstWrites = hud.writes;
    for (let frame = 0; frame < 120; frame++) {
      state.timeRemaining -= 1 / 60;
      hud.update(state);
    }
    expect(hud.writes - firstWrites).toBe(2);
    mutationsSince();

    // Thirty frames with no change at all: no writes and not a single DOM mutation.
    const settledWrites = hud.writes;
    for (let frame = 0; frame < 30; frame++) hud.update(state);
    expect(hud.writes).toBe(settledWrites);
    expect(mutationsSince()).toBe(0);

    // A cash change writes only the cash.
    state.cash = 100;
    hud.update(state);
    expect(hud.writes).toBe(settledWrites + 1);
    observer.disconnect();
  });

  it('has nothing focusable or clickable inside it (yet)', () => {
    // pointer-events: none lives in the stylesheet, which happy-dom does not load; the live check
    // (a real touch on the HUD moving the basket) covers it. Here: nothing inside opts back in.
    const { root } = mount();
    const element = root.querySelector<HTMLElement>('.hud')!;
    expect(element.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
  });
});

describe('HUD with the game loop', () => {
  it('counts the timer from 90 to 0 over a round', () => {
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    const root = document.createElement('div');
    const hud = new Hud(root);
    const seen: string[] = [];
    // random 0.5: fresh items in the centre lane under the basket, so the round runs to time.
    const game = new Game({
      scheduler,
      random: () => 0.5,
      render: (state) => {
        hud.update(state);
        const shown = root.querySelector('[data-timer]')!.textContent!;
        if (seen.at(-1) !== shown) seen.push(shown);
      },
    });
    const frame = (ms: number) => {
      time += ms;
      const cb = queued;
      queued = null;
      cb?.();
    };
    frame(16);
    game.start();
    for (let i = 0; i < (ROUND_DURATION * 1000) / 50 + 40; i++) frame(50);

    expect(game.state.status).toBe('gameOver');
    expect(seen).toEqual(Array.from({ length: ROUND_DURATION + 1 }, (_, i) => String(ROUND_DURATION - i)));
    expect(root.querySelector('[data-cash]')!.textContent).toMatch(/^₦[\d,]+$/);
  });
});
