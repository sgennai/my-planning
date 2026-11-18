// @vitest-environment node
// /api/intake against a stand-in Instapaper: what it asks for, what it returns, and what it refuses.
import { describe, it, expect, beforeEach } from 'vitest';
import { handleIntake, INSTAPAPER_API } from './intake';

const TOKEN = 'tok-secret-123';
const env = { INSTAPAPER_ACCESS_TOKEN: TOKEN };
const calls: { url: string; auth: string | null; redirect?: RequestRedirect }[] = [];
let reply: (url: URL) => Response | Promise<Response>;

const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, auth: new Headers(init?.headers).get('Authorization'), redirect: init?.redirect });
  return reply(new URL(url));
}) as typeof fetch;

const get = (path: string, e: Record<string, string | undefined> = env) =>
  handleIntake(new Request(`https://app.test/api/intake/${path}`), e, fake);

const bookmark = (id: number, extra: Record<string, unknown> = {}) => ({
  id, url: `https://example.com/a/${id}`, title: `Title ${id}`, description: 'Opening words', image: null,
  progress: { percentage: 0.25, timestamp: 1 }, liked: false, archived: false, time: 1_700_000_000 + id, pubtime: null,
  author: null, folder_id: null, tags: [{ id: 1, name: 'ai', slug: 'ai', count: 3 }], private_source: null, category: 0, ...extra,
});

beforeEach(() => {
  calls.length = 0;
  reply = () => Response.json({});
});

