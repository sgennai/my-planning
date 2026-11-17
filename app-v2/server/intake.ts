// /api/intake — Intake's only way to Instapaper (API v2), read only.
//
//   GET /api/intake/status               the token is set and accepted; whether the account is Premium
//   GET /api/intake/sync?since=&offset=  every bookmark changed since `since` (Unix seconds), with the ids
//                                        deleted; `complete: false` and `nextOffset` when cut short
//   GET /api/intake/articles/<id>        one article as Instapaper parsed it: its HTML body and metadata
//   GET /api/intake/folders              folder names
//   GET /api/intake/tags                 tag names
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

async function instapaper(path: string, token: string, fetchImpl: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(INSTAPAPER_API + path, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

const int = (v: string | null, min: number): number | null => (v !== null && /^\d{1,12}$/.test(v) && Number(v) >= min ? Number(v) : null);

export async function handleIntake(request: Request, env: IntakeEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return fail(405, 'method', 'Read only.');
  const url = new URL(request.url);
  const [what, id, ...rest] = url.pathname.replace(/^\/api\/intake\/?/, '').split('/');
  if (rest.length) return fail(404, 'not-found', 'No such path.');

  const token = env.INSTAPAPER_ACCESS_TOKEN?.trim();
  if (!token) return fail(503, 'not-configured', 'Instapaper is not connected yet (INSTAPAPER_ACCESS_TOKEN).');

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
    return json(200, { bookmarks, deletedIds, complete, nextOffset: complete ? null : offset });
  }

  if (what === 'articles' && id) {
    if (!ID.test(id)) return fail(404, 'not-found', 'No such bookmark.');
    try {
      return json(200, articleOf(Number(id), await instapaper(`/bookmarks/${id}/parse`, token, fetchImpl)));
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
