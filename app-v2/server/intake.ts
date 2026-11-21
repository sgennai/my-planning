// /api/intake — Intake's only way to Instapaper (API v2), read only.
//
//   GET /api/intake/status               the token is set and accepted; whether the account is Premium
//   GET /api/intake/sync?since=&offset=  every bookmark changed since `since` (Unix seconds), with the ids
//                                        deleted; `complete: false` and `nextOffset` when cut short
//   GET /api/intake/articles/<id>        one article as Instapaper parsed it: its HTML body and metadata
//   GET /api/intake/folders              folder names
//   GET /api/intake/tags                 tag names
//   GET /api/intake/image?url=&s=        an article's picture, for the reader to keep on the device (D4); `s`
//                                        the signature this server gave with the article or the library
//
// The token (INSTAPAPER_ACCESS_TOKEN, a Pages secret) only ever goes to Instapaper: one host, fixed paths,
// numeric ids, and no redirect followed, as the official SDK does. Nothing is written to Instapaper and
// nothing is cached here; each device keeps its own copy. Behind the site's login like every other path
// (functions/_middleware.ts).

import type { SyncedBookmark, ParsedArticle } from '../src/intake/types';

export interface IntakeEnv {
  INSTAPAPER_ACCESS_TOKEN?: string;
}

export const INSTAPAPER_API = 'https://www.instapaper.com/api/2';
// The API's largest page, and 40 of them a call: 20,000 bookmarks, inside a Function's subrequest allowance.
// A larger account comes back in more calls, through `nextOffset`.
const PAGE = 500;
const MAX_PAGES = 40;
const TIMEOUT_MS = 15_000;
// Instapaper extracts an article when first asked, which can take longer than a list.
const PARSE_TIMEOUT_MS = 25_000;
const ID = /^\d{1,15}$/;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});
const fail = (status: number, code: string, message: string, headers?: Record<string, string>) => json(status, { error: { code, message } }, headers);

