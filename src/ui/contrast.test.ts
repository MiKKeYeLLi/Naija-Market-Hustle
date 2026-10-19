import { describe, expect, it } from 'vitest';
import { HAZARD_ITEMS, FRESH_ITEMS } from '../game/items';
import { HAZARD_MARK, HAZARD_SPLOTCH } from '../render/models';
import styles from '../styles.css?raw';

// WCAG 2.x relative luminance and contrast ratio.
type Rgb = [number, number, number];
const hex = (value: string): Rgb => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// A colour at `alpha` composited over `under`.
const over = (top: Rgb, alpha: number, under: Rgb): Rgb => top.map((c, i) => c * alpha + under[i] * (1 - alpha)) as Rgb;

const WHITE: Rgb = [255, 255, 255];
const INK = hex('#2b1608');
const INK_SOFT = hex('#5c3a1e');
const CARD = hex('#fff6e3');
const CREAM = hex('#fff6e3');
// The HUD strip is translucent; judge it over pure white, the worst thing that can be behind it.
const HUD_MIN_ALPHA = 0.9;
const HUD = over([43, 22, 8], HUD_MIN_ALPHA, WHITE);

describe('the colours under test are the stylesheet\'s colours', () => {
  it.each([
    '--ink: #2b1608',
    '--ink-soft: #5c3a1e',
    '--card: #fff6e3',
    '--accent: #1f7a3a',
    'rgb(43 22 8 / 0.94), rgb(43 22 8 / 0.9)',
    'color: #ffb4a8',
    'fill: #ff5a4e',
    'stroke: rgb(255 246 227 / 0.7)',
    'border: 2px solid rgb(255 246 227 / 0.7)',
    'background: #f9c80e',
    'color: #17672f',
    'background: #b3261e',
    'background: #3b1f0e',
  ])('styles.css still contains %s', (declaration) => {
    expect(styles).toContain(declaration);
  });
});

describe('WCAG AA contrast', () => {
  // Normal text needs 4.5:1; non-text UI parts and graphics (icons, outlines) need 3:1.
  it.each<[string, Rgb, Rgb, number]>([
    ['HUD timer and labels on the strip', CREAM, HUD, 4.5],
    ['HUD urgent timer on the strip', hex('#ffb4a8'), HUD, 4.5],
    ['HUD cash pill', INK, CREAM, 4.5],
    ['Primary buttons (white on green)', WHITE, hex('#1f7a3a'), 4.5],
    ['Quiet buttons and notes (ink-soft on card)', INK_SOFT, CARD, 4.5],
    ['Card titles', INK, CARD, 4.5],
    ['Results stat labels', INK_SOFT, over(hex('#e9c98f'), 0.35, CARD), 4.5],
    ['New best badge', INK, hex('#f9c80e'), 4.5],
    ['Gain label', hex('#17672f'), CREAM, 4.5],
    ['Loss label', CREAM, hex('#b3261e'), 4.5],
    ['Rush hour banner', hex('#fff4d6'), hex('#3b1f0e'), 4.5],
    ['Market madness banner', hex('#fff4d6'), hex('#b3261e'), 4.5],
    ['Graphics notice', CREAM, INK, 4.5],
    ['start.ng profile card text', CREAM, INK, 4.5],
    ['start.ng sign-in button', INK, hex('#d8fd71'), 4.5],
    ['start.ng leaderboard line on the results card', hex('#145528'), CARD, 4.5],
    ['Hearts on the strip (graphic)', hex('#ff5a4e'), HUD, 3],
    ['Lost heart outline on the strip (graphic)', over(CREAM, 0.7, HUD), HUD, 3],
    ['Pause button border on the strip (UI part)', over(CREAM, 0.7, HUD), HUD, 3],
  ])('%s', (_name, foreground, background, minimum) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });
});

describe('hazards without colour', () => {
  it.each(HAZARD_ITEMS.map((item) => [item.label, item.colorKey]))(
    '%s: the light X and the dark splotch both stand out from the body by brightness',
    (_label, body) => {
      expect(contrast(hex(HAZARD_MARK), hex(body))).toBeGreaterThanOrEqual(3);
      expect(contrast(hex(HAZARD_SPLOTCH), hex(body))).toBeGreaterThanOrEqual(1.5);
      expect(contrast(hex(HAZARD_MARK), hex(HAZARD_SPLOTCH))).toBeGreaterThanOrEqual(7);
    },
  );

  it('no fresh item is as light as the X marker, so a light X only ever means "hazard"', () => {
    for (const item of FRESH_ITEMS) expect(luminance(hex(item.colorKey))).toBeLessThan(luminance(hex(HAZARD_MARK)));
  });
});
