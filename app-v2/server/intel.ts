// /api/intel — the Intelligence section's only way to Google Drive.
//
//   GET /api/intel/feeds/<feedId>  the Google Docs in that feed's folder
//   GET /api/intel/docs/<fileId>   one of them, as plain text
//
// Read-only, and only documents inside the three feed folders: anything else
// is refused even if the service account could see it. It sits behind the
// site's login (functions/_middleware.ts) like every other path. Responses
// are not cached here; the app keeps its own copy per device.
import { FEEDS, feedById } from '../src/intelligence/feeds';
import { readServiceAccount, accessToken, drive, GoogleError } from './google';

export interface IntelEnv {
  GOOGLE_SERVICE_ACCOUNT?: string;
}

const DOC_MIME = 'application/vnd.google-apps.document';
const FILE_FIELDS = 'id,name,createdTime,modifiedTime,webViewLink';
const MAX_PAGES = 5;
const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

export async function handleIntel(request: Request, env: IntelEnv, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return fail(405, 'method', 'Read only.');
  const [kind, id, ...rest] = new URL(request.url).pathname.replace(/^\/api\/intel\/?/, '').split('/');
  if (rest.length || !id) return fail(404, 'not-found', 'No such path.');

  const account = readServiceAccount(env.GOOGLE_SERVICE_ACCOUNT);
  if (!account) return fail(503, 'not-configured', 'Google Drive is not connected yet (GOOGLE_SERVICE_ACCOUNT).');

  try {
    const token = await accessToken(account, fetchImpl);

    if (kind === 'feeds') {
      const feed = feedById(id);
      if (!feed) return fail(404, 'not-found', `No feed ${id}.`);
      const q = `'${feed.folderId}' in parents and mimeType = '${DOC_MIME}' and trashed = false`;
      const files = [];
      let pageToken = '';
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          q, orderBy: 'name desc', pageSize: '200', fields: `nextPageToken,files(${FILE_FIELDS})`,
          ...(pageToken && { pageToken }),
        });
        const body = await (await drive(`files?${params}`, token, fetchImpl)).json() as { files?: unknown[]; nextPageToken?: string };
        files.push(...(body.files || []));
        pageToken = body.nextPageToken || '';
        if (!pageToken) break;
      }
      return json(200, { feedId: feed.id, files });
    }

    if (kind === 'docs') {
      if (!FILE_ID.test(id)) return fail(400, 'bad-id', 'Not a Drive file id.');
      const meta = await (await drive(`files/${id}?fields=${FILE_FIELDS},mimeType,parents,trashed`, token, fetchImpl)).json() as {
        mimeType?: string; parents?: string[]; trashed?: boolean; [k: string]: unknown;
      };
      const feed = FEEDS.find(f => meta.parents?.includes(f.folderId));
      if (!feed || meta.mimeType !== DOC_MIME || meta.trashed) {
        return fail(403, 'outside-feeds', 'Not a Google Doc in an Intelligence folder.');
      }
      const text = await (await drive(`files/${id}/export?mimeType=text/plain`, token, fetchImpl)).text();
      const file = { id: meta.id, name: meta.name, createdTime: meta.createdTime, modifiedTime: meta.modifiedTime, webViewLink: meta.webViewLink };
      return json(200, { feedId: feed.id, file, text });
    }

    return fail(404, 'not-found', 'No such path.');
  } catch (e) {
    if (e instanceof GoogleError) return fail(e.status, 'google', e.message);
    return fail(500, 'server', (e as Error).message);
  }
}
