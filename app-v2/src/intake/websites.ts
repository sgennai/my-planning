// Intake › Websites: the sites you keep, synced between your devices as the app's own records in `content`,
// beside Takeaways and your highlights. One record each, type `intake-website`, id `ws:<uuid>`:
// its address, name, description, topic (`category`), tags, your note, whether it is pinned and where among the
// pinned (`pinRank`, ascending), and its logo as found when it was added (`logo`: small pictures made on the
// device from the site's own icons, site-logo.ts; synced so every device shows them, offline too).
//
// Between devices a record merges field by field (`mergeWebsite`): every change by your hand stamps the fields it
// changed (`stamps`), and for each field the later stamp wins, so pinning on one device and editing the note on
// another, both offline, keeps both. A removal stands (storage/merge.ts, `removalWins`): no copy from a device
// that had not seen it brings the website back. Nothing here is ever written by the app on its own.
import { generateId } from '../ui/helpers';

export const WEBSITE_TYPE = 'intake-website';
export const isWebsiteId = (id: string) => id.startsWith('ws:');

/** The topics a website can be filed under to begin with; any you type are added after them. */
export const DEFAULT_CATEGORIES = [
  'Enterprise AI', 'Customer Engagement', 'Sales & GTM', 'Strategy & Research', 'Technology & Product', 'Productivity & Learning',
] as const;

export type LogoKind = 'logo' | 'touch' | 'manifest' | 'favicon';
export interface LogoImage {
  /** A PNG made on the device (a data: address), never the site's own file. */
  data: string;
  w: number;
  h: number;
  kind: LogoKind;
  /** Where it was found. */
  src: string;
  /** Opaque to its edges (an app icon): shown filling its frame, not on a plate. */
  bleed: boolean;
  /** The plate that keeps it readable: a light logo goes on a dark one. */
  plate: 'light' | 'dark';
}
export interface WebsiteLogo {
  /** About square: lists, and wherever a wordmark is not wanted or not found. */
  square: LogoImage | null;
  /** The site's official wordmark, when it names one: wide cards. */
  wide: LogoImage | null;
  /** The two colours of its card, taken from the logo; null when it has none to give. */
  palette: [string, string] | null;
  checkedAt: string;
}

// ── A logo, checked before it is shown ─────────────────────────────────────
// A record can come from another device, or be damaged: only what this app's logo pipeline makes is drawn (a PNG
// data address, within its sizes); anything else gives the website's initials. Never SVG, HTML or another address.
export const LOGO_LIMITS = { chars: 48 * 1024, square: 128, wideW: 384, wideH: 96 } as const;
const PNG_DATA = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/;
const KINDS: readonly LogoKind[] = ['logo', 'touch', 'manifest', 'favicon'];
const dimension = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= max;

export function safeLogoImage(x: unknown, slot: 'square' | 'wide'): LogoImage | null {
  const i = x as Partial<LogoImage> | null | undefined;
  if (!i || typeof i !== 'object' || typeof i.data !== 'string' || i.data.length > LOGO_LIMITS.chars || !PNG_DATA.test(i.data)) return null;
  const maxW = slot === 'square' ? LOGO_LIMITS.square : LOGO_LIMITS.wideW;
  const maxH = slot === 'square' ? LOGO_LIMITS.square : LOGO_LIMITS.wideH;
  if (!dimension(i.w, maxW) || !dimension(i.h, maxH)) return null;
  return {
    data: i.data, w: i.w, h: i.h,
    kind: KINDS.includes(i.kind as LogoKind) ? (i.kind as LogoKind) : 'favicon',
    src: typeof i.src === 'string' ? i.src : '',
    bleed: i.bleed === true,
    plate: i.plate === 'dark' ? 'dark' : 'light',
  };
}

/** The card's two colours, only as two #rrggbb values. */
export const safePalette = (p: unknown): [string, string] | null =>
  Array.isArray(p) && p.length === 2 && p.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? [p[0], p[1]] : null;

