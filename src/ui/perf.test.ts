// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { PerfOverlay } from './perf';

afterEach(() => {
  document.body.innerHTML = '';
});

const stats = { calls: 21, triangles: 3100, geometries: 24 };

function run(overlay: PerfOverlay, from: number, frames: number, frameMs: number): number {
  let t = from;
  for (let i = 0; i < frames; i++) {
    t += frameMs;
    overlay.frame(t, stats);
  }
  return t;
}

describe('PerfOverlay', () => {
  it('reports fps over the last second and the round\'s worst second', () => {
    const root = document.createElement('div');
    const overlay = new PerfOverlay(root);
    // Two seconds per segment, so at least one whole one-second window falls inside each.
    let t = run(overlay, 0, 121, 1000 / 60);
    expect(overlay.snapshot.fps).toBeCloseTo(60, 0);
    t = run(overlay, t, 60, 1000 / 30);
    expect(overlay.snapshot.fps).toBeCloseTo(30, 0);
    run(overlay, t, 121, 1000 / 60);
    expect(overlay.snapshot.fps).toBeCloseTo(60, 0);
    expect(overlay.snapshot.worstFps).toBeCloseTo(30, 0);
    expect(overlay.snapshot.longestFrameMs).toBeCloseTo(1000 / 30, 1);
    expect(overlay.snapshot.calls).toBe(21);
  });

  it('starts the worst-case figures again for a new round', () => {
    const overlay = new PerfOverlay(document.createElement('div'));
    const t = run(overlay, 0, 40, 50); // 20 fps
    overlay.resetRound();
    run(overlay, t + 5000, 130, 1000 / 60); // the 5 s gap on a screen must not count as a frame
    expect(overlay.snapshot.worstFps).toBeGreaterThan(55);
    expect(overlay.snapshot.longestFrameMs).toBeLessThan(20);
  });

  it('writes the DOM about twice a second, not every frame', () => {
    const root = document.createElement('div');
    const overlay = new PerfOverlay(root);
    run(overlay, 0, 240, 1000 / 60); // four seconds, 240 frames
    expect(overlay.writes).toBeGreaterThanOrEqual(7);
    expect(overlay.writes).toBeLessThanOrEqual(9);
    expect(root.querySelector('.perf-overlay')!.textContent).toContain('21 calls');
  });
});
