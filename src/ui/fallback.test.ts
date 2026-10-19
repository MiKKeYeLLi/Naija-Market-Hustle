// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Game, type FrameScheduler } from '../game/Game';
import { Hud } from './hud';
import { GraphicsNotice, showWebGLFallback, supportsWebGL } from './fallback';
import { PauseScreen, ResultsScreen, StartScreen } from './screens';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('supportsWebGL', () => {
  it('is false when no WebGL context can be created', () => {
    const doc = { createElement: () => ({ getContext: () => null }) } as unknown as Document;
    expect(supportsWebGL(doc)).toBe(false);
  });

  it('is false when probing throws', () => {
    const doc = {
      createElement: () => ({
        getContext: () => {
          throw new Error('blocked');
        },
      }),
    } as unknown as Document;
    expect(supportsWebGL(doc)).toBe(false);
  });

  it('is true when a context exists, and releases the probe context', () => {
    let released = false;
    const context = { getExtension: () => ({ loseContext: () => (released = true) }) };
    const doc = { createElement: () => ({ getContext: (kind: string) => (kind === 'webgl2' ? context : null) }) } as unknown as Document;
    expect(supportsWebGL(doc)).toBe(true);
    expect(released).toBe(true);
  });
});

describe('showWebGLFallback', () => {
  it('replaces the canvases with a clear message and what to try', () => {
    document.body.innerHTML = '<canvas id="backdrop-canvas"></canvas><canvas id="game-canvas"></canvas><div id="ui-root"></div>';
    const root = document.getElementById('ui-root')!;
    const screen = showWebGLFallback(root);
    expect((document.getElementById('game-canvas') as HTMLCanvasElement).hidden).toBe(true);
    expect((document.getElementById('backdrop-canvas') as HTMLCanvasElement).hidden).toBe(true);
    expect(screen.getAttribute('role')).toBe('alert');
    expect(screen.textContent).toContain("This browser can't show the 3D market");
    expect(screen.textContent).toContain('WebGL');
    expect(screen.querySelectorAll('.fallback-tips li')).toHaveLength(3);
  });
});

describe('GraphicsNotice', () => {
  it('shows and hides a status message', () => {
    const root = document.createElement('div');
    const notice = new GraphicsNotice(root);
    expect(notice.isVisible).toBe(false);
    notice.show('Graphics paused');
    expect(notice.isVisible).toBe(true);
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Graphics paused');
    notice.hide();
    expect(notice.isVisible).toBe(false);
  });
});

describe('every control is clearly labelled', () => {
  it('gives every button on every screen and in the HUD an accessible name', () => {
    const root = document.createElement('div');
    document.body.append(root);
    let game: Game | null = null;
    const scheduler: FrameScheduler = { now: () => 0, request: () => 1, cancel: () => {} };
    game = new Game({ scheduler });
    new StartScreen(root, { soundOn: true, onStart: () => {}, onSoundChange: () => {} }).show(0);
    new PauseScreen(root, { onResume: () => {}, onRestart: () => {} }).show();
    new ResultsScreen(root, { onPlayAgain: () => {} }).show({ ...game.state, endReason: 'time' });
    new Hud(root).show();

    const buttons = [...root.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    const names = buttons.map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim());
    for (const name of names) expect(name.length).toBeGreaterThan(2);
    expect(names).toEqual(expect.arrayContaining(['Start Market Day', 'Sound: on', 'Resume', 'Restart', 'Play Again', 'Pause']));
    // Toggle state is exposed, not just the label.
    expect(root.querySelector('[data-sound]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('speaks the HUD values with their meaning', () => {
    const root = document.createElement('div');
    const hud = new Hud(root);
    hud.update({ ...new Game({ scheduler: { now: () => 0, request: () => 1, cancel: () => {} } }).state, cash: 1250 });
    const spoken = root.querySelector('.hud')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(spoken).toContain('90 seconds left');
    expect(spoken).toContain('Cash ₦1,250');
    expect(root.querySelector('[data-lives]')!.getAttribute('aria-label')).toBe('Lives: 3 of 3');
  });
});
