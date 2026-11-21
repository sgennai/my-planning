// /api/websites — what a website says about itself, for Intake › Websites. Read only, behind the site's login
// like every path (functions/_middleware.ts).
//
//   GET /api/websites/meta?url=          the page's name and description, and the logo and icons it names (its
//                                        structured data's organisation logo, Apple Touch icons, its web app
//                                        manifest's icons, its favicons, then the usual addresses), each icon's
//                                        address signed for /icon for an hour. Never its og:image: a banner, not
//                                        a logo.
//   GET /api/websites/icon?url=&e=&s=    one of those icons, as its bytes: a raster, an ICO or an SVG.
//
// Neither is a general fetcher. /meta reads one page (and its manifest) the user typed, keeps only the few
// fields above, and returns no markup; /icon fetches only an address /meta signed, within the hour. Both take
// Intake's picture rules (server/intake.ts): an http(s) host name, never an IP address, a port, credentials or a
// local or reserved name; every address the name resolves to public, asked again at each redirect; a size cap
// counted as it streams, one deadline, a pace per server instance; nothing of ours sent (Accept and User-Agent
// only), nothing logged or kept. An SVG is sent so the device can turn it into a picture: never drawn on the
// page as markup, and served here as an attachment, sandboxed, so opening its address shows nothing.
//
// The signing key is derived from the site's login password (BASIC_AUTH_PASS), with its own label, so no new
// secret is needed; changing the password only means icons are looked up again.
import { addressesOf, decodeAttribute, imageAddress, isPublicAddress, readAtMost, sniffImage } from './intake';

export interface WebsitesEnv {
  BASIC_AUTH_PASS?: string;
}

/** Also for tests, which shorten the time. */
export const SITE_LIMITS = {
  pageBytes: 768 * 1024, manifestBytes: 128 * 1024, iconBytes: 1024 * 1024, svgBytes: 512 * 1024,
  hops: 4, pageTimeoutMs: 8_000, manifestTimeoutMs: 4_000, iconTimeoutMs: 10_000, metaPerMinute: 60, iconPerMinute: 240, signedForS: 3600, icons: 8,
};
const USER_AGENT = 'Mozilla/5.0 (compatible; RoutineWebsites/1.0)';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
});
const fail = (status: number, code: string, message: string, headers?: Record<string, string>) => json(status, { error: { code, message } }, headers);

export type IconKind = 'logo' | 'touch' | 'manifest' | 'favicon';
export interface IconCandidate {
  url: string;
  kind: IconKind;
  /** The larger side it says it has, when it says. */
  size: number | null;
  svg: boolean;
  /** Not named by the site: one of the usual addresses, tried in case. */
  guess: boolean;
  e: number;
  s: string;
}
export interface SiteMeta {
  /** Where the page ended up, after its redirects. */
  url: string;
  name: string | null;
  description: string | null;
  icons: IconCandidate[];
  /** Whether the page itself was read (some sites refuse; their usual icon addresses are still offered). */
  read: boolean;
}

// ── The address ─────────────────────────────────────────────────────────────

/** What the user typed, as an address this reads: https added when no scheme is given. */
export function siteAddress(raw: string | null): URL | null {
  const t = raw?.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  return imageAddress(withScheme);
}

// ── Pace ────────────────────────────────────────────────────────────────────
const paces = { meta: { since: 0, count: 0 }, icon: { since: 0, count: 0 } };
function tooMany(which: 'meta' | 'icon', now: number): number {
  const p = paces[which];
  const limit = which === 'meta' ? SITE_LIMITS.metaPerMinute : SITE_LIMITS.iconPerMinute;
  if (now - p.since >= 60_000) { p.since = now; p.count = 0; }
  return ++p.count > limit ? Math.max(1, Math.ceil((p.since + 60_000 - now) / 1000)) : 0;
}
/** For tests: a new minute. */
export function _resetSitePace() { for (const p of Object.values(paces)) { p.since = 0; p.count = 0; } }

