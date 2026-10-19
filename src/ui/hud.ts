// Timer, cash and lives HUD (NMH-15). A strip across the top that never takes pointer events,
// so drags that start on it still reach the canvas and move the basket.

import { MAX_LIVES, type GameState } from '../game/state';
import { formatNaira } from './format';

// Seconds left at or below which the timer turns urgent.
const URGENT_SECONDS = 10;

const HEART_PATH =
  'M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z';

// What the HUD shows, derived from state. The HUD compares these, not raw state, so it only
// touches the DOM when something visible changes.
export function hudValues(state: Readonly<GameState>): { seconds: number; cash: number; lives: number } {
  return {
    // Rounded up: 90 for the whole first second, 0 only once time has fully run out.
    seconds: Math.max(0, Math.ceil(state.timeRemaining - 1e-9)),
    cash: state.cash,
    lives: Math.min(MAX_LIVES, Math.max(0, state.lives)),
  };
}

export class Hud {
  readonly element: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly cash: HTMLElement;
  private readonly hearts: HTMLElement;
  private readonly heartIcons: HTMLElement[];
  private shown: { seconds: number; cash: number; lives: number } | null = null;
  // DOM writes so far; lets tests prove updates happen only on change.
  writes = 0;

  constructor(root: HTMLElement) {
    this.element = document.createElement('header');
    this.element.className = 'hud';
    this.element.hidden = true;
    this.element.innerHTML = `
      <div class="hud-cell hud-timer" aria-label="Time left">
        <svg class="hud-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>
        <span data-timer></span>
      </div>
      <div class="hud-cell hud-cash" aria-label="Cash"><span data-cash></span></div>
      <div class="hud-cell hud-lives" role="img" data-lives>
        ${Array.from({ length: MAX_LIVES }, () => `<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_PATH}"/></svg>`).join('')}
      </div>`;
    this.timer = this.element.querySelector('[data-timer]')!;
    this.cash = this.element.querySelector('[data-cash]')!;
    this.hearts = this.element.querySelector('[data-lives]')!;
    this.heartIcons = [...this.hearts.querySelectorAll<HTMLElement>('.heart')];
    root.append(this.element);
  }

  // Cheap to call every frame: only values that changed reach the DOM.
  update(state: Readonly<GameState>): void {
    const next = hudValues(state);
    const shown = this.shown;
    if (!shown || shown.seconds !== next.seconds) {
      this.timer.textContent = String(next.seconds);
      this.element.classList.toggle('is-urgent', next.seconds <= URGENT_SECONDS);
      this.writes++;
    }
    if (!shown || shown.cash !== next.cash) {
      this.cash.textContent = formatNaira(next.cash);
      this.writes++;
    }
    if (!shown || shown.lives !== next.lives) {
      // Lost hearts become outlines: the change reads by shape as well as colour.
      this.heartIcons.forEach((heart, i) => heart.classList.toggle('is-lost', i >= next.lives));
      this.hearts.setAttribute('aria-label', `Lives: ${next.lives} of ${MAX_LIVES}`);
      this.writes++;
    }
    this.shown = next;
  }

  show(): void {
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }

  // Full height including any safe-area padding, for the scene to reserve.
  get height(): number {
    return this.element.hidden ? 0 : this.element.getBoundingClientRect().bottom;
  }

  dispose(): void {
    this.element.remove();
  }
}
