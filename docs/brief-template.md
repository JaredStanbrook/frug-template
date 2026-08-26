# <App name>

<!--
Fill this in and hand it to Claude Code. Delete any section that does not
apply. Anything you leave blank, Claude will ask about — or assume, and tell
you what it assumed.

If you would rather be interviewed than write this cold, docs/brief-prompt.md
has a prompt to paste into any chat assistant that produces this for you.
-->

## Purpose

What the app does, in one sentence. Who uses it. What they do today instead.

## Users and roles

Every kind of person with an account, with a short lowercase name for each
(these become roles in code).

| Role    | Who they are | What they can do | What they cannot do |
| ------- | ------------ | ---------------- | ------------------- |
| `admin` |              |                  |                     |
| `user`  |              |                  |                     |

How do people get accounts? (open sign-up / invite-only / an admin creates them)

## Data model

The main objects. For each, list the fields, say who owns it, and name its
relationships.

### <Object>

- field — what it holds
- field — what it holds

Owned by: <role or object>
Relates to: <object> (one-to-many / many-to-one)

## Key actions

The handful of things that matter most, one line each.

- A <role> <does something> so that <outcome>.

## Screens

| Screen           | Shows | Actions available |
| ---------------- | ----- | ----------------- |
| Home (signed in) |       |                   |
|                  |       |                   |

Where should a user land immediately after signing in?

## Public access

Anything a signed-out visitor can see. Write "nothing" if the whole app is
behind sign-in.

## Files

Do users upload anything? What kind, and roughly how large? Who may download
it? Write "none" if not.

## Look and feel

Three adjectives. Any site whose feel you like, and what specifically about it.

Density: spacious / balanced / dense
Default theme: light / dark / follow the system

## Out of scope

What this version deliberately does not do.

## Open questions

Anything you are unsure about. Leave it here rather than guessing.
