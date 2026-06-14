# Deployment guide — My Planning v2

Deployed on **Cloudflare Pages** at `sgennai.github.io/my-planning/v2/`
(base path `/my-planning/v2/`, set in `vite.config.ts`).

---

## Environment variables

Three build-time env vars seed sync credentials into the app on first boot.
They are read via `import.meta.env.*` and baked into the JS bundle by Vite
at build time. They only fill fields that are empty in a device's IndexedDB —
existing values (set later via Settings) always win.

| Variable | Purpose |
|---|---|
| `VITE_SYNC_URL` | Base URL of the D1 sync Cloudflare Worker, e.g. `https://my-planning-sync.<you>.workers.dev` |
| `VITE_SYNC_SECRET` | Shared secret sent as `X-Sync-Secret` header on every push/pull |
| `VITE_PROXY_URL` | Base URL of the proxy Cloudflare Worker (ICS feeds + Todoist relay), e.g. `https://my-planning-proxy.<you>.workers.dev` |

### Setting them in Cloudflare Pages

1. Cloudflare dashboard → **Pages** → `my-planning` → **Settings** → **Environment variables**
2. Under **Production**, add all three variables
3. Repeat under **Preview** if preview deployments are used (can use the same values)
4. Trigger a new deployment (push to the connected branch, or **Deployments** → **Retry deployment**) — Pages re-runs the Vite build with the new env so the values are baked in

> Values set in Cloudflare Pages environment variables are **not** exposed in
> source control and are injected only at build time. They are however present
> as plain strings in the compiled JS bundle, so Cloudflare Access (below) is
> required to prevent unauthenticated users from reading them.

---

## Cloudflare Access setup

Without Access, the baked-in `VITE_SYNC_SECRET` is visible to anyone who can
fetch the JS bundle. Access gates the entire Pages deployment behind an
identity check before a byte is served.

### Create the Access application

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** → **Add an application**
2. Choose **Self-hosted**
3. **Application name**: `My Planning`
4. **Application domain**: the Pages hostname (e.g. `my-planning.pages.dev`) — add the custom domain too if one is configured
5. **Session duration**: `24 hours` is a reasonable default; `1 week` reduces sign-in friction on personal devices
6. Click **Next**

### Configure the policy

1. **Policy name**: `Owner only`
2. **Action**: Allow
3. **Include** rule: **Emails** → add your email address (`stephane.gennai@gmail.com`)
4. No additional rules needed — this restricts access to that single email
5. Click **Next** → **Add application**

### How sign-in works

On first visit from any device, Cloudflare Access redirects to a login page and
sends a one-time code to the configured email. After verification, Access sets a
signed cookie valid for the configured session duration. Subsequent visits within
the session load the app directly.

### Revoking a session

- **Single device**: Cloudflare dashboard → **Zero Trust** → **Access** →
  **Active Sessions** → find the session → **Revoke**. The device will be asked
  to re-authenticate on next visit.
- **All devices at once**: **Access** → **Applications** → `My Planning` →
  **Revoke all tokens**. Every active session is invalidated immediately.
- **Remove a device permanently**: same as revoking a single session — Access
  does not maintain a device registry, only sessions.

---

## Secret rotation

Rotate `X-Sync-Secret` any time a device is lost, a session is compromised, or
as a scheduled hygiene step. Do it in this order to avoid a window where the
Worker rejects legitimate clients.

### Step-by-step

1. **Update the Worker first.**
   In the sync Worker's Cloudflare dashboard (or via Wrangler):
   ```
   wrangler secret put SYNC_SECRET
   ```
   Enter the new secret value. The Worker starts accepting the new secret
   immediately; it will reject the old one from this point.

2. **Update Pages env vars.**
   Cloudflare dashboard → **Pages** → `my-planning` → **Settings** →
   **Environment variables** → edit `VITE_SYNC_SECRET` → save.

3. **Redeploy Pages.**
   Push a trivial commit or use **Deployments** → **Retry deployment**. The
   Vite build bakes the new secret into the JS bundle.

4. **Force-reload on all signed-in devices.**
   The old bundle (with the old secret) will keep failing sync until replaced
   by the new one. Hard-reload each device:
   - Desktop browser: Cmd/Ctrl + Shift + R
   - iOS Safari: Settings → Safari → Advanced → Website Data → delete entry, then reload
   - Any device: clearing the PWA cache or reinstalling forces a fresh bundle fetch

5. **Verify.** Open Settings on each device — the sync status indicator in the
   sidebar should show healthy (no amber strip). If it still shows an error, the
   old bundle is cached; repeat step 4.

---

## Local development

Create `app-v2/.env.local` (gitignored by Vite by default — never commit it):

```
VITE_SYNC_URL=https://my-planning-sync.<you>.workers.dev
VITE_SYNC_SECRET=your-sync-secret-here
VITE_PROXY_URL=https://my-planning-proxy.<you>.workers.dev
```

You may also commit a `app-v2/.env` with **placeholder values only** as
documentation for contributors — never real secrets:

```
# Copy to .env.local and fill in real values. Never commit .env.local.
VITE_SYNC_URL=
VITE_SYNC_SECRET=
VITE_PROXY_URL=
```

Vite loads files in this precedence order (later wins):
`.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`

So `.env` with empty placeholders is safe to commit; `.env.local` with real
values overrides it locally and is never tracked.
