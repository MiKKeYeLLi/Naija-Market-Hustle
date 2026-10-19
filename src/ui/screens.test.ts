// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game, type FrameScheduler } from '../game/Game';
import { ROUND_DURATION } from '../game/state';
import { PauseScreen, StartScreen } from './screens';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(overrides: Partial<ConstructorParameters<typeof StartScreen>[1]> = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  const onStart = vi.fn();
  const onSoundChange = vi.fn();
  const screen = new StartScreen(root, { soundOn: true, onStart, onSoundChange, ...overrides });
  const q = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  return { root, screen, onStart, onSoundChange, q };
}

describe('StartScreen', () => {
  it('shows the title, three instruction lines, best score and both buttons', () => {
    const { screen, q, root } = mount();
    screen.show(0);
    expect(q('h1').textContent).toBe('Naija Market Hustle');
    const lines = [...root.querySelectorAll('.instructions li')].map((li) => li.textContent?.trim());
    expect(lines).toEqual([
      'Catch fresh produce for cash',
      '✕Rotten goods cost cash and a life',
      '⇆Drag or use the arrow keys to move the basket',
    ]);
    expect(q('[data-start]').textContent).toBe('Start Market Day');
    expect(q('[data-sound]').textContent).toBe('Sound: on');
    expect(screen.isVisible).toBe(true);
  });

  it('shows ₦0 best score on a first visit and formats saved scores', () => {
    const { screen, q } = mount();
    screen.show(0);
    expect(q('[data-best]').textContent).toBe('₦0');
    screen.show(12500);
    expect(q('[data-best]').textContent).toBe('₦12,500');
  });

  it('hides the decorative marks from screen readers', () => {
    const { root } = mount();
    const marks = [...root.querySelectorAll('.instruction-mark')];
    expect(marks).toHaveLength(3);
    for (const mark of marks) expect(mark.getAttribute('aria-hidden')).toBe('true');
  });

  it('calls onStart when Start Market Day is pressed', () => {
    const { q, onStart } = mount();
    q<HTMLButtonElement>('[data-start]').click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('toggles sound, reflects it with aria-pressed and reports each change', () => {
    const { q, onSoundChange } = mount({ soundOn: true });
    const toggle = q<HTMLButtonElement>('[data-sound]');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toBe('Sound: off');
    toggle.click();
    expect(onSoundChange.mock.calls).toEqual([[false], [true]]);
  });

  it('starts from a saved sound-off preference', () => {
    const { q } = mount({ soundOn: false });
    expect(q('[data-sound]').textContent).toBe('Sound: off');
  });

  it('focuses the start button when shown, and hides', () => {
    const { screen, q } = mount();
    screen.show(0);
    expect(document.activeElement).toBe(q('[data-start]'));
    screen.hide();
    expect(screen.isVisible).toBe(false);
  });

  it('removes itself and its listeners on dispose', () => {
    const { screen, root, q, onStart } = mount();
    const button = q<HTMLButtonElement>('[data-start]');
    screen.dispose();
    expect(root.children).toHaveLength(0);
    button.click();
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('start screen with the game', () => {
  it('keeps the timer at 90 until Start Market Day is pressed', () => {
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    const frame = (ms: number) => {
      time += ms;
      const cb = queued;
      queued = null;
      cb?.();
    };

    const root = document.createElement('div');
    let game: Game | null = null;
    const screen = new StartScreen(root, { soundOn: true, onStart: () => game!.start(), onSoundChange: () => {} });
    game = new Game({
      scheduler,
      bestScore: 3000,
      onStatusChange: (status) => {
        if (status === 'playing') screen.hide();
      },
    });
    screen.show(game.state.bestScore);

    // Ten idle seconds with the screen up: nothing moves.
    for (let i = 0; i < 200; i++) frame(50);
    expect(game.state.status).toBe('ready');
    expect(game.state.timeRemaining).toBe(ROUND_DURATION);
    expect(root.querySelector('[data-best]')!.textContent).toBe('₦3,000');

    root.querySelector<HTMLButtonElement>('[data-start]')!.click();
    expect(game.state.status).toBe('playing');
    expect(screen.isVisible).toBe(false);
    frame(16);
    frame(16);
    expect(game.state.timeRemaining).toBeLessThan(ROUND_DURATION);
  });
});

describe('PauseScreen', () => {
  function mountPause() {
    const root = document.createElement('div');
    document.body.append(root);
    const onResume = vi.fn();
    const onRestart = vi.fn();
    const screen = new PauseScreen(root, { onResume, onRestart });
    return { root, screen, onResume, onRestart };
  }

  it('starts hidden, then shows Paused with Resume focused and Restart', () => {
    const { root, screen } = mountPause();
    expect(screen.isVisible).toBe(false);
    screen.show();
    expect(screen.isVisible).toBe(true);
    expect(root.querySelector('h2')!.textContent).toBe('Paused');
    expect(document.activeElement?.textContent).toBe('Resume');
    expect(root.querySelector('[data-restart]')!.textContent).toBe('Restart');
  });

  it('calls back for Resume and Restart', () => {
    const { root, onResume, onRestart } = mountPause();
    root.querySelector<HTMLButtonElement>('[data-resume]')!.click();
    root.querySelector<HTMLButtonElement>('[data-restart]')!.click();
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('removes itself and its listeners on dispose', () => {
    const { root, screen, onResume } = mountPause();
    const resume = root.querySelector<HTMLButtonElement>('[data-resume]')!;
    screen.dispose();
    resume.click();
    expect(onResume).not.toHaveBeenCalled();
    expect(root.children).toHaveLength(0);
  });

  it('Restart from pause gives a fresh round with the best score kept', () => {
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    const frame = (ms: number) => {
      time += ms;
      const cb = queued;
      queued = null;
      cb?.();
    };
    const game = new Game({ scheduler, bestScore: 900 });
    const root = document.createElement('div');
    new PauseScreen(root, {
      onResume: () => game.resume(),
      onRestart: () => {
        game.reset();
        game.start();
      },
    });
    frame(16);
    game.start();
    for (let i = 0; i < 100; i++) frame(50);
    game.pause();

    root.querySelector<HTMLButtonElement>('[data-restart]')!.click();
    expect(game.state.status).toBe('playing');
    expect(game.state.timeRemaining).toBe(ROUND_DURATION);
    expect(game.state.items).toEqual([]);
    expect([game.state.cash, game.state.lives]).toEqual([0, 3]);
    expect(game.state.bestScore).toBe(900);
  });
});