// ── Signing ─────────────────────────────────────────────────────────────────
const encoder = new TextEncoder();
let signing: { secret: string; key: Promise<CryptoKey> } | null = null;
function signingKey(secret: string): Promise<CryptoKey> {
  if (signing?.secret !== secret) {
    const key = (async () => {
      const root = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', root, encoder.encode('my-planning websites icon address v1'));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    })();
    signing = { secret, key };
  }
  return signing.key;
}
/** 128 bits of HMAC-SHA-256 over the expiry and the address, base64url. */
export async function signIcon(secret: string, address: string, expires: number): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(`${expires}\n${address}`)));
  return btoa(String.fromCharCode(...mac.subarray(0, 16))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

// ── Fetching, with the picture rules ───────────────────────────────────────

type Fetched = { ok: true; url: URL; response: Response } | { ok: false; code: string; url: URL };

/** One address, its redirects followed only to public hosts this would fetch itself. */
async function guarded(start: URL, accept: string, fetchImpl: typeof fetch, signal: AbortSignal, hops = SITE_LIMITS.hops): Promise<Fetched> {
  let url = start;
  for (let hop = 0; ; hop++) {
    const addresses = await addressesOf(url.hostname.replace(/\.$/, ''), fetchImpl, signal);
    if (!addresses) return { ok: false, code: 'unreachable', url };
    if (!addresses.length) return { ok: false, code: 'no-such-host', url };
    if (!addresses.every(isPublicAddress)) return { ok: false, code: 'blocked', url };
    const response = await fetchImpl(url.href, { headers: { Accept: accept, 'User-Agent': USER_AGENT }, redirect: 'manual', signal });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get('Location') : null;
    if (!location) return { ok: true, url, response };
    await response.body?.cancel().catch(() => undefined);
    let next: URL | null;
    try { next = hop < hops ? imageAddress(new URL(location, url).href) : null; } catch { next = null; }
    if (!next) return { ok: false, code: 'blocked', url };
    url = next;
  }
}

const decode = (bytes: Uint8Array, charset: string | null) => {
  try { return new TextDecoder(charset ?? 'utf-8').decode(bytes); } catch { return new TextDecoder().decode(bytes); }
};
const charsetOf = (s: string | null) => /charset\s*=\s*["']?([\w-]+)/i.exec(s ?? '')?.[1] ?? null;
/** The page's text in the encoding its header names, else the one its own <meta> names, else UTF-8. */
export function textOf(bytes: Uint8Array, headerType: string | null): string {
  const declared = charsetOf(headerType);
  if (declared) return decode(bytes, declared);
  const start = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  const own = /<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i.exec(start)?.[1] ?? null;
  return decode(bytes, own);
}

/** The start of a page: up to `max` bytes, ending early once its head has closed. Never null: a long page is cut. */
async function readStart(response: Response, max: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  const closed = (chunk: Uint8Array) => /<\/head\s*>|<body[\s>]/i.test(new TextDecoder('latin1').decode(chunk));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.byteLength;
    if (size >= max || closed(value)) { await reader.cancel().catch(() => undefined); break; }
  }
  const out = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const p of parts) { const take = Math.min(p.byteLength, out.length - at); out.set(p.subarray(0, take), at); at += take; if (at >= out.length) break; }
  return out;
}

// ── Reading the page's head ────────────────────────────────────────────────

