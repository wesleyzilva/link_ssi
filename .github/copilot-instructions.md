# GitHub Copilot — Workspace Instructions

> Inherited from [workspaceShare](https://github.com/wesleyzilva/workspaceShare).
> See the full specification at `.github/copilot-instructions.md` in that repository.

## This Project: link_ssi

- **Type:** Angular SPA — single-page link hub
- **Hosting:** GitHub Pages (`gh-pages` branch)
- **Analytics:** GA4 — track every link click with `event_category: link_click`
- **Goal:** Zero third-party dependency, full ownership of link-in-bio data

## Quick Rules

- English C2 in all code and documentation
- STAR methodology for any decision record or PR description
- Angular signals, standalone components, `OnPush` change detection
- `feat`/`fix`/`chore` conventional commits, max 72-char subject
- No secrets committed — GA4 measurement ID lives in `environment.ts`
