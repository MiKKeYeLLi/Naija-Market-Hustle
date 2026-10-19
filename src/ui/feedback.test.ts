// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { FeedbackEvent } from '../game/Game';
import type { ItemTypeId } from '../game/items';
import styles from '../styles.css?raw';
import { Feedback, LABEL_POOL, SHAKE_MS, isPenalty, labelFor } from './feedback';

afterEach(() => {
  document.body.innerHTML = '';
});

const event = (type: 'catch' | 'miss', itemType: ItemTypeId, cash: number, lives: number): FeedbackEvent => ({
  type,
  item: { id: 1, type: itemType, x: 1.2, y: 0, speed: 4, resolved: true },
  applied: { cash, lives },
});

describe('labelFor', () => {
  it('shows the amount a fresh catch added', () => {
    expect(labelFor(event('catch', 'pepper', 150, 0))).toEqual({ text: '+₦150', tone: 'gain' });
  });

  it('shows the amount a hazard actually took', () => {
    expect(labelFor(event('catch', 'rottenPepper', -150, -1))).toEqual({ text: '−₦150', tone: 'loss' });
    // ₦50 in hand: only ₦50 could come off.
    expect(labelFor(event('catch', 'rottenPepper', -50, -1))).toEqual({ text: '−₦50', tone: 'loss' });
    // ₦0 in hand: no cash lost, just the life.
    expect(labelFor(event('catch', 'rottenTomato', 0, -1))).toEqual({ text: '−1 life', tone: 'loss' });
  });

  it('labels a missed fresh item and stays quiet for a missed hazard', () => {
    expect(labelFor(event('miss', 'corn', 0, -1))).toEqual({ text: 'Missed! −1 life', tone: 'loss' });
    expect(labelFor(event('miss', 'rottenTomato', 0, 0))).toBeNull();
  });

  it('counts anything that cost a life as a penalty', () => {
    expect(isPenalty(event('catch', 'tomato', 100, 0))).toBe(false);
    expect(isPenalty(event('catch', 'rottenTomato', 0, -1))).toBe(true);
    expect(isPenalty(event('miss', 'onion', 0, -1))).toBe(true);
    expect(isPenalty(event('miss', 'rottenPepper', 0, 0))).toBe(false);
  });
});

function mount(reduced = false) {
  const root = document.createElement('div');
  const canvas = document.createElement('canvas');
  document.body.append(root, canvas);
  const projected: Array<[number, number]> = [];
  const feedback = new Feedback(root, {
    project: (x, y) => (projected.push([x, y]), { x: 100 + x * 10, y: 500 - y * 10 }),
    shakeTargets: [canvas],
    reducedMotion: () => reduced,
  });
  return { root, canvas, feedback, projected };
}

describe('Feedback', () => {
  it('floats a label with the right amount at the projected catch point', () => {
    const { root, feedback, projected } = mount();
    feedback.handle(event('catch', 'plantain', 200, 0));
    const label = root.querySelector<HTMLElement>('.cash-label.is-floating')!;
    expect(label.textContent).toBe('+₦200');
    expect(label.dataset.tone).toBe('gain');
    expect(projected[0][0]).toBe(1.2); // the item's lane
    expect(label.style.left).toBe(`${100 + 1.2 * 10}px`);
  });

  it('flashes and shakes on a penalty, not on a fresh catch', () => {
    const { root, canvas, feedback } = mount();
    feedback.handle(event('catch', 'tomato', 100, 0));
    expect(root.querySelector('.penalty-flash')!.classList.contains('is-flashing')).toBe(false);
    expect(canvas.classList.contains('is-shaking')).toBe(false);

    feedback.handle(event('catch', 'rottenTomato', -100, -1));
    expect(root.querySelector('.penalty-flash')!.classList.contains('is-flashing')).toBe(true);
    expect(canvas.classList.contains('is-shaking')).toBe(true);
    expect(feedback.shown).toEqual({ labels: 2, flashes: 1, shakes: 1 });
  });

  it('skips the flash and shake under reduced motion, and keeps labels still', () => {
    const { root, canvas, feedback } = mount(true);
    feedback.handle(event('miss', 'onion', 0, -1));
    expect(root.querySelector('.penalty-flash')!.classList.contains('is-flashing')).toBe(false);
    expect(canvas.classList.contains('is-shaking')).toBe(false);
    const label = root.querySelector<HTMLElement>('.cash-label')!;
    expect(label.classList.contains('is-still')).toBe(true);
    expect(label.classList.contains('is-floating')).toBe(false);
    expect(label.textContent).toBe('Missed! −1 life');
    expect(feedback.shown).toEqual({ labels: 1, flashes: 0, shakes: 0 });
  });

  it('reuses a fixed pool: no elements are created after construction', () => {
    const { root, feedback } = mount();
    const elements = root.querySelectorAll('*').length;
    expect(root.querySelectorAll('.cash-label')).toHaveLength(LABEL_POOL);
    for (let i = 0; i < 200; i++) feedback.handle(event(i % 3 ? 'catch' : 'miss', i % 2 ? 'corn' : 'rottenTomato', i % 2 ? 80 : -100, i % 2 ? 0 : -1));
    expect(root.querySelectorAll('*').length).toBe(elements);
  });

  it('clears every running effect on reset', () => {
    const { root, canvas, feedback } = mount();
    feedback.handle(event('catch', 'rottenPepper', -150, -1));
    feedback.clear();
    expect(root.querySelectorAll('.is-floating, .is-still, .is-flashing')).toHaveLength(0);
    expect(canvas.classList.contains('is-shaking')).toBe(false);
  });

  it('removes its elements on dispose', () => {
    const { root, feedback } = mount();
    feedback.dispose();
    expect(root.children).toHaveLength(0);
  });
});

describe('shake duration', () => {
  it('stays under 200 ms, in the constant and in the stylesheet', () => {
    expect(SHAKE_MS).toBeLessThan(200);
    expect(styles).toContain(`animation: screen-shake ${SHAKE_MS}ms`);
  });

  it('is turned off by the reduced-motion media query in the stylesheet too', () => {
    const block = styles.slice(styles.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const selector of ['.heart.is-lost', '.penalty-flash.is-flashing', '#game-canvas.is-shaking']) {
      expect(block).toContain(selector);
    }
    expect(block).toContain('animation: none');
  });
});
