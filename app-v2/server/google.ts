// Read-only access to Google Drive as a service account.
//
// The dedicated Google account shares its "ChatGPT Intelligence" folder with
// the service account (Viewer), which sees that folder and nothing else. The
// account's key lives in the Cloudflare secret GOOGLE_SERVICE_ACCOUNT, as the
// JSON Google issues or that JSON in base64, and never leaves the server: the
// app only ever talks to /api/intel.

export const DRIVE_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export class GoogleError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** The secret as Google's JSON, raw or in base64. */
export function readServiceAccount(secret: string | undefined): ServiceAccount | null {
  const value = (secret || '').trim();
  if (!value) return null;
  try {
    const json = JSON.parse(value.startsWith('{') ? value : atob(value));
    return json.client_email && json.private_key ? json : null;
  } catch {
    return null;
  }
}

const base64url = (bytes: Uint8Array | string) => {
  const s = typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function signingKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s+/g, '')), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

let cached: { email: string; token: string; until: number } | null = null;

/** For tests: forget the token kept between requests. */
export function _forgetToken() { cached = null; }

/** An access token, kept until a minute before it expires. */
export async function accessToken(account: ServiceAccount, fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === account.client_email && cached.until > now) return cached.token;

  const aud = account.token_uri || TOKEN_URL;
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({
    iss: account.client_email, scope: DRIVE_READONLY, aud, iat: now, exp: now + 3600,
  }))}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', await signingKey(account.private_key), new TextEncoder().encode(unsigned)));

  const res = await fetchImpl(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new GoogleError(502, `Google sign-in failed: ${body.error_description || body.error || res.status}`);
  }
  cached = { email: account.client_email, token: body.access_token, until: now + (body.expires_in ?? 3600) - 60 };
  return body.access_token;
}

/** A Drive API call; Google's own error message on failure. */
export async function drive(path: string, token: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const res = await fetchImpl(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) return res;
  const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
  throw new GoogleError(res.status === 404 ? 404 : res.status === 403 ? 403 : 502,
    `Google Drive: ${body.error?.message || res.statusText || res.status}`);
}
