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
