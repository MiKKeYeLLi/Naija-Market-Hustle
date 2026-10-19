import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, loadBestScore, loadSoundOn, saveSoundOn, type KeyValueStore } from './storage';

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
