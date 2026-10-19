// Best score and sound preference in localStorage (NMH-14 reads, NMH-19 completes saving).
// Every access is wrapped: private browsing or blocked storage must never break the game.

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const BEST_SCORE_KEY = 'nmh.bestScore';
const SOUND_KEY = 'nmh.soundOn';

// localStorage itself can throw on access when storage is blocked, so resolve it lazily and safely.
function browserStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(key: string, store: KeyValueStore | null): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string, store: KeyValueStore | null): boolean {
  try {
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// ₦0 on a first visit, or if the stored value is missing, unreadable or nonsense.
export function loadBestScore(store: KeyValueStore | null = browserStore()): number {
  const value = Number(read(BEST_SCORE_KEY, store));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// Sound defaults to on; only an explicit "false" turns it off.
export function loadSoundOn(store: KeyValueStore | null = browserStore()): boolean {
  return read(SOUND_KEY, store) !== 'false';
}

// Returns whether the preference was persisted; the in-memory toggle works either way.
export function saveSoundOn(on: boolean, store: KeyValueStore | null = browserStore()): boolean {
  return write(SOUND_KEY, String(on), store);
}

export const STORAGE_KEYS = { bestScore: BEST_SCORE_KEY, sound: SOUND_KEY } as const;
