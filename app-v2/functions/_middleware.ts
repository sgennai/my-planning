interface Env {
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASS: string;
}

interface EventContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

// Constant-time comparison — XOR-accumulates over the full length of the longer
// string so neither length mismatch nor character mismatch causes early exit.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}


// iOS fetches the Home Screen icon and the manifest without the page's Basic
// Auth credentials when adding the app to the Home Screen, so behind the gate
// it never sees them. They hold nothing private: icons, the app's name.
const PUBLIC_PATHS = new Set([
  '/apple-touch-icon.png',
  '/favicon.svg',
  '/favicon-64.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/manifest.webmanifest',
]);

// A Home Screen app opens from its service worker's copy and never sees the
// password prompt, and iOS forgets the password when the app is swiped away.
// Its update check for /sw.js then went out with no credentials and was
// refused, so deploys never reached it. Once the password is accepted the
// device also gets this cookie, which the update check does carry.
//
// The value is an HMAC of the username keyed by the password: nothing to
// store, and changing either credential signs every device out, as it did
// before. A year, renewed whenever the app checks for an update.
const SESSION_COOKIE = 'mp_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

async function sessionToken(user: string, pass: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`my-planning-session:v1:${user}`)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cookieValue(request: Request, name: string): string {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return '';
}

// `Secure` would stop a cookie being stored over plain http in local dev.
function cookie(url: URL, name: string, value: string, maxAge: number): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

async function withSession(response: Response, token: string, url: URL): Promise<Response> {
  const out = new Response(response.body, response);
  out.headers.append('Set-Cookie', cookie(url, SESSION_COOKIE, token, SESSION_MAX_AGE));
  return out;
}

// Signing out: the device forgets its session cookie, and is marked as signed
// out so that a password the browser remembered for Basic Auth, and sends by
// itself, does not sign it straight back in. The sign-in page is the way back,
// and clears the mark. The page asks for name and password, as the browser's
// Basic dialog did, which an iPhone or iPad Home Screen app could not show.
const SIGNED_OUT_COOKIE = 'mp_signed_out';
const SIGN_IN_PATH = '/__auth/sign-in';
const SIGN_OUT_PATH = '/__auth/sign-out';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** Where to go after signing in: a path on this site, never another one. */
function safeNext(value: unknown): string {
  const next = typeof value === 'string' ? value : '';
  return /^\/(?![/\\])/.test(next) && !next.startsWith('/__auth/') ? next : '/';
}

