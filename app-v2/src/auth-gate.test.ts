// @vitest-environment node
// The password gate in front of the whole site (functions/_middleware.ts),
// and the sign-in cookie that lets a Home Screen app keep receiving updates.
import { describe, it, expect } from 'vitest';
import { onRequest } from '../functions/_middleware';

const ENV = { BASIC_AUTH_USER: 'stephane', BASIC_AUTH_PASS: 'correct horse' };
const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

async function call(path: string, headers: Record<string, string> = {}, env = ENV) {
  let reachedSite = false;
  const response = await onRequest({
    request: new Request(`https://my-planning.pages.dev${path}`, { headers }),
    env,
    next: async () => { reachedSite = true; return new Response('site', { headers: { 'Content-Type': 'text/html' } }); },
  });
  return { response, reachedSite, cookie: response.headers.get('Set-Cookie') };
}

async function signIn() {
  const { cookie } = await call('/', { Authorization: basic(ENV.BASIC_AUTH_USER, ENV.BASIC_AUTH_PASS) });
  return cookie!.split(';')[0];
}

describe('password gate', () => {
  it('asks for the password when nothing is presented', async () => {
    const { response, reachedSite } = await call('/');
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="My Planning"');
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
