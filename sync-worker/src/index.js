const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Sync-Secret, Content-Type',
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
