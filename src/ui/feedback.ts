// Catch and penalty feedback in the DOM (NMH-21): floating cash labels, a red flash and a short
// screen shake. Everything is created once and reused; an effect only restarts a CSS animation.
// Particles live in render/effects.ts; the heart-loss animation is CSS on the HUD hearts.

import type { FeedbackEvent } from '../game/Game';
import { ITEM_DEFINITIONS } from '../game/items';
import { BASKET_MOUTH, PLAY_AREA } from '../game/playArea';
import { formatNaira } from './format';

export const LABEL_POOL = 10;
// Must stay under 200 ms (NMH-21); the CSS keyframes use the same duration.
export const SHAKE_MS = 160;

export interface FeedbackOptions {
  // Play-plane point to client pixels (scene.playToClient).
  project(x: number, y: number): { x: number; y: number };
  // Elements that shake together: both canvases, so the static backdrop moves with the scene.
  shakeTargets: HTMLElement[];
  reducedMotion(): boolean;
}

export type LabelTone = 'gain' | 'loss';

// What a label says for a feedback event, or null for no label (a missed hazard costs nothing).
export function labelFor(event: FeedbackEvent): { text: string; tone: LabelTone } | null {
  const fresh = ITEM_DEFINITIONS[event.item.type].kind === 'fresh';
  if (event.type === 'catch' && fresh) return { text: `+${formatNaira(event.applied.cash)}`, tone: 'gain' };
  if (event.type === 'catch') {
    // The amount that really came off: at ₦0 there is no cash to lose, only the life.
    const lost = -event.applied.cash;
    return { text: lost > 0 ? `−${formatNaira(lost)}` : '−1 life', tone: 'loss' };
  }
  return fresh ? { text: 'Missed! −1 life', tone: 'loss' } : null;
}

// True when the event should flash and shake: anything that cost a life.
export function isPenalty(event: FeedbackEvent): boolean {
  return event.applied.lives < 0;
}

export class Feedback {
  private readonly labels: HTMLElement[];
  private readonly flash: HTMLElement;
  private nextLabel = 0;
  // Counters for tests: how many labels, flashes and shakes have played.
  shown = { labels: 0, flashes: 0, shakes: 0 };

  constructor(
    private readonly root: HTMLElement,
    private readonly options: FeedbackOptions,
  ) {
    this.flash = document.createElement('div');
    this.flash.className = 'penalty-flash';
    this.flash.setAttribute('aria-hidden', 'true');
    root.append(this.flash);

    this.labels = Array.from({ length: LABEL_POOL }, () => {
      const label = document.createElement('div');
      label.className = 'cash-label';
      label.setAttribute('aria-hidden', 'true');
      root.append(label);
      return label;
    });
  }

  handle(event: FeedbackEvent): void {
    const label = labelFor(event);
    if (label) {
      // Catches float up from the basket mouth; misses from where the item left the bottom.
      const y = event.type === 'catch' ? BASKET_MOUTH.centerY + 0.6 : PLAY_AREA.bottom + 0.9;
      this.showLabel(label.text, label.tone, event.item.x, y);
    }
    if (isPenalty(event) && !this.options.reducedMotion()) {
      restart(this.flash, 'is-flashing');
      for (const target of this.options.shakeTargets) restart(target, 'is-shaking');
      this.shown.flashes++;
      this.shown.shakes++;
    }
  }

  clear(): void {
    for (const label of this.labels) label.classList.remove('is-floating', 'is-still');
    this.flash.classList.remove('is-flashing');
    for (const target of this.options.shakeTargets) target.classList.remove('is-shaking');
  }

  dispose(): void {
    this.clear();
    this.flash.remove();
    for (const label of this.labels) label.remove();
  }

  private showLabel(text: string, tone: LabelTone, x: number, y: number): void {
    const label = this.labels[this.nextLabel];
    this.nextLabel = (this.nextLabel + 1) % LABEL_POOL;
    const point = this.options.project(x, y);
    // Keep the label on screen even for the outermost lanes (when the root has been laid out).
    const width = this.root.clientWidth;
    const left = width > 96 ? Math.min(Math.max(point.x, 48), width - 48) : point.x;
    label.textContent = text;
    label.dataset.tone = tone;
    label.style.left = `${left}px`;
    label.style.top = `${point.y}px`;
    label.classList.remove('is-floating', 'is-still');
    // Reduced motion: the label still says what happened, it just doesn't drift.
    restart(label, this.options.reducedMotion() ? 'is-still' : 'is-floating');
    this.shown.labels++;
  }
}

// Replays a one-shot CSS animation on an element that may already be mid-animation.
function restart(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}
