# Template → working app

The procedure for turning a fresh copy of this template into a real site.
Follow it in order; each step depends on the one before.

## Contents

- [Is this still the template?](#is-this-still-the-template)
- [Step 0 — Get the brief](#step-0--get-the-brief)
- [Step 1 — Decide the storage](#step-1--decide-the-storage)
- [Step 2 — Configure the repo](#step-2--configure-the-repo)
- [Step 3 — Model the domain](#step-3--model-the-domain)
- [Step 4 — Build the features](#step-4--build-the-features)
- [Step 5 — Strip the scaffolding](#step-5--strip-the-scaffolding)
- [Step 6 — Hand back](#step-6--hand-back)
- [What not to do](#what-not-to-do)

## Is this still the template?

Check before anything else:

```bash
grep -in "change.me\|0000000\|frug-app" wrangler.jsonc | grep -v "^\s*[0-9]*:\s*//"
```

Any hit outside a comment means the repo has never been configured, and Step 1
onwards applies. No hits means it is already a real site — skip to ordinary
feature work and use the rest of the skill.

Two other signals that the scaffolding is still in place: `worker/routes/notes.tsx`
exists, and `APP_NAME` is still `"Frug"`.

## Step 0 — Get the brief

Do not start building from a one-line request. You need to know what the app
is, who signs in, what the main objects are and how they relate before the
first table exists — changing that later means writing migrations against data
that already exists.

If the user has not given you a brief, point them at `docs/brief-prompt.md`.
It contains a prompt they can paste into any chat assistant, which interviews
them and produces a brief in the shape this template consumes. They paste the
result back here.

If they would rather just talk it through, ask for the same things the brief
covers, but keep it to a handful of questions — do not interrogate. The
minimum you need before writing a schema:

- What the app is for, in a sentence.
- The main objects, and which belongs to which.
- Who has accounts, and what different roles may do.
- Whether anything is public to signed-out visitors.
- Whether users upload files.

Say back what you understood and get a yes before generating migrations.

## Step 1 — Decide the storage

Work out which bindings the app actually needs. Getting this right now avoids
a config change and a redeploy later. Full detail in `bindings.md`; the short
version:

| Binding | Needed when | Notes |
| --- | --- | --- |
| **D1** (`DB`) | Always | Auth and roles live here. Never remove it. |
| **KV** (`KV`) | Passkeys enabled, or you want short-lived cache | Stores WebAuthn challenges. Droppable only if `AUTH_METHODS` has no `passkey`. |
| **R2** (`R2`) | Users upload or download files | Images, documents, exports. Not for structured data. |
| **Rate limiter** | Always on by default | Nothing to provision. |

The template ships with all three storage blocks present. Removing one is a
config edit plus a type edit — `bindings.md` has both halves. **A binding
declared but not provisioned fails the deploy**, so an unused block must be
deleted rather than left pointing at a placeholder.

Ask the user to create whichever they need in the Cloudflare dashboard and
paste back the ids. They cannot be guessed, and `docs/deploy.md` Step 1 tells
them where to click.

## Step 2 — Configure the repo

Once you have the ids:

```bash
npm run configure -- \
  --name my-site --app-name "My Site" --tagline "…" \
  --domain my-site.example.com \
  --d1-name my-site-db --d1-id <uuid> \
  --kv-id <32-hex> \
  --r2-bucket my-site-files \
  --admin-email owner@example.com
```

Use `--no-r2` or `--no-kv` for storage the app does not need; the script
removes the block and tells you what else to delete. Run
`npm run configure -- --help` for the full list.

Then set the RBAC vars in `wrangler.jsonc` by hand, because they depend on the
domain model rather than on ids:

- `ROLES_AVAILABLE` — every role in the brief.
- `ROLES_DEFAULT` — what a new sign-up gets.
- `ROLES_RESTRICTED` — anything that must not be self-assigned.
- `PERMISSIONS_AVAILABLE` — `resource.action` and `resource.action.any` for
  each object.
- `ROLES_INHERENT` — which role gets which permissions.

Keep the resource names identical to the `Resource` union in
`worker/services/access.service.ts`.

Verify before moving on:

```bash
npm run build && npx wrangler deploy --dry-run
```

The dry run prints the resolved bindings. Check the ids match what the user
pasted — this is the cheapest place to catch a typo.

## Step 3 — Model the domain

One file per object in `worker/schema/`, following `note.schema.ts`. Get the
whole model in before generating migrations, so the first migration is one
coherent schema rather than a chain of edits.

Then **one** migration:

```bash
npm run gen
```

Read the generated SQL before continuing. It is the thing that will run
against a real database.

Local check:

```bash
npm run migrate:local
```

## Step 4 — Build the features

Now the ordinary loop from `SKILL.md`: views, routes, registration checklist,
`npm run build && npm run test`. Build one feature end to end and confirm it
works before starting the next — a half-finished vertical slice is easier to
fix than four of them.

Work through the brief's features in the order the user listed them, unless
one clearly blocks another.

## Step 5 — Strip the scaffolding

Once at least one real feature works, remove the example so it does not ship:

- `worker/schema/note.schema.ts`
- `worker/routes/notes.tsx`
- `worker/views/notes/`
- its entry in `worker/app.tsx`
- its entry in `menuConfig` in `worker/views/components/NavBar.tsx`
- its table in `worker/routes/dev.tsx`
- `notes.*` from `PERMISSIONS_AVAILABLE` and `ROLES_INHERENT`
- `"notes"` from the `Resource` union in `access.service.ts`
- its paths in `tests/ui-pages.test.ts`

Also replace `worker/views/pages/Home.tsx` — the template's landing page
describes the template — and `public/favicon.svg`.

Deleting the notes table needs a migration. Since nothing real depends on it,
`npm run gen` produces the drop; check it only touches `note`.

Then `npm run build && npm run test` again.

## Step 6 — Hand back

Tell the user, concretely:

- What you built, and what is left from the brief.
- Anything you assumed because the brief was silent.
- The three dashboard steps if they have not done them: `JWT_SECRET` as a
  Secret, the repo connected under Settings → Builds with Build `npm run build`
  and Deploy `npm run deploy`, and registering with the bootstrap admin email.
- That `ALLOWED_EMAILS` is worth setting if the site should not be open to
  public sign-up.

## What not to do

- **Do not configure the template repository itself.** Configuration belongs
  in the repo made *from* the template. A configured template hands the next
  site real database ids, and its first deploy migrates someone else's data.
  If you find real ids in the template repo, say so rather than building on it.
- **Do not invent Cloudflare ids.** They come from the dashboard. A wrong id
  is accepted at build time and fails at deploy.
- **Do not leave a binding declared but unprovisioned.** It fails the deploy
  with an error that does not name the binding clearly.
- **Do not generate several migrations while modelling.** Get the schema right,
  then generate once.
- **Do not skip the brief** because the request sounds simple. The schema is
  the expensive thing to change.