describe('/api/intake', () => {
  it('refuses anything but GET, and unknown paths', async () => {
    expect((await handleIntake(new Request('https://app.test/api/intake/status', { method: 'POST' }), env, fake)).status).toBe(405);
    expect((await get('nothing')).status).toBe(404);
    expect((await get('articles/12/extra')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('says when no token is set, without calling Instapaper', async () => {
    const r = await get('status', {});
    expect(r.status).toBe(503);
    expect((await r.json()).error.code).toBe('not-configured');
    expect(calls).toHaveLength(0);
  });

  it('checks the token, sending it to Instapaper only, never following a redirect', async () => {
    reply = () => Response.json({ id: 1, username: 'reader@example.com', premium: false });
    const r = await get('status');
    expect(await r.json()).toEqual({ connected: true, premium: false });
    expect(calls).toEqual([{ url: `${INSTAPAPER_API}/me`, auth: `Bearer ${TOKEN}`, redirect: 'manual' }]);
  });

  it('syncs every page, moving past bookmarks and deleted ids alike, and renames the fields', async () => {
    reply = url => {
      const offset = Number(url.searchParams.get('offset'));
      if (offset === 0) return Response.json({ bookmarks: Array.from({ length: 498 }, (_, i) => bookmark(i + 1)), deleted_ids: [9001, 9002], total: 503 });
      return Response.json({ bookmarks: [bookmark(600, { archived: true, liked: true, image: 'https://img.example.com/x.jpg' })], deleted_ids: [], total: 503 });
    };
    const body = await (await get('sync?since=1700000000')).json();
    expect(calls.map(c => new URL(c.url).search)).toEqual(['?since=1700000000&limit=500&offset=0', '?since=1700000000&limit=500&offset=500']);
    expect(body.complete).toBe(true);
    expect(body.nextOffset).toBeNull();
    expect(body.bookmarks).toHaveLength(499);
    expect(body.deletedIds).toEqual([9001, 9002]);
    expect(body.bookmarks[498]).toEqual({
      id: 600, url: 'https://example.com/a/600', title: 'Title 600', description: 'Opening words', image: 'https://img.example.com/x.jpg',
      author: null, savedAt: 1_700_000_600, publishedAt: null, archived: true, liked: true, folderId: null, tags: ['ai'], category: 0,
      instapaperProgress: 0.25, privateSource: null,
    });
  });

  it('starts from the beginning without a since, and resumes from an offset', async () => {
    reply = () => Response.json({ bookmarks: [bookmark(1)], deleted_ids: [] });
    await get('sync');
    await get('sync?since=5&offset=1500');
    expect(calls.map(c => new URL(c.url).search)).toEqual(['?since=1&limit=500&offset=0', '?since=5&limit=500&offset=1500']);
  });

  it('stops after 40 full pages and says where to go on', async () => {
    reply = () => Response.json({ bookmarks: Array.from({ length: 500 }, (_, i) => bookmark(i + 1)), deleted_ids: [] });
    const body = await (await get('sync?since=1')).json();
    expect(calls).toHaveLength(40);
    expect(body.complete).toBe(false);
    expect(body.nextOffset).toBe(20_000);
  });

  it('returns an article as parsed, renamed, its body as given', async () => {
    reply = () => Response.json({
      metadata: { title: 'A title', author: { name: 'A. Writer', url: null }, pubtime: 1_699_000_000, thumbnail: 'https://img.example.com/t.jpg', description: 'Summary', private_source: null, category: 0 },
      content: { body: '<p>Made-up words.</p>', images: ['https://img.example.com/1.jpg'], words: 1234, paywalled: false, direction: 'ltr' },
    });
    const body = await (await get('articles/1234567890')).json();
    expect(calls[0].url).toBe(`${INSTAPAPER_API}/bookmarks/1234567890/parse`);
    expect(body).toEqual({
      id: 1234567890, title: 'A title', author: 'A. Writer', authorUrl: null, publishedAt: 1_699_000_000, thumbnail: 'https://img.example.com/t.jpg',
      description: 'Summary', category: 0, html: '<p>Made-up words.</p>', images: ['https://img.example.com/1.jpg'], words: 1234, paywalled: false, direction: 'ltr',
    });
  });

  it('refuses an id that is not a number, without calling Instapaper', async () => {
    expect((await get('articles/12abc')).status).toBe(404);
    expect((await get('articles/..%2Fme')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('turns Instapaper failures into codes the app understands, never echoing the token', async () => {
    const cases: [number, string, number, string][] = [
      [400, 'Parsed content unavailable', 422, 'unavailable'],
      [400, 'Bookmark not found', 404, 'not-found'],
      [401, 'Authentication failed', 502, 'auth-failed'],
      [402, 'Instaparser free credit limit exceeded', 502, 'quota'],
      [403, 'Application is suspended', 502, 'forbidden'],
      [429, 'Rate limit exceeded', 429, 'rate-limited'],
      [500, 'Error generating text version of this URL', 502, 'upstream'],
    ];
    for (const [status, message, ours, code] of cases) {
      reply = () => Response.json({ error: { code: status, message } }, { status, headers: status === 429 ? { 'Retry-After': '30' } : {} });
      const r = await get('articles/77');
      const text = await r.text();
      expect([r.status, JSON.parse(text).error.code]).toEqual([ours, code]);
      expect(text).not.toContain(TOKEN);
      if (status === 429) expect(r.headers.get('Retry-After')).toBe('30');
    }
  });

  it('a 400 on the list is not an article failure', async () => {
    reply = () => Response.json({ error: { code: 400, message: 'Invalid request' } }, { status: 400 });
    expect((await (await get('sync')).json()).error.code).toBe('upstream');
  });

  it('refuses to follow a redirect, and reports an unreachable Instapaper', async () => {
    reply = () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example.com/' } });
    expect((await (await get('status')).json()).error.code).toBe('upstream');
    reply = () => { throw new TypeError('network down'); };
    const r = await get('status');
    expect([r.status, (await r.json()).error.code]).toEqual([504, 'unreachable']);
  });

  it('lists folder and tag names', async () => {
    reply = url => Response.json(url.pathname.endsWith('/folders')
      ? { folders: [{ id: 5, title: 'Later', slug: 'later', position: 1, public: false, count: 2 }] }
      : { tags: [{ id: 1, name: 'ai', slug: 'ai', count: 3 }] });
    expect(await (await get('folders')).json()).toEqual({ folders: [{ id: 5, title: 'Later' }] });
    expect(await (await get('tags')).json()).toEqual({ tags: [{ id: 1, name: 'ai', count: 3 }] });
  });
});

describe('/api/intake/image', () => {
  const pic = (type = 'image/jpeg', bytes = 2000, headers: Record<string, string> = {}) =>
    new Response(new Uint8Array(bytes), { headers: { 'Content-Type': type, ...headers } });
  const image = (u: string) => get(`image?url=${encodeURIComponent(u)}`);

  it("fetches a picture with nothing of ours, and answers it safely; no token needed", async () => {
    reply = () => pic('image/webp; charset=binary');
    const res = await get(`image?url=${encodeURIComponent('https://cdn.example.com/a.webp')}`, {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect((await res.arrayBuffer()).byteLength).toBe(2000);
    expect(calls).toEqual([{ url: 'https://cdn.example.com/a.webp', auth: null, redirect: 'manual' }]);
  });

  it('refuses addresses that are not a public web host, without asking anything', async () => {
    for (const u of ['ftp://x.example.com/a.png', 'https://localhost/a.png', 'http://127.0.0.1/a.png', 'http://[::1]/a.png', 'https://printer.local/a.png',
      'https://user:pw@x.example.com/a.png', 'https://x.example.com:8080/a.png', 'https://intranet/a.png', 'not a url']) {
      expect((await image(u)).status, u).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('keeps only raster pictures: never SVG, HTML or anything over 6 MB', async () => {
    reply = () => pic('image/svg+xml');
    expect((await image('https://cdn.example.com/a.svg')).status).toBe(415);
    reply = () => pic('text/html');
    expect((await image('https://cdn.example.com/a.png')).status).toBe(415);
    reply = () => pic('image/png', 10, { 'Content-Length': String(7 * 1024 * 1024) });
    expect((await image('https://cdn.example.com/b.png')).status).toBe(413);
    reply = () => pic('image/png', 6 * 1024 * 1024 + 1);
    expect((await image('https://cdn.example.com/c.png')).status).toBe(413);
  });

  it('follows a redirect only to an address it would fetch, three at most', async () => {
    reply = url => (url.pathname === '/a.jpg' ? new Response(null, { status: 302, headers: { Location: '/b.jpg' } }) : pic());
    expect((await image('https://cdn.example.com/a.jpg')).status).toBe(200);
    expect(calls.map(c => c.url)).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']);
    reply = () => new Response(null, { status: 301, headers: { Location: 'http://127.0.0.1/admin.png' } });
    expect((await image('https://cdn.example.com/a.jpg')).status).toBe(502);
    calls.length = 0;
    reply = url => new Response(null, { status: 302, headers: { Location: `${url.pathname}x` } });
    expect((await image('https://cdn.example.com/a')).status).toBe(502);
    expect(calls.length).toBe(4);
  });

  it("says when the picture's site refuses it or doesn't answer", async () => {
    reply = () => new Response('no', { status: 403 });
    expect(await (await image('https://cdn.example.com/a.jpg')).json()).toMatchObject({ error: { code: 'blocked' } });
    reply = () => { throw new TypeError('network'); };
    expect((await image('https://cdn.example.com/a.jpg')).status).toBe(504);
  });
});
