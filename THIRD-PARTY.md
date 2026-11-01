# Third-party code, assets and running costs

**Verdict: everything in this app is permissively licensed, needs no account, no key and no
payment, and has no online service that can start charging or disappear.** One dependency was
removed in this pass — the Google Fonts CDN — because it was the only part of the app that
reached a third-party server.

Checked: `index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, `fonts/`, `.github/workflows/`.

---

## Inventory

| What | Where | Licence | Commercial use | Obligation | Cost |
|---|---|---|---|---|---|
| **Bricolage Grotesque** (variable font, wght 200–800) | `fonts/*.woff2` | **SIL OFL 1.1** | Yes | Ship `fonts/OFL.txt` with the font; don't use the Reserved Font Name for a *modified* version | ₹0 |
| App icon + PWA icons | `icons/icon.svg`, `icons/*.png` | Original artwork, same terms as the app | Yes | none | ₹0 |
| UI glyphs (home, book, plus, bars, timer, sliders, close, undo) | inline `<svg>` in `index.html` | Drawn for this app (24×24, 1.75 stroke) | Yes | none | ₹0 |
| App code, service worker, manifest | `index.html`, `sw.js`, `manifest.webmanifest` | Yours — no outbound licence declared yet (see bottom) | — | — | ₹0 |
| `actions/checkout@v4` | `.github/workflows/unzip.yml` | **MIT** | Yes | none | ₹0 (free minutes on a public repo) |
| GitHub Pages hosting | deploy | GitHub ToS | Yes | none | ₹0 for a public repo |

Even in the worst case — if a glyph path were adapted from an MIT/ISC icon set such as Lucide or
Feather — both allow commercial use with no credit in the UI; the only obligation is keeping their
notice in a source distribution, which is what this file is.

---

## What was removed: Google Fonts

The font itself was always free (OFL), so this was never a licensing problem. It was a
*maintenance* and *privacy* problem:

1. **Two third-party hosts on the critical path.** `fonts.googleapis.com` (CSS API) and
   `fonts.gstatic.com` (files) both had to stay up, and the `css2?family=…opsz,wght@12..96,500;…`
   query had to keep parsing. If Google changes that API, the app silently loses its typeface.
2. **It never worked offline.** The app is offline-first and precaches everything it needs — but
   the font was fetched from another origin, so it was never in the cache. Open the app on a plane
   and it fell back to `system-ui`. The design was only ever correct while online.
3. **It leaked an IP per visit.** Google's CDN receives the visitor's address on every cold load.
   German courts have ruled that loading Google Fonts this way without consent breaches GDPR —
   a real exposure for a study app used by students in the EU.
4. **It was unverifiable.** Nothing about the font lived in this repo, so this file could not
   honestly claim anything about it.

**Now:** the two subsets (latin 41 KB, latin-ext 19 KB — 60 KB total, same variable font, all
weights 200–800) live in `fonts/`, `fonts/OFL.txt` sits beside them as the licence requires, and
the service worker precaches both. The stylesheet is two `@font-face` rules with `unicode-range`,
so latin-ext is only *used* when a page actually contains those characters. **The app now makes
zero requests to any origin other than its own.**

One trade-off: if you open `index.html` straight off disk (`file://`), Chrome and Edge refuse to
load local font files, so you'd see `system-ui` instead. Served over http(s) — GitHub Pages, the
installed PWA, the local preview — the real typeface loads and is cached. That's a browser rule
about local files, not a licensing or network issue.

---

## What is deliberately not used

- No framework, no bundler, no build step, no runtime npm dependencies — `index.html` is the app.
- No CDN `<script>`, no external CSS, no external images, no web-font service.
- No analytics, no crash reporting, no tracking pixel, no A/B service.
- No backend, no database, no serverless function, no accounts, no API keys, no OAuth.
- No paid tier of anything; every feature runs on built-in web platform APIs
  (`localStorage`, Service Worker, Cache Storage, Notifications, `Blob`, `Intl`).

`grep -nE 'fetch\(|XMLHttpRequest|sendBeacon|WebSocket|importScripts' index.html` returns nothing.

---

## What would cost money if you changed something

| Change | Cost |
|---|---|
| Custom domain | ~₹1,000/yr (optional; GitHub Pages subdomain is free) |
| Private repo **and** Pages | needs GitHub Pro — a public repo's Pages is free |
| Wrapping for Google Play / App Store | Play $25 once, Apple $99/yr — installing the PWA from the browser is free |
| Real push when the app is closed on iOS | the first thing that needs a server — this is exactly why the `.ics` fallback exists; without a server, reminders fire while the app is open and the calendar file covers the closed case |
| Sync across devices | needs a backend or a paid BaaS |

---

## Rules to keep it free

1. **No CDN links.** Vendor the file into the repo, put its licence beside it, add it to the
   `sw.js` `ASSETS` list.
2. **No service that needs a key, an account, or a credit card.** If it can't run from `file://`
   or a static host, it doesn't go in.
3. **Fonts/icons:** OFL, Apache-2.0, MIT, ISC, BSD, CC0 are fine. CC-BY needs a visible credit.
   CC-BY-NC, "free for personal use", or no licence at all — don't.
4. **Record it here.** A row in the table above the day you add it, with the licence file next to
   the asset.

---

## The app's own code

No outbound licence is declared. That is a choice only you can make, so it was left alone:

- **Want others to be able to reuse it?** Add `LICENSE` with MIT (shortest, most permissive) or
  Apache-2.0 (adds a patent grant). One file, no maintenance.
- **Want it to stay yours?** Do nothing — without a licence, default copyright applies.

Nothing in the app depends on that decision.
