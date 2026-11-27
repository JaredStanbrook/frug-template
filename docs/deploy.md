# Deploying from your phone

The whole cycle — template to live site — without a terminal.

You do three things in the **Cloudflare dashboard** (create resources, paste a
secret, connect the repo). Claude does everything else in the repo. Cloudflare
builds and deploys on every push from then on.

```
  Cloudflare dashboard              Claude Code                Cloudflare
  ────────────────────              ───────────                ──────────
  1. Create D1 + KV        ──ids──▶  2. Configure repo
                                        + push       ──────▶   4. Build
  3. Connect repo,                                             5. Migrate
     set JWT_SECRET                                            6. Deploy ✅
```

Nothing here needs `npx`, `wrangler`, or a computer.

---

## Step 1 — Create the resources (dashboard)

In the Cloudflare dashboard, create two things and copy their ids.

**D1 database** → **Storage & Databases → D1 SQL Database → Create**

Name it something like `my-site-db`. Open it; the **Database ID** is on the
overview page — a UUID like `ecb3b2b7-8d46-455b-b645-29c109e8b8a5`.

**KV namespace** → **Storage & Databases → KV → Create Instance**

Name it anything. Copy the **Namespace ID** — 32 hex characters.

**R2 bucket** (only if your site stores files) → **R2 → Create bucket**.

> These ids are not secrets. They are useless without an authenticated API
> token for your account, which is why they live in version control.

---

## Step 2 — Tell Claude (Claude Code)

Paste the ids into the chat. Something like:

> Configure this repo:
> app name "My Site", tagline "Notes for my team",
> domain `my-site.example.com`,
> D1 name `my-site-db`, D1 id `ecb3b2b7-…`,
> KV id `0fb3123f…`,
> admin email `me@example.com`.
> No R2.

Claude runs the configure script, which rewrites `wrangler.jsonc`:

```bash
npm run configure -- \
  --name my-site --app-name "My Site" --tagline "Notes for my team" \
  --domain my-site.example.com \
  --d1-name my-site-db --d1-id <uuid> --kv-id <32-hex> \
  --admin-email me@example.com --no-r2
```

It validates the ids, fills every placeholder, reports anything still unset,
and refuses a `--domain` that was pasted as a URL. Then Claude commits and
pushes.

**No domain yet?** Say so. The routes block is removed and the site publishes
on `<name>.<subdomain>.workers.dev`. Come back to Step 6 afterwards, because
passkeys need `RP_ID`/`ORIGIN` to match whatever hostname you end up on.

---

## Step 3 — Set the secret (dashboard)

`JWT_SECRET` signs session cookies. It must never be committed, so it is the
one value that does not live in the repo.

**Workers & Pages → your Worker → Settings → Variables and Secrets → Add**
→ type **Secret**, name `JWT_SECRET`.

For the value, ask Claude to generate one, or use any long random string —
40+ characters from a password manager is fine.

> Anyone holding this can mint a session for any user. Changing it later logs
> everyone out, which is exactly what you want after a leak.
>
> Set it as a **Secret**, not a Variable, and not a _Build_ variable — build
> variables exist only during the build and are invisible at runtime.

The Worker must exist before it has a Settings page. If you have not deployed
yet, do Step 4 first and come back — the first build will fail on the missing
secret, then succeed once you set it and re-run.

---

## Step 4 — Connect the repo (dashboard)

**Workers & Pages → your Worker → Settings → Builds → Connect**, then
authorise GitHub and pick this repository.

Set the build configuration:

| Field              | Value            |
| ------------------ | ---------------- |
| **Build command**  | `npm run build`  |
| **Deploy command** | `npm run deploy` |
| **Root directory** | _(leave blank)_  |

`npm run deploy` is defined in `package.json` as:

```
wrangler d1 migrations apply DB --remote && wrangler deploy
```

so migrations run against the real database immediately before the new code
goes live. That is the whole reason for the custom deploy command — the
default `npx wrangler deploy` would ship code against an un-migrated schema.

Push a commit (or hit **Retry deployment**) and watch the build log.

---

## Step 5 — Create your admin account

Open the site and **register normally** with the email you gave as
`--admin-email`. That account is granted `admin` on sign-up.

