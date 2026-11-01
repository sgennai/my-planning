// @vitest-environment node
// The password gate in front of the whole site (functions/_middleware.ts),
// and the sign-in cookie that lets a Home Screen app keep receiving updates.
import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/_middleware';

const ENV = { BASIC_AUTH_USER: 'stephane', BASIC_AUTH_PASS: 'correct horse' };
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

async function call(path: string, headers: Record<string, string> = {}, env = ENV, init: RequestInit = {}) {
  let reachedSite = false;
  const response = await onRequest({
    request: new Request(`https://my-planning.pages.dev${path}`, { headers, ...init }),
    env,
    next: async () => { reachedSite = true; return new Response('site', { headers: { 'Content-Type': 'text/html' } }); },
  });
  return { response, reachedSite, cookie: response.headers.get('Set-Cookie') };
}

const PAGE = { 'Sec-Fetch-Mode': 'navigate', Accept: 'text/html' };
const cookiesOf = (r: Response) => r.headers.getSetCookie().map(c => c.split(';')[0]);

async function signIn() {
  const { cookie } = await call('/', { Authorization: basic(ENV.BASIC_AUTH_USER, ENV.BASIC_AUTH_PASS) });
  return cookie!.split(';')[0];
}

describe('password gate', () => {
  it('shows the sign-in page to a page load with nothing presented, and no Basic challenge', async () => {
    const { response, reachedSite } = await call('/plan?x=1', PAGE);
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBeNull();
    const html = await response.text();
    expect(html).toContain('action="/__auth/sign-in"');
    expect(html).toContain('name="next" value="/plan?x=1"');
    expect(html).toContain('autocomplete="current-password"');
    expect(reachedSite).toBe(false);
  });

  it('refuses anything else plainly, with no Basic challenge', async () => {
    const { response, reachedSite } = await call('/api/intel/feeds/enterprise-ai-challenge');
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBeNull();
    expect(await response.text()).toBe('Unauthorized');
    expect(reachedSite).toBe(false);
  });

  it('serves the Home Screen icons and manifest without a password', async () => {
    for (const path of ['/apple-touch-icon.png', '/manifest.webmanifest']) {
      expect((await call(path)).reachedSite).toBe(true);
    }
  });

  it('refuses a wrong password and gives no cookie', async () => {
    const { response, cookie } = await call('/', { Authorization: basic(ENV.BASIC_AUTH_USER, 'wrong') });
    expect(response.status).toBe(401);
    expect(cookie).toBeNull();
  });

  it('fails closed when the credentials are not configured', async () => {
    const { response } = await call('/', {}, { BASIC_AUTH_USER: '', BASIC_AUTH_PASS: '' });
    expect(response.status).toBe(503);
  });

  it('gives a year-long, script-proof cookie once the password is accepted', async () => {
    const { response, reachedSite, cookie } = await call('/', { Authorization: basic(ENV.BASIC_AUTH_USER, ENV.BASIC_AUTH_PASS) });
    expect(reachedSite).toBe(true);
    expect(await response.text()).toBe('site');
    expect(cookie).toMatch(/^mp_session=[\w-]{43}; Max-Age=31536000; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
  });

  it('lets the cookie alone through, as the app update check sends it', async () => {
    const session = await signIn();
    const page = await call('/', { Cookie: `theme=dark; ${session}` });
    expect(page.reachedSite).toBe(true);
    expect(page.cookie).toBeNull();

    const update = await call('/sw.js', { Cookie: session });
    expect(update.reachedSite).toBe(true);
    // Renewed on every update check, so a used app never runs out.
    expect(update.cookie?.split(';')[0]).toBe(session);
  });

  it('refuses an altered cookie', async () => {
    const session = await signIn();
    const altered = session.slice(0, -1) + (session.endsWith('A') ? 'B' : 'A');
    expect((await call('/', { Cookie: altered })).response.status).toBe(401);
  });

  it('signs every device out when the password changes', async () => {
    const session = await signIn();
    const { response } = await call('/', { Cookie: session }, { ...ENV, BASIC_AUTH_PASS: 'new password' });
    expect(response.status).toBe(401);
  });
});

describe('signing in and out', () => {
  const form = (fields: Record<string, string>) => ({
    method: 'POST',
    body: new URLSearchParams(fields),
  });
  const signOut = (headers: Record<string, string> = { 'Sec-Fetch-Site': 'same-origin' }) =>
    call('/__auth/sign-out', headers, ENV, { method: 'POST' });

  it('the sign-in page signs in with name and password, and goes where it was going', async () => {
    const { response, reachedSite } = await call('/__auth/sign-in', {}, ENV, form({ user: ENV.BASIC_AUTH_USER, password: ENV.BASIC_AUTH_PASS, next: '/plan' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/plan');
    expect(reachedSite).toBe(false);
    const [session, mark] = cookiesOf(response);
    expect(session).toMatch(/^mp_session=[\w-]{43}$/);
    expect(mark).toBe('mp_signed_out=');
    expect((await call('/', { Cookie: session })).reachedSite).toBe(true);
  });

  it('a wrong password shows the page again, with no cookie', async () => {
    const { response } = await call('/__auth/sign-in', {}, ENV, form({ user: ENV.BASIC_AUTH_USER, password: 'wrong', next: '/' }));
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(await response.text()).toContain("That name and password don&#39;t match.");
  });

  it('never sends you to another site after signing in', async () => {
    for (const next of ['//evil.example', '/\\evil.example', 'https://evil.example', '/__auth/sign-out']) {
      const { response } = await call('/__auth/sign-in', {}, ENV, form({ user: ENV.BASIC_AUTH_USER, password: ENV.BASIC_AUTH_PASS, next }));
      expect(response.headers.get('Location')).toBe('/');
    }
  });

  it('signing out ends the session on this device: the cookie goes and everything is refused', async () => {
    const session = await signIn();
    const { response } = await signOut();
    expect(response.status).toBe(204);
    const [cleared, mark] = cookiesOf(response);
    expect(cleared).toBe('mp_session=');
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0');
    expect(mark).toBe('mp_signed_out=1');
    // What the browser then holds: the mark, no session.
    for (const path of ['/', '/api/intel/feeds/enterprise-ai-challenge', '/assets/index.js', '/sw.js']) {
      const after = await call(path, { Cookie: mark, ...(path === '/' ? PAGE : {}) });
      expect(after.response.status).toBe(401);
      expect(after.reachedSite).toBe(false);
    }
    expect(await (await call('/', { Cookie: mark, ...PAGE })).response.text()).toContain('You are signed out on this device.');
    expect(session).toMatch(/^mp_session=/);
  });

  it('after signing out, a password the browser remembered does not sign it back in', async () => {
    const { response } = await signOut();
    const [, mark] = cookiesOf(response);
    const remembered = { Authorization: basic(ENV.BASIC_AUTH_USER, ENV.BASIC_AUTH_PASS) };
    const after = await call('/api/intel/feeds/enterprise-ai-challenge', { Cookie: mark, ...remembered });
    expect(after.response.status).toBe(401);
    expect(after.reachedSite).toBe(false);
    // Without the mark (a script, local development), the header still works.
    expect((await call('/api/intel/feeds/enterprise-ai-challenge', remembered)).reachedSite).toBe(true);
  });

  it('signing in again clears the signed-out mark', async () => {
    const { response } = await call('/__auth/sign-in', { Cookie: 'mp_signed_out=1' }, ENV, form({ user: ENV.BASIC_AUTH_USER, password: ENV.BASIC_AUTH_PASS, next: '/' }));
    const cleared = response.headers.getSetCookie().find(c => c.startsWith('mp_signed_out='))!;
    expect(cleared).toContain('Max-Age=0');
  });

  it('only this site can sign you out, and only by POST', async () => {
    expect((await signOut({ 'Sec-Fetch-Site': 'cross-site' })).response.status).toBe(403);
    expect((await call('/__auth/sign-out', { 'Sec-Fetch-Site': 'same-origin' })).response.status).toBe(403);
    expect((await signOut({ Origin: 'https://my-planning.pages.dev' })).response.status).toBe(204);
    expect((await signOut({ Origin: 'https://evil.example' })).response.status).toBe(403);
  });
});
