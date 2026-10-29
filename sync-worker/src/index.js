const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // X-Todoist-Token is needed so the browser's CORS preflight passes for the
  // Todoist proxy routes below (this worker also serves D1 sync + ICS).
  'Access-Control-Allow-Headers': 'X-Sync-Secret, X-Todoist-Token, Content-Type',
};

const VALID_STORES = [
  'projects', 'todos', 'scheduledBlocks', 'practiceItems', 'stories',
  'reviews', 'progressLog', 'modules', 'learning', 'content',
  'create_ideas', 'create_posts', 'singletons'
];

// Constant-time comparison, so a wrong key takes as long to refuse whatever it
// shares with the right one.
function sameSecret(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a || ''), y = enc.encode(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Pulls list records by when they reached this Worker (`server_at`), not by
// the `updated_at` the sending device stamped on them: a device that was
// offline uploads changes stamped hours ago, and a device that synced in the
// meantime used to skip them for good. The cursor handed back trails the
// clock by a minute, so a write landing during a pull is caught by the next
// one; re-sending a record is harmless under last-write-wins.
const CURSOR_LAG_MS = 60 * 1000;

// ICS edge cache: revalidate after 20 min; keep a stale copy up to 7 days so a
// rate-limited/erroring upstream still serves last-known-good. Freshness is
// tracked via the X-Cached-At header (the programmatic Cache API ignores
// stale-if-error semantics on its own).
const ICS_FRESH_SECONDS = 20 * 60;
const ICS_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function icsResponse(body, cacheStatus) {
  return new Response(body, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'X-Cache': cacheStatus },
  });
}

function makeIcsCacheEntry(body, nowSec) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': `public, max-age=${ICS_MAX_AGE_SECONDS}`,
      'X-Cached-At': String(nowSec),
    },
  });
}

async function proxyICS(request, feedUrl, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(request.url);
  const nowSec = Math.floor(Date.now() / 1000);
  const cached = await cache.match(cacheKey);

  if (cached) {
    const cachedAt = parseInt(cached.headers.get('X-Cached-At') || '0', 10);
    const cachedBody = await cached.text();
    if (nowSec - cachedAt < ICS_FRESH_SECONDS) return icsResponse(cachedBody, 'HIT');
    // Stale — try to revalidate, fall back to the stale copy on any failure.
    try {
      const res = await fetch(feedUrl);
      if (res.ok) {
        const fresh = await res.text();
        ctx.waitUntil(cache.put(cacheKey, makeIcsCacheEntry(fresh, nowSec)));
        return icsResponse(fresh, 'REVALIDATED');
      }
      return icsResponse(cachedBody, 'STALE');
    } catch {
      return icsResponse(cachedBody, 'STALE');
    }
  }

  // Cache miss — fetch fresh.
  try {
    const res = await fetch(feedUrl);
    const body = await res.text();
    if (res.ok) ctx.waitUntil(cache.put(cacheKey, makeIcsCacheEntry(body, nowSec)));
    return new Response(body, {
      status: res.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'X-Cache': 'MISS' },
    });
  } catch (e) {
    return new Response('ICS fetch failed: ' + e.message, { status: 502, headers: CORS_HEADERS });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

    // ── Todoist proxy ──────────────────────────────────────────────────────
    //   GET  /todoist/projects               → api.todoist.com/api/v1/projects
    //   GET  /todoist/tasks?project_id=xxx   → api.todoist.com/api/v1/tasks?...
    //   POST /todoist/tasks                  → create a task
    //   POST /todoist/tasks/:id/close        → complete a task
    // Auth: the Todoist API token travels in the X-Todoist-Token request header.
    if (url.pathname === '/todoist' || url.pathname.startsWith('/todoist/')) {
      const token = request.headers.get('X-Todoist-Token');
      if (!token) return json({ error: 'Missing X-Todoist-Token header' }, 401);
      const todoistPath = url.pathname.replace(/^\/todoist/, '');
      const todoistUrl = `https://api.todoist.com/api/v1${todoistPath}${url.search}`;
      const hasBody = request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH';
      try {
        const res = await fetch(todoistUrl, {
          method: request.method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: hasBody ? await request.text() : undefined,
        });
        const body = await res.text();
        return new Response(body, {
          status: res.status,
          headers: { ...CORS_HEADERS, 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
        });
      } catch (e) {
        return json({ error: 'Upstream Todoist fetch failed: ' + e.message }, 502);
      }
    }

    // ── ICS proxy (?url=<encoded feed>) — cached 20 min, stale-on-error 7 days ──
    // Behind the sync key: without it this was an open proxy anyone could use
    // to fetch any address, spending the free plan's daily requests that sync
    // depends on.
    if (url.searchParams.get('url')) {
      if (!env.SYNC_SECRET || !sameSecret(request.headers.get('X-Sync-Secret'), env.SYNC_SECRET)) {
        return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
      }
      return proxyICS(request, url.searchParams.get('url'), ctx);
    }

    if (!url.pathname.startsWith('/sync/')) {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    const secret = request.headers.get('X-Sync-Secret');
    if (!env.SYNC_SECRET || !sameSecret(secret, env.SYNC_SECRET)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
    }

    if (request.method === 'POST' && url.pathname === '/sync/push') {
      try {
        const payload = await request.json(); // Array of { storeName, id, payload, updatedAt, deleted }
        
        const batches = {};
        for (const record of payload) {
          if (!VALID_STORES.includes(record.storeName)) continue;
          if (!batches[record.storeName]) batches[record.storeName] = [];
          batches[record.storeName].push(record);
        }

        const statements = [];
        const serverAt = new Date().toISOString();

        for (const storeName of Object.keys(batches)) {
          const records = batches[storeName];
          for (const rec of records) {
            statements.push(
              env.DB.prepare(`
                INSERT INTO ${storeName} (id, payload, updated_at, deleted, server_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  payload = excluded.payload,
                  updated_at = excluded.updated_at,
                  deleted = excluded.deleted,
                  server_at = excluded.server_at
                WHERE excluded.updated_at > ${storeName}.updated_at
              `).bind(
                rec.id,
                JSON.stringify(rec.payload),
                rec.updatedAt,
                rec.deleted ? 1 : 0,
                serverAt
              )
            );
          }
        }
        
        if (statements.length > 0) {
          await env.DB.batch(statements);
        }

        return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      }
    }

    if (request.method === 'GET' && url.pathname === '/sync/pull') {
      try {
        const since = url.searchParams.get('since') || '1970-01-01T00:00:00.000Z';
        const cursor = new Date(Date.now() - CURSOR_LAG_MS).toISOString();

        // Rows written before server_at existed have none; their own stamp stands in.
        const statements = VALID_STORES.map(storeName =>
          env.DB.prepare(`SELECT '${storeName}' as storeName, id, payload, updated_at, deleted FROM ${storeName} WHERE COALESCE(server_at, updated_at) > ?`).bind(since)
        );
        
        const results = await env.DB.batch(statements);
        
        let allRecords = [];
        for (const res of results) {
          if (res.results) {
            allRecords = allRecords.concat(res.results.map(r => ({
              storeName: r.storeName,
              id: r.id,
              payload: JSON.parse(r.payload),
              updatedAt: r.updated_at,
              deleted: r.deleted === 1
            })));
          }
        }

        return new Response(JSON.stringify({ records: allRecords, cursor }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