This works because `BOOTSTRAP_ADMIN_EMAIL` is set in `wrangler.jsonc`. It only
fires when **no admin exists yet**, so it disarms itself permanently the moment
you use it — a second registration with the same address gets an ordinary
account. Registering with `"role": "admin"` in the API is still rejected.

Once you are in, clearing the variable is good hygiene, though leaving it set
cannot grant anyone anything.

Check it worked: the nav should show **System Logs**, and `/admin/logs` should
load.

---

## Step 6 — Point passkeys at the real hostname

If you deployed to `workers.dev`, or changed domain, update these two vars in
`wrangler.jsonc` and push:

```jsonc
"RP_ID": "my-site.workers.dev",          // bare hostname, no scheme, no port
"ORIGIN": "https://my-site.workers.dev"  // full origin
```

Passkeys are bound to an origin. A mismatch here fails at the browser with no
useful error, which is the single most confusing way this setup goes wrong.
Passwords and TOTP are unaffected.

---

## Step 7 — Email (optional, needed for password reset)

"Forgot password?" and "confirm your email" work by emailing a link. The site
sends through **Cloudflare Email Service** via the `EMAIL` binding already in
`wrangler.jsonc`. Until you finish this step nothing is sent, the sign-in page
does not offer "Forgot password?", and new accounts stay unconfirmed.

1. **Compute → Email Service → Email Sending → Onboard Domain.** Pick the
   site's domain. It must use Cloudflare DNS. Cloudflare adds the SPF, DKIM,
   DMARC and bounce records itself, usually within 15 minutes.
2. Set `EMAIL_FROM` in `wrangler.jsonc` to an address on that domain, e.g.
   `"noreply@my-site.example.com"`, and push. Emails show `APP_NAME` as the
   sender's name.
3. Sending to anyone needs the **Workers Paid** plan. On Free, Email Service
   only delivers to addresses verified under Email Routing → Destination
   Addresses, which is enough to test with your own inbox.
4. Test it: sign up with an address you can read, or use "Forgot password?".
   A send that fails is logged with its reason (`E_SENDER_DOMAIN_NOT_AVAILABLE`,
   `E_RECIPIENT_PLAN_RESTRICTED`, ...) in the Worker's logs, never shown to the
   visitor.

Then, if every account must confirm its address before using the site, set
`REQUIRE_EMAIL_VERIFICATION` to `"true"`. Not before: with no email, nobody
can confirm, and every guarded page sends them to `/verify-email` for good.

A site that will never send email can delete the `send_email` block and
`EMAIL_FROM`.

---

## Done

Every push to the connected branch now builds, migrates and deploys. Ask Claude
for changes, let it push, watch the build.

---

# Reference

## The three kinds of configuration

| Kind        | Lives in                  | In git         | Read as            | Use for                                 |
| ----------- | ------------------------- | -------------- | ------------------ | --------------------------------------- |
| **Binding** | `wrangler.jsonc`          | Yes (ids only) | `c.env.DB`         | D1, KV, R2, email, rate limiter, assets |
| **Var**     | `wrangler.jsonc` `"vars"` | Yes            | `c.env.APP_NAME`   | Non-sensitive settings                  |
| **Secret**  | Dashboard → Secrets       | **No**         | `c.env.JWT_SECRET` | Anything that grants access if leaked   |

## Vars that must match reality

Most vars are safe defaults. These break things quietly:

| Var                | Must be                                | Symptom when wrong                                                                                                           |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `RP_ID`            | Bare hostname, no scheme or port       | Passkeys fail with an opaque browser error                                                                                   |
| `ORIGIN`           | Full origin with `https://`            | Passkeys fail; CSRF rejects your own forms                                                                                   |
| `JWT_EXPIRY`       | **Seconds** (`86400` = 24h)            | A millisecond value (`86400000`) gives a ~2.7 **year** session                                                               |
| `SESSION_DURATION` | **Milliseconds** (`86400000` = 24h)    | A seconds value (`86400`) expires every session ~86s after sign-in. `validateAuthConfig` now refuses anything under a minute |
| `ROLES_DEFAULT`    | A role listed in `ROLES_AVAILABLE`     | Registration throws at runtime                                                                                               |
| `ORIGIN`           | The address people use                 | Emailed reset and confirmation links point at it, so a wrong one sends people somewhere else                                 |
| `EMAIL_FROM`       | On a domain onboarded to Email Service | Nothing is sent; the reason is in the Worker's logs                                                                          |

