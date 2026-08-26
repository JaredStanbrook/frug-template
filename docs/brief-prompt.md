# Writing the brief

Claude builds a much better app when it knows the shape of the thing before it
writes the first table. The database schema is the expensive part to change
later — once real rows exist, every change is a migration.

So: spend ten minutes on a brief first.

Two ways to get one.

---

## Option A — have another assistant interview you

Paste the prompt below into ChatGPT, Gemini, Claude.ai, or whatever you have
open. It will ask you questions, then produce a brief in the shape this
template consumes. Paste the finished brief into Claude Code.

This works well when you know what you want but not how to describe it in
software terms.

> ### Prompt to copy
>
> You are helping me write a build brief for a web application. I will hand
> your output to a coding agent, so it needs to be concrete and unambiguous —
> but I am not necessarily technical, so ask me questions in plain language.
>
> The app will be built on a fixed stack I cannot change, so please do not
> propose alternatives to it:
>
> - One Cloudflare Worker, server-rendered. Every page is HTML built on the
>   server; HTMX swaps fragments for interactivity. There is no React, no
>   single-page app, no mobile app.
> - Cloudflare D1 (SQLite) for all structured data, R2 for uploaded files, KV
>   for short-lived tokens.
> - Accounts, sign-in (password, passkey, two-factor), roles and permissions
>   are already built. Do not design them — just tell me who has accounts and
>   what each kind of user is allowed to do.
> - Styling uses a fixed light/dark theme system. Describe layout, hierarchy
>   and tone; do not pick hex colours.
>
> Interview me one topic at a time — do not dump every question at once. Start
> by asking what the app is for and who uses it. Then work through the areas
> below, asking follow-ups where my answer is vague. If I say something that
> is unusually hard on this stack (live collaboration, realtime chat, heavy
> background processing, very large file handling), tell me plainly and offer
> a simpler version.
>
> Cover:
>
> 1. **Purpose** — what it does, in one sentence. Who it is for. What replaces
>    it today.
> 2. **Users and roles** — every kind of person with an account, and what each
>    may and may not do. Whether sign-up is open, invite-only, or admin-created.
> 3. **Things** — the main objects the app stores. For each: what it is called,
>    what information it holds, who owns it, and which other things it relates
>    to. Push me until each object has a clear owner.
> 4. **What people do** — the handful of actions that matter most, as short
>    sentences: "a coach adds a player to a squad", "a parent pays an invoice".
> 5. **Screens** — the pages, what each shows, and what a user does on each.
>    What the first screen after signing in should be.
> 6. **Public vs private** — anything a signed-out visitor can see.
> 7. **Files** — whether users upload anything, what kind, roughly how big.
> 8. **Look and feel** — three adjectives, and any site whose feel I like.
> 9. **Out of scope** — what this version deliberately does not do.
>
> When you have enough, output the brief under exactly these headings, and
> nothing else:
>
> ```
> # <App name>
> ## Purpose
> ## Users and roles
> ## Data model
> ## Key actions
> ## Screens
> ## Public access
> ## Files
> ## Look and feel
> ## Out of scope
> ## Open questions
> ```
>
> Under **Data model**, list each object as a heading with its fields as a
> bullet list, and state its owner and relationships explicitly. Under
> **Users and roles**, give each role a short name suitable for use in code
> (lowercase, one word where possible).
>
> Put anything I was unsure about under **Open questions** rather than
> inventing an answer. Keep the whole thing under two pages.

---

## Option B — write it yourself

Copy `docs/brief-template.md`, fill it in, and hand it over. Skip anything that
does not apply; Claude will ask about gaps that matter.

---

## Then

Start a Claude Code session in your new repo and paste the brief with something
like:

> Here is the brief for the app I want to build on this template. Set the repo
> up and start building.
>
> <paste>

Claude will read the brief, tell you which Cloudflare resources it needs, and
ask you to create them in the dashboard and paste back the ids. From there it
configures the repo and builds.

**What it will ask you for**, so you can have it ready:

- A **D1 database** — always.
- A **KV namespace** — unless you turn passkey sign-in off.
- An **R2 bucket** — only if people upload files.
- The **domain** you want, or nothing if you are happy on `workers.dev` to
  start with.
- The **email address** that should be the first admin.

`docs/deploy.md` has the click-by-click for each.

## What makes a brief work

- **Name the objects and say who owns them.** "Invoices belong to a client;
  clients belong to the agency" is worth more than three paragraphs of feature
  description.
- **Be concrete about roles.** "Admins can delete anything, members only their
  own posts" turns directly into permission strings.
- **Say what it does not do.** It stops scope drifting mid-build.
- **Describe feel, not pixels.** "Calm, dense, spreadsheet-like" gives more to
  work with than a hex code, and the theme system handles colour.
- **Leave the unknowns as questions.** An honest open question is better than a
  guess you will have to migrate away from.
