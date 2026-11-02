// @vitest-environment node
// /api/intel against a stand-in Google: the sign-in it makes, what it lists
// and exports, and what it refuses.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { handleIntel } from './intel';
import { _forgetToken, DRIVE_READONLY } from './google';

const CHALLENGE = '14RjcLlB6iVh47-MByN8N57PHzOQIhm78';
const DOC_ID = '1F0t_R2-YRaBscFFbUXbnd2g-p10zSR8H92D7Wkhc-FY';
const OTHER_ID = '1OtherFileOutsideTheFeeds0000000000000000';

let secret = '';
let publicKey: CryptoKey;
const calls: { url: string; auth: string | null }[] = [];
const claims: Record<string, unknown>[] = [];
let tokenStatus = 200;
let pages: { id: string; name: string }[][] = [];

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const fakeGoogle = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, auth: new Headers(init?.headers).get('Authorization') });
  if (url === 'https://oauth2.googleapis.com/token') {
    const jwt = new URLSearchParams(String(init?.body)).get('assertion')!;
    const [h, c, sig] = jwt.split('.');
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, b64url(sig), new TextEncoder().encode(`${h}.${c}`));
    claims.push({ ...JSON.parse(new TextDecoder().decode(b64url(c))), verified: ok });
    if (tokenStatus !== 200) return Response.json({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, { status: tokenStatus });
    return Response.json({ access_token: 'token-1', expires_in: 3599 });
  }
  const u = new URL(url);
  if (u.pathname === '/drive/v3/files') {
    const page = Number(u.searchParams.get('pageToken') || 0);
    return Response.json({ files: pages[page] || [], ...(page + 1 < pages.length && { nextPageToken: String(page + 1) }) });
  }
  if (u.pathname === `/drive/v3/files/${DOC_ID}`) {
    return Response.json({ id: DOC_ID, name: '2026-11-01_0820__enterprise-ai-challenge', mimeType: 'application/vnd.google-apps.document', parents: [CHALLENGE], trashed: false, modifiedTime: '2026-11-01T07:25:00.000Z' });
  }
  if (u.pathname === `/drive/v3/files/${OTHER_ID}`) {
    return Response.json({ id: OTHER_ID, name: 'Gym plan', mimeType: 'application/vnd.google-apps.document', parents: ['someOtherFolder'] });
  }
  if (u.pathname === `/drive/v3/files/${DOC_ID}/export`) {
    return new Response('\uFEFF---\r\ntitle: "Shadow AI"\r\n---\r\n\r\n## Challenge\r\nText.');
  }
  return Response.json({ error: { message: 'File not found: x.' } }, { status: 404 });
}) as typeof fetch;

const get = (path: string, init?: RequestInit, env = { GOOGLE_SERVICE_ACCOUNT: secret }) =>
  handleIntel(new Request(`https://my-planning.pages.dev/api/intel/${path}`, init), env, fakeGoogle);

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']) as CryptoKeyPair;
  publicKey = pair.publicKey;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
  // As the command in the setup steps stores it: Google's JSON in base64.
  secret = btoa(JSON.stringify({ type: 'service_account', client_email: 'reader@proj.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' }));
});

beforeEach(() => {
  _forgetToken();
  calls.length = 0;
  claims.length = 0;
  tokenStatus = 200;
  pages = [[{ id: DOC_ID, name: '2026-11-01_0820__enterprise-ai-challenge' }]];
});

describe('/api/intel', () => {
  it('signs in as the service account, read-only, with a signature Google can check', async () => {
    expect((await get('feeds/enterprise-ai-challenge')).status).toBe(200);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ iss: 'reader@proj.iam.gserviceaccount.com', scope: DRIVE_READONLY, aud: 'https://oauth2.googleapis.com/token', verified: true });
  });

  it("lists a feed's Google Docs from its folder only, every page", async () => {
    pages = [[{ id: 'a', name: '2026-11-02_0820__x' }], [{ id: 'b', name: '2026-11-01_0820__x' }]];
    const res = await get('feeds/enterprise-ai-challenge');
    expect(await res.json()).toEqual({ feedId: 'enterprise-ai-challenge', files: pages.flat(), complete: true });
    const lists = calls.filter(c => c.url.includes('/drive/v3/files?'));
    expect(lists).toHaveLength(2);
    const q = new URL(lists[0].url).searchParams.get('q');
    expect(q).toBe(`'${CHALLENGE}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`);
    expect(new URL(lists[0].url).searchParams.get('orderBy')).toBe('name desc');
    expect(lists.every(c => c.auth === 'Bearer token-1')).toBe(true);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('lists up to 10,000 documents a feed, and says when a folder holds more', async () => {
    pages = Array.from({ length: 11 }, (_, i) => [{ id: `p${i}`, name: `page ${i}` }]);
    const res = await get('feeds/enterprise-ai-challenge');
    const body = await res.json();
    expect(body.files).toHaveLength(10);
    expect(body.complete).toBe(false);
    const lists = calls.filter(c => c.url.includes('/drive/v3/files?'));
    expect(lists.map(c => new URL(c.url).searchParams.get('pageSize'))).toEqual(Array(10).fill('1000'));
  });

  it('reuses its token between requests', async () => {
    await get('feeds/enterprise-ai-challenge');
    await get(`docs/${DOC_ID}`);
    expect(calls.filter(c => c.url.includes('oauth2')).length).toBe(1);
  });

  it('returns a document in a feed folder as its plain text, untouched', async () => {
    const res = await get(`docs/${DOC_ID}`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.feedId).toBe('enterprise-ai-challenge');
    expect(body.file).toEqual({ id: DOC_ID, name: '2026-11-01_0820__enterprise-ai-challenge', modifiedTime: '2026-11-01T07:25:00.000Z' });
    // Decoding the export drops Google's byte-order mark; the rest is as written.
    expect(body.text).toBe('---\r\ntitle: "Shadow AI"\r\n---\r\n\r\n## Challenge\r\nText.');
  });

  it('refuses a document outside the feed folders, before reading it', async () => {
    const res = await get(`docs/${OTHER_ID}`);
    expect(res.status).toBe(403);
    expect(calls.some(c => c.url.includes(`${OTHER_ID}/export`))).toBe(false);
  });

  it('refuses what is not a feed or a file id, and anything but GET', async () => {
    expect((await get('feeds/unknown')).status).toBe(404);
    expect((await get("docs/x' or 1=1")).status).toBe(400);
    expect((await get('docs')).status).toBe(404);
    expect((await get('feeds/enterprise-ai-challenge', { method: 'POST' })).status).toBe(405);
  });

  it('says plainly when the key is not set, or Google refuses it', async () => {
    const off = await get('feeds/enterprise-ai-challenge', undefined, { GOOGLE_SERVICE_ACCOUNT: '' });
    expect(off.status).toBe(503);
    expect((await off.json()).error.code).toBe('not-configured');
    tokenStatus = 400;
    const refused = await get('feeds/enterprise-ai-challenge');
    expect(refused.status).toBe(502);
    expect((await refused.json()).error.message).toBe('Google sign-in failed: Invalid JWT Signature.');
  });

  it('passes on Drive not finding a file', async () => {
    const res = await get('docs/1MissingFile000000000000');
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toBe('Google Drive: File not found: x.');
  });
});
