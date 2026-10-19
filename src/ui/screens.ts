// Start, pause and results screens (NMH-14, NMH-16, NMH-17). Plain DOM over the canvas.

import { MAX_LIVES, type EndReason, type GameState } from '../game/state';
import { formatNaira } from './format';

export interface StartScreenOptions {
  onStart(): void;
  onSoundChange(on: boolean): void;
  soundOn: boolean;
}

// Title, how to play, best score, Start Market Day and the sound toggle, over the idle scene.
export class StartScreen {
  private readonly element: HTMLElement;
  private readonly best: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly soundButton: HTMLButtonElement;
  private soundOn: boolean;

  constructor(
    root: HTMLElement,
    private readonly options: StartScreenOptions,
  ) {
    this.soundOn = options.soundOn;
    this.element = document.createElement('section');
    this.element.className = 'screen start-screen';
    this.element.setAttribute('aria-labelledby', 'start-title');
    this.element.innerHTML = `
      <div class="screen-card">
        <h1 id="start-title" class="screen-title">Naija Market Hustle</h1>
        <ul class="instructions">
          <li><span class="instruction-mark mark-fresh" aria-hidden="true"></span>Catch fresh produce for cash</li>
          <li><span class="instruction-mark mark-rotten" aria-hidden="true">✕</span>Rotten goods cost cash and a life</li>
          <li><span class="instruction-mark mark-move" aria-hidden="true">⇆</span>Drag or use the arrow keys to move the basket</li>
        </ul>
        <p class="best-score">Best <strong data-best></strong></p>
        <button type="button" class="button button-primary" data-start>Start Market Day</button>
        <button type="button" class="button button-quiet sound-toggle" data-sound></button>
      </div>`;
    this.best = this.element.querySelector('[data-best]')!;
    this.startButton = this.element.querySelector('[data-start]')!;
    this.soundButton = this.element.querySelector('[data-sound]')!;

    this.startButton.addEventListener('click', this.onStartClick);
    this.soundButton.addEventListener('click', this.onSoundClick);
    this.renderSound();
    root.append(this.element);
  }

  get isVisible(): boolean {
    return !this.element.hidden;
  }

  show(bestScore: number): void {
    this.best.textContent = formatNaira(bestScore);
    this.element.hidden = false;
    // Enter or Space starts straight away on desktop; no scroll jump on mobile.
    this.startButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.startButton.removeEventListener('click', this.onStartClick);
    this.soundButton.removeEventListener('click', this.onSoundClick);
    this.element.remove();
  }

  private onStartClick = (): void => {
    this.options.onStart();
  };

  private onSoundClick = (): void => {
    this.soundOn = !this.soundOn;
    this.renderSound();
    this.options.onSoundChange(this.soundOn);
  };

  private renderSound(): void {
    this.soundButton.setAttribute('aria-pressed', String(this.soundOn));
    this.soundButton.textContent = this.soundOn ? 'Sound: on' : 'Sound: off';
  }
}

export interface PauseScreenOptions {
  onResume(): void;
  onRestart(): void;
}

// The pause overlay: the round is frozen behind it until Resume (or P / Esc).
export class PauseScreen {
  private readonly element: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    private readonly options: PauseScreenOptions,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen pause-screen';
    this.element.setAttribute('aria-labelledby', 'pause-title');
    this.element.hidden = true;
    this.element.innerHTML = `
      <div class="screen-card">
        <h2 id="pause-title" class="screen-title">Paused</h2>
        <p class="screen-note">The market waits for you.<span class="key-hint"> Press P or Esc to carry on.</span></p>
        <button type="button" class="button button-primary" data-resume>Resume</button>
        <button type="button" class="button button-quiet" data-restart>Restart</button>
      </div>`;
    this.resumeButton = this.element.querySelector('[data-resume]')!;
    this.restartButton = this.element.querySelector('[data-restart]')!;
    this.resumeButton.addEventListener('click', this.onResumeClick);
    this.restartButton.addEventListener('click', this.onRestartClick);
    root.append(this.element);
  }

  get isVisible(): boolean {
    return !this.element.hidden;
  }

  show(): void {
    this.element.hidden = false;
    this.resumeButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.resumeButton.removeEventListener('click', this.onResumeClick);
    this.restartButton.removeEventListener('click', this.onRestartClick);
    this.element.remove();
  }

  private onResumeClick = (): void => {
    this.options.onResume();
  };

  private onRestartClick = (): void => {
    this.options.onRestart();
  };
}