export const FIELDS = ['url', 'name', 'description', 'category', 'tags', 'note', 'pinned', 'pinRank', 'logo'] as const;
export type Field = typeof FIELDS[number];

export interface Website {
  id: string;
  type: typeof WEBSITE_TYPE;
  v: 1;
  url: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  note: string;
  pinned: boolean;
  pinRank: number;
  logo: WebsiteLogo | null;
  createdAt: string;
  editedAt: string;
  stamps: Partial<Record<Field, string>>;
}
export type WebsiteInput = Pick<Website, 'url' | 'name' | 'description' | 'category' | 'tags' | 'note' | 'pinned'> & { logo?: WebsiteLogo | null };

export const isWebsite = (r: unknown): r is Website => {
  const x = r as Partial<Website> & { _deleted?: unknown } | null;
  return !!x && !x._deleted && x.type === WEBSITE_TYPE && typeof x.id === 'string' && isWebsiteId(x.id)
    && typeof x.url === 'string' && typeof x.name === 'string';
};

/** Every website, as the app shows them: a record from a later version keeps what this one reads. */
export function websitesOf(content: unknown[] | undefined): Website[] {
  return (content ?? []).filter(isWebsite).map(w => ({
    ...w,
    description: typeof w.description === 'string' ? w.description : '',
    category: typeof w.category === 'string' && w.category.trim() ? w.category : DEFAULT_CATEGORIES[0],
    tags: Array.isArray(w.tags) ? w.tags.filter((t): t is string => typeof t === 'string') : [],
    note: typeof w.note === 'string' ? w.note : '',
    pinned: w.pinned === true,
    pinRank: typeof w.pinRank === 'number' && Number.isFinite(w.pinRank) ? w.pinRank : 0,
    logo: w.logo ?? null,
    stamps: w.stamps ?? {},
  }));
}

// ── Addresses ───────────────────────────────────────────────────────────────

/** What was typed, as an address to keep: https added when no scheme is given; http(s) with a host only. */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.') || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

export const domainOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|ref_src)$/i;
/**
 * What makes two addresses the same website for the library: the same host (with or without `www.`, http or
 * https), the same path (a closing slash aside, case kept: paths can differ by case) and the same query, less
 * tracking tags. Two pages of one site are two websites; nothing is matched by domain alone.
 */
