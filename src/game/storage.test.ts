import { describe, expect, it } from 'vitest';
import { Game, type FrameScheduler } from './Game';
import { type GameState } from './state';
import { STORAGE_KEYS, SafeStore, loadBestScore, loadSoundOn, saveBestScore, saveSoundOn, type KeyValueStore } from './storage';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('SecurityError: storage blocked');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('loadBestScore', () => {
  it('is ₦0 on a first visit', () => {
    expect(loadBestScore(memoryStore())).toBe(0);
  });

  it('reads a saved best score', () => {
    expect(loadBestScore(memoryStore({ [STORAGE_KEYS.bestScore]: '4250' }))).toBe(4250);
  });

  it.each(['', 'abc', '-50', 'NaN', 'Infinity'])('treats a stored %j as ₦0', (value) => {
    expect(loadBestScore(memoryStore({ [STORAGE_KEYS.bestScore]: value }))).toBe(0);
  });

  it('is ₦0 when storage is blocked or missing', () => {
    expect(loadBestScore(throwingStore)).toBe(0);
    expect(loadBestScore(null)).toBe(0);
  });
});

describe('sound preference', () => {
  it('defaults to on', () => {
    expect(loadSoundOn(memoryStore())).toBe(true);
    expect(loadSoundOn(null)).toBe(true);
    expect(loadSoundOn(throwingStore)).toBe(true);
  });

  it('round-trips off and on', () => {
    const store = memoryStore();
    expect(saveSoundOn(false, store)).toBe(true);
    expect(loadSoundOn(store)).toBe(false);
    saveSoundOn(true, store);
    expect(loadSoundOn(store)).toBe(true);
  });

  it('reports a failed save instead of throwing', () => {
    expect(saveSoundOn(false, throwingStore)).toBe(false);
    expect(saveSoundOn(false, null)).toBe(false);
  });
});

describe('keys', () => {
  it('are namespaced as nmh.best and nmh.sound', () => {
    expect(STORAGE_KEYS).toEqual({ bestScore: 'nmh.best', sound: 'nmh.sound' });
    const store = memoryStore();
    saveBestScore(700, store);
    saveSoundOn(false, store);
    expect(store.data).toEqual({ 'nmh.best': '700', 'nmh.sound': 'false' });
  });
});

describe('saveBestScore', () => {
  it('saves a first best and survives a refresh (a fresh read of the same storage)', () => {
    const storage = memoryStore();
    expect(saveBestScore(3200, new SafeStore(() => storage))).toBe(true);
    // A refresh: new SafeStore, empty memory, same localStorage.
    expect(loadBestScore(new SafeStore(() => storage))).toBe(3200);
  });

  it('never lets a lower or equal score overwrite the best', () => {
    const store = memoryStore({ [STORAGE_KEYS.bestScore]: '5000' });
    expect(saveBestScore(4999, store)).toBe(false);
    expect(saveBestScore(5000, store)).toBe(false);
    expect(store.data[STORAGE_KEYS.bestScore]).toBe('5000');
    expect(saveBestScore(5001, store)).toBe(true);
    expect(store.data[STORAGE_KEYS.bestScore]).toBe('5001');
  });

  it('ignores nonsense scores', () => {
    const store = memoryStore();
    for (const score of [NaN, Infinity, -10, 0]) expect(saveBestScore(score, store)).toBe(false);
    expect(store.data).toEqual({});
  });

  it('stores whole naira', () => {
    const store = memoryStore();
    saveBestScore(1250.9, store);
    expect(store.data[STORAGE_KEYS.bestScore]).toBe('1250');
  });
});

describe('SafeStore', () => {
  it('passes through to working storage', () => {
    const storage = memoryStore({ x: '1' });
    const safe = new SafeStore(() => storage);
    expect(safe.getItem('x')).toBe('1');
    safe.setItem('y', '2');
    expect(storage.data.y).toBe('2');
  });

  it('keeps the session working in memory when storage is blocked', () => {
    const safe = new SafeStore(() => throwingStore);
    expect(loadBestScore(safe)).toBe(0);
    expect(saveBestScore(2400, safe)).toBe(true);
    expect(loadBestScore(safe)).toBe(2400);
    expect(saveBestScore(1800, safe)).toBe(false); // still never lowered
    saveSoundOn(false, safe);
    expect(loadSoundOn(safe)).toBe(false);
  });

  it('keeps the session working when there is no localStorage at all', () => {
    const safe = new SafeStore(() => null);
    saveBestScore(900, safe);
    expect(loadBestScore(safe)).toBe(900);
  });

  it('survives localStorage throwing on access itself', () => {
    const safe = new SafeStore(() => {
      throw new Error('SecurityError: The operation is insecure.');
    });
    expect(() => safe.getItem('x')).not.toThrow();
    expect(() => safe.setItem('x', '1')).not.toThrow();
    expect(safe.getItem('x')).toBe('1');
  });

  it('prefers the value written this session when the backing write fails (quota full)', () => {
    const storage = memoryStore({ [STORAGE_KEYS.bestScore]: '1000' });
    const full: KeyValueStore = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const safe = new SafeStore(() => full);
    expect(saveBestScore(4000, safe)).toBe(true);
    expect(loadBestScore(safe)).toBe(4000);
  });
});

describe('best score through the game', () => {
  // Plays rounds the way main.ts wires them: load at boot, save on gameOver when isNewBest.
  function session(storage: KeyValueStore) {
    const store = new SafeStore(() => storage);
    let time = 0;
    let queued: (() => void) | null = null;
    const scheduler: FrameScheduler = { now: () => time, request: (cb) => ((queued = cb), 1), cancel: () => (queued = null) };
    const game: Game = new Game({
      scheduler,
      random: () => 0.5,
      bestScore: loadBestScore(store),
      onStatusChange: (status) => {
        if (status === 'gameOver' && game.state.isNewBest) saveBestScore(game.state.bestScore, store);
      },
    });
    const frame = () => {
      time += 50;
      const cb = queued;
      queued = null;
      cb?.();
    };
    frame();
    const playRound = (cash: number) => {
      if (game.state.status !== 'ready') game.reset();
      game.start();
      frame();
      const state = game.state as GameState;
      state.items = [];
      state.cash = cash;
      state.timeRemaining = 0.01;
      frame();
    };
    return { game, playRound, store };
  }

  it('keeps the best across a refresh and never lowers it', () => {
    const storage = memoryStore();
    const first = session(storage);
    first.playRound(2600);
    first.playRound(1900);
    expect(storage.getItem(STORAGE_KEYS.bestScore)).toBe('2600');

    const afterRefresh = session(storage);
    expect(afterRefresh.game.state.bestScore).toBe(2600);
    afterRefresh.playRound(2000);
    expect(afterRefresh.game.state.isNewBest).toBe(false);
    afterRefresh.playRound(3100);
    expect(storage.getItem(STORAGE_KEYS.bestScore)).toBe('3100');
  });

  it('plays normally with storage blocked, keeping the best for the session', () => {
    const { game, playRound } = session(throwingStore);
    expect(game.state.bestScore).toBe(0);
    playRound(1500);
    expect(game.state.isNewBest).toBe(true);
    playRound(1200);
    expect(game.state.isNewBest).toBe(false);
    expect(game.state.bestScore).toBe(1500);
  });
});
