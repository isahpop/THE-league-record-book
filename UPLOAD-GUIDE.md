# Uploading THE League V7 to GitHub

Upload the CONTENTS of this folder to the root of the `isahpop/THE-league-record-book`
repository. Do not upload the outer ZIP or a containing folder.

After upload, the repository root should look like:

- `.github/`
- `assets/`
- `data/`
- `scripts/`
- `tests/`
- `.nojekyll`
- `index.html`
- `README.md`
- `UPLOAD-GUIDE.md`

The website expects the folder structure above. For example, `index.html` loads
`assets/styles.css`, `assets/stats.js`, and `assets/app.js`.

## GitHub Pages

Keep GitHub Pages pointed at the `main` branch and repository root if that is
how the existing site is published. The new folder structure works normally
with GitHub Pages.

## Validation

Every push to `main` now triggers `.github/workflows/validate.yml`.
It runs `node --test tests/stats.test.js` and checks that the required site
files exist. A green Actions check means the record-book calculations and
required file structure passed.

## Tuesday updates

The ChatGPT weekly task is scheduled to refresh THE League after each completed
NFL week, write the Tuesday column, update the site data, and validate the site.
If GitHub write access is authorized later, it can commit directly. Otherwise,
it will produce a fresh upload package for manual upload.


## Required one-time ESPN automation setup

After uploading this package, open GitHub → Settings → Secrets and variables → Actions. Add two repository secrets: `ESPN_SWID` and `ESPN_S2`. Do not paste either value into source files or chat. Then open Actions → Sync ESPN league data → Run workflow. A successful run will update `data/season-2026.json` directly from ESPN and commit only if the public league data changed.