class InstapaperError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  constructor(status: number, message: string, retryAfter: string | null = null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function instapaper(path: string, token: string, fetchImpl: typeof fetch, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(INSTAPAPER_API + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new InstapaperError(0, 'unreachable');
  }
  // A redirect is refused, never followed: it would send the token elsewhere.
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) throw new InstapaperError(302, 'redirect');
  if (!response.ok) {
    let message = '';
    try { message = String(((await response.json()) as { error?: { message?: unknown } }).error?.message ?? ''); } catch { /* not JSON */ }
    throw new InstapaperError(response.status, message, response.headers.get('Retry-After'));
  }
  return response.json();
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function bookmarkOf(raw: unknown): SyncedBookmark | null {
  const b = raw as Record<string, unknown>;
  const id = num(b?.id);
  if (id === null) return null;
  const progress = b.progress as { percentage?: unknown } | null | undefined;
  return {
    id,
    url: str(b.url),
    title: str(b.title),
    description: str(b.description),
    image: str(b.image),
    author: str(b.author),
    savedAt: num(b.time),
    publishedAt: num(b.pubtime),
    archived: b.archived === true,
    liked: b.liked === true,
    folderId: num(b.folder_id),
    tags: Array.isArray(b.tags) ? b.tags.map(t => str((t as { name?: unknown })?.name)).filter((t): t is string => !!t) : [],
    category: num(b.category) ?? 0,
    instapaperProgress: Math.min(1, Math.max(0, num(progress?.percentage) ?? 0)),
    privateSource: str(b.private_source),
    imageSig: null,
  };
}

export function articleOf(id: number, raw: unknown): ParsedArticle {
  const r = raw as { metadata?: Record<string, unknown>; content?: Record<string, unknown> };
  const m = r?.metadata ?? {}, c = r?.content ?? {};
  const author = m.author as { name?: unknown; url?: unknown } | null | undefined;
  const direction = c.direction === 'rtl' ? 'rtl' : c.direction === 'ltr' ? 'ltr' : null;
  return {
    id,
    title: str(m.title),
    author: str(author?.name),
    authorUrl: str(author?.url),
    publishedAt: num(m.pubtime),
    thumbnail: str(m.thumbnail),
    description: str(m.description),
    category: num(m.category) ?? 0,
    html: str(c.body),
    images: Array.isArray(c.images) ? c.images.filter((u): u is string => typeof u === 'string') : [],
    words: num(c.words),
    paywalled: c.paywalled === true,
    direction,
    sigs: {},
  };
}

/** What a failure from Instapaper means for the app, never echoing anything sent. */
function failure(e: unknown, article = false): Response {
  if (!(e instanceof InstapaperError)) return fail(502, 'upstream', 'Instapaper answered in a way the app does not understand.');
  switch (true) {
    case e.status === 0: return fail(504, 'unreachable', "Couldn't reach Instapaper.");
    case e.status === 302: return fail(502, 'upstream', 'Instapaper redirected the request; it was not followed.');
    case e.status === 401: return fail(502, 'auth-failed', 'Instapaper refused the token (INSTAPAPER_ACCESS_TOKEN). Regenerate it on Instapaper and store the new one.');
    case e.status === 403: return fail(502, 'forbidden', 'Instapaper refused this request for the application.');
    case e.status === 402: return fail(502, 'quota', "Instapaper's parsing quota is used up.");
    case e.status === 429: return fail(429, 'rate-limited', 'Instapaper asked to slow down. Try again shortly.', e.retryAfter ? { 'Retry-After': e.retryAfter } : undefined);
    case article && e.status === 400 && /not found/i.test(e.message): return fail(404, 'not-found', 'No such bookmark on this account.');
    case article && e.status === 400: return fail(422, 'unavailable', "Instapaper couldn't extract this article.");
    case e.status >= 500: return fail(502, 'upstream', 'Instapaper had a problem. Try again later.');
    default: return fail(502, 'upstream', `Instapaper refused the request (${e.status}).`);
  }
}

// ── Pictures (Intake 2.0 Phase 2, D4) ───────────────────────────────────────
// An article's picture, fetched here because the browser cannot read another site's image to keep it
// offline. Not a general fetcher:
// - only an address this server handed out itself, signed: an article's pictures (as Instapaper lists them
//   and as its HTML shows them) and its thumbnail with the article, a bookmark's picture with the library.
//   The signature is an HMAC of the address under a key derived from the Instapaper token, so it can't be
//   made anywhere else, and the token never leaves for a picture;
// - an http(s) address with a host name (no IP address, no port, no credentials, no local or reserved
//   name), whose every address, asked of Cloudflare's resolver, is public; each redirect checked the same,
//   three at most;
// - one of five raster types by its first bytes as well as its header (never SVG, which can carry script),
//   6 MB at most as it streams, 15 s for the whole of it;
// - 240 a minute per server instance;
// - the request carries nothing of ours (no cookie, token or referrer); nothing is cached or logged here.
// Behind the site's login like every path.
const IMAGE_TYPES = /^image\/(jpeg|png|gif|webp|avif)$/;
/** Also for tests, which shorten the time. */
export const IMAGE_LIMITS = { bytes: 6 * 1024 * 1024, hops: 3, timeoutMs: 15_000, perMinute: 240, perArticle: 500 };
export const DNS_API = 'https://cloudflare-dns.com/dns-query';
const RESERVED_NAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|arpa|test|example|invalid|onion|alt)$/;

export function imageAddress(raw: string | null): URL | null {
  if (!raw || raw.length > 2048) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  // A name, never an address: the URL parser has already written 2130706433, 0x7f.1 or 0177.1 as 127.0.0.1.
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
  if (RESERVED_NAME.test(host)) return null;
  return u;
}

/** An address anyone on the internet can reach: not private, loopback, link-local (the cloud metadata
 *  address among them), shared, documentation, benchmarking, multicast or reserved. IPv6: global unicast only. */