`SESSION_DURATION` and `LOCKOUT_DURATION` are milliseconds; `JWT_EXPIRY` is
seconds. Nothing can validate a plausible-looking number, so check it by hand.

## If the build fails

Read the build log in **Settings → Builds** first; it names the failing step.

| Symptom                                                                  | Cause                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every page returns a "Not configured" 503                                | `JWT_SECRET` is not set at runtime, or was set as a _Build_ variable rather than a Secret — a Build variable exists only during the build. Fix it in Variables and Secrets; secrets apply immediately, with no redeploy |
| Migration step fails with an auth error                                  | Rare — the build has your account's credentials. Fall back to the manual migration below                                                                                                                                |
| `database_id` invalid                                                    | The id in `wrangler.jsonc` does not match the dashboard                                                                                                                                                                 |
| Passkey registration fails, everything else works                        | `RP_ID` / `ORIGIN` mismatch (Step 6)                                                                                                                                                                                    |
| Build cannot find `worker-configuration.d.ts`                            | Should not happen — `npm run build` regenerates it via `wrangler types`                                                                                                                                                 |
| `npm ci` fails with `Missing: <pkg> from lock file`                      | `package-lock.json` was regenerated with a plain `npm install`, which drops optional binaries for other platforms. Ask Claude to rerun `npm install --package-lock-only` and push                                       |
| Pages load but sign-up fails with "The database has not been set up yet" | The migrate step never ran. Check the Deploy command is `npm run deploy`, not the default `npx wrangler deploy`, then redeploy. Or apply the schema by hand — see the manual migration fallback below                   |

**Manual migration fallback.** If the migrate step ever fails, you can apply
the schema by hand with no CLI: open **D1 → your database → Console**, paste
the contents of `drizzle/0000_init.sql`, and run it. Ask Claude for the exact
SQL for any later migration.

## Rolling back

**Workers & Pages → your Worker → Deployments** lists every deployment with a
**Rollback** action. Code rolls back instantly; database migrations do not, so
a migration that drops a column needs a forward fix, not a rollback.

## Local development (optional)

Nothing above requires this, but if you do have a machine:

```bash
npm install
cp .dev.vars.example .dev.vars     # set JWT_SECRET
npm run migrate:local
npm run dev                        # http://localhost:3000
```

For local dev, `RP_ID` must be `localhost` and `ORIGIN` `http://localhost:3000`
— `.dev.vars` overrides `wrangler.jsonc`, so set them there rather than
editing the deployed config.

Emails are not sent locally. With `EMAIL_FROM` empty (the default) each one is
printed in the terminal running `npm run dev`, link included, so a reset or
confirmation can be followed by copying it. Add `"remote": true` to the
`send_email` binding to send real mail from a local run.

`npm run create-admin:local -- --email you@example.com --generate` creates an
admin directly, as an alternative to the bootstrap flow.

Bun works too (`bun install`, `bun run dev`) — the scripts are runtime-agnostic.
The committed lockfile is `package-lock.json` because npm is what Cloudflare's
build image detects most reliably.

## Appendix: adding a staging environment

The template ships production-only, which is what the dashboard flow wants: one
Worker, one connected repo, one deploy command.

To add staging, add an `"env": { "staging": { … } }` block to `wrangler.jsonc`.
Two things to know:

1. **Named environments inherit nothing.** Every binding and var must be
   repeated inside the block. Omitting one does not fall back — the binding is
   simply absent at runtime.
2. It deploys a **separate Worker** named `<name>-staging`, with **separate
   secrets** — you must set `JWT_SECRET` on it too, and give it its own D1 and
   KV ids. Pointing staging at production ids means a staging migration runs
   against live data.

Then add a `deploy:staging` script to `package.json` (it does not ship in the
template):

```json
"deploy:staging": "wrangler d1 migrations apply DB --remote --env staging && wrangler deploy --env staging"
```

and connect a second Worker in the dashboard to the same repo, with Deploy
command `npm run deploy:staging`.
