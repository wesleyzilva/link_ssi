# link_ssi — Personal Link Hub

<p align="center">
  <em>Centralised, data-tracked link page for Wesley Silva's professional and social profiles</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Angular-20+-DD0031?style=for-the-badge&logo=angular&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-5+-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/GitHub%20Pages-Hosted-24292E?style=for-the-badge&logo=github&logoColor=white"/>
  <img src="https://img.shields.io/badge/Status-In%20Development-F39C12?style=for-the-badge"/>
</p>

**Live:** https://wesleyzilva.github.io/link_ssi/ *(pending deployment)*

---

> Single-page link hub built with Angular, replacing generic link-in-bio tools with a fully owned, analytics-instrumented profile page — every click tracked, every link version-controlled, no third-party lock-in.

---

## The Problem

Professional social profiles (LinkedIn, GitHub, portfolio, WhatsApp) are scattered across bios and footers with no centralised access point. Third-party "link in bio" tools (Linktree, etc.) add a middleman, obscure analytics, restrict design, and create dependency on a service that can change pricing or disappear.

---

## The Solution

A self-hosted Angular single-page application deployed on GitHub Pages. Presents a curated set of professional links with custom branding, GA4 click tracking, and zero platform dependency. Full control over design, data, and uptime.

---

## Architecture

```
Visitor clicks link in bio
    └─► GitHub Pages (link_ssi)
             └─► Profile card + categorised links
                      └─► Click event → GA4 (link_id, link_label)
                               └─► User lands on destination
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Angular 20+ | Reactive UI, standalone components |
| Styling | SCSS | Custom design tokens, mobile-first |
| Analytics | GA4 | Click tracking per link |
| Hosting | GitHub Pages | Zero-cost static hosting |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- Angular CLI ≥ 20 (`npm install -g @angular/cli`)

### Install & Run

```bash
git clone https://github.com/wesleyzilva/link_ssi.git
cd link_ssi
npm install
npm start
# → http://localhost:4200
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
