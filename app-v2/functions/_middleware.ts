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

const REALM = 'Basic realm="My Planning"';

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

async function withSession(response: Response, token: string, url: URL): Promise<Response> {
  const out = new Response(response.body, response);
  // `Secure` would stop the cookie being stored over plain http in local dev.
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  out.headers.append('Set-Cookie', `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure}`);
  return out;
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
  const presented = cookieValue(context.request, SESSION_COOKIE);
  if (presented && timingSafeEqual(presented, token)) {
    const response = await context.next();
    return url.pathname === '/sw.js' ? withSession(response, token, url) : response;
  }

  const header = context.request.headers.get('Authorization') ?? '';
  if (header.startsWith('Basic ')) {
    let decoded: string;
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = '';
    }
    // Split on the first colon only — passwords may contain colons.
    const colonIdx = decoded.indexOf(':');
    if (colonIdx > 0) {
      const user = decoded.slice(0, colonIdx);
      const pass = decoded.slice(colonIdx + 1);
      if (timingSafeEqual(user, BASIC_AUTH_USER) && timingSafeEqual(pass, BASIC_AUTH_PASS)) {
        return withSession(await context.next(), token, url);
      }
    }
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': REALM },
  });
};
