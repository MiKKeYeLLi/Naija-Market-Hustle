import { describe, expect, it } from 'vitest';
import leaderboardConfig from '../public/startng.json';
import { START_NG, StartNgClient, connectPageTransport, isOnStartNg, signInUrl, type Transport } from './startng';

const FACE = 'data:image/png;base64,iVBORw0KGgo=';

// A transport that records what the game sends and replies with canned answers.
function fakeTransport(replies: Record<string, Record<string, unknown> | null>) {
  const sent: Array<{ message: Record<string, unknown>; replyType: string }> = [];
  const transport: Transport = async (message, replyType) => {
    sent.push({ message, replyType });
    return replies[replyType] ?? null;
  };
  return { transport, sent };
}

describe('where the game runs', () => {
  it('only talks to start.ng from a *.start.ng address', () => {
    expect(isOnStartNg('naija-market-hustle.start.ng')).toBe(true);
    expect(isOnStartNg('localhost')).toBe(false);
    expect(isOnStartNg('start.ng.evil.example')).toBe(false);
  });

  it('builds the sign-in link back to this page', () => {
    expect(signInUrl({ origin: 'https://naija-market-hustle.start.ng', pathname: '/' })).toBe(
      'https://start.ng/?return_to=https%3A%2F%2Fnaija-market-hustle.start.ng%2F',
    );
  });
});

describe('StartNgClient.whoAmI', () => {
  it('reads a signed-in player and start.ng\'s guest look', async () => {
    const { transport, sent } = fakeTransport({
      'startng:user': {
        type: 'startng:user',
        user: { id: 42, name: 'Runner Tee', account: 'Hamzat', face: FACE, style: {} },
        guest: { name: 'Guest', face: FACE },
      },
    });
    const who = await new StartNgClient(transport).whoAmI();
    expect(sent).toEqual([{ message: { type: 'startng:whoami' }, replyType: 'startng:user' }]);
    expect(who).toEqual({
      user: { id: 42, name: 'Runner Tee', account: 'Hamzat', face: FACE },
      guest: { name: 'Guest', face: FACE, account: undefined, id: undefined },
    });
  });

  it('treats a guest as user null', async () => {
    const { transport } = fakeTransport({ 'startng:user': { user: null, guest: { name: 'Guest', face: FACE } } });
    const who = await new StartNgClient(transport).whoAmI();
    expect(who?.user).toBeNull();
    expect(who?.guest?.name).toBe('Guest');
  });

  it('only accepts image data URLs as faces', async () => {
    const { transport } = fakeTransport({
      'startng:user': { user: { name: 'X', face: 'javascript:alert(1)' }, guest: null },
    });
    const who = await new StartNgClient(transport).whoAmI();
    expect(who?.user?.face).toBe('');
  });

  it('is null when start.ng does not answer or the game is not on start.ng', async () => {
    expect(await new StartNgClient(fakeTransport({}).transport).whoAmI()).toBeNull();
    expect(await new StartNgClient(null).whoAmI()).toBeNull();
  });
});

describe('StartNgClient.saveRun', () => {
  it('sends exactly the startng.json stats as whole numbers in range', async () => {
    const { transport, sent } = fakeTransport({
      'startng:scoreSaved': { ok: true, result: { best: 4200, improved: true, rank: 3, stats: { cash: 4200, fresh: 30 } } },
    });
    const saved = await new StartNgClient(transport).saveRun({ cash: 4200.7, fresh: 30 });
    expect(sent[0].message).toEqual({ type: 'startng:score', stats: { cash: 4200, fresh: 30 } });
    expect(Object.keys(sent[0].message.stats as object)).toEqual(leaderboardConfig.leaderboard.stats.map((s) => s.key));
    expect(saved).toEqual({ ok: true, improved: true, rank: 3, error: undefined });
  });

  it('clamps nonsense to start.ng\'s accepted range', async () => {
    const { transport, sent } = fakeTransport({});
    await new StartNgClient(transport).saveRun({ cash: -5, fresh: Number.NaN });
    await new StartNgClient(transport).saveRun({ cash: 5e12, fresh: 1 });
    expect(sent[0].message.stats).toEqual({ cash: 0, fresh: 0 });
    expect(sent[1].message.stats).toEqual({ cash: 1_000_000_000, fresh: 1 });
  });

  it('reports a refusal', async () => {
    const { transport } = fakeTransport({ 'startng:scoreSaved': { ok: false, error: 'Sign in to save your score' } });
    const saved = await new StartNgClient(transport).saveRun({ cash: 10, fresh: 1 });
    expect(saved).toEqual({ ok: false, improved: undefined, rank: undefined, error: 'Sign in to save your score' });
  });
});

describe('startng.json', () => {
  it('follows start.ng\'s leaderboard rules', () => {
    const stats = leaderboardConfig.leaderboard.stats;
    expect(stats.length).toBeGreaterThanOrEqual(1);
    expect(stats.length).toBeLessThanOrEqual(5);
    for (const stat of stats) {
      expect(stat.key).toMatch(/^[a-z][a-z0-9_]{0,23}$/);
      expect(stat.label.length).toBeLessThanOrEqual(30);
      expect(['highest', 'lowest']).toContain(stat.order);
    }
    // Ranked by cash first, then fresh produce caught.
    expect(stats.map((s) => s.key)).toEqual(['cash', 'fresh']);
  });
});

describe('connectPageTransport', () => {
  // A minimal window: event target, timers and a document that "loads" the iframe straight away.
  function fakeWindow() {
    const target = new EventTarget();
    const posted: Array<{ data: Record<string, unknown>; origin: string }> = [];
    const contentWindow = { postMessage: (data: Record<string, unknown>, origin: string) => posted.push({ data, origin }) };
    const frame = {
      hidden: false,
      src: '',
      title: '',
      contentWindow,
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
    };
    const win = {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
      document: {
        createElement: () => frame,
        body: { append: () => queueMicrotask(() => frame.onload?.()) },
      },
    } as unknown as Window;
    const reply = (data: Record<string, unknown>, origin = START_NG, source: unknown = contentWindow) =>
      target.dispatchEvent(Object.assign(new Event('message'), { data, origin, source }));
    return { win, frame, posted, reply };
  }

  it('posts to the hidden start.ng/connect frame and resolves with the matching reply', async () => {
    const { win, frame, posted, reply } = fakeWindow();
    const pending = connectPageTransport(win)({ type: 'startng:whoami' }, 'startng:user');
    await new Promise((r) => setTimeout(r, 0));
    expect(frame.src).toBe('https://start.ng/connect');
    expect(frame.hidden).toBe(true);
    expect(posted[0].origin).toBe(START_NG);
    const requestId = posted[0].data.requestId;
    reply({ type: 'startng:user', requestId, user: null });
    await expect(pending).resolves.toEqual({ type: 'startng:user', requestId, user: null });
  });

  it('ignores replies from another origin, another window or another request', async () => {
    const { win, posted, reply } = fakeWindow();
    const pending = connectPageTransport(win, 60)({ type: 'startng:whoami' }, 'startng:user');
    await new Promise((r) => setTimeout(r, 0));
    const requestId = posted[0].data.requestId;
    reply({ type: 'startng:user', requestId, user: { name: 'Impostor' } }, 'https://evil.example');
    reply({ type: 'startng:user', requestId, user: { name: 'Impostor' } }, START_NG, {});
    reply({ type: 'startng:user', requestId: 'someone-else', user: { name: 'Impostor' } });
    // None of those count, so it times out with null.
    await expect(pending).resolves.toBeNull();
  });
});