function signInPage(status: number, next: string, message: string | null, alert = false): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>My Planning</title>
<style>
  :root { color-scheme: light dark; --canvas: #F5F6F8; --surface: #FFFFFF; --hairline: #D4D9E1; --ink: #111827; --ink-3: #6B7280; --accent: #2563EB; --alert: #C2410C; }
  @media (prefers-color-scheme: dark) { :root { --canvas: #0E1014; --surface: #171A20; --hairline: #39404B; --ink: #F3F5F8; --ink-3: #8A93A3; --accent: #3B82F6; --alert: #EA8A5C; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
    background: var(--canvas); color: var(--ink); font: 16px/1.5 Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { width: min(100%, 380px); background: var(--surface); border: 1px solid var(--hairline); border-radius: 22px; padding: 32px 28px 28px; }
  .eb { font-size: 11px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-3); }
  h1 { margin: 6px 0 20px; font-size: 24px; letter-spacing: -0.02em; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--ink-3); margin: 14px 0 6px; }
  input { width: 100%; min-height: 44px; padding: 8px 12px; border: 1px solid var(--hairline); border-radius: 12px; background: var(--canvas); color: var(--ink); font: inherit; font-size: 16px; }
  input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  button { width: 100%; min-height: 48px; margin-top: 22px; border: 0; border-radius: 999px; background: var(--accent); color: #fff; font: inherit; font-weight: 600; }
  p { margin: 0 0 4px; font-size: 14px; color: var(--ink-3); }
  p.alert { color: var(--alert); }
</style>
</head>
<body>
<main>
  <div class="eb">My Planning</div>
  <h1>Sign in</h1>
  ${message ? `<p${alert ? ' class="alert"' : ''} role="status">${escapeHtml(message)}</p>` : ''}
  <form method="post" action="${SIGN_IN_PATH}">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <label for="user">Name</label>
    <input id="user" name="user" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** A page load, as opposed to a script, a file or an API call. */
function isPageLoad(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const mode = request.headers.get('Sec-Fetch-Mode');
  if (mode) return mode === 'navigate';
  return (request.headers.get('Accept') ?? '').includes('text/html');
}

/** A sign-out from this site's own page, not from a link on another site. */
function fromThisSite(request: Request, url: URL): boolean {
  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin';
  return request.headers.get('Origin') === url.origin;
}

export const onRequest = async (context: EventContext): Promise<Response> => {
  // Pass OPTIONS preflights through (unlikely for a same-origin SPA but correct).
  if (context.request.method === 'OPTIONS') return context.next();

  const url = new URL(context.request.url);
  if (PUBLIC_PATHS.has(url.pathname)) return context.next();

  const { BASIC_AUTH_USER, BASIC_AUTH_PASS } = context.env;

  // Fail closed: if env vars are not configured, refuse all requests rather
  // than silently serving the app unprotected.
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASS) {
    return new Response('Auth not configured', { status: 503 });
  }

  const token = await sessionToken(BASIC_AUTH_USER, BASIC_AUTH_PASS);
  const request = context.request;
  const signedOut = cookieValue(request, SIGNED_OUT_COOKIE) === '1';
  const matches = (user: string, pass: string) =>
    timingSafeEqual(user, BASIC_AUTH_USER) && timingSafeEqual(pass, BASIC_AUTH_PASS);

  if (url.pathname === SIGN_OUT_PATH) {
    if (request.method !== 'POST' || !fromThisSite(request, url)) return new Response('Not allowed', { status: 403 });
    const out = new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    out.headers.append('Set-Cookie', cookie(url, SESSION_COOKIE, '', 0));
    out.headers.append('Set-Cookie', cookie(url, SIGNED_OUT_COOKIE, '1', SESSION_MAX_AGE));
    return out;
  }

  if (url.pathname === SIGN_IN_PATH) {
    if (request.method !== 'POST') return signInPage(200, safeNext(url.searchParams.get('next')), null);
    let form: FormData | null = null;
    try { form = await request.formData(); } catch { /* not a form: refused below */ }
    const next = safeNext(form?.get('next'));
    if (!form || !matches(String(form.get('user') ?? ''), String(form.get('password') ?? ''))) {
      return signInPage(401, next, "That name and password don't match.", true);
    }
    const out = new Response(null, { status: 303, headers: { Location: next, 'Cache-Control': 'no-store' } });
    out.headers.append('Set-Cookie', cookie(url, SESSION_COOKIE, token, SESSION_MAX_AGE));
    out.headers.append('Set-Cookie', cookie(url, SIGNED_OUT_COOKIE, '', 0));
    return out;
  }

  const presented = cookieValue(request, SESSION_COOKIE);
  if (presented && timingSafeEqual(presented, token)) {
    const response = await context.next();
    return url.pathname === '/sw.js' ? withSession(response, token, url) : response;
  }

  // The password as a Basic header still works, for scripts and local
  // development, but not on a device that has just signed out.
  const header = request.headers.get('Authorization') ?? '';
  if (header.startsWith('Basic ') && !signedOut) {
    let decoded: string;
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = '';
    }
    // Split on the first colon only — passwords may contain colons.
    const colonIdx = decoded.indexOf(':');
    if (colonIdx > 0 && matches(decoded.slice(0, colonIdx), decoded.slice(colonIdx + 1))) {
      return withSession(await context.next(), token, url);
    }
  }

  // No Basic challenge: the browser's own password dialog is what kept
  // signing a signed-out device back in, and a Home Screen app cannot show it.
  if (isPageLoad(request)) {
    return signInPage(401, safeNext(url.pathname + url.search), signedOut ? 'You are signed out on this device.' : null);
  }
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
};
