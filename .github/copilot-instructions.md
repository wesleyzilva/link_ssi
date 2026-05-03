# GitHub Copilot — Workspace Instructions

> Inherited from [workspaceShare](https://github.com/wesleyzilva/workspaceShare).
> See the full specification at `.github/copilot-instructions.md` in that repository.

## This Project: link_ssi

- **Type:** Chrome Extension — LinkedIn SSI automation tool
- **Manifest:** V3 (Service Worker, Content Scripts, Declarative permissions)
- **Runtime:** Vanilla JavaScript (ES modules) — no build step, no framework
- **Storage:** IndexedDB only — no backend, no cloud, no third-party services
- **Execution:** Local only — runs in an authenticated Chrome session with the user's real LinkedIn cookies

## Quick Rules

- English C2 in all code and documentation
- STAR methodology for any decision record or PR description
- Vanilla JS only — do NOT use Angular, React, Vue, or any component framework
- No `npm install` — zero dependencies; pure browser APIs only
- All DOM selectors must include a fallback strategy (LinkedIn changes DOM frequently)
- Human-mimicry is mandatory before every interaction: use `randomWait()` and `scrollIntoViewAndPause()` from `utils/human-mimicry.js`
- Anti-duplication must be enforced via IndexedDB before every action (posts + recruiters)
- Daily caps are hardcoded constants — never remove or bypass them
- `feat`/`fix`/`chore` conventional commits, max 72-char subject
- No secrets committed — no API keys, tokens, or credentials of any kind

