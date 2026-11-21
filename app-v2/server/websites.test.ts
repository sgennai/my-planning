// @vitest-environment node
// /api/websites against a stand-in web: what a look-up reads and returns, what an icon fetch serves, and what both refuse.
import { describe, it, expect, beforeEach } from 'vitest';
import { DNS_API } from './intake';
import { handleWebsites, signIcon, readHead, rankIcons, nameFromTitle, siteKey, structuredLogos, textOf, isIco, isSvg, SITE_LIMITS, _resetSitePace, type SiteMeta } from './websites';

const SECRET = 'login-password';
const env = { BASIC_AUTH_PASS: SECRET };
const calls: { url: string; headers: Headers }[] = [];
let pages: Record<string, () => Response> = {};
let names: Record<string, { a?: string[]; aaaa?: string[] }> = {};

const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith(DNS_API)) {
    const q = new URL(url);
    const name = names[q.searchParams.get('name')!] ?? { a: ['93.184.215.14'] };
    const type = q.searchParams.get('type') === 'A' ? 1 : 28;
    const data = (type === 1 ? name.a : name.aaaa) ?? [];
    return Response.json({ Status: 0, Answer: data.map(d => ({ type, data: d })) });
  }
  calls.push({ url, headers: new Headers(init?.headers) });
  const page = pages[url];
  return page ? page() : new Response('not here', { status: 404 });
}) as typeof fetch;

const get = (path: string, e: Record<string, string | undefined> = env) => handleWebsites(new Request(`https://app.test/api/websites/${path}`), e, fake);
const html = (body: string, type = 'text/html; charset=utf-8') => () => new Response(body, { headers: { 'Content-Type': type } });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const ICO = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0, 0]);
const SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<!-- logo --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>');

beforeEach(() => {
  calls.length = 0;
  pages = {};
  names = {};
  _resetSitePace();
});

const HOME = `<!doctype html><html><head>
  <title>Harvard Business Review - Ideas and Advice for Leaders</title>
  <meta property="og:site_name" content="Harvard Business Review">
  <meta name="description" content="Management &amp; leadership ideas.">
  <meta property="og:image" content="https://hbr.org/banner.jpg">
  <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="mask-icon" href="/mask.svg" color="#000">
  <link rel="apple-touch-icon" href="/touch-120.png" sizes="120x120">
  <link rel="apple-touch-icon" sizes="180x180" href="/touch-180.png">
  <link rel="icon" href="data:image/png;base64,AAAA">
  <link rel="manifest" href="/site.webmanifest">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","url":"https://hbr.org/","logo":{"@type":"ImageObject","url":"https://hbr.org/logo-wide.png"}},{"@type":"Organization","url":"https://other.example.net/","logo":"https://other.example.net/logo.png"}]}</script>
</head><body><img src="/x.png"></body></html>`;
const MANIFEST = JSON.stringify({ name: 'HBR', icons: [
  { src: '/m-mask-512.png', sizes: '512x512', purpose: 'maskable' },
  { src: '/m-192.png', sizes: '192x192' },
  { src: '/m-mono.png', sizes: '512x512', purpose: 'monochrome' },
] });

