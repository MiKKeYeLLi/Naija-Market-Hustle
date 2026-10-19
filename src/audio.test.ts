import { describe, expect, it } from 'vitest';
import { MUSIC_VOLUME, SoundBoard, type MusicElement, type SoundContext } from './audio';

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

describe('background music', () => {
  // A stand-in <audio> element that records what the game asks of it.
  function fakeMusic() {
    const calls: string[] = [];
    const element = {
      loop: false,
      preload: 'none' as HTMLMediaElement['preload'],
      currentTime: 37,
      volume: 1,
      playing: false,
      play() {
        calls.push('play');
        element.playing = true;
        return Promise.resolve();
      },
      pause() {
        calls.push('pause');
        element.playing = false;
      },
    };
    return { element, calls };
  }

  function setupMusic(options: { enabled?: boolean; webAudio?: boolean } = {}) {
    const { element, calls } = fakeMusic();
    const fake = fakeContext();
    const routed: number[] = [];
    if (options.webAudio !== false) {
      (fake.context as unknown as { createMediaElementSource: unknown }).createMediaElementSource = () => ({
        connect: (gain: { gain: { value: number } }) => {
          routed.push(gain.gain.value);
          return gain;
        },
      });
    }
    let created = 0;
    const board = new SoundBoard({
      enabled: options.enabled ?? true,
      createContext: () => fake.context,
      musicSrc: './assets/music.mp3',
      createMusicElement: (src) => {
        created++;
        expect(src).toBe('./assets/music.mp3');
        return element as unknown as MusicElement;
      },
    });
    return { board, element, calls, routed, created: () => created };
  }

  it('requests nothing before the first tap', () => {
    const { board, calls, created } = setupMusic();
    board.setMusicPlaying(true, true);
    expect(created()).toBe(0);
    expect(calls).toEqual([]);
    expect(board.isMusicPlaying).toBe(false);
  });

  it('loops the track and routes it through Web Audio at the music volume', () => {
    const { board, element, routed } = setupMusic();
    board.unlock();
    expect(element.loop).toBe(true);
    expect(element.preload).toBe('auto');
    expect(routed).toEqual([MUSIC_VOLUME]);
    expect(element.volume).toBe(1); // untouched: volume is set on the gain node instead
  });

  it('falls back to the element volume without Web Audio', () => {
    const { board, element } = setupMusic({ webAudio: false });
    board.unlock();
    expect(element.volume).toBe(MUSIC_VOLUME);
  });

  it('plays during a round, rewinds for a new round, and keeps its place after a pause', () => {
    const { board, element } = setupMusic();
    board.unlock();
    expect(element.playing).toBe(false); // the start screen is quiet

    board.setMusicPlaying(true, true); // new round
    expect(element.playing).toBe(true);
    expect(element.currentTime).toBe(0);

    element.currentTime = 42;
    board.setMusicPlaying(false); // paused
    expect(element.playing).toBe(false);
    board.setMusicPlaying(true); // resumed: no rewind
    expect(element.currentTime).toBe(42);
    expect(element.playing).toBe(true);

    board.setMusicPlaying(false); // game over
    expect(element.playing).toBe(false);
  });

  it('starts at once if the round began in the unlocking tap', () => {
    const { board, element } = setupMusic();
    board.setMusicPlaying(true, true);
    board.unlock();
    expect(element.playing).toBe(true);
  });

  it('is silenced by the sound toggle and comes back when it is turned on mid-round', () => {
    const { board, element } = setupMusic({ enabled: false });
    board.unlock();
    board.setMusicPlaying(true, true);
    expect(element.playing).toBe(false);
    board.setEnabled(true);
    expect(element.playing).toBe(true);
    board.setEnabled(false);
    expect(element.playing).toBe(false);
  });

  it('does not start when sound is turned on between rounds', () => {
    const { board, element } = setupMusic({ enabled: false });
    board.unlock();
    board.setEnabled(true);
    expect(element.playing).toBe(false);
  });

  it('never throws if the browser refuses to play', async () => {
    const { board, element } = setupMusic();
    element.play = () => Promise.reject(new DOMException('NotAllowedError'));
    board.unlock();
    expect(() => board.setMusicPlaying(true, true)).not.toThrow();
    await Promise.resolve();
  });

  it('stops on dispose', () => {
    const { board, element } = setupMusic();
    board.unlock();
    board.setMusicPlaying(true, true);
    board.dispose();
    expect(element.playing).toBe(false);
  });
});
