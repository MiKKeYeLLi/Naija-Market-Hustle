// Best score and sound preference persistence (NMH-14, NMH-19).
// Every access is wrapped: private browsing or blocked storage must never break the game. When
// localStorage is unavailable, values live in memory for the rest of the session instead.

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

export const STORAGE_KEYS = { bestScore: 'nmh.best', sound: 'nmh.sound' } as const;

// localStorage itself can throw on access when storage is blocked, so resolve it lazily and safely.
function browserStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// A store that never throws. Writes go to memory and, when possible, to the backing store; reads
// prefer memory, so a value written this session wins even if the backing write failed (blocked
// storage, quota). Values only in memory last until the page is closed.
export class SafeStore implements KeyValueStore {
  private readonly memory = new Map<string, string>();

  constructor(private readonly backing: () => KeyValueStore | null = browserStore) {}

  getItem(key: string): string | null {
    const remembered = this.memory.get(key);
    if (remembered !== undefined) return remembered;
    try {
      return this.backing()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      this.backing()?.setItem(key, value);
    } catch {
      // Blocked or full: the in-memory copy keeps the session working.
    }
  }
}

const defaultStore = new SafeStore();

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
export function loadBestScore(store: KeyValueStore | null = defaultStore): number {
  const value = Number(read(STORAGE_KEYS.bestScore, store));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// Saves `score` only if it beats the stored best, so a lower round can never overwrite it (even one
// from another tab). Returns whether the best changed.
export function saveBestScore(score: number, store: KeyValueStore | null = defaultStore): boolean {
  const best = Math.floor(score);
  if (!Number.isFinite(best) || best <= loadBestScore(store)) return false;
  return write(STORAGE_KEYS.bestScore, String(best), store);
}

// Sound defaults to on; only an explicit "false" turns it off.
export function loadSoundOn(store: KeyValueStore | null = defaultStore): boolean {
  return read(STORAGE_KEYS.sound, store) !== 'false';
}

// Returns whether the preference was stored; the in-memory toggle works either way.
export function saveSoundOn(on: boolean, store: KeyValueStore | null = defaultStore): boolean {
  return write(STORAGE_KEYS.sound, String(on), store);
}