describe('/api/websites', () => {
  it('refuses anything but GET, unknown paths, and works only with the login configured', async () => {
    expect((await handleWebsites(new Request('https://app.test/api/websites/meta?url=hbr.org', { method: 'POST' }), env, fake)).status).toBe(405);
    expect((await get('elsewhere')).status).toBe(404);
    const r = await get('meta?url=hbr.org', {});
    expect(r.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['', 'nothing'], ['javascript:alert(1)', 'a script'], ['ftp://hbr.org/', 'another scheme'], ['http://127.0.0.1/', 'an IP address'],
    ['http://[::1]/', 'an IPv6 address'], ['http://localhost/', 'a local name'], ['https://hbr.org:8443/', 'a port'],
    ['https://user:pw@hbr.org/', 'credentials'], ['http://2130706433/', 'a number host'], ['http://intranet/', 'a bare name'],
  ])('refuses %s (%s) before any request', async (raw) => {
    const r = await get(`meta?url=${encodeURIComponent(raw)}`);
    expect(r.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('reads the name, description and every icon the page names, in the order they are tried, each signed', async () => {
    pages['https://hbr.org/'] = html(HOME);
    pages['https://hbr.org/site.webmanifest'] = () => new Response(MANIFEST, { headers: { 'Content-Type': 'application/manifest+json' } });
    const r = await get('meta?url=hbr.org');
    expect(r.status).toBe(200);
    const m = (await r.json()) as SiteMeta;
    expect(m).toMatchObject({ url: 'https://hbr.org/', name: 'Harvard Business Review', description: 'Management & leadership ideas.', read: true });
    expect(m.icons.map(i => [i.kind, new URL(i.url).pathname])).toEqual([
      ['logo', '/logo-wide.png'],
      ['touch', '/touch-180.png'],
      ['touch', '/touch-120.png'],
      ['manifest', '/m-192.png'],
      ['manifest', '/m-mask-512.png'],
      ['favicon', '/favicon.svg'],
      ['favicon', '/favicon-32.png'],
      ['favicon', '/favicon.ico'],
    ]);
    // Never the og:image banner, the mask icon, a data: address, another organisation's logo or the monochrome icon.
    expect(JSON.stringify(m.icons)).not.toMatch(/banner|mask\.svg|data:|other\.example|m-mono/);
    for (const i of m.icons) expect(i.s).toBe(await signIcon(SECRET, i.url, i.e));
    expect(m.icons[5].svg).toBe(true);
    expect(m.icons.at(-1)!.guess).toBe(true);
  });

  it("never takes a share picture for the logo: the page's og:image, or a file named as one", async () => {
    pages['https://martech.org/'] = html(`<head>
      <meta property="og:image" content="https://martech.org/uploads/home-share.png">
      <script type="application/ld+json">{"@graph":[{"@type":"Organization","url":"https://martech.org/","logo":{"url":"https://martech.org/uploads/home-share.png"}}]}</script>
      <script type="application/ld+json">{"@type":"Organization","logo":"https://martech.org/wp-content/uploads/2021/06/OG-image-1.png"}</script>
      <script type="application/ld+json">{"@type":"Organization","logo":"/brand/martech-logo.svg"}</script>
    </head>`);
    const m = (await (await get('meta?url=martech.org')).json()) as SiteMeta;
    expect(m.icons.filter(i => i.kind === 'logo').map(i => i.url)).toEqual(['https://martech.org/brand/martech-logo.svg']);
  });

  it('sends nothing of ours: Accept and User-Agent only, and no cookie, login or referrer', async () => {
    pages['https://hbr.org/'] = html(HOME);
    await get('meta?url=https://hbr.org/');
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect([...c.headers.keys()].sort()).toEqual(['accept', 'user-agent']);
  });

  it('a site that refuses its page still offers its usual icon addresses', async () => {
    pages['https://www.mckinsey.com/featured-insights'] = () => new Response('Access denied', { status: 403, headers: { 'Content-Type': 'text/html' } });
    const m = (await (await get('meta?url=https://www.mckinsey.com/featured-insights')).json()) as SiteMeta;
    expect(m.read).toBe(false);
    expect(m.name).toBeNull();
    expect(m.icons.map(i => new URL(i.url).pathname)).toEqual(['/apple-touch-icon.png', '/favicon.ico']);
    expect(m.icons.every(i => i.guess)).toBe(true);
  });

  it('a page that drops the connection is not read, and its usual icon addresses are still offered', async () => {
    pages['https://business.adobe.com/blog'] = () => { throw new TypeError('stream reset'); };
    const r = await get('meta?url=https://business.adobe.com/blog');
    expect(r.status).toBe(200);
    const m = (await r.json()) as SiteMeta;
    expect(m.read).toBe(false);
    expect(m.icons.map(i => i.url)).toEqual(['https://business.adobe.com/apple-touch-icon.png', 'https://business.adobe.com/favicon.ico']);
  });

  it('a name that does not exist is said to be so', async () => {
    names['nowhere-at-all.example.net'] = {};
    const r = await get('meta?url=nowhere-at-all.example.net');
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('no-such-host');
    expect(calls).toHaveLength(0);
  });

  it('follows redirects to public hosts and reports where the page ended up', async () => {
    pages['https://stratechery.com/'] = () => new Response(null, { status: 301, headers: { Location: 'https://www.stratechery.com/home' } });
    pages['https://www.stratechery.com/home'] = html('<head><title>Stratechery by Ben Thompson</title></head>');
    const m = (await (await get('meta?url=stratechery.com')).json()) as SiteMeta;
    expect(m.url).toBe('https://www.stratechery.com/home');
    expect(m.name).toBe('Stratechery by Ben Thompson');
  });

  it('refuses a host on a private network, and a redirect to one, without reading it', async () => {
    names['inside.example.net'] = { a: ['10.0.0.8'] };
    expect((await get('meta?url=inside.example.net')).status).toBe(422);
    expect(calls).toHaveLength(0);
    names['meta.example.net'] = { a: ['169.254.169.254'] };
    pages['https://hop.example.net/'] = () => new Response(null, { status: 302, headers: { Location: 'https://meta.example.net/' } });
    expect((await get('meta?url=hop.example.net')).status).toBe(422);
    expect(calls.map(c => c.url)).toEqual(['https://hop.example.net/']);
    pages['https://loop.example.net/'] = () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/' } });
    expect((await get('meta?url=loop.example.net')).status).toBe(422);
  });

  it('does not follow more than four redirects', async () => {
    for (let i = 0; i < 6; i++) pages[`https://r${i}.example.net/`] = () => new Response(null, { status: 302, headers: { Location: `https://r${i + 1}.example.net/` } });
    expect((await get('meta?url=r0.example.net')).status).toBe(422);
    expect(calls).toHaveLength(SITE_LIMITS.hops + 1);
  });

  it('keeps to a pace: a look-up a second at most, per server instance', async () => {
    pages['https://hbr.org/'] = html(HOME);
    for (let i = 0; i < SITE_LIMITS.metaPerMinute; i++) await get('meta?url=hbr.org');
    const r = await get('meta?url=hbr.org');
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('returns no markup: only the fields it reads, cleaned', async () => {
    pages['https://evil.example.net/'] = html('<head><title><script>x</script>Name</title><meta name="description" content="<b>bold</b>  spaced\n out"></head>');
    const m = (await (await get('meta?url=evil.example.net')).json()) as SiteMeta;
    expect(Object.keys(m).sort()).toEqual(['description', 'icons', 'name', 'read', 'url']);
    expect(m.name).toBe('x Name');
    expect(m.description).toBe('bold spaced out');
  });
});

describe('/api/websites/icon', () => {
  const signed = async (url: string, e = Math.floor(Date.now() / 1000) + 600) => `icon?url=${encodeURIComponent(url)}&e=${e}&s=${await signIcon(SECRET, url, e)}`;

  it('fetches only an address a look-up signed, within the hour', async () => {
    pages['https://hbr.org/touch-180.png'] = () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    expect((await get('icon?url=https%3A%2F%2Fhbr.org%2Ftouch-180.png&e=9999999999&s=AAAA')).status).toBe(403);
    expect((await get(await signed('https://hbr.org/touch-180.png', Math.floor(Date.now() / 1000) - 5))).status).toBe(403);
    const other = (await signed('https://hbr.org/other.png')).replace('other.png', 'touch-180.png');
    expect((await get(other)).status).toBe(403);
    expect(calls).toHaveLength(0);
    const r = await get(await signed('https://hbr.org/touch-180.png'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/png');
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('a new login password voids the signatures made under the old one; a new look-up signs again', async () => {
    pages['https://hbr.org/'] = html(HOME);
    pages['https://hbr.org/touch-180.png'] = () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    const m = (await (await get('meta?url=hbr.org')).json()) as SiteMeta;
    const touch = m.icons.find(i => i.url === 'https://hbr.org/touch-180.png')!;
    const path = (i: typeof touch) => `icon?url=${encodeURIComponent(i.url)}&e=${i.e}&s=${i.s}`;
    const rotated = { BASIC_AUTH_PASS: 'a-new-login-password' };
    expect((await get(path(touch), rotated)).status).toBe(403);
    const again = (await (await get('meta?url=hbr.org', rotated)).json()) as SiteMeta;
    const fresh = again.icons.find(i => i.url === touch.url)!;
    expect(fresh.s).not.toBe(touch.s);
    expect((await get(path(fresh), rotated)).status).toBe(200);
  });

  it('the signing key is the login password through its own label, never the password itself', async () => {
    const e = 2_000_000_000;
    const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const direct = new Uint8Array(await crypto.subtle.sign('HMAC', raw, new TextEncoder().encode(`${e}\nhttps://hbr.org/t.png`)));
    const directSig = btoa(String.fromCharCode(...direct.subarray(0, 16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(await signIcon(SECRET, 'https://hbr.org/t.png', e)).not.toBe(directSig);
    expect(await signIcon(SECRET, 'https://hbr.org/t.png', e)).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('serves a picture as its bytes say, an ICO as an icon, and an SVG only as a sandboxed attachment', async () => {
    pages['https://a.example.net/f.ico'] = () => new Response(ICO, { headers: { 'Content-Type': 'application/octet-stream' } });
    pages['https://a.example.net/f.svg'] = () => new Response(SVG, { headers: { 'Content-Type': 'image/svg+xml' } });
    pages['https://a.example.net/lies.png'] = () => new Response(PNG, { headers: { 'Content-Type': 'text/plain' } });
    const ico = await get(await signed('https://a.example.net/f.ico'));
    expect(ico.headers.get('Content-Type')).toBe('image/x-icon');
    const svg = await get(await signed('https://a.example.net/f.svg'));
    expect(svg.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(svg.headers.get('Content-Disposition')).toMatch(/^attachment/);
    expect(svg.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
    expect((await get(await signed('https://a.example.net/lies.png'))).headers.get('Content-Type')).toBe('image/png');
  });

  it('refuses what is not an icon: an error page, HTML dressed as SVG, an empty answer, a refusal, too many bytes', async () => {
    pages['https://a.example.net/page'] = html('<!doctype html><html><body>Not found</body></html>', 'image/png');
    pages['https://a.example.net/fake.svg'] = () => new Response('<html><svg></svg></html>', { headers: { 'Content-Type': 'image/svg+xml' } });
    pages['https://a.example.net/empty.png'] = () => new Response(new Uint8Array(0), { headers: { 'Content-Type': 'image/png' } });
    pages['https://a.example.net/gone.png'] = () => new Response('no', { status: 403 });
    pages['https://a.example.net/huge.png'] = () => new Response(new Uint8Array(SITE_LIMITS.iconBytes + 10), { headers: { 'Content-Type': 'image/png' } });
    expect((await get(await signed('https://a.example.net/page'))).status).toBe(415);
    expect((await get(await signed('https://a.example.net/fake.svg'))).status).toBe(415);
    expect((await get(await signed('https://a.example.net/empty.png'))).status).toBe(415);
    expect((await get(await signed('https://a.example.net/gone.png'))).status).toBe(502);
    expect((await get(await signed('https://a.example.net/huge.png'))).status).toBe(413);
  });

  it('refuses an icon on a private network, or redirected to one', async () => {
    names['cdn.example.net'] = { aaaa: ['fd00::1'] };
    expect((await get(await signed('https://cdn.example.net/i.png'))).status).toBe(502);
    pages['https://a.example.net/moved.png'] = () => new Response(null, { status: 302, headers: { Location: 'https://localhost/i.png' } });
    expect((await get(await signed('https://a.example.net/moved.png'))).status).toBe(502);
    expect(calls.map(c => c.url)).toEqual(['https://a.example.net/moved.png']);
  });
});

describe('reading a page', () => {
  it('a name from the title: the part naming the site', () => {
    expect(nameFromTitle('Harvard Business Review - Ideas and Advice for Leaders', 'hbr.org')).toBe('Harvard Business Review');
    expect(nameFromTitle('Newsroom \\ Anthropic', 'www.anthropic.com')).toBe('Anthropic');
    expect(nameFromTitle('Home | Farnam Street', 'fs.blog')).toBe('Home');
    expect(nameFromTitle('The GitHub Blog', 'github.blog')).toBe('The GitHub Blog');
  });

  it('the site a host belongs to', () => {
    expect(siteKey('www.technologyreview.com')).toBe('technologyreview.com');
    expect(siteKey('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(siteKey('rework.withgoogle.com')).toBe('withgoogle.com');
  });

  it('structured logos: organisations of this site only, whatever the nesting; a broken script is skipped', () => {
    const scripts = [
      '{"@type":"NewsArticle","publisher":{"@type":"NewsMediaOrganization","name":"MIT TR","logo":{"url":"/logo.svg"}}}',
      '{not json',
      '[{"@type":["Organization","Brand"],"url":"https://www.technologyreview.com","logo":["https://cdn.tr.com/a.png"]}]',
      '{"@type":"Organization","url":"https://elsewhere.org","logo":"https://elsewhere.org/l.png"}',
    ];
    expect(structuredLogos(scripts, 'www.technologyreview.com')).toEqual(['/logo.svg', 'https://cdn.tr.com/a.png']);
  });

  it('reads attributes in any order and quoting, and only from the head', () => {
    const h = readHead(`<head><LINK HREF=/a.png REL='apple-touch-icon' SIZES=152x152><meta content="Desc" name=description></head><body><link rel="icon" href="/late.png"></body>`, 'x.com');
    expect(h.icons).toEqual([{ href: '/a.png', rel: 'touch', size: 152, svg: false }]);
    expect(h.description).toBe('Desc');
  });

  it("decodes a page in the encoding its header or its own meta names", () => {
    const latin = new Uint8Array([...new TextEncoder().encode('<head><meta charset="iso-8859-1"><title>Caf'), 0xe9, ...new TextEncoder().encode('</title></head>')]);
    expect(readHead(textOf(latin, 'text/html'), 'x.fr').title).toBe('Café');
    expect(readHead(textOf(latin, 'text/html; charset=windows-1252'), 'x.fr').title).toBe('Café');
  });

  it('ranks: no page means the usual addresses; a page with a touch icon is not given the usual one', () => {
    const page = new URL('https://x.com/');
    expect(rankIcons(page, null, null).map(c => c.url)).toEqual(['https://x.com/apple-touch-icon.png', 'https://x.com/favicon.ico']);
    const head = readHead('<head><link rel="apple-touch-icon" href="/t.png"></head>', 'x.com');
    expect(rankIcons(page, head, null).map(c => c.url)).toEqual(['https://x.com/t.png', 'https://x.com/favicon.ico']);
  });

  it('tells an ICO and an SVG by their bytes', () => {
    expect(isIco(ICO)).toBe(true);
    expect(isIco(PNG)).toBe(false);
    expect(isSvg(SVG)).toBe(true);
    expect(isSvg(new TextEncoder().encode('<!DOCTYPE html><html><svg/></html>'))).toBe(false);
  });
});
