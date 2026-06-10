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

    // ── ICS proxy (?url=<encoded feed>) ────────────────────────────────────
    if (url.searchParams.get('url')) {
      const feedUrl = url.searchParams.get('url');
      try {
        const icsRes = await fetch(feedUrl);
        const icsBody = await icsRes.text();
        return new Response(icsBody, {
          status: icsRes.status,
          headers: { ...CORS_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8' },
        });
      } catch (e) {
        return new Response('ICS fetch failed: ' + e.message, { status: 502, headers: CORS_HEADERS });
      }
    }

    if (!url.pathname.startsWith('/sync/')) {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    const secret = request.headers.get('X-Sync-Secret');
    if (!env.SYNC_SECRET || secret !== env.SYNC_SECRET) {
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
        
        for (const storeName of Object.keys(batches)) {
          const records = batches[storeName];
          for (const rec of records) {
            statements.push(
              env.DB.prepare(`
                INSERT INTO ${storeName} (id, payload, updated_at, deleted)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  payload = excluded.payload,
                  updated_at = excluded.updated_at,
                  deleted = excluded.deleted
                WHERE excluded.updated_at > ${storeName}.updated_at
              `).bind(
                rec.id, 
                JSON.stringify(rec.payload), 
                rec.updatedAt, 
                rec.deleted ? 1 : 0
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
        
        const statements = VALID_STORES.map(storeName => 
          env.DB.prepare(`SELECT '${storeName}' as storeName, id, payload, updated_at, deleted FROM ${storeName} WHERE updated_at > ?`).bind(since)
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

        return new Response(JSON.stringify({ records: allRecords }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }});
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  }
};
