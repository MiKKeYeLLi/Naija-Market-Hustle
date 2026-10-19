import { describe, expect, it } from 'vitest';
import { SoundBoard, type SoundContext } from './audio';

interface Note {
  type: string;
  frequencies: number[];
  start: number;
  stop: number;
  filtered: boolean;
}

// A recording stand-in for AudioContext: notes every oscillator, its pitch changes and timing.
function fakeContext(initialState: AudioContextState = 'suspended') {
  const notes: Note[] = [];
  let resumes = 0;
  const param = (onSet?: (value: number) => void) => ({
    value: 0,
    setValueAtTime(value: number) {
      onSet?.(value);
      return this;
    },
    exponentialRampToValueAtTime(value: number) {
      onSet?.(value);
      return this;
    },
    linearRampToValueAtTime() {
      return this;
    },
  });
  const node = () => ({ connect: (target: unknown) => target });
  const context = {
    state: initialState,
    currentTime: 1.5,
    destination: {},
    resume() {
      resumes++;
      context.state = 'running';
      return Promise.resolve();
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => {
      const filter = { ...node(), type: '', frequency: param() };
      return filter;
    },
    createOscillator: () => {
      const note: Note = { type: '', frequencies: [], start: NaN, stop: NaN, filtered: false };
      const oscillator = {
        frequency: param((value) => note.frequencies.push(value)),
        set type(value: string) {
          note.type = value;
        },
        connect(target: { type?: string }) {
          if (target.type === 'lowpass') note.filtered = true;
          return target;
        },
        start(at: number) {
          note.start = at;
          notes.push(note);
        },
        stop(at: number) {
          note.stop = at;
        },
      };
      return oscillator;
    },
  };
  return { context: context as unknown as SoundContext, notes, resumes: () => resumes };
}

class GestureTarget extends EventTarget {
  listeners = 0;
  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    this.listeners++;
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    this.listeners--;
    super.removeEventListener(type, listener, options);
  }
}

function setup(enabled = true) {
  const fake = fakeContext();
  let created = 0;
  const board = new SoundBoard({
    enabled,
    createContext: () => {
      created++;
      return fake.context;
    },
  });
  const target = new GestureTarget();
  board.listenForUnlock(target);
  return { board, target, created: () => created, ...fake };
}

describe('before the first user gesture', () => {
  it('creates no audio context and plays nothing', () => {
    const { board, notes, created } = setup();
    expect(board.play('catch')).toBe(false);
    expect(board.play('penalty')).toBe(false);
    expect(board.play('gameOver')).toBe(false);
    expect(created()).toBe(0);
    expect(notes).toEqual([]);
    expect(board.isUnlocked).toBe(false);
  });

  it.each(['pointerdown', 'keydown', 'touchend'])('unlocks on the first %s, once, and stops listening', (type) => {
    const { board, target, created, resumes } = setup();
    expect(target.listeners).toBe(3);
    target.dispatchEvent(new Event(type));
    expect(board.isUnlocked).toBe(true);
    expect(created()).toBe(1);
    expect(resumes()).toBe(1); // a suspended context is resumed inside the gesture
    expect(target.listeners).toBe(0);
    target.dispatchEvent(new Event(type));
    expect(created()).toBe(1);
  });
});

describe('after unlock', () => {
  function unlocked(enabled = true) {
    const s = setup(enabled);
    s.target.dispatchEvent(new Event('pointerdown'));
    return s;
  }

  it('plays three distinct sounds', () => {
    const { board, notes } = unlocked();
    const shape = (name: 'catch' | 'penalty' | 'gameOver') => {
      notes.length = 0;
      expect(board.play(name)).toBe(true);
      return notes.map((n) => `${n.type}:${n.frequencies.map(Math.round).join('>')}${n.filtered ? ':lowpass' : ''}`).join(' ');
    };
    const catchSound = shape('catch');
    const penalty = shape('penalty');
    const gameOver = shape('gameOver');
    expect(catchSound).toBe('triangle:880 triangle:1320'); // two rising notes
    expect(penalty).toBe('sawtooth:240>90:lowpass'); // one falling, muffled buzz
    expect(gameOver).toBe('triangle:659 triangle:523 triangle:392 triangle:523'); // a closing phrase
    expect(new Set([catchSound, penalty, gameOver]).size).toBe(3);
  });

  it('schedules sounds from now and stops every note', () => {
    const { board, notes } = unlocked();
    board.play('gameOver');
    for (const note of notes) {
      expect(note.start).toBeGreaterThanOrEqual(1.5); // currentTime
      expect(note.stop).toBeGreaterThan(note.start);
    }
    // The whole game-over phrase is short.
    expect(Math.max(...notes.map((n) => n.stop)) - 1.5).toBeLessThan(1.2);
  });

  it('is silent while the toggle is off, and plays again when it is turned back on', () => {
    const { board, notes } = unlocked(false);
    expect(board.play('catch')).toBe(false);
    expect(notes).toEqual([]);
    board.setEnabled(true);
    expect(board.play('catch')).toBe(true);
    board.setEnabled(false);
    notes.length = 0;
    board.play('penalty');
    expect(notes).toEqual([]);
  });
});

describe('without Web Audio', () => {
  it('stays silent and never throws', () => {
    const board = new SoundBoard({ enabled: true, createContext: () => null });
    board.unlock();
    expect(board.isUnlocked).toBe(true);
    expect(board.play('catch')).toBe(false);
  });

  it('survives a context that throws while playing', () => {
    const fake = fakeContext('running');
    (fake.context as unknown as { createOscillator: () => never }).createOscillator = () => {
      throw new Error('InvalidStateError');
    };
    const board = new SoundBoard({ enabled: true, createContext: () => fake.context });
    board.unlock();
    expect(() => board.play('gameOver')).not.toThrow();
    expect(board.play('gameOver')).toBe(false);
  });
});
