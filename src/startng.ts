// start.ng integration (https://start.ng/docs.md): who's playing, sign-in, and saving runs to the
// shared leaderboard, through start.ng's hidden connect page. start.ng handles all sign-in; the game
// never sees a password, an email or the player's real session.

export const START_NG = 'https://start.ng';

export interface StartNgPlayer {
  name: string;
  // The character's face, a PNG data URL.
  face: string;
  // Account name for "@account"; absent for guests.
  account?: string;
  id?: number;
}

export interface WhoAmI {
  user: StartNgPlayer | null;
  guest: StartNgPlayer | null;
}

export interface SavedRun {
  ok: boolean;
  improved?: boolean;
  rank?: number;
  error?: string;
}

// The leaderboard columns, matching public/startng.json.
export interface RunStats {
  cash: number;
  fresh: number;
}

// Sends one message to start.ng and resolves to its reply, or null if it didn't answer in time.
export type Transport = (message: Record<string, unknown>, replyType: string) => Promise<Record<string, unknown> | null>;

// The connect page only answers games served from a *.start.ng address.
export function isOnStartNg(hostname: string = location.hostname): boolean {
  return hostname.endsWith('.start.ng');
}

// The docs' connect-page helper: a hidden iframe to start.ng/connect and postMessage, accepting only
// replies from start.ng's origin and from that frame, matched by request id.
export function connectPageTransport(win: Window = window, timeoutMs = 5000): Transport {
  let frame: Promise<HTMLIFrameElement> | null = null;
  const connectFrame = () =>
    (frame ??= new Promise((resolve, reject) => {
      const element = win.document.createElement('iframe');
      element.src = `${START_NG}/connect`;
      element.hidden = true;
      element.title = 'start.ng connection';
      element.onload = () => resolve(element);
      element.onerror = reject;
      win.document.body.append(element);
    }));

  return async (message, replyType) => {
    const element = await connectFrame();
    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2);
      const done = (reply: Record<string, unknown> | null) => {
        win.clearTimeout(timer);
        win.removeEventListener('message', onMessage);
        resolve(reply);
      };
      const timer = win.setTimeout(() => done(null), timeoutMs);
      function onMessage(event: MessageEvent) {
        if (event.origin !== START_NG || event.source !== element.contentWindow) return;
        if (event.data?.type === replyType && event.data.requestId === requestId) done(event.data);
      }
      win.addEventListener('message', onMessage);
      element.contentWindow?.postMessage({ ...message, requestId }, START_NG);
    });
  };
}

function asPlayer(value: unknown): StartNgPlayer | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string') return null;
  return {
    name: raw.name,
    face: typeof raw.face === 'string' && raw.face.startsWith('data:image/') ? raw.face : '',
    account: typeof raw.account === 'string' ? raw.account : undefined,
    id: typeof raw.id === 'number' ? raw.id : undefined,
  };
}

// A whole number within start.ng's accepted range (0 to 1,000,000,000).
const statValue = (n: number) => Math.min(1_000_000_000, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));

export class StartNgClient {
  constructor(private readonly transport: Transport | null) {}

  // Null when not on start.ng or start.ng didn't answer: the game just plays without a profile.
  async whoAmI(): Promise<WhoAmI | null> {
    if (!this.transport) return null;
    const reply = await this.transport({ type: 'startng:whoami' }, 'startng:user');
    if (!reply) return null;
    return { user: asPlayer(reply.user), guest: asPlayer(reply.guest) };
  }

  // Signed-in players only; start.ng keeps each player's best run.
  async saveRun(stats: RunStats): Promise<SavedRun | null> {
    if (!this.transport) return null;
    const reply = await this.transport(
      { type: 'startng:score', stats: { cash: statValue(stats.cash), fresh: statValue(stats.fresh) } },
      'startng:scoreSaved',
    );
    if (!reply) return null;
    const result = (reply.result ?? {}) as Record<string, unknown>;
    return {
      ok: reply.ok === true,
      improved: typeof result.improved === 'boolean' ? result.improved : undefined,
      rank: typeof result.rank === 'number' ? result.rank : undefined,
      error: typeof reply.error === 'string' ? reply.error : undefined,
    };
  }
}

// start.ng signs the player in (making a character if they're new) and sends them back here.
export function signInUrl(loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${START_NG}/?return_to=${encodeURIComponent(loc.origin + loc.pathname)}`;
}
