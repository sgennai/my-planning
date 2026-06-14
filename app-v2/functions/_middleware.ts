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

export const onRequest = async (context: EventContext): Promise<Response> => {
  // Pass OPTIONS preflights through (unlikely for a same-origin SPA but correct).
  if (context.request.method === 'OPTIONS') return context.next();

  const { BASIC_AUTH_USER, BASIC_AUTH_PASS } = context.env;

  // Fail closed: if env vars are not configured, refuse all requests rather
  // than silently serving the app unprotected.
  if (!BASIC_AUTH_USER || !BASIC_AUTH_PASS) {
    return new Response('Auth not configured', { status: 503 });
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
        return context.next();
      }
    }
  }

  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': REALM },
  });
};
