// Cloudflare Worker — ICS proxy + Todoist proxy
// Deploy at: workers.cloudflare.com
//
// Routes:
//   GET  /?url=<encoded-ics-url>          → proxy an ICS feed (cached 20 min)
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

const ICS_CACHE_SECONDS = 20 * 60; // 20 minutes — avoids Google 429s

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

    // Strip /todoist prefix, keep the rest of the path + query string
    const todoistPath = url.pathname.replace(/^\/todoist/, '');
    const todoistUrl = `https://api.todoist.com/api/v1${todoistPath}${url.search}`;

    const todoistRes = await fetch(todoistUrl, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') ? await request.text() : undefined,
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
    return new Response('Missing ?url parameter', {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Use Cloudflare's Cache API to avoid hammering Google with every page load
  const cache = caches.default;
  const cacheKey = new Request(feedUrl, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return new Response(body, {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'X-Cache': 'HIT' },
    });
  }

  const icsRes = await fetch(feedUrl);
  const icsBody = await icsRes.text();

  if (icsRes.ok) {
    // Store in Cloudflare edge cache for ICS_CACHE_SECONDS
    const toCache = new Response(icsBody, {
      status: 200,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': `public, max-age=${ICS_CACHE_SECONDS}` },
    });
    event.waitUntil(cache.put(cacheKey, toCache));
  }

  return new Response(icsBody, {
    status: icsRes.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'X-Cache': 'MISS' },
  });
}