export function isPublicAddress(ip: string): boolean {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b, c] = v4.slice(1).map(Number);
    if (v4.slice(1).some(n => Number(n) > 255)) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99)
      || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
  }
  const w = ipv6Words(ip);
  if (!w) return false;
  if (w[0] < 0x2000 || w[0] > 0x3fff) return false; // mapped and NAT64 IPv4, ULA, link-local, multicast…
  if (w[0] === 0x2001 && w[1] < 0x200) return false; // IETF assignments: Teredo, benchmarking, ORCHID
  if (w[0] === 0x2001 && w[1] === 0xdb8) return false; // documentation
  if (w[0] === 0x2002) return false; // 6to4
  if (w[0] === 0x3fff && w[1] < 0x1000) return false; // documentation (RFC 9637)
  return true;
}

function ipv6Words(ip: string): number[] | null {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (!/^[0-9a-f:]+$/.test(s)) return null; // an embedded IPv4 or a zone: never global unicast anyway
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const gap = 8 - head.length - tail.length;
  if (halves.length === 1 ? gap !== 0 : gap < 1) return null;
  const words = [...head, ...Array<string>(halves.length === 2 ? gap : 0).fill('0'), ...tail];
  return words.every(h => /^[0-9a-f]{1,4}$/.test(h)) ? words.map(h => parseInt(h, 16)) : null;
}

/** Every address a name has, from Cloudflare's resolver (the one this runtime's own requests use); null if it can't say. */
export async function addressesOf(host: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<string[] | null> {
  const ask = async (type: 'A' | 'AAAA') => {
    const res = await fetchImpl(`${DNS_API}?name=${encodeURIComponent(host)}&type=${type}`, { headers: { Accept: 'application/dns-json' }, redirect: 'manual', signal });
    if (!res.ok) throw new Error('dns');
    const body = (await res.json()) as { Status?: unknown; Answer?: { type?: unknown; data?: unknown }[] };
    // 0: answered; 3: no such name. Anything else (a failure, a refusal) is no answer.
    if (body.Status !== 0 && body.Status !== 3) throw new Error('dns');
    return (Array.isArray(body.Answer) ? body.Answer : []).filter(a => a.type === (type === 'A' ? 1 : 28)).map(a => String(a.data));
  };
  try {
    const [v4, v6] = await Promise.all([ask('A'), ask('AAAA')]);
    return [...v4, ...v6];
  } catch {
    return null;
  }
}

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
/** The picture's type by its first bytes, whatever its header says: one of the five, or null. */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (/^GIF8[79]a$/.test(ascii(b, 0, 6))) return 'image/gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (ascii(b, 4, 8) === 'ftyp') {
    const box = Math.min(64, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
    if (/avi[fs]/.test(ascii(b, 8, Math.max(12, box)))) return 'image/avif';
  }
  return null;
}

