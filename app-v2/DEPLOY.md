# Deployment guide — My Planning v2

Deployed on **Cloudflare Pages** (base path `/`, set in `vite.config.ts`).

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

## Site sign-in (`functions/_middleware.ts`)

Every request goes through a Cloudflare Pages Function, except the icons and
`manifest.webmanifest` (`PUBLIC_PATHS`), which iOS fetches without credentials
when adding the app to the Home Screen.

- **Signing in.** An unauthenticated page load gets a small sign-in page (name
  and password, served by the gate itself, Keychain-friendly); anything else
  gets a plain 401. There is no `WWW-Authenticate` challenge any more: the
  browser's Basic dialog kept signing a signed-out device back in, and a Home
  Screen app cannot show it. A correct name and password sets the session
  cookie and returns to the page asked for (`/__auth/sign-in`, POST).
- **The session cookie** `mp_session`: HttpOnly, SameSite=Lax, Secure, a year,
  renewed whenever the app checks for an update (`/sw.js`). Its value is an HMAC
  of the name keyed by the password, so it is the same on every device and
  needs no storage; changing either credential signs every device out.
- **Signing out** (the app's Sign out, which asks first): `/__auth/sign-out`
  (POST, from this site only) clears the cookie on that device and marks it
  signed out (`mp_signed_out`), so a password the browser remembered does not
  sign it back in; the app then deletes the device's Intelligence cache and
  its offline copy (service worker and caches). Afterwards `/`, `/api/*` and
  the app's files answer 401 on that device. The app's own database stays (it
  mirrors synced data and may hold unsent edits, synced first when possible);
  nothing synced is deleted. Signing in again clears the mark.
- **Scripts and local development** may still send the password as an
  `Authorization: Basic` header (`curl -u`, the Vite `/api` proxy), except from
  a browser that has just signed out.
- There is no per-device revocation of a session held elsewhere: to sign out a
  lost device, rotate the password (below).

### Environment variables (runtime — not build-time)

| Variable | Purpose |
|---|---|
| `BASIC_AUTH_USER` | Sign-in name |
| `BASIC_AUTH_PASS` | Sign-in password |

These are **runtime** env vars, not `VITE_`-prefixed. They are never baked
into the JS bundle — the Pages Function reads them from `context.env` at
request time, for every deployment at once (rolling back a deployment does not
change them).

Set them in the same dashboard location as the `VITE_*` vars:
Cloudflare dashboard → **Pages** → `my-planning` → **Settings** →
**Environment variables** → **Production**.

### Generating a strong password

```sh
openssl rand -base64 32
```

Copy the output as `BASIC_AUTH_PASS`. Use any memorable string as
`BASIC_AUTH_USER` (e.g. `stephane`).

### Rotating the password (signs every device out)

1. Generate a new password (`openssl rand -base64 32`).
2. Update `BASIC_AUTH_PASS` in Pages → **Settings** → **Environment variables**.
3. Redeploy (push a commit, or **Deployments** → **Retry deployment**).
4. Every session cookie is now invalid. A device opening the app online gets
   the sign-in page; a Home Screen app keeps working offline from its service
   worker copy until it next goes online, when its calls are refused and the
   next page load signs in.

For a compromise, also bump the service worker (edit any constant in
`vite.config.ts`) so every device fetches fresh assets on its next online
load and meets the sign-in page at once.

### Rotating the Google key (Intelligence)

The Intelligence feeds are read with a Google service account in the dedicated
Google account; its JSON key is the Pages secret `GOOGLE_SERVICE_ACCOUNT`
(base64 of the JSON). Nobody but the user handles the key. To replace it (lost
laptop, suspected leak, or yearly):

1. In the dedicated account's Google Cloud console: **IAM & Admin → Service
   Accounts →** the reader account **→ Keys → Add key → Create new key → JSON**.
2. In Terminal, from `app-v2`:
   `base64 < ~/Downloads/NEW-KEY.json | tr -d '\n' | npx wrangler pages secret put GOOGLE_SERVICE_ACCOUNT --project-name my-planning`
   and replace the `GOOGLE_SERVICE_ACCOUNT=` line in `app-v2/.dev.vars` the same way.
3. Redeploy (secrets apply to new deployments), then open Intelligence and
   refresh: editions load.
4. Back in the console, **delete the old key**, then delete the downloaded file.

The service account only ever has **Viewer** on the "ChatGPT Intelligence"
folder (scope `drive.readonly`); check the folder's sharing after any change.

---

## Local development

Create `app-v2/.env.local` (gitignored by Vite by default — never commit it):

```
VITE_SYNC_URL=https://my-planning-sync.<you>.workers.dev
VITE_SYNC_SECRET=your-sync-secret-here
VITE_PROXY_URL=https://my-planning-proxy.<you>.workers.dev
```

> `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` are not needed in `.env.local` —
> the Pages Function middleware only runs on Cloudflare, not in the local Vite
> dev server. Local dev is unprotected by design.

You may also commit a `app-v2/.env` with **placeholder values only** as
documentation for contributors — never real secrets:

```
# Copy to .env.local and fill in real values. Never commit .env.local.
VITE_SYNC_URL=
VITE_SYNC_SECRET=
VITE_PROXY_URL=
# BASIC_AUTH_USER and BASIC_AUTH_PASS are runtime vars (Pages Function only).
# Set them in the Cloudflare Pages dashboard, not here.
```

Vite loads files in this precedence order (later wins):
`.env` → `.env.local` → `.env.[mode]` → `.env.[mode].local`

So `.env` with empty placeholders is safe to commit; `.env.local` with real
values overrides it locally and is never tracked.

---

## Sync architecture: first-boot trade-off

On a fresh device (empty IndexedDB), `loadOrCreate` in `src/main-app.tsx`
attempts a **pull-before-save**: it fetches all records from the Worker before
writing any local defaults. This prevents the Worker's authoritative data from
being overwritten by empty defaults through the normal last-write-wins rule
(defaults are stamped `updatedAt=now`, which is always newer than records the
Worker received from another device weeks or months ago).

### Offline first-boot

If the initial pull fails (device offline, Worker down), the app saves defaults
locally and sets the `my-planning-needs-initial-pull` flag in `localStorage`.
While this flag is set, `syncData()` in `src/storage/db.ts` **skips push
entirely** and **force-applies** all remote records on the next online sync —
bypassing the LWW check that would otherwise let the phone's newer-timestamped
defaults win.

### Trade-off (do not "fix" this into a three-way merge)

Any edits made on the device while offline and before the first successful pull
are **overwritten** by the Worker's data when the device comes online. This is
intentional. For a personal single-user app the correct recovery from an offline
first-boot is "Worker wins" — per-field three-way merge with conflict resolution
is disproportionate for this edge case and would require schema-level change
tracking that does not exist here.

If you ever need to implement per-field merge, the entry point is the
`NEEDS_INITIAL_PULL_KEY` flag path in `syncData()` and the
`pullAndReplaceFromWorker()` function — both in `src/storage/db.ts`.

---

## Notifications and reminders

The Routine dashboard ships **in-app reminders only**, and that is a deliberate
limit rather than an unfinished feature.

### What works today

While the app is open — which is the actual use case, an iPad on a desk stand
for most of the working day — the Routine screen shows a reminder strip for any
activity with a clock time that has come due in the last 30 minutes and is not
yet done. Each strip offers "Mark done" and a dismiss. This covers the four
priority reminders: the 11:00 stack, strength training, Wednesday cardio, and
evening magnesium once a time is set on it in Routine settings.

The reminder check runs on the same one-minute clock subscription the rest of
the screen uses. There is no polling and no background work.

### What does not work, and why

Notifications that fire **when the app is closed** are not implemented, and
cannot be with the current architecture. On iPadOS:

1. The Notification API is only available to a web app **installed to the Home
   Screen** (Add to Home Screen from the Safari share sheet). It does nothing in
   a normal Safari tab.
2. Even installed, iOS/iPadOS has **no local scheduled-notification API** for
   web apps. `setTimeout` plus `new Notification()` only fires while a page is
   running; iOS suspends the app shortly after it goes to the background.
3. Delivering a notification to a closed app requires **Web Push** (iOS 16.4+),
   which needs: a push subscription per device, VAPID keys, a server holding
   those subscriptions, and a scheduler that wakes up at the right local time
   and pushes. That is a new always-on backend component — the existing D1 sync
   Worker is request-driven and has no scheduler.

Implementing it would mean adding a Cron Trigger to a Worker, a `push_subs`
table, VAPID key management, and per-user reminder times — a self-contained
later phase. It was kept out of this one on purpose: it must not be the thing
holding up a working dashboard, and a reminder that silently fails to fire is
worse than no reminder at all.

### If you want to try it anyway

Install to the Home Screen (the manifest and icons are in place) and grant
notification permission; you will get reminders while the app is open or very
recently backgrounded. Do not rely on it for anything time-critical.
