// The app's side of /api/intake (server/intake.ts). A failure carries the server's code, or 'offline' when
// no answer came back.
import type { SyncedBookmark, ParsedArticle } from './types';

export type IntakeErrorCode =
  | 'offline' | 'not-configured' | 'auth-failed' | 'forbidden' | 'quota' | 'rate-limited'
  | 'unavailable' | 'not-found' | 'unreachable' | 'upstream';

export class IntakeError extends Error {
  readonly code: IntakeErrorCode;
  /** Seconds to wait, when Instapaper said. */
  readonly retryAfter: number | null;
  constructor(code: IntakeErrorCode, message: string, retryAfter: number | null = null) {
    super(message);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

async function api<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/intake/${path}`, { cache: 'no-store', credentials: 'same-origin' });
  } catch {
    throw new IntakeError('offline', "You're offline.");
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { /* the sign-in page, or nothing */ }
  if (res.ok && body) return body as T;
  const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
  const wait = Number(res.headers.get('Retry-After'));
  throw new IntakeError((err?.code as IntakeErrorCode) ?? 'upstream', err?.message ?? `Unexpected answer (${res.status}).`, Number.isFinite(wait) && wait > 0 ? wait : null);
}

export interface SyncPage { bookmarks: SyncedBookmark[]; deletedIds: number[]; complete: boolean; nextOffset: number | null }

export const fetchChanges = (since: number, offset: number) => api<SyncPage>(`sync?since=${since}&offset=${offset}`);
export const fetchArticle = (id: number) => api<ParsedArticle>(`articles/${id}`);

// Instapaper is asked for article text two seconds apart at most, whoever asks: the background fetch, one at
// a time, or you (opening an article not yet here, Try again), ahead of it.
const PACE_MS = 2000;
let lastStart = 0;
let queue: Promise<unknown> = Promise.resolve();
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
async function paced(id: number): Promise<ParsedArticle> {
  const gap = lastStart + PACE_MS - Date.now();
  if (gap > 0) await wait(gap);
  lastStart = Date.now();
  return fetchArticle(id);
}
/** The background fetch's: one at a time. */
export function fetchArticleQueued(id: number): Promise<ParsedArticle> {
  const run = queue.then(() => paced(id));
  queue = run.catch(() => undefined);
  return run;
}
/** One you asked for: beside the background's, never sooner than two seconds after the last request. */
export const fetchArticleNow = (id: number): Promise<ParsedArticle> => paced(id);