/** The body, or null as soon as it passes `max` (the rest is never read). */
export async function readAtMost(response: Response, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

const encoder = new TextEncoder();
let signing: { token: string; key: Promise<CryptoKey> } | null = null;
/** The key that signs picture addresses: derived from the token, never the token itself. */
function signingKey(token: string): Promise<CryptoKey> {
  if (signing?.token !== token) {
    const key = (async () => {
      const root = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', root, encoder.encode('my-planning intake picture address v1'));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    })();
    signing = { token, key };
  }
  return signing.key;
}

/** 128 bits of HMAC-SHA-256 over the address, base64url. */
export async function signImage(token: string, address: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(token), encoder.encode(address)));
  return btoa(String.fromCharCode(...mac.subarray(0, 16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/** An absolute http(s) address as the URL parser writes it, which is how the reader asks for it. */
export function normalImageAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null; // relative, or not an address: not signed; the reader shows it from the publisher
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decodeAttribute = (s: string) => s.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (m, dec?: string, hex?: string, name?: string) => {
  try { return dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[name!.toLowerCase()] ?? m; } catch { return m; }
});

/** The pictures an article may ask for: those Instapaper lists, every `src` of its HTML, its thumbnail. */
export function imageAddressesOf(html: string | null, listed: string[], thumbnail: string | null): string[] {
  const out = new Set<string>();
  const add = (raw: string | null | undefined) => { const a = normalImageAddress(raw); if (a) out.add(a); };
  for (const m of (html ?? '').matchAll(/<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) add(decodeAttribute(m[1] ?? m[2] ?? m[3] ?? ''));
  listed.forEach(add);
  add(thumbnail);
  return [...out].slice(0, IMAGE_LIMITS.perArticle);
}

const signAll = async (token: string, addresses: string[]): Promise<Record<string, string>> =>
  Object.fromEntries(await Promise.all(addresses.map(async a => [a, await signImage(token, a)] as const)));

const pace = { since: 0, count: 0 };
/** Seconds to wait when this instance has fetched its share of pictures this minute; 0 otherwise. */
function tooMany(now: number): number {
  if (now - pace.since >= 60_000) { pace.since = now; pace.count = 0; }
  return ++pace.count > IMAGE_LIMITS.perMinute ? Math.max(1, Math.ceil((pace.since + 60_000 - now) / 1000)) : 0;
}
/** For tests: a new minute. */
export function _resetImagePace() { pace.since = 0; pace.count = 0; }

async function image(params: URLSearchParams, token: string, fetchImpl: typeof fetch): Promise<Response> {
  const raw = params.get('url');
  const start = imageAddress(raw);
  if (!start) return fail(400, 'bad-url', 'Not an image address this fetches.');
  if (!sameText(params.get('s') ?? '', await signImage(token, raw!))) return fail(403, 'unsigned', 'Only the pictures of your own articles are fetched here.');
  const wait = tooMany(Date.now());
  if (wait) return fail(429, 'rate-limited', 'Too many pictures at once. Try again shortly.', { 'Retry-After': String(wait) });
  try {
    return await fetchImage(start, fetchImpl, AbortSignal.timeout(IMAGE_LIMITS.timeoutMs));
  } catch {
    return fail(504, 'unreachable', "The image's site didn't answer in time.");
  }
}

async function fetchImage(start: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Response> {
  let url = start;
  let response: Response;
  for (let hop = 0; ; hop++) {
    const addresses = await addressesOf(url.hostname.replace(/\.$/, ''), fetchImpl, signal);
    if (!addresses) return fail(502, 'unreachable', "Couldn't look up the image's site.");
    if (!addresses.length || !addresses.every(isPublicAddress)) return fail(502, 'blocked', "The image's site is not on the public internet.");
    response = await fetchImpl(url.href, {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif', 'User-Agent': 'Mozilla/5.0 (compatible; RoutineReader/1.0)' },
      redirect: 'manual',
      signal,
    });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('Location') : null;
    if (!location) break;
    await response.body?.cancel().catch(() => undefined);
    let next: URL | null;
    try { next = hop < IMAGE_LIMITS.hops ? imageAddress(new URL(location, url).href) : null; } catch { next = null; }
    if (!next) return fail(502, 'blocked', 'The image moved somewhere this does not follow.');
    url = next;
  }
  const refuse = async (r: Response) => { await response.body?.cancel().catch(() => undefined); return r; };
  if (!response.ok) return refuse(fail(502, 'blocked', `The image's site refused it (${response.status}).`));
  if (!IMAGE_TYPES.test((response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase())) return refuse(fail(415, 'not-an-image', 'Not a picture this keeps.'));
  if (Number(response.headers.get('Content-Length')) > IMAGE_LIMITS.bytes) return refuse(fail(413, 'too-large', 'The picture is too large to keep.'));
  const bytes = await readAtMost(response, IMAGE_LIMITS.bytes);
  if (!bytes) return fail(413, 'too-large', 'The picture is too large to keep.');
  const type = sniffImage(bytes);
  if (!type) return fail(415, 'not-an-image', 'Not a picture this keeps.');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

const int = (v: string | null, min: number): number | null => (v !== null && /^\d{1,12}$/.test(v) && Number(v) >= min ? Number(v) : null);

export async function handleIntake(request: Request, env: IntakeEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return fail(405, 'method', 'Read only.');
  const url = new URL(request.url);
  const [what, id, ...rest] = url.pathname.replace(/^\/api\/intake\/?/, '').split('/');
  if (rest.length) return fail(404, 'not-found', 'No such path.');
  const token = env.INSTAPAPER_ACCESS_TOKEN?.trim();
  if (!token) return fail(503, 'not-configured', 'Instapaper is not connected yet (INSTAPAPER_ACCESS_TOKEN).');

  // Pictures are never sent the token: it only signs their addresses.
  if (what === 'image' && !id) return image(url.searchParams, token, fetchImpl);

  if (what === 'status' && !id) {
    try {
      const me = (await instapaper('/me', token, fetchImpl)) as { premium?: unknown };
      return json(200, { connected: true, premium: me?.premium === true });
    } catch (e) { return failure(e); }
  }

  if (what === 'sync' && !id) {
    const since = int(url.searchParams.get('since'), 1) ?? 1;
    let offset = int(url.searchParams.get('offset'), 0) ?? 0;
    const bookmarks: SyncedBookmark[] = [];
    const deletedIds: number[] = [];
    let complete = false;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const body = (await instapaper(`/bookmarks?since=${since}&limit=${PAGE}&offset=${offset}`, token, fetchImpl)) as { bookmarks?: unknown[]; deleted_ids?: unknown[] };
        const got = Array.isArray(body?.bookmarks) ? body.bookmarks : [];
        const gone = Array.isArray(body?.deleted_ids) ? body.deleted_ids.filter((d): d is number => typeof d === 'number') : [];
        for (const raw of got) { const b = bookmarkOf(raw); if (b) bookmarks.push(b); }
        deletedIds.push(...gone);
        // In since mode deleted ids share the page: the offset moves past both, and a short page is the last.
        offset += got.length + gone.length;
        if (got.length + gone.length < PAGE) { complete = true; break; }
      }
    } catch (e) { return failure(e); }
    // Each bookmark's picture, signed for the image endpoint as the reader will ask for it.
    await Promise.all(bookmarks.map(async b => {
      const address = normalImageAddress(b.image);
      b.imageSig = address ? await signImage(token, address) : null;
    }));
    return json(200, { bookmarks, deletedIds, complete, nextOffset: complete ? null : offset });
  }

  if (what === 'articles' && id) {
    if (!ID.test(id)) return fail(404, 'not-found', 'No such bookmark.');
    try {
      const article = articleOf(Number(id), await instapaper(`/bookmarks/${id}/parse`, token, fetchImpl, PARSE_TIMEOUT_MS));
      article.sigs = await signAll(token, imageAddressesOf(article.html, article.images, article.thumbnail));
      return json(200, article);
    } catch (e) { return failure(e, true); }
  }

  if ((what === 'folders' || what === 'tags') && !id) {
    try {
      const body = (await instapaper(`/${what}`, token, fetchImpl)) as Record<string, unknown>;
      const list = Array.isArray(body?.[what]) ? (body[what] as Record<string, unknown>[]) : [];
      return what === 'folders'
        ? json(200, { folders: list.map(f => ({ id: num(f.id), title: str(f.title) })).filter(f => f.id !== null) })
        : json(200, { tags: list.map(t => ({ id: num(t.id), name: str(t.name), count: num(t.count) ?? 0 })).filter(t => t.id !== null) });
    } catch (e) { return failure(e); }
  }

  return fail(404, 'not-found', 'No such path.');
}
