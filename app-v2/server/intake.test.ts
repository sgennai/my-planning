// @vitest-environment node
// /api/intake against a stand-in Instapaper: what it asks for, what it returns, and what it refuses.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleIntake, INSTAPAPER_API, DNS_API, IMAGE_LIMITS, signImage, isPublicAddress, imageAddressesOf, sniffImage, _resetImagePace } from './intake';

const TOKEN = 'tok-secret-123';
const env = { INSTAPAPER_ACCESS_TOKEN: TOKEN };
const calls: { url: string; auth: string | null; redirect?: RequestRedirect }[] = [];
let reply: (url: URL, init?: RequestInit) => Response | Promise<Response>;
/** What the resolver says each name is: public unless a test says otherwise. */
let names: Record<string, { a?: string[]; aaaa?: string[]; fail?: boolean }> = {};
const sent: Headers[] = [];

const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith(DNS_API)) {
    const q = new URL(url);
    const name = names[q.searchParams.get('name')!] ?? { a: ['93.184.215.14'] };
    if (name.fail) return new Response('busy', { status: 503 });
    const type = q.searchParams.get('type') === 'A' ? 1 : 28;
    const data = (type === 1 ? name.a : name.aaaa) ?? [];
    return Response.json({ Status: 0, Answer: data.map(d => ({ name: q.searchParams.get('name'), type, TTL: 60, data: d })) });
  }
  calls.push({ url, auth: new Headers(init?.headers).get('Authorization'), redirect: init?.redirect });
  sent.push(new Headers(init?.headers));
  return reply(new URL(url), init);
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
  sent.length = 0;
  names = {};
  reply = () => Response.json({});
  _resetImagePace();
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
      instapaperProgress: 0.25, privateSource: null, imageSig: await signImage(TOKEN, 'https://img.example.com/x.jpg'),
    });
    expect(body.bookmarks[0].imageSig).toBeNull();
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
      sigs: { 'https://img.example.com/1.jpg': await signImage(TOKEN, 'https://img.example.com/1.jpg'), 'https://img.example.com/t.jpg': await signImage(TOKEN, 'https://img.example.com/t.jpg') },
    });
  });

  it("signs the article's pictures as the reader will ask for them: listed, in its HTML (entities read), its thumbnail; never a relative one", async () => {
    const html = '<p><img src="https://cdn.example.com/a.jpg?w=800&amp;q=80"><img alt="x" src=\'HTTPS://CDN.Example.com/b c.png\'><img src="/relative.png"><img data-src="https://cdn.example.com/no.png"><img src="data:image/png;base64,AAAA"></p>';
    expect(imageAddressesOf(html, ['https://img.example.com/1.jpg'], 'https://img.example.com/t.jpg')).toEqual([
      'https://cdn.example.com/a.jpg?w=800&q=80', 'https://cdn.example.com/b%20c.png', 'https://img.example.com/1.jpg', 'https://img.example.com/t.jpg',
    ]);
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
  const JPEG = [0xff, 0xd8, 0xff, 0xe0];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const WEBP = [...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBPVP8 '].map(c => c.charCodeAt(0)));
  const AVIF = [0, 0, 0, 0x1c, ...[...'ftypavif'].map(c => c.charCodeAt(0)), 0, 0, 0, 0];
  const bytesOf = (head: number[], size = 2000) => { const b = new Uint8Array(size); b.set(head); return b; };
  const pic = (type = 'image/jpeg', head = JPEG, size = 2000, headers: Record<string, string> = {}) =>
    new Response(bytesOf(head, size), { headers: { 'Content-Type': type, ...headers } });
  const image = async (u: string, sig?: string) => get(`image?url=${encodeURIComponent(u)}&s=${sig ?? await signImage(TOKEN, u)}`);
  afterEach(() => { IMAGE_LIMITS.timeoutMs = 15_000; vi.restoreAllMocks(); });

  it("fetches a signed picture with nothing of ours, and answers it safely", async () => {
    reply = () => pic('image/webp; charset=binary', WEBP);
    const res = await image('https://cdn.example.com/a.webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/webp');
    expect(res.headers.get('Content-Length')).toBe('2000');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect((await res.arrayBuffer()).byteLength).toBe(2000);
    expect(calls).toEqual([{ url: 'https://cdn.example.com/a.webp', auth: null, redirect: 'manual' }]);
    // Only Accept and User-Agent go: no cookie, token, referrer or anything of the request that came in.
    expect([...sent[0].keys()].sort()).toEqual(['accept', 'user-agent']);
  });

  it('is not a general fetcher: an address the server did not sign is refused, without asking anything', async () => {
    const other = await signImage(TOKEN, 'https://cdn.example.com/a.jpg');
    for (const [u, sig] of [
      ['https://evil.example.net/x.jpg', ''],
      ['https://evil.example.net/x.jpg', other], // another picture's signature
      ['https://cdn.example.com/a.jpg?x=1', other], // the same picture, changed
      ['https://evil.example.net/x.jpg', await signImage('another-token', 'https://evil.example.net/x.jpg')],
    ] as const) expect((await image(u, sig)).status, u).toBe(403);
    expect(calls).toEqual([]);
    // No token, no pictures: the key that signs them comes from it.
    expect((await get(`image?url=${encodeURIComponent('https://cdn.example.com/a.jpg')}&s=${other}`, {})).status).toBe(503);
  });

  it('refuses addresses that are not a public web host, without asking anything', async () => {
    for (const u of ['ftp://x.example.com/a.png', 'https://localhost/a.png', 'https://localhost./a.png', 'http://127.0.0.1/a.png', 'http://2130706433/a.png',
      'http://0x7f.1/a.png', 'http://0177.0.0.1/a.png', 'http://[::1]/a.png', 'http://[::ffff:127.0.0.1]/a.png', 'http://169.254.169.254/latest/meta-data',
      'https://printer.local/a.png', 'https://db.internal/a.png', 'https://nas.home.arpa/a.png', 'https://x.test/a.png', 'https://user:pw@x.example.com/a.png',
      'https://x.example.com:8080/a.png', 'https://intranet/a.png', 'javascript:alert(1)', 'not a url', `https://x.example.com/${'a'.repeat(2100)}`]) {
      expect((await image(u)).status, u).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it('refuses a name that resolves to a private, loopback, link-local or reserved address, or that the resolver cannot answer for', async () => {
    const cases: [string, { a?: string[]; aaaa?: string[]; fail?: boolean }, string][] = [
      ['rebind.example.net', { a: ['127.0.0.1'] }, 'blocked'],
      ['metadata.example.net', { a: ['169.254.169.254'] }, 'blocked'],
      ['lan.example.net', { a: ['10.1.2.3'] }, 'blocked'],
      ['cgnat.example.net', { a: ['100.64.0.1'] }, 'blocked'],
      ['mixed.example.net', { a: ['93.184.215.14', '192.168.1.1'] }, 'blocked'],
      ['v6loop.example.net', { aaaa: ['::1'] }, 'blocked'],
      ['v6ula.example.net', { a: ['93.184.215.14'], aaaa: ['fd00:ec2::254'] }, 'blocked'],
      ['v6mapped.example.net', { aaaa: ['::ffff:7f00:1'] }, 'blocked'],
      ['nothing.example.net', {}, 'blocked'],
      ['flaky.example.net', { fail: true }, 'unreachable'],
    ];
    for (const [host, answer, code] of cases) {
      names[host] = answer;
      const r = await image(`https://${host}/a.jpg`);
      expect([r.status, (await r.json()).error.code], host).toEqual([502, code]);
    }
    expect(calls).toEqual([]);
  });

  it('knows which addresses are public', () => {
    for (const ip of ['93.184.215.14', '1.1.1.1', '8.8.8.8', '2606:4700::6810:84e5', '2a00:1450:4007:80e::200e']) expect(isPublicAddress(ip), ip).toBe(true);
    for (const ip of ['0.0.0.0', '10.0.0.1', '100.100.1.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.0.0.8', '192.0.2.1', '192.168.0.1',
      '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '256.1.1.1', '::', '::1', '::ffff:7f00:1', '64:ff9b::7f00:1', 'fc00::1', 'fd00::1',
      'fe80::1', 'ff02::1', '2001:db8::1', '2001::1', '2002:7f00:1::1', '3fff::1', 'not-an-ip']) expect(isPublicAddress(ip), ip).toBe(false);
  });

  it('keeps only the five raster types, by their bytes as well as their header', async () => {
    reply = () => pic('image/svg+xml', [...'<svg'].map(c => c.charCodeAt(0)));
    expect((await image('https://cdn.example.com/a.svg')).status).toBe(415);
    reply = () => pic('text/html');
    expect((await image('https://cdn.example.com/a.png')).status).toBe(415);
    // A header that lies: an HTML page sent as a PNG.
    reply = () => pic('image/png', [...'<!doctype html><script>'].map(c => c.charCodeAt(0)));
    expect((await image('https://cdn.example.com/b.png')).status).toBe(415);
    reply = () => new Response(new Uint8Array(0), { headers: { 'Content-Type': 'image/png' } });
    expect((await image('https://cdn.example.com/empty.png')).status).toBe(415);
    // A CDN that sends a WebP for a .jpg: served as what it is.
    reply = () => pic('image/jpeg', WEBP);
    const r = await image('https://cdn.example.com/c.jpg');
    expect([r.status, r.headers.get('Content-Type')]).toEqual([200, 'image/webp']);
    for (const [head, type] of [[JPEG, 'image/jpeg'], [PNG, 'image/png'], [[...'GIF89a'].map(c => c.charCodeAt(0)), 'image/gif'], [AVIF, 'image/avif']] as const) {
      expect(sniffImage(bytesOf([...head])), type).toBe(type);
    }
  });

  it('stops at 6 MB as the picture streams, whatever its length says', async () => {
    reply = () => pic('image/png', PNG, 10, { 'Content-Length': String(7 * 1024 * 1024) });
    expect((await image('https://cdn.example.com/b.png')).status).toBe(413);
    // No length given: read in pieces until it passes 6 MB, and no further.
    let pulled = 0;
    reply = () => new Response(new ReadableStream({
      pull(c) { pulled++; c.enqueue(bytesOf(PNG, 1024 * 1024)); },
    }), { headers: { 'Content-Type': 'image/png' } });
    expect((await image('https://cdn.example.com/endless.png')).status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(9);
    reply = () => pic('image/png', PNG, 6 * 1024 * 1024 + 1);
    expect((await image('https://cdn.example.com/c.png')).status).toBe(413);
    reply = () => pic('image/png', PNG, 6 * 1024 * 1024);
    expect((await image('https://cdn.example.com/d.png')).status).toBe(200);
  });

  it('gives up after its time, a picture that never ends included', async () => {
    IMAGE_LIMITS.timeoutMs = 60;
    reply = (_u, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
    expect((await image('https://cdn.example.com/slow.jpg')).status).toBe(504);
    reply = (_u, init) => new Response(new ReadableStream({
      start(c) { c.enqueue(bytesOf(JPEG, 100)); init?.signal?.addEventListener('abort', () => c.error(init.signal!.reason)); },
    }), { headers: { 'Content-Type': 'image/jpeg' } });
    expect((await image('https://cdn.example.com/trickle.jpg')).status).toBe(504);
  });

  it('follows a redirect only to an address it would fetch, its name checked again, three at most', async () => {
    reply = url => (url.pathname === '/a.jpg' ? new Response(null, { status: 302, headers: { Location: '/b.jpg' } }) : pic());
    expect((await image('https://cdn.example.com/a.jpg')).status).toBe(200);
    expect(calls.map(c => c.url)).toEqual(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']);
    for (const to of ['http://127.0.0.1/admin.png', 'http://[::1]/x.png', 'http://localhost/x.png', 'file:///etc/passwd', 'https://inside.example.net/x.png']) {
      names['inside.example.net'] = { a: ['10.0.0.5'] };
      calls.length = 0;
      reply = () => new Response(null, { status: 301, headers: { Location: to } });
      const r = await image('https://cdn.example.com/a.jpg');
      expect([r.status, (await r.json()).error.code], to).toEqual([502, 'blocked']);
      expect(calls.length, to).toBe(1);
    }
    calls.length = 0;
    reply = url => new Response(null, { status: 302, headers: { Location: `${url.pathname}x` } });
    expect((await image('https://cdn.example.com/a')).status).toBe(502);
    expect(calls.length).toBe(4);
  });

  it("says when the picture's site refuses it or doesn't answer, never with the token or the address in a log", async () => {
    const log = vi.spyOn(console, 'log'), warn = vi.spyOn(console, 'warn'), error = vi.spyOn(console, 'error');
    reply = () => new Response('no', { status: 403 });
    const refused = await image('https://cdn.example.com/a.jpg');
    const text = await refused.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'blocked' } });
    expect(text).not.toContain(TOKEN);
    reply = () => { throw new TypeError('network'); };
    expect((await image('https://cdn.example.com/a.jpg')).status).toBe(504);
    expect([log, warn, error].every(s => s.mock.calls.length === 0)).toBe(true);
  });

  it('paces itself: 240 pictures a minute, then asks to wait', async () => {
    reply = () => pic();
    const u = 'https://cdn.example.com/a.jpg';
    const sig = await signImage(TOKEN, u);
    for (let i = 0; i < IMAGE_LIMITS.perMinute; i++) expect((await image(u, sig)).status).toBe(200);
    const r = await image(u, sig);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});
