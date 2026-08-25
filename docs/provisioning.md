# Provisioning a new site

Every per-site value in `wrangler.jsonc` and every secret, with the four ways
to supply each one. Work top to bottom; the whole thing takes about ten minutes.

Audit what is still unfilled at any point:

```bash
grep -in "change.me\|0000000" wrangler.jsonc
```

---

## The three kinds of configuration

Getting these confused is the most common way a deploy goes wrong, so it is
worth being precise:

| Kind        | Lives in                   | Visible in git | Read as            | Use for                                                       |
| ----------- | -------------------------- | -------------- | ------------------ | ------------------------------------------------------------- |
| **Binding** | `wrangler.jsonc` top level | Yes (ids only) | `c.env.DB`         | D1, KV, R2, rate limiters, the assets fetcher                 |
| **Var**     | `wrangler.jsonc` `"vars"`  | Yes            | `c.env.APP_NAME`   | Non-sensitive settings — role tables, feature flags, branding |
| **Secret**  | `wrangler secret put`      | **No**         | `c.env.JWT_SECRET` | Anything that grants access if leaked                         |

Resource **ids are not secrets** — a D1 database id or KV namespace id is
useless without an authenticated API token for your account, which is why they
sit in version control. `JWT_SECRET` is the opposite: anyone holding it can
mint a session for any user.

---

## 1. Cloudflare resources

Create these first; each command prints the id you need.

### D1 database

```bash
bunx wrangler d1 create my-site-db
```

Output:

```jsonc
{
  "binding": "DB",
  "database_name": "my-site-db",
  "database_id": "ecb3b2b7-8d46-455b-b645-29c109e8b8a5",
}
```

Paste `database_name` and `database_id` into the `d1_databases` block. Keep
`"migrations_dir": "drizzle"` — that is what `bun run migrate:remote` applies.

_Dashboard route:_ **Storage & Databases → D1 → Create**. The id is on the
database's overview page.

### KV namespace

```bash
bunx wrangler kv namespace create KV
```

Paste the printed `id` into `kv_namespaces`. The template uses KV for WebAuthn
challenges (5-minute TTL) and short-lived state — nothing here is durable, so
losing the namespace costs nothing but an interrupted sign-in.

_Dashboard route:_ **Storage & Databases → KV → Create namespace**.

### R2 bucket (optional)

```bash
bunx wrangler r2 bucket create my-site-files
```

If the site stores no files, delete the `r2_buckets` block **and** the `R2`
entry in `worker/types.ts`. Leaving a binding declared for a bucket that does
not exist fails the deploy.

_Dashboard route:_ **R2 → Create bucket**.

### Rate limiter

Nothing to provision. `namespace_id` is an arbitrary number you choose to
identify the limiter _within this worker_ — it is not an account resource. Use
a different number per limiter if you add a second one.

### Custom domain

The zone must already exist in your Cloudflare account. Then:

```jsonc
"routes": [{ "pattern": "my-site.example.com", "custom_domain": true }]
```

`zone_name` is only needed when the record is ambiguous. Delete the block
entirely to publish on `<name>.<subdomain>.workers.dev` instead — useful before
you have a domain.

_Dashboard route:_ **Workers & Pages → your worker → Settings → Domains &
Routes → Add**. Adding it there and in `wrangler.jsonc` is equivalent; keeping
it in the file means a fresh deploy reproduces it.

---

## 2. Secrets

### `JWT_SECRET` — required

Signs the session cookie. Generate a long random value:

```bash
openssl rand -base64 48
```

Then supply it by whichever route fits how you deploy:

**a. Wrangler CLI** (most direct)

```bash
bunx wrangler secret put JWT_SECRET
# paste when prompted; it is not echoed and not stored locally
```

**b. Cloudflare dashboard**

**Workers & Pages → your worker → Settings → Variables and Secrets → Add →
type: Secret**. Same result. Useful when someone without repo access needs to
rotate it.

**c. GitHub Actions**, for deploys from CI

CI never needs `JWT_SECRET` itself — the secret already lives on the worker and
survives deploys. CI needs only a token that is allowed to deploy:

```
Repo → Settings → Secrets and variables → Actions → New repository secret
  CLOUDFLARE_API_TOKEN   (Edit Cloudflare Workers template)
  CLOUDFLARE_ACCOUNT_ID  (Dashboard → Workers & Pages → Account ID)
```