// Placeholder tiers from the PRD, to tune after playtesting. ₦2,000 and ₦5,000 both sit in the middle.
export const PERFORMANCE_TIERS = [
  { below: 2000, message: 'Small small, e go better.' },
  { below: 5001, message: 'Market champion in the making.' },
  { below: Infinity, message: 'Oga of the market!' },
] as const;

export function performanceMessage(cash: number): string {
  return PERFORMANCE_TIERS.find((tier) => cash < tier.below)!.message;
}

const END_TITLES: Record<EndReason, string> = {
  time: "Time's up!",
  lives: 'Out of lives!',
};

export interface ResultsScreenOptions {
  onPlayAgain(): void;
}

// Round summary: why it ended, final cash, new-best badge, a tier message, the counts, Play Again.
export class ResultsScreen {
  private readonly element: HTMLElement;
  private readonly playAgainButton: HTMLButtonElement;
  private readonly fields: Record<'title' | 'reason' | 'cash' | 'message' | 'fresh' | 'rotten' | 'lives', HTMLElement>;
  private readonly badge: HTMLElement;
  // How many times show() has run; lets tests prove one results screen per round.
  shows = 0;

  constructor(
    root: HTMLElement,
    private readonly options: ResultsScreenOptions,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'screen results-screen';
    this.element.setAttribute('aria-labelledby', 'results-title');
    this.element.hidden = true;
    this.element.innerHTML = `
      <div class="screen-card">
        <h2 id="results-title" class="screen-title" data-field="title"></h2>
        <p class="results-reason" data-field="reason"></p>
        <p class="results-cash-label">Final cash</p>
        <p class="results-cash" data-field="cash"></p>
        <p class="new-best" data-badge hidden>New best!</p>
        <p class="results-message" data-field="message"></p>
        <dl class="results-stats">
          <div><dt>Fresh caught</dt><dd data-field="fresh"></dd></div>
          <div><dt>Rotten caught</dt><dd data-field="rotten"></dd></div>
          <div><dt>Lives left</dt><dd data-field="lives"></dd></div>
        </dl>
        <button type="button" class="button button-primary" data-play-again>Play Again</button>
      </div>`;
    const field = (name: string) => this.element.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
    this.fields = {
      title: field('title'),
      reason: field('reason'),
      cash: field('cash'),
      message: field('message'),
      fresh: field('fresh'),
      rotten: field('rotten'),
      lives: field('lives'),
    };
    this.badge = this.element.querySelector('[data-badge]')!;
    this.playAgainButton = this.element.querySelector('[data-play-again]')!;
    this.playAgainButton.addEventListener('click', this.onPlayAgainClick);
    root.append(this.element);
  }

  get isVisible(): boolean {
    return !this.element.hidden;
  }

  show(state: Readonly<GameState>): void {
    const reason = state.endReason ?? 'time';
    this.fields.title.textContent = END_TITLES[reason];
    this.fields.reason.textContent = reason === 'time' ? 'The market is closing for the day.' : 'Too many rotten deals and missed sales.';
    this.fields.cash.textContent = formatNaira(state.cash);
    this.fields.message.textContent = performanceMessage(state.cash);
    this.fields.fresh.textContent = String(state.freshCaught);
    this.fields.rotten.textContent = String(state.rottenCaught);
    this.fields.lives.textContent = `${state.lives} of ${MAX_LIVES}`;
    this.badge.hidden = !state.isNewBest;
    this.element.hidden = false;
    this.shows++;
    this.playAgainButton.focus({ preventScroll: true });
  }

  hide(): void {
    this.element.hidden = true;
  }

  dispose(): void {
    this.playAgainButton.removeEventListener('click', this.onPlayAgainClick);
    this.element.remove();
  }

  private onPlayAgainClick = (): void => {
    this.options.onPlayAgain();
  };
}
