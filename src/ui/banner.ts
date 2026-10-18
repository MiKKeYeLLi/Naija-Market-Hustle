// Phase banner: a short announcement over the play area when the difficulty phase changes.

import type { Phase } from '../game/spawner';

const PHASE_TEXT: Record<Phase, string> = {
  warmUp: 'Warm-up',
  rushHour: 'Rush hour!',
  marketMadness: 'Market madness!',
};

// Long enough to read, short enough to clear before the next items reach the basket.
const SHOW_MS = 1800;

export class PhaseBanner {
  private readonly element: HTMLDivElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'phase-banner';
    // Screen readers announce the phase without stealing focus.
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    root.append(this.element);
  }

  show(phase: Phase): void {
    this.element.textContent = PHASE_TEXT[phase];
    this.element.dataset.phase = phase;
    // Restart the CSS animation if a banner is already showing.
    this.element.classList.remove('is-visible');
    void this.element.offsetWidth;
    this.element.classList.add('is-visible');
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), SHOW_MS);
  }

  hide(): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.element.classList.remove('is-visible');
  }

  dispose(): void {
    this.hide();
    this.element.remove();
  }
}
