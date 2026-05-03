# link_ssi — LinkedIn SSI Optimizer

> Chrome Extension · Manifest V3 · Vanilla JS · IndexedDB · Zero cloud dependency

[![Status](https://img.shields.io/badge/status-active-brightgreen)](https://github.com/wesleyzilva/link_ssi)
[![Type](https://img.shields.io/badge/type-chrome--extension-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![LinkedIn SSI](https://img.shields.io/badge/LinkedIn-SSI--automation-0077b5)](https://www.linkedin.com/sales/ssi)

---

## Executive Summary

A Chrome Extension that automates LinkedIn Social Selling Index (SSI) optimisation for a global nearshore tech talent positioning strategy. The extension executes a daily routine — capturing SSI scores, sending strategic connection requests to Tech Recruiters in high-value geographic windows, engaging with low-competition posts, and building relationships through network touch events — with full human-mimicry, anti-duplication, and daily caps to avoid platform detection.

**Owner:** Wesley Silva · IT Manager · 14+ years · Nearshore LATAM specialist  
**Target recruiters:** US East Coast, UK/EU, APAC (Australia, Singapore, China)  
**Time windows:** 11:00 BRT (US East + EU morning) · 21:00 BRT (APAC morning + US West)

---

## Big Picture

LinkedIn SSI is a **compound interest system**: every daily interaction deposits into a score that determines LinkedIn's algorithm priority for profile visibility to recruiters. Without deliberate, consistent daily engagement, a technical profile decays in visibility while competitors accumulate signals. This extension solves the execution problem — not the strategy — by automating the repetitive daily touchpoints that drive SSI growth while **preserving the authenticity of the engagement** through personalised messages, contextual comments, and human-timing delays.

The commercial goal is direct: a higher SSI score means more recruiter InMails, more profile views from target decision-makers, and a shorter sales cycle for nearshore placement. Each additional SSI point above 70 statistically correlates with 2–3× more recruiter-initiated contact.

---

## Executive Tradeoffs

| Dimension | Decision | Alternative Rejected | Rationale |
|-----------|----------|---------------------|-----------|
| Platform | Chrome Extension (Manifest V3) | Selenium / Playwright bot | Extension runs in an authenticated browser session with the user's real cookies, consistent IP, and natural fingerprint — the same signals a human generates. Headless browsers have distinct fingerprints LinkedIn actively blocks |
| Runtime | Local execution only | Cloud-hosted automation (AWS Lambda + Puppeteer) | LinkedIn bans IPs from cloud providers aggressively. Consistent residential IP from the user's machine is the safest execution environment |
| Storage | IndexedDB (client-only) | Firebase / Supabase backend | Zero cloud cost; no GDPR/LGPD liability for contact data; no third-party breach surface; data never leaves the user's machine |
| Framework | Vanilla JavaScript (ES modules) | React / Angular SPA | Extensions don't benefit from component frameworks; Vanilla JS eliminates build tooling, transpilation, and dependency management complexity |
| Cadence | Twice-daily alarm (11:00 + 21:00 BRT) | Continuous / random | Fixed windows map precisely to peak recruiter activity in target time zones; predictability makes cap management reliable |
| Anti-detection | Human-mimicry (random delays, scroll simulation, hover events) | No mimicry / maximum speed | LinkedIn's anti-automation systems measure timing uniformity and event sequences; human-mimicry is a hard requirement, not an optimisation |

---

## Architecture

```
link_ssi/
├── manifest.json                  ← Manifest V3 config (permissions, host_permissions)
├── background/
│   └── service-worker.js          ← Alarm scheduler + daily sequence orchestrator
├── content/
│   ├── ssi-monitor.js             ← Captures 4 SSI pillar scores from Sales Navigator
│   ├── recruiter-prospector.js    ← Sends connection requests with personalised notes
│   ├── post-engager.js            ← Likes + comments on low-competition posts
│   └── relationship-builder.js   ← Congratulates network events (anniversaries, new jobs)
├── utils/
│   ├── db.js                      ← IndexedDB wrapper (scores, posts, recruiter 7-day lock)
│   ├── time-checker.js            ← Validates BRT time against target geographic windows
│   └── human-mimicry.js           ← randomWait(), humanClick(), humanType(), scroll simulation
└── popup/
    ├── popup.html                 ← Extension popup UI
    ├── popup.js                   ← Reads storage, renders SSI scores + activity log
    └── popup.css                  ← Dark-mode popup styles
```

---

## Daily Routine Sequence

```
Service Worker alarm fires (11:00 or 21:00 BRT)
  │
  ├─ checkGlobalTime() → validates time window
  │
  ├─ Tab 1: linkedin.com/sales/ssi
  │    └─ ssi-monitor.js → captures 4 pillar scores → saves to IndexedDB
  │
  ├─ Tab 2: linkedin.com/search/results/ (Tech Recruiters, target geo)
  │    └─ recruiter-prospector.js → sends up to 25 connection requests
  │         └─ isRecruiterLocked() → skips if interacted within 7 days
  │
  ├─ Tab 3: linkedin.com/feed/
  │    └─ post-engager.js → 5 likes + 2 comments (priority: <10 comments)
  │         └─ hasInteractedWithPost() → skips already-liked posts
  │
  └─ Tab 4: linkedin.com/mynetwork/
       └─ relationship-builder.js → congratulates anniversaries + new roles
```

---

## SSI Pillars → Actions Mapping

| SSI Pillar | Target Score | Automation Action |
|------------|-------------|-------------------|
| Establish your professional brand | 25/25 | Post engagement, relationship touches |
| Find the right people | 25/25 | Recruiter prospecting with geo + title filters |
| Engage with insights | 25/25 | Low-competition post likes + meaningful comments |
| Build relationships | 25/25 | Anniversary congrats, new job messages, connection notes |

---

## Daily Caps (Anti-Burn)

| Action | Cap per session | Reason |
|--------|----------------|--------|
| Connection requests | 25/day | LinkedIn soft-ban threshold ~30/day for new accounts |
| Post likes | 5 per run | Natural browsing behaviour ceiling |
| Post comments | 2 per run | Quality > quantity; generic comments hurt SSI |
| Relationship touches | 10 per run | Mirrors organic network-check behaviour |
| Recruiter 7-day lock | Per profile | Prevents harassment signal; re-engagement after position update |

---

## Connection Note Template

```
Hi {firstName}, I noticed you're scaling tech teams globally. As an IT Manager
based in Brazil with 14+ years in high-performance engineering, remote team
leadership, and M&A, I'd love to connect and stay on your radar for senior
leadership opportunities. Best, Wesley
```

---

## Installation (Local)

1. Clone the repository
   ```bash
   git clone https://github.com/wesleyzilva/link_ssi.git
   cd link_ssi
   ```

2. Open Chrome → `chrome://extensions/`

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked** → select the `link_ssi` folder

5. Pin the extension from the Extensions menu

6. Open LinkedIn in a tab and sign in — the extension will automatically schedule the next alarm

---

## Environment & Permissions

No API keys or secrets required. All credentials stay in your Chrome session.

| Permission | Purpose |
|-----------|---------|
| `storage` | Persist SSI scores and activity state between popup opens |
| `alarms` | Schedule daily 11:00 and 21:00 BRT execution windows |
| `tabs` | Open LinkedIn URLs and inject content scripts |
| `scripting` | Execute content scripts in LinkedIn tabs |
| `notifications` | Show completion notification after each daily run |
| `host_permissions: linkedin.com` | Read and interact with LinkedIn DOM |

---

## Roadmap

- [ ] **v1.1** — Popup SSI trend chart (7-day history from IndexedDB)
- [ ] **v1.2** — Manual trigger button in popup (run now, skip alarm)
- [ ] **v1.3** — Recruiter CRM view — all contacted profiles with lock countdown
- [ ] **v1.4** — Target list import — CSV of priority recruiter profiles
- [ ] **v2.0** — Profile view automation (SSI "Find the right people" pillar boost)

---

## Security

- No secrets committed — no API keys, no OAuth tokens
- All data stored locally in IndexedDB — no external server
- Content scripts scoped exclusively to `linkedin.com` host
- Anti-duplication enforced at DB level — no repeated harassment of same contacts
- Daily caps hardcoded — cannot be overridden without source modification

---

## License

MIT
```

### Environment Variables

```env
# No secrets required for this project
# GA4 Measurement ID is set in src/index.html
```

---

## Deploy

```bash
npm run build
npm run deploy   # pushes dist/ to gh-pages branch
```

---

## Roadmap

| Version | Goal | Status |
|---------|------|--------|
| v1.0 | Profile card + link list | 🔄 In Progress |
| v1.1 | GA4 click tracking | 📋 Planned |
| v1.2 | Dark/light theme toggle | 📋 Planned |
| v1.3 | QR Code generator for offline sharing | 📋 Planned |

---

## License

MIT © [Wesley Silva](https://github.com/wesleyzilva)
