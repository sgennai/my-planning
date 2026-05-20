// Cloudflare Worker — ICS proxy + Todoist proxy
// Deploy at: workers.cloudflare.com
//
// Routes:
//   GET  /?url=<encoded-ics-url>          → proxy an ICS feed (cached 20 min, stale-on-error up to 7 days)
//   GET  /todoist/projects                → GET api.todoist.com/api/v1/projects
//   GET  /todoist/tasks?project_id=xxx    → GET api.todoist.com/api/v1/tasks?project_id=xxx
//   POST /todoist/tasks/:id/close         → POST api.todoist.com/api/v1/tasks/:id/close
//
// Auth for Todoist routes: pass the API token in the X-Todoist-Token request header.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Todoist-Token, Content-Type',
  'Cache-Control': 'no-store',
};

// Revalidate after 20 min; keep stale entry for up to 7 days as a 429 fallback.
// The X-Cached-At header (unix seconds) drives freshness checks instead of HTTP
// max-age, because the programmatic Cache API doesn't honour stale-if-error.
const ICS_FRESH_SECONDS  = 20 * 60;           // 20 minutes — revalidate threshold
const ICS_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days  — how long to keep in cache

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);

  // ── Todoist proxy ──────────────────────────────────────────────────────────
  if (url.pathname.startsWith('/todoist/') || url.pathname === '/todoist') {
    const token = request.headers.get('X-Todoist-Token');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing X-Todoist-Token header' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const todoistPath = url.pathname.replace(/^\/todoist/, '');
    const todoistUrl = `https://api.todoist.com/api/v1${todoistPath}${url.search}`;

    const todoistRes = await fetch(todoistUrl, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH')
        ? await request.text()
        : undefined,
    });

    const body = await todoistRes.text();
    return new Response(body, {
      status: todoistRes.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': todoistRes.headers.get('Content-Type') || 'application/json',
      },
    });
  }

  // ── ICS proxy (?url=<encoded>) ─────────────────────────────────────────────
  const feedUrl = url.searchParams.get('url');
  if (!feedUrl) {
    return new Response('Missing ?url parameter', { status: 400, headers: CORS_HEADERS });
  }

  const cache    = caches.default;
  const cacheKey = new Request(request.url);
  const nowSec   = Math.floor(Date.now() / 1000);

  const cached = await cache.match(cacheKey);

  if (cached) {
    const cachedAt = parseInt(cached.headers.get('X-Cached-At') || '0', 10);
    const age = nowSec - cachedAt;
    const cachedBody = await cached.text();

    if (age < ICS_FRESH_SECONDS) {
      // Still fresh — serve directly.
      return icsResponse(cachedBody, 'HIT');
    }

    // Stale — attempt revalidation; fall back to stale on any failure.
    try {
      const icsRes = await fetch(feedUrl);
      if (icsRes.ok) {
        const freshBody = await icsRes.text();
        event.waitUntil(cache.put(cacheKey, makeCacheEntry(freshBody, nowSec)));
        return icsResponse(freshBody, 'REVALIDATED');
      }
      // Google returned an error (e.g. 429) — serve stale rather than failing.
      return icsResponse(cachedBody, 'STALE');
    } catch (_) {
      return icsResponse(cachedBody, 'STALE');
    }
  }

  // Cache miss — fetch fresh from Google.
  const icsRes  = await fetch(feedUrl);
  const icsBody = await icsRes.text();

  if (icsRes.ok) {
    event.waitUntil(cache.put(cacheKey, makeCacheEntry(icsBody, nowSec)));
  }

  return new Response(icsBody, {
    status: icsRes.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'X-Cache': 'MISS' },
  });
}

function makeCacheEntry(body, nowSec) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // Long max-age keeps the entry in the CF cache for up to 7 days so we
      // always have a stale fallback. Freshness is managed via X-Cached-At.
      'Cache-Control': `public, max-age=${ICS_MAX_AGE_SECONDS}`,
      'X-Cached-At': String(nowSec),
    },
  });
}

function icsResponse(body, cacheStatus) {
  return new Response(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'X-Cache': cacheStatus,
    },
  });
}
