// ?perf overlay (NMH-23): a small readout for profiling a real round on a real phone.
// fps over the last second, the round's worst one-second fps and longest frame, and renderer.info.
// The DOM is written twice a second; per frame it only adds to two counters.

export interface RenderStats {
  calls: number;
  triangles: number;
  geometries: number;
}

const WINDOW_MS = 1000;
const REFRESH_MS = 500;

export class PerfOverlay {
  private readonly element: HTMLElement;
  private windowStart = 0;
  private framesInWindow = 0;
  private lastFrame = 0;
  private lastRefresh = 0;
  private fps = 0;
  // Since the round started.
  private worstFps = Infinity;
  private longestFrameMs = 0;
  private stats: RenderStats = { calls: 0, triangles: 0, geometries: 0 };
  // DOM writes so far; lets tests prove the readout is not rewritten every frame.
  writes = 0;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'perf-overlay';
    this.element.setAttribute('aria-hidden', 'true');
    root.append(this.element);
  }

  // Call once per rendered frame with a timestamp in ms and that frame's renderer.info numbers.
  frame(now: number, stats: RenderStats): void {
    this.stats = stats;
    if (this.lastFrame) this.longestFrameMs = Math.max(this.longestFrameMs, now - this.lastFrame);
    this.lastFrame = now;
    // The first frame only opens the window; frames are counted by the intervals that end in it.
    if (!this.windowStart) {
      this.windowStart = now;
      return;
    }
    this.framesInWindow++;

    const elapsed = now - this.windowStart;
    if (elapsed >= WINDOW_MS) {
      this.fps = (this.framesInWindow * 1000) / elapsed;
      this.worstFps = Math.min(this.worstFps, this.fps);
      this.windowStart = now;
      this.framesInWindow = 0;
    }
    if (now - this.lastRefresh >= REFRESH_MS) {
      this.lastRefresh = now;
      this.render();
    }
  }

  // A new round: start the worst-case figures again. Skips the gap from the screen in between.
  resetRound(): void {
    this.worstFps = Infinity;
    this.longestFrameMs = 0;
    this.lastFrame = 0;
    this.windowStart = 0;
    this.framesInWindow = 0;
  }

  get snapshot(): { fps: number; worstFps: number; longestFrameMs: number } & RenderStats {
    return { fps: this.fps, worstFps: this.worstFps, longestFrameMs: this.longestFrameMs, ...this.stats };
  }

  dispose(): void {
    this.element.remove();
  }

  private render(): void {
    this.writes++;
    const worst = Number.isFinite(this.worstFps) ? this.worstFps.toFixed(0) : '–';
    this.element.textContent =
      `${this.fps.toFixed(0)} fps · min ${worst} · max frame ${this.longestFrameMs.toFixed(0)} ms\n` +
      `${this.stats.calls} calls · ${this.stats.triangles} tris · ${this.stats.geometries} geo`;
  }
}
