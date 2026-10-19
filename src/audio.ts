// Catch, penalty and game-over sounds (NMH-22), synthesised with Web Audio: no files to load.
//
// Browsers only allow audio after a user gesture, so the AudioContext is not even created until the
// first tap, click or key press (unlock). Before that, and whenever sound is off, play() does nothing.
// Without Web Audio support the game is simply silent.

export type SoundName = 'catch' | 'penalty' | 'gameOver';

// The slice of AudioContext these sounds use, so tests can pass a recording stand-in.
export type SoundContext = Pick<
  AudioContext,
  'currentTime' | 'destination' | 'state' | 'resume' | 'createOscillator' | 'createGain' | 'createBiquadFilter'
>;

const MASTER_VOLUME = 0.3;
// Events that unlock audio. Capture phase on window, so they count wherever the tap lands.
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

function browserContext(): SoundContext | null {
  try {
    const Context =
      globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Context ? new Context() : null;
  } catch {
    return null;
  }
}

export interface SoundBoardOptions {
  enabled: boolean;
  createContext?: () => SoundContext | null;
}

export class SoundBoard {
  private context: SoundContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private enabled: boolean;
  private unlockTarget: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null = null;
  private readonly createContext: () => SoundContext | null;

  constructor(options: SoundBoardOptions) {
    this.enabled = options.enabled;
    this.createContext = options.createContext ?? browserContext;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  // Waits for the first gesture on `target` (window), then unlocks once and stops listening.
  listenForUnlock(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): void {
    if (this.unlocked || this.unlockTarget) return;
    this.unlockTarget = target;
    for (const type of UNLOCK_EVENTS) target.addEventListener(type, this.onGesture, { capture: true });
  }

  // Must run inside a user gesture: creates (or resumes) the context browsers keep suspended.
  unlock(): void {
    this.stopListening();
    if (this.unlocked) return;
    this.unlocked = true;
    this.context = this.createContext();
    if (!this.context) return;
    this.master = this.context.createGain();
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(this.context.destination);
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  play(name: SoundName): boolean {
    if (!this.enabled || !this.context || !this.master) return false;
    try {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      SOUNDS[name](this.context, this.master, this.context.currentTime);
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.stopListening();
  }

  private onGesture = (): void => {
    this.unlock();
  };

  private stopListening(): void {
    if (!this.unlockTarget) return;
    for (const type of UNLOCK_EVENTS) this.unlockTarget.removeEventListener(type, this.onGesture, { capture: true });
    this.unlockTarget = null;
  }
}

// One shaped tone: an oscillator through its own envelope into the master gain.
function tone(
  context: SoundContext,
  output: AudioNode,
  options: { type: OscillatorType; from: number; to?: number; start: number; duration: number; peak: number; lowpass?: number },
): void {
  const { type, from, to, start, duration, peak, lowpass } = options;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  if (to) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  let last: AudioNode = oscillator;
  if (lowpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(lowpass, start);
    last.connect(filter);
    last = filter;
  }
  last.connect(envelope);
  envelope.connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

// Three clearly different shapes: a bright rising ding, a low falling buzz, a short closing tune.
const SOUNDS: Record<SoundName, (context: SoundContext, output: AudioNode, now: number) => void> = {
  // Two quick rising notes, like coins landing in the basket.
  catch: (context, output, now) => {
    tone(context, output, { type: 'triangle', from: 880, start: now, duration: 0.09, peak: 0.6 });
    tone(context, output, { type: 'triangle', from: 1320, start: now + 0.06, duration: 0.14, peak: 0.5 });
  },
  // A muffled downward buzz: clearly "wrong" without being harsh.
  penalty: (context, output, now) => {
    tone(context, output, { type: 'sawtooth', from: 240, to: 90, start: now, duration: 0.28, peak: 0.55, lowpass: 900 });
  },
  // A short falling phrase (E, C, G) that settles back on C: the market closing.
  gameOver: (context, output, now) => {
    const notes = [659.25, 523.25, 392, 523.25];
    notes.forEach((frequency, i) => {
      const last = i === notes.length - 1;
      tone(context, output, { type: 'triangle', from: frequency, start: now + i * 0.16, duration: last ? 0.5 : 0.16, peak: 0.5 });
    });
  },
};
