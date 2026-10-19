// Start, pause and results screens (NMH-14, NMH-16, NMH-17). Plain DOM over the canvas.

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