export function urlKey(url: string): string {
  try {
    const u = new URL(normalizeUrl(url) ?? url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const query = [...u.searchParams].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
    return `${host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export const findDuplicate = (sites: Website[], url: string, except?: string): Website | undefined => {
  const key = urlKey(url);
  return sites.find(s => s.id !== except && urlKey(s.url) === key);
};

// ── Search, topics ─────────────────────────────────────────────────────────

/** Lower case, accents and other marks gone: "Équipe" and "equipe" match. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

/** Every word of the search, in its name, domain, description, topic, tags or note. */
export function matchesQuery(site: Website, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([site.name, domainOf(site.url), site.url, site.description, site.category, site.tags.join(' '), site.note].join('\n'));
  return words.every(w => hay.includes(w));
}

/** The topics in order: the six to begin with, then your own (alphabetical), each with how many websites it holds. */
export function categoriesOf(sites: Website[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of sites) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  const own = [...counts.keys()].filter(c => !(DEFAULT_CATEGORIES as readonly string[]).includes(c)).sort((a, b) => fold(a).localeCompare(fold(b)));
  return [...DEFAULT_CATEGORIES, ...own].map(name => ({ name, count: counts.get(name) ?? 0 }));
}

export const byName = (a: Website, b: Website) => fold(a.name).localeCompare(fold(b.name)) || a.createdAt.localeCompare(b.createdAt);

/** Tags as typed in one field: split on commas, trimmed, each kept once (case aside), 20 at most. */
export function tagsFrom(text: string): string[] {
  const out: string[] = [];
  for (const t of text.split(',').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)) {
    if (!out.some(o => fold(o) === fold(t))) out.push(t.slice(0, 40));
  }
  return out.slice(0, 20);
}

// ── Pinned & ready ─────────────────────────────────────────────────────────

export const pinnedOf = (sites: Website[]) => sites.filter(s => s.pinned).sort((a, b) => a.pinRank - b.pinRank || byName(a, b));

/** A rank after every pinned website: a website pinned now goes last. */
export const lastRank = (sites: Website[]) => Math.max(0, ...pinnedOf(sites).map(s => s.pinRank)) + 1;

/**
 * The rank that puts a pinned website at `to` (0-based) among the others, changing that website alone: between its
 * new neighbours' ranks. Close ranks are spread again (all of them) only when two would become equal.
 */
export function moveTo(sites: Website[], id: string, to: number): { id: string; pinRank: number }[] {
  const order = pinnedOf(sites);
  const from = order.findIndex(s => s.id === id);
  if (from < 0) return [];
  const rest = order.filter(s => s.id !== id);
  const at = Math.max(0, Math.min(to, rest.length));
  if (at === from) return [];
  const before = rest[at - 1]?.pinRank;
  const after = rest[at]?.pinRank;
  const rank = before === undefined ? (after ?? 1) - 1 : after === undefined ? before + 1 : (before + after) / 2;
  if (rank !== before && rank !== after && Number.isFinite(rank)) return [{ id, pinRank: rank }];
  // Worn too fine to split: number them all again, in the new order.
  const next = [...rest.slice(0, at), order[from], ...rest.slice(at)];
  return next.map((s, i) => ({ id: s.id, pinRank: i + 1 })).filter(c => c.pinRank !== sites.find(s => s.id === c.id)?.pinRank);
}

// ── Records ────────────────────────────────────────────────────────────────

const stamp = (now: Date) => now.toISOString();
const cleanText = (s: string, max: number) => s.replace(/\r\n?/g, '\n').trim().slice(0, max);

export function newWebsite(input: WebsiteInput, sites: Website[], now = new Date()): Website {
  const at = stamp(now);
  return {
    id: `ws:${generateId()}`,
    type: WEBSITE_TYPE,
    v: 1,
    url: input.url,
    name: cleanText(input.name, 120) || domainOf(input.url),
    description: cleanText(input.description, 600),
    category: cleanText(input.category, 60) || DEFAULT_CATEGORIES[0],
    tags: input.tags,
    note: cleanText(input.note, 4000),
    pinned: input.pinned,
    pinRank: input.pinned ? lastRank(sites) : 0,
    logo: input.logo ?? null,
    createdAt: at,
    editedAt: at,
    stamps: Object.fromEntries(FIELDS.map(f => [f, at])),
  };
}

export const withWebsite = (content: unknown[] | undefined, w: Website): unknown[] => [...(content ?? []), w];
export const withoutWebsite = (content: unknown[] | undefined, id: string): unknown[] => (content ?? []).filter(r => (r as { id?: unknown })?.id !== id);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Your change to one website: only the fields that differ are written, and each is stamped. */
export function updateWebsite(content: unknown[] | undefined, id: string, patch: Partial<Pick<Website, Field>>, now = new Date()): unknown[] {
  const at = stamp(now);
  let changed = false;
  const next = (content ?? []).map(r => {
    if (!isWebsite(r) || r.id !== id) return r;
    const fields = (Object.keys(patch) as Field[]).filter(f => FIELDS.includes(f) && !same(patch[f], r[f]));
    if (!fields.length) return r;
    changed = true;
    const clean: Partial<Website> = { ...patch };
    if (typeof clean.name === 'string') clean.name = cleanText(clean.name, 120) || domainOf(clean.url ?? r.url);
    if (typeof clean.description === 'string') clean.description = cleanText(clean.description, 600);
    if (typeof clean.note === 'string') clean.note = cleanText(clean.note, 4000);
    if (typeof clean.category === 'string') clean.category = cleanText(clean.category, 60) || r.category;
    const picked = Object.fromEntries(fields.map(f => [f, clean[f]]));
    return { ...r, ...picked, editedAt: at, stamps: { ...(r.stamps ?? {}), ...Object.fromEntries(fields.map(f => [f, at])) } };
  });
  return changed ? next : (content ?? []);
}

/** Several websites changed at once (a new order of the pinned): one write. */
export function updateWebsites(content: unknown[] | undefined, changes: { id: string; patch: Partial<Pick<Website, Field>> }[], now = new Date()): unknown[] {
  return changes.reduce((c, { id, patch }) => updateWebsite(c, id, patch, now), content ?? []);
}

/** Pinned now goes last among the pinned; unpinned keeps its place in its topic. */
export function pinPatch(sites: Website[], site: Website, pinned: boolean): Partial<Pick<Website, Field>> {
  return pinned ? { pinned: true, pinRank: site.pinned ? site.pinRank : lastRank(sites) } : { pinned: false };
}

/**
 * The same website as two devices wrote it, merged field by field: each field from the copy that changed it
 * last (`stamps`; a tie goes to the larger value, so both devices reach the same result). Null when either is
 * not a website, which leaves it to last-write-wins.
 */
export function mergeWebsite(local: unknown, remote: unknown): Website | null {
  if (!isWebsite(local) || !isWebsite(remote) || local.id !== remote.id) return null;
  const l = local.stamps ?? {}, r = remote.stamps ?? {};
  const out: Record<string, unknown> = { ...remote };
  const stamps: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    const ls = l[f] ?? local.createdAt, rs = r[f] ?? remote.createdAt;
    const takeLocal = ls > rs || (ls === rs && JSON.stringify(local[f] ?? null) > JSON.stringify(remote[f] ?? null));
    out[f] = takeLocal ? local[f] : remote[f];
    stamps[f] = takeLocal ? ls : rs;
  }
  out.stamps = stamps;
  out.editedAt = local.editedAt > remote.editedAt ? local.editedAt : remote.editedAt;
  out.createdAt = local.createdAt < remote.createdAt ? local.createdAt : remote.createdAt;
  return out as unknown as Website;
}

// ── Look ───────────────────────────────────────────────────────────────────

/** Two letters from the name (its first two words' initials, or its first two letters), for a site with no logo. */
export function initialsOf(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return 'W';
  const two = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return two.toUpperCase();
}

// The card colours of the approved prototype, for a site whose logo gives none: chosen by its domain, so a
// website keeps its colours on every device.
const PALETTES: [string, string][] = [
  ['#162f58', '#7b67ad'], ['#552c72', '#b24eaa'], ['#25375c', '#ed9874'], ['#2c3c37', '#81a28c'], ['#244676', '#6e9bd5'],
  ['#0a3e55', '#64adbd'], ['#4f315c', '#ed8c99'], ['#6e522e', '#d7b97f'], ['#254c59', '#51adac'], ['#263c42', '#6eacae'],
  ['#862b36', '#e48772'], ['#25588b', '#79c0ed'], ['#4f3332', '#c98c6a'], ['#3a4863', '#9ca3bc'], ['#252a38', '#737f9d'],
  ['#673b37', '#eaa17c'], ['#3c5447', '#b0b57c'], ['#356277', '#9ac5b1'],
];
export const PATTERNS = ['orb', 'rings', 'arc', 'mesh', 'grid', 'wave', 'lines'] as const;
export type Pattern = typeof PATTERNS[number];

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function artOf(site: Pick<Website, 'url' | 'logo'>): { c1: string; c2: string; pattern: Pattern } {
  const h = hash(domainOf(site.url));
  const [c1, c2] = safePalette(site.logo?.palette) ?? PALETTES[h % PALETTES.length];
  return { c1, c2, pattern: PATTERNS[(h >>> 8) % PATTERNS.length] };
}
