# Template versions

Every site built from this template records which template release it started
from, so it can later see what has changed and pull those changes in.

## How it works

- **`frugal.json`** at the repo root holds the template's address and a
  version, e.g. `0.2.0`. In the template it is the current release. A site
  made from the template copies it with everything else, so the site knows
  its starting version without anyone writing it down. Do not edit it by hand.
- **Each template change is a release.** A pull request to the template bumps
  `frugal.json` (semver: patch for fixes, minor for features, major for
  anything a site must change to keep working) and adds a
  `## [<version>] - <date>` section to `CHANGELOG.md`. CI refuses a pull
  request that does neither.
- **Merging to `main` tags it.** Once CI passes, `template-release.yml` tags
  the commit `v<version>` and publishes the changelog section as a GitHub
  release. Those tags are what sites upgrade between.

## Upgrading a site

```bash
npm run template                  # what is new since this site's version
npm run template -- upgrade       # apply everything up to the latest release
npm run template -- upgrade 0.3.0 # or stop at a given release
```

`upgrade` fetches the template's tags into `refs/tags/frugal/*` (so they never
clash with the site's own tags), takes the template's diff between the site's
version and the target, and applies it as a three-way merge. Then it sets
`frugal.json` to the new version. Conflicts are left as markers, as `git merge`
leaves them. Resolve them, then `npm run build && npm test`, and commit.

Not applied:

- **`drizzle/`.** Migration numbers belong to each repo, so a template
  migration would collide with the site's own. The schema files in
  `worker/schema/` are patched instead: run `npm run gen` and the site writes
  its own migration for the change. `npm run gen` writes structure only, so
  the template's new migrations are listed too: copy any hand-added data step
  in them (an `UPDATE` backfill, say) into the site's migration.
- **`CHANGELOG.md` and `frugal.json`.** The site's own. The template's
  changelog for the releases applied is printed instead.
- **Files the site deleted**, such as the notes example. They are listed so
  you can port anything still wanted by hand.

Read each printed changelog section: it names anything that has to be done by
hand, such as a new var to set in the dashboard.

## Sites made before versioning

A site with no `frugal.json` was made before versions existed, and may carry
any mix of template changes ported by hand. Which release it matches has to be
worked out by hand once:

1. Copy `scripts/template.ts` and the `"template"` script in `package.json`
   from the template into the site.
2. `npm run template -- guess` lists how many lines the site differs from each
   release. The site's own features add to every row, so treat it as a hint.
3. Read the template's `CHANGELOG.md` and find the newest release whose
   changes the site already has in full. When unsure, pick the older one: an
   upgrade re-applies a change the site already has as a conflict you can
   resolve, but never brings back a change it skipped.
4. `npm run template -- pin <version>` writes `frugal.json`. Commit it.

From then on the site upgrades like any other.