See `.github/workflows/deploy.yml`.

**d. Local development**

```bash
cp .dev.vars.example .dev.vars
# set JWT_SECRET; .dev.vars is git-ignored
```

> Secrets are **per worker script**. `wrangler secret put JWT_SECRET` and
> `wrangler secret put JWT_SECRET --env staging` write to two different
> workers. A staging deploy that 500s on every request is usually this.

### Optional secrets

Only if `AUTH_METHODS` includes `email` or `sms`: `SMTP_USER`, `SMTP_PASS`,
`SMS_PROVIDER_API_KEY`. Same four routes.

---

## 3. Vars that must match reality

Most vars are safe defaults. These four break things silently if wrong:

| Var             | Must be                                                       | Symptom when wrong                                                    |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `RP_ID`         | The bare hostname — `my-site.example.com`, no scheme, no port | Passkey registration and login fail with an opaque browser error      |
| `ORIGIN`        | The full origin — `https://my-site.example.com`               | Passkeys fail; the CSRF check rejects your own forms                  |
| `JWT_EXPIRY`    | **Seconds** (`86400` = 24h)                                   | A pasted millisecond value (`86400000`) gives a ~2.7 **year** session |
| `ROLES_DEFAULT` | A role listed in `ROLES_AVAILABLE`                            | Registration throws at runtime                                        |

`SESSION_DURATION` and `LOCKOUT_DURATION` are milliseconds; `JWT_EXPIRY` is
seconds. They are not interchangeable — `validateAuthConfig()` cannot catch a
plausible-looking number, so check this one by hand.

Run the config validator against a deployed worker at any time:

```bash
bunx wrangler tail          # then hit the site and watch for config warnings
```

---

## 4. Production vs staging

Production sits at the **top level** of `wrangler.jsonc`, so plain
`wrangler deploy` targets the live site and keeps its existing secrets.

`env.staging` deploys a **separate worker script** named `<name>-staging`.

**Named environments inherit nothing.** Every binding and var is repeated in
the staging block on purpose. Two rules:

1. **Give staging its own D1 and KV ids.** Pointing staging at production ids
   means `bun run migrate:remote` against staging migrates live data, and a
   test account lands in the production users table. The template ships
   separate placeholders for exactly this reason.
2. **`RP_ID` / `ORIGIN` must match the staging hostname.** A passkey registered
   on `my-site.example.com` will not work on `dev.my-site.example.com` — that
   is WebAuthn working as designed, not a bug.

Set staging secrets separately:

```bash
bunx wrangler secret put JWT_SECRET --env staging
```

Delete the whole `env` block if you do not want a staging environment.

---

## 5. First deploy

```bash
bun run migrate:remote                                    # create the tables
bun run create-admin:remote --email you@example.com --generate
bun run deploy:prod
```

`create-admin` is the only way to make the first admin: `admin` is listed in
`ROLES_RESTRICTED`, so it cannot be self-assigned at registration.

The `migrate:*` scripts target the **`DB` binding**, so Wrangler resolves the
real database from `wrangler.jsonc` and the scripts need no editing. Use
`bun run migrate:staging` for the staging environment — `migrate:remote`
targets production.

---

## Checklist

- [ ] `name` set to the worker name you want to keep
- [ ] `routes` set to your domain, or the block deleted
- [ ] `d1_databases` — real `database_name` and `database_id`
- [ ] `kv_namespaces` — real `id`
- [ ] `r2_buckets` — real bucket, or block **and** `R2` in `types.ts` deleted
- [ ] `JWT_SECRET` set via `wrangler secret put` (and again for `--env staging`)
- [ ] `RP_ID` and `ORIGIN` match the deployed hostname exactly
- [ ] `JWT_EXPIRY` is in seconds
- [ ] `APP_NAME`, `APP_TAGLINE`, `TOTP_ISSUER`, `RP_NAME` are your branding
- [ ] `ROLES_*` and `PERMISSIONS_AVAILABLE` model your resources, and match the
      `Resource` type in `worker/services/access.service.ts`
- [ ] `ALLOWED_EMAILS` set if registration should be invite-only
- [ ] Staging uses **separate** D1 and KV ids from production
- [ ] `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in GitHub, if deploying from CI
- [ ] `grep -in "change.me\|0000000" wrangler.jsonc` returns only comment lines