const clean = (s: string | null | undefined, max = 300): string | null => {
  // Text only: any markup in it (a title written with tags, a description quoting some) is dropped.
  const t = decodeAttribute((s ?? '').replace(/<[^<>]{0,300}>/g, ' ')).replace(/<[^<>]{0,300}>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trimEnd()}…`;
};

function attributesOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = m[1].toLowerCase();
    if (!(name in out)) out[name] = decodeAttribute(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

const largest = (sizes: string | undefined): number | null => {
  if (!sizes) return null;
  if (/\bany\b/i.test(sizes)) return 512;
  let best = 0;
  for (const m of sizes.matchAll(/(\d{1,4})\s*x\s*(\d{1,4})/gi)) best = Math.max(best, Number(m[1]), Number(m[2]));
  return best || null;
};

interface HeadIcon { href: string; rel: string; size: number | null; svg: boolean }
export interface Head {
  title: string | null;
  siteName: string | null;
  appName: string | null;
  description: string | null;
  icons: HeadIcon[];
  manifest: string | null;
  logos: string[];
  /** The page's share pictures (og:image, twitter:image): banners, never taken for its logo. */
  banners: string[];
}

const ORGANISATION = /(Organization|Corporation|Company|NewsMediaOrganization|OnlineBusiness|OnlineStore|EducationalOrganization|GovernmentOrganization|NGO|Brand)$/i;

/** The organisation logos a page's structured data names for itself (an organisation's own `url`, when given, on the same site). */
export function structuredLogos(scripts: string[], pageHost: string): string[] {
  const out: string[] = [];
  const sameSite = (u: unknown) => {
    if (typeof u !== 'string') return true;
    try { return siteKey(new URL(u).hostname) === siteKey(pageHost); } catch { return true; }
  };
  const logoOf = (l: unknown): string | null => {
    if (typeof l === 'string') return l;
    if (Array.isArray(l)) return logoOf(l[0]);
    const o = l as { url?: unknown; contentUrl?: unknown } | null;
    return typeof o?.url === 'string' ? o.url : typeof o?.contentUrl === 'string' ? o.contentUrl : null;
  };
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6 || out.length >= 3) return;
    if (Array.isArray(node)) { for (const n of node) walk(n, depth + 1); return; }
    const o = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o['@type'] ?? []).map(String);
    if (types.some(t => ORGANISATION.test(t)) && o.logo && sameSite(o.url)) {
      const logo = logoOf(o.logo);
      if (logo && !out.includes(logo)) out.push(logo);
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  for (const s of scripts) {
    try { walk(JSON.parse(s.trim()), 0); } catch { /* not JSON: ignored */ }
  }
  return out;
}

/** The registrable part of a host, closely enough to tell a site's own pages: the last two labels, or three under a two-letter country's second level. */
export function siteKey(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const n = labels.length;
  const secondLevel = n >= 3 && labels[n - 1].length === 2 && /^(co|com|org|net|ac|gov|edu|ne|or|go)$/.test(labels[n - 2]);
  return labels.slice(secondLevel ? -3 : -2).join('.');
}

export function readHead(html: string, pageHost: string): Head {
  const end = html.search(/<\/head\s*>|<body[\s>]/i);
  const head = end > 0 ? html.slice(0, end) : html.slice(0, 200_000);
  const metas = new Map<string, string>();
  const icons: HeadIcon[] = [];
  let manifest: string | null = null;
  for (const m of head.matchAll(/<(meta|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const a = attributesOf(m[2]);
    if (m[1].toLowerCase() === 'meta') {
      const key = (a.property ?? a.name ?? '').toLowerCase();
      if (key && a.content && !metas.has(key)) metas.set(key, a.content);
      continue;
    }
    const rel = (a.rel ?? '').toLowerCase().split(/\s+/);
    const href = a.href?.trim();
    if (!href || href.startsWith('data:')) continue;
    if (rel.includes('manifest')) { manifest ??= href; continue; }
    // A pinned tab's mask icon is one flat colour by design: not a logo.
    if (rel.includes('mask-icon')) continue;
    const touch = rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed');
    if (touch || rel.includes('icon')) {
      const svg = /svg/i.test(a.type ?? '') || /\.svg(?:[?#]|$)/i.test(href);
      icons.push({ href, rel: touch ? 'touch' : 'icon', size: largest(a.sizes), svg });
    }
  }
  const scripts = [...html.slice(0, 400_000).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(m => /application\/ld\+json/i.test(attributesOf(m[1]).type ?? ''))
    .map(m => m[2]);
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1] ?? null;
  return {
    title: clean(title, 160),
    siteName: clean(metas.get('og:site_name'), 120),
    appName: clean(metas.get('application-name') ?? metas.get('apple-mobile-web-app-title'), 120),
    description: clean(metas.get('description') ?? metas.get('og:description') ?? metas.get('twitter:description')),
    icons,
    manifest,
    logos: structuredLogos(scripts, pageHost),
    banners: ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].map(k => metas.get(k)).filter((v): v is string => !!v),
  };
}

// A file named as a share picture or a banner: some sites name their social picture as the publisher's logo.
const BANNER_NAME = /(^|[/_.-])(og|open-?graph|social|share|sharing|banner|cover|hero|featured|default-?image|thumbnail)([/_.-]|image|$)/i;

/** A page title without its tagline: "Name | Tagline" or "Tagline — Name" kept to the part that names the site. */
export function nameFromTitle(title: string | null, host: string): string | null {
  if (!title) return null;
  const parts = title.split(/\s+[|·•—–-]\s+|\s+[\\/]\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return title;
  const bare = siteKey(host).split('.')[0].toLowerCase();
  const named = parts.find(p => p.toLowerCase().replace(/[^a-z0-9]/g, '').includes(bare.replace(/[^a-z0-9]/g, '')));
  return named ?? parts[0];
}

interface ManifestIcon { src: string; size: number | null; svg: boolean; maskable: boolean }
export function readManifest(text: string): { name: string | null; description: string | null; icons: ManifestIcon[] } {
  let m: Record<string, unknown>;
  try { m = JSON.parse(text) as Record<string, unknown>; } catch { return { name: null, description: null, icons: [] }; }
  const icons: ManifestIcon[] = [];
  for (const i of Array.isArray(m?.icons) ? (m.icons as Record<string, unknown>[]) : []) {
    if (typeof i?.src !== 'string' || i.src.startsWith('data:')) continue;
    const purpose = typeof i.purpose === 'string' ? i.purpose.toLowerCase().split(/\s+/) : ['any'];
    if (!purpose.includes('any') && !purpose.includes('maskable')) continue; // monochrome only: a silhouette
    icons.push({ src: i.src, size: largest(typeof i.sizes === 'string' ? i.sizes : undefined), svg: /svg/i.test(String(i.type ?? '')) || /\.svg(?:[?#]|$)/i.test(i.src), maskable: !purpose.includes('any') });
  }
  return {
    name: clean(typeof m.name === 'string' ? m.name : typeof m.short_name === 'string' ? m.short_name : null, 120),
    description: clean(typeof m.description === 'string' ? m.description : null),
    icons,
  };
}

const absolute = (href: string, base: URL): string | null => {
  try {
    const u = new URL(href, base);
    u.hash = '';
    return imageAddress(u.href) ? u.href : null;
  } catch { return null; }
};

/** The candidates in the order they are tried: the official logo, the touch and app icons (largest first), the favicons, then the usual addresses. */
export function rankIcons(page: URL, head: Head | null, manifest: { base: URL; icons: ManifestIcon[] } | null): Omit<IconCandidate, 'e' | 's'>[] {
  const out: Omit<IconCandidate, 'e' | 's'>[] = [];
  const add = (href: string | null, kind: IconKind, size: number | null, svg: boolean, guess = false) => {
    if (!href || out.some(c => c.url === href)) return;
    out.push({ url: href, kind, size, svg, guess });
  };
  const bySize = <T extends { size: number | null; svg: boolean }>(a: T, b: T) => (b.size ?? (b.svg ? 256 : 0)) - (a.size ?? (a.svg ? 256 : 0));
  const banners = new Set((head?.banners ?? []).map(b => absolute(b, page)));
  for (const l of head?.logos ?? []) {
    const at = absolute(l, page);
    if (!at || banners.has(at) || BANNER_NAME.test(new URL(at).pathname)) continue;
    add(at, 'logo', null, /\.svg(?:[?#]|$)/i.test(l));
  }
  for (const i of (head?.icons ?? []).filter(i => i.rel === 'touch').sort(bySize)) add(absolute(i.href, page), 'touch', i.size, i.svg);
  if (manifest) {
    const icons = [...manifest.icons].sort((a, b) => Number(a.maskable) - Number(b.maskable) || bySize(a, b));
    for (const i of icons) add(absolute(i.src, manifest.base), 'manifest', i.size, i.svg);
  }
  // Favicons: the larger rasters first, then an SVG, then the small ones.
  const favicons = (head?.icons ?? []).filter(i => i.rel === 'icon');
  const rank = (i: HeadIcon) => (i.svg ? 64 : i.size ?? 16);
  for (const i of [...favicons].sort((a, b) => rank(b) - rank(a))) add(absolute(i.href, page), 'favicon', i.size, i.svg);
  if (!head?.icons.some(i => i.rel === 'touch')) add(absolute('/apple-touch-icon.png', page), 'touch', 180, false, true);
  add(absolute('/favicon.ico', page), 'favicon', null, false, true);
  return out.slice(0, SITE_LIMITS.icons);
}

async function meta(params: URLSearchParams, secret: string, fetchImpl: typeof fetch): Promise<Response> {
  const start = siteAddress(params.get('url'));
  if (!start) return fail(400, 'bad-url', 'Not a website address this reads: http or https, with a public host name.');
  start.hash = '';
  const wait = tooMany('meta', Date.now());
  if (wait) return fail(429, 'rate-limited', 'Too many look-ups at once. Try again shortly.', { 'Retry-After': String(wait) });
  let page: URL = start;
  let head: Head | null = null;
  // A page that refuses, drops the connection or takes too long is not read; its usual icon addresses are still
  // offered (some sites refuse automated readers but not their icons). Only an address that can't be a public
  // website is refused outright.
  try {
    const got = await guarded(start, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', fetchImpl, AbortSignal.timeout(SITE_LIMITS.pageTimeoutMs));
    if (!got.ok && got.code === 'blocked') return fail(422, 'blocked', 'That address is not on the public internet, or moved somewhere that is not.');
    if (!got.ok && got.code === 'no-such-host') return fail(422, 'no-such-host', 'No website answers at that address. Check its spelling.');
    if (!got.ok) return fail(502, 'unreachable', "Couldn't look up that website.");
    page = got.url;
    const type = got.response.headers.get('Content-Type');
    if (got.response.ok && /^(text\/html|application\/xhtml\+xml)\b/i.test(type ?? 'text/html')) {
      // Only the start is read: the head, or the cap, whichever comes first.
      const bytes = await readStart(got.response, SITE_LIMITS.pageBytes).catch(() => null);
      if (bytes) head = readHead(textOf(bytes, type), page.hostname);
    } else {
      await got.response.body?.cancel().catch(() => undefined);
    }
  } catch { /* not read: see above */ }
  let manifest: { base: URL; icons: ManifestIcon[]; name: string | null; description: string | null } | null = null;
  const manifestUrl = head?.manifest ? absolute(head.manifest, page) : null;
  if (manifestUrl) {
    try {
      const got = await guarded(new URL(manifestUrl), 'application/manifest+json,application/json;q=0.9', fetchImpl, AbortSignal.timeout(SITE_LIMITS.manifestTimeoutMs), 2);
      if (got.ok && got.response.ok) {
        const bytes = await readAtMost(got.response, SITE_LIMITS.manifestBytes).catch(() => null);
        if (bytes) manifest = { base: got.url, ...readManifest(new TextDecoder().decode(bytes)) };
      } else if (got.ok) await got.response.body?.cancel().catch(() => undefined);
    } catch { /* no manifest: the page's own icons stand */ }
  }
  const expires = Math.floor(Date.now() / 1000) + SITE_LIMITS.signedForS;
  const icons = await Promise.all(rankIcons(page, head, manifest).map(async c => ({ ...c, e: expires, s: await signIcon(secret, c.url, expires) })));
  const body: SiteMeta = {
    url: page.href,
    name: head?.siteName ?? head?.appName ?? manifest?.name ?? nameFromTitle(head?.title ?? null, page.hostname),
    description: head?.description ?? manifest?.description ?? null,
    icons,
    read: head !== null,
  };
  return json(200, body);
}

// ── Icons ───────────────────────────────────────────────────────────────────

/** An ICO file: reserved 0, type 1, at least one image. */
export const isIco = (b: Uint8Array) => b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && (b[4] | (b[5] << 8)) > 0;
/** An SVG document: an <svg> root after any declaration, comment or doctype; never HTML. */
export function isSvg(b: Uint8Array): boolean {
  const text = new TextDecoder().decode(b.subarray(0, 4096)); // a byte-order mark is dropped by the decoder
  const rest = text.replace(/^(\s|<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, '');
  return /^<svg[\s>]/i.test(rest) && !/<html[\s>]/i.test(text);
}

async function icon(params: URLSearchParams, secret: string, fetchImpl: typeof fetch): Promise<Response> {
  const raw = params.get('url');
  const start = imageAddress(raw);
  if (!start) return fail(400, 'bad-url', 'Not an icon address this fetches.');
  const e = Number(params.get('e'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(e) || e < now || e > now + SITE_LIMITS.signedForS + 60
    || !sameText(params.get('s') ?? '', await signIcon(secret, raw!, e))) {
    return fail(403, 'unsigned', 'Only an icon a website look-up found, within the hour, is fetched here.');
  }
  const wait = tooMany('icon', Date.now());
  if (wait) return fail(429, 'rate-limited', 'Too many icons at once. Try again shortly.', { 'Retry-After': String(wait) });
  try {
    const signal = AbortSignal.timeout(SITE_LIMITS.iconTimeoutMs);
    const got = await guarded(start, 'image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*;q=0.8', fetchImpl, signal, 3);
    if (!got.ok) return fail(502, got.code === 'unreachable' ? 'unreachable' : 'blocked', got.code === 'unreachable' ? "Couldn't reach the icon's site." : "The icon's site is not on the public internet.");
    const response = got.response;
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); return fail(502, 'refused', `The icon's site refused it (${response.status}).`); }
    if (Number(response.headers.get('Content-Length')) > SITE_LIMITS.iconBytes) { await response.body?.cancel().catch(() => undefined); return fail(413, 'too-large', 'The icon is too large.'); }
    const bytes = await readAtMost(response, SITE_LIMITS.iconBytes);
    if (!bytes) return fail(413, 'too-large', 'The icon is too large.');
    const common = {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Length': String(bytes.byteLength),
    };
    const raster = sniffImage(bytes);
    if (raster) return new Response(bytes, { status: 200, headers: { ...common, 'Content-Type': raster } });
    if (isIco(bytes)) return new Response(bytes, { status: 200, headers: { ...common, 'Content-Type': 'image/x-icon' } });
    if (bytes.byteLength <= SITE_LIMITS.svgBytes && isSvg(bytes)) {
      return new Response(bytes, { status: 200, headers: { ...common, 'Content-Type': 'image/svg+xml', 'Content-Disposition': 'attachment; filename="icon.svg"' } });
    }
    return fail(415, 'not-an-image', 'Not an icon this keeps.');
  } catch {
    return fail(504, 'unreachable', "The icon's site didn't answer in time.");
  }
}

export async function handleWebsites(request: Request, env: WebsitesEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return fail(405, 'method', 'Read only.');
  const url = new URL(request.url);
  const what = url.pathname.replace(/^\/api\/websites\/?/, '');
  const secret = env.BASIC_AUTH_PASS;
  if (!secret) return fail(503, 'not-configured', 'The site login is not configured.');
  if (what === 'meta') return meta(url.searchParams, secret, fetchImpl);
  if (what === 'icon') return icon(url.searchParams, secret, fetchImpl);
  return fail(404, 'not-found', 'No such path.');
}
