import { describe, expect, it } from 'vitest';
import { PLAY_AREA } from '../game/playArea';
import { computeFit } from './scene';

// Where the play area's top and bottom edges land on screen, in CSS pixels from the top.
function playAreaOnScreen(width: number, height: number, inset: number) {
  const { unitsPerPixel, cameraY } = computeFit(width, height, inset);
  const toScreenY = (worldY: number) => height / 2 - (worldY - cameraY) / unitsPerPixel;
  const toScreenX = (worldX: number) => width / 2 + worldX / unitsPerPixel;
  return {
    top: toScreenY(PLAY_AREA.top),
    bottom: toScreenY(PLAY_AREA.bottom),
    left: toScreenX(PLAY_AREA.left),
    right: toScreenX(PLAY_AREA.right),
  };
}

describe('computeFit', () => {
  it('matches the NMH-02 fit when nothing is reserved', () => {
    const fit = computeFit(360, 640, 0);
    expect(fit.cameraY).toBe(0);
    // 9:16 phone: the 4% margin on 16 units over 640 px.
    expect(fit.unitsPerPixel).toBeCloseTo((16 * 1.04) / 640, 9);
  });

  it.each([
    [360, 640, 56],
    [390, 844, 90],
    [1440, 900, 56],
    [320, 568, 56],
  ])('fits the whole play area below a %ix%i HUD inset of %ipx', (width, height, inset) => {
    const area = playAreaOnScreen(width, height, inset);
    expect(area.top).toBeGreaterThanOrEqual(inset);
    expect(area.bottom).toBeLessThanOrEqual(height);
    expect(area.left).toBeGreaterThanOrEqual(0);
    expect(area.right).toBeLessThanOrEqual(width);
    // Centred in the space below the inset.
    expect((area.top + area.bottom) / 2).toBeCloseTo(inset + (height - inset) / 2, 6);
    expect((area.left + area.right) / 2).toBeCloseTo(width / 2, 6);
  });

  it('keeps the same scale on both axes', () => {
    const { unitsPerPixel } = computeFit(360, 640, 56);
    const area = playAreaOnScreen(360, 640, 56);
    expect((area.right - area.left) * unitsPerPixel).toBeCloseTo(PLAY_AREA.width, 9);
    expect((area.bottom - area.top) * unitsPerPixel).toBeCloseTo(PLAY_AREA.height, 9);
  });
});
