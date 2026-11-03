# Recall — Codebase Audit

> **Status after the fix pass (branch `arena/674395e5-recall`).**
> Fixed: #1 bad import bricking the app, #2 `nid`/duplicate ids, #4 PYQ visibility (now surfaced with counts + an honest test sheet), #5 interval preview now equals the stored interval, #7 test readiness is explained instead of silently ignored, #8 timer Skip saves partial focus, #9 storage-full is surfaced, #10 mid-session delete crash, #12 SW precache list + all-or-nothing install, #14 export carries a schema version, #15 dialog roles / Escape / aria-current / aria-live, #16 muted-text contrast, #17 nav on 320px screens, #18 render cost, plus a new editing layer (chapters, lectures, questions) and delete with a confirmation step + Undo (the earlier single-tap delete was reversed at the owner's request).
> Also: the zip workflow can no longer rewrite the working tree from a feature branch, and `recall-app.zip` has been regenerated from this source so it can no longer clobber the fixes.
> Later pass: Today view now live-refreshes as cards fall due (it used to be a frozen snapshot until you reopened the app), shows a live "next batch in …" countdown, and lays out an explicit plan (n sittings, time estimates, overdue-first ordering).
> Later still: PYQ sets removed at the owner's request (legacy PYQ cards are dropped on load), and the reminder engine rebuilt — it now re-arms itself daily, catches a missed slot when the app wakes, stays quiet when nothing is due, schedules a closed-app nudge only when cards will actually be due then, and ships an .ics fallback for browsers that cannot wake a closed tab.
> Later still: the review unit went back to the **question** — which is what the owner actually wanted, and the lecture-level experiment was wrong. A lecture is a recorded video; you write questions from it; **each question has its own next date**. A lecture appears on Today because some of its questions came due ("2 of 6 due"), you rate those one at a time on four taps — **Blank · Vague · Solid · Instant**, i.e. how well you remembered it — and each tap shows the date it will store. That per-question rating is the point of the app: it is what tells the owner which specific questions to re-read. Saves made under the lecture model are migrated down onto their questions (each inherits the lecture's date and stability) instead of being lost.
> Licensing/cost pass: everything the app uses is permissively licensed and free to run. The Google Fonts CDN was the only third-party request in the app and is now removed — Bricolage Grotesque is self-hosted (60 KB of woff2, SIL OFL 1.1, `fonts/OFL.txt`, precached by the service worker), so the app makes **zero requests off its own origin**, works offline with its real typeface, and hands no visitor IP to Google. Full inventory in `THIRD-PARTY.md`.
> Folder sync: Settings now has a **Folder sync** section. In Chrome or Edge you pick a folder once; Recall writes `recall-data.json` into it after every change and loads a newer copy when the app opens, so Syncthing can carry the same data between devices. Browsers without the File System Access API fall back to downloading a sync file or importing one, and Syncthing conflict copies can be loaded from the same section.
> Still open by choice: #3 (zip is still the deploy input — recommend deleting it), #11 (SW build stamping relies on the zip), #19 (session caps, post-exam mode, dark mode). Fixed since this list was written: #4 (PYQ removed entirely at the owner's request), #6 (reminder engine rebuilt), #13 (font self-hosted).
>
> The rest of this document is the original audit, left as written.

**Scope:** `index.html` (single-file app, 326 lines), `sw.js`, `manifest.webmanifest`, `.github/workflows/unzip.yml`, `icons/`, `recall-app.zip`
**Method:** static read of all files + the app's own JS executed in a stubbed DOM harness (extracted `<script>`, real functions called, real state inspected). Every finding below was reproduced, not guessed — repro steps included.
**Live:** https://arv3609.github.io/Recall-/ (GitHub Pages, built from `main`)

---

## TL;DR

| # | Severity | Problem | Where |
|---|----------|---------|-------|
| 1 | 🔴 **P0** | A bad import **permanently bricks the app** (white screen, Settings unreachable) | `index.html:296-297` |
| 2 | 🔴 **P0** | `nid` not reconciled on import → **duplicate card ids** → grading edits the wrong card | `index.html:164, 297` |
| 3 | 🔴 **P0** | The `.zip` + workflow **silently overwrite** any edit you make to `index.html` | `unzip.yml:37,48` |
| 4 | 🟠 P1 | **PYQ sets are invisible forever** unless you run that chapter's test | `index.html:163` |
| 5 | 🟠 P1 | Grade buttons **show the wrong interval** ("24d" → actually 22–26d) | `index.html:155, 314` |
| 6 | 🟠 P1 | Reminders are **one-shot / silently dead** on iOS and most Android | `index.html:248-251` |
| 7 | 🟠 P1 | Chapter test **can be started early** ("Early" badge is clickable) | `index.html:309` |
| 8 | 🟡 P2 | Timer "Skip" **silently discards** a running focus block | `index.html:224` |
| 9 | 🟡 P2 | `save()` **swallows quota errors** — silent data loss | `index.html:133` |
| 10 | 🟡 P2 | Crash if a chapter is deleted while a review session is open | `index.html:309, 314` |
| 11 | 🟡 P2 | Service worker never updates for existing users → offline users frozen | `sw.js:1` + `unzip.yml:42` |
| 12 | 🟡 P2 | SW misses 2 icons in its precache list; `addAll` is all-or-nothing | `sw.js:1,3` |
| 13 | 🟡 P2 | Google Fonts = uncached third-party dependency → offline loses typography | `index.html:17` |
| 14 | 🟡 P2 | No export format version → future migrations impossible | `index.html:296` |
| 15 | 🔵 P3 | No dialog semantics, no focus management, no Escape, no keyboard shortcuts | `index.html:109, 129` |
| 16 | 🔵 P3 | `--mute` text fails WCAG AA (4.05:1 on 14–15px text) | `index.html:15` |
| 17 | 🔵 P3 | Nav overflows on 320px screens | `index.html:60` |
| 18 | 🔵 P3 | `render()` rebuilds all 5 views, `dueQ()` runs 4× per render | `index.html:233` |

Good news up front: **no XSS.** `esc()` is applied correctly everywhere user text reaches HTML (verified with `<img src=x onerror=...>` and `<script>` payloads). The FSRS math is also correct — `R()` returns exactly 0.90 at `t = S`, and intervals derive properly from the retention target. The core scheduler is sound; the bugs are in the edges around it.

---

## 🔴 P0 — Data loss / app-breaking

### 1. A bad import bricks the app permanently

`doImp()` (line 296) only checks that `chs`, `cards`, `lecs` exist. `fix()` (line 297) only defaults `focus` and `pt`. Then it **saves before rendering**:

```js
function doImp(){ ... DB=d; fix(); save(); closeSh(); render(); ... }
function fix(){ DB.focus=DB.focus||[]; DB.pt=DB.pt||{...} }   // <- set, log, nid missing
```

**Repro (verified):** import `{"chs":[],"lecs":[],"cards":[]}`

```
doImp threw -> TypeError: Cannot read properties of undefined (reading 'filter')   // DB.log
after keys: chs,lecs,cards,focus,pt        // set, log, nid are gone
BOOT FAILED on reload -> TypeError: Cannot read properties of undefined (reading 'filter')
=> blank screen, no nav, no settings, no way to reach "Erase everything"
```

The same payload is now in `localStorage`, so **every reload throws before `render()` finishes**. The Settings screen — including "Erase everything" — is unreachable. In an installed PWA the only escape is clearing site data from the browser settings. A partially-corrupt `localStorage` (interrupted write, older app version) hits the same path via `load()` (line 134).

**Fix — three layers, all cheap:**

```js
function normalize(d){                       // single source of truth
  d = (d && typeof d === 'object') ? d : {};
  d.chs   = Array.isArray(d.chs)   ? d.chs.filter(isCh)   : [];
  d.lecs  = Array.isArray(d.lecs)  ? d.lecs.filter(isLec) : [];
  d.cards = Array.isArray(d.cards) ? d.cards.filter(isCard).map(cardDefaults) : [];
  d.log   = Array.isArray(d.log)   ? d.log.filter(l => l && +l.t) : [];
  d.focus = Array.isArray(d.focus) ? d.focus.filter(f => f && +f.t) : [];
  d.pt    = Object.assign({m:'focus',run:false,end:0,rem:null,cy:0,ch:0}, d.pt || {});
  d.set   = Object.assign({ret:.9, exam:'', fm:25, bm:5, lb:15}, d.set || {});
  d.nid   = 1 + Math.max(0, ...[...d.chs, ...d.lecs, ...d.cards].map(o => +o.id || 0));
  return d;
}
function cardDefaults(c){
  return Object.assign({S:0,D:5,reps:0,lapses:0,last:0,state:'new',leech:false,text:'',label:'?',due:Date.now()}, c);
}
```

- `load()` → `DB = normalize(JSON.parse(j))`
- `doImp()` → `var d = normalize(JSON.parse(text)); DB = d; save(); render();`
- Wrap the boot line in a guard so a crash can never be fatal:

```js
try { load(); fix(); render(); } catch(e){
  // recovery screen instead of a white page
  document.getElementById('v-today').innerHTML =
    '<div class="empty"><b>Could not read your data</b><p>Tap below to reset Recall.</p>' +
    '<button class="btn bad" onclick="localStorage.removeItem(\'recall.v1\');location.reload()">Reset data</button></div>';
  document.getElementById('v-today').classList.add('on');
}
```

**Bonus:** validate *before* writing to `localStorage`, and keep a `recall.v1.bak` of the last known-good DB so one bad import is always recoverable.

---

### 2. Import doesn't reconcile `nid` → duplicate ids → wrong card gets graded

`mk()` (line 164) does `id: DB.nid++`. `fix()` never recomputes `nid`, so an imported DB whose `nid` is behind its existing ids hands out **ids that already exist**.

**Repro (verified):** import a DB with one card `id:3` and `nid:1`, then add a lecture → `ids: [3, 2, 3]`, `duplicateIds: [3]`.

`cardOf(id)` returns the *first* match, so grading, `setTx()`, and `undo()` can silently hit the wrong question. The fix is the `d.nid = 1 + Math.max(...)` line in `normalize()` above.

---

### 3. The `.zip` is the real source of truth and it overwrites the repo

`unzip.yml` triggers on any `*.zip` push, unzips over the repo root, then `git add -A` + `git push` (lines 37, 48–53). So:

- Any edit made directly to `index.html` gets **silently reverted** the next time the zip is pushed.
- `recall-app.zip` (60 KB binary) in git is a duplicate of the working tree. Right now it differs from the repo: the zip has `sw.js` with `V='__BUILD__'` (unstamped), the repo has `V='168a364ade'` (stamped by a past workflow run). Push the zip again and the working tree's build id is replaced by the *older* one.

**Fix options, pick one:**
- **(recommended)** Delete `recall-app.zip` and `unzip.yml`. Treat the repo as the source of truth; GitHub Pages already deploys `main` directly.
- Keep the zip workflow, but unzip into `dist/` and deploy *that*, leaving source in the repo root.
- At minimum, add `recall-app.zip` to `.gitignore` and generate it from source in CI instead of committing it.

---

## 🟠 P1 — Features that don't do what the UI promises

### 4. PYQ sets are invisible forever

```js
function dueQ(){ ... c.due<=t && !(c.k==='P' && c.state==='new') ... }   // line 163
```

`doComp()` creates every PYQ set with `state:'new'` and `due = testDue` (3 days out). Combined with the filter above, they are **excluded from the due queue permanently** — nothing promotes them except completing a chapter test.

**Repro (verified):** complete a chapter with 240 PYQs / 20 per set →
`{pyqCards:12, pyqStates:["new"], inDueQueue:0, visibleInToday:false}`

So a user who adds 12 PYQ sets and never runs the test never sees them. They *do* exist in the DB and in `vProgress`'s "next 14 days" chart, so the numbers disagree with the Today screen.

**Fix:** drop the `'P' && 'new'` exclusion and let the normal due date govern — set PYQ cards `due = testDue` and they'll appear on the right day anyway. If you want PYQs gated behind the test on purpose, then surface them in Today with a locked state ("Test in 3 days — 12 PYQ sets waiting") instead of hiding them.

### 5. The interval shown on the grade button is not the interval you get

`reveal()` (line 314) previews with `sched(c, i+1, t)`, but `apply()` (line 155) then mutates it three more times:

```js
if(iv>=3) iv *= 1 + (Math.random()-.5)*.1;               // ±5% random
if(n.iv>=3){ ... [-1,0,1,2].forEach(... split by day load ...) }   // may move ±2 days
```

**Repro (verified):** same card, same grade, 20 previews → **19 distinct values**. And even when stable, `apply` snaps `due` to a day boundary and can shift it by up to 2 days.

**Fix:** `Math.random()` → a seeded PRNG keyed on `card.id + reps` (deterministic and still spread out), and have `reveal()` call a shared `plan(c,g,t)` that `apply()` also uses verbatim, so what's displayed is what's stored.

### 6. Reminders are one-shot, and silently dead outside Chrome-on-Android

**Repro (verified):**
- `schedDaily()` (line 251) schedules a **single** `TimestampTrigger`. Nothing re-arms it after it fires — the only call sites are boot, `setRem(true)`, and the time input. So a user who doesn't open the app gets **exactly one** reminder, ever.
- Its body is hardcoded `'Time to recall. Your questions are waiting.'` — it fires even when **zero cards are due**, unlike `sw.js:13` which does filter.
- `regPeriodic()` (line 248) calls `permissions.query({name:'periodic-background-sync'})` and only registers if `state==='granted'` — that query returns `'prompt'` in practice, so the SW's `check()` never runs. And `minInterval:36e5` is 1 hour, below Chromium's ~12 h floor.
- On iOS, `TimestampTrigger` is `undefined` and `new Notification()` throws — both caught and swallowed. **Settings still says "Reminder On".**

**Fix:**
- Have `sw.js` re-arm: after firing, compute tomorrow's time and `showNotification` with a new trigger (self-rescheduling), and drop the body when `dues` is empty.
- Raise `minInterval` to `12*36e5`.
- Tell the truth in the UI: gate the "On" chip on a capability check (`'TimestampTrigger' in self` / `registration.periodicSync`), and on iOS show "Reminders only work while Recall is open" instead of pretending.
- Also: `setRem()` (line 239) has `try{ ... requestPermission().then(...) }catch(e){}` — a rejected promise is **not** caught by `try/catch`. Verified: it throws an unhandled rejection. Add `.catch()`.

### 7. Chapter tests can be started before they're ready

`vToday()` renders the badge as `c.testDue<=t ? 'Start' : 'Early'`, but the whole card is the click target (`onclick="startTest(...)"`), and `chSheet()` offers "Start chapter test" unconditionally. Verified: `startedEarly: true`.

**Fix:** when the test isn't due, either disable the button (`disabled` + `aria-disabled`, muted styling) or make "Early" open a confirm sheet explaining that the 3-day consolidation window hasn't elapsed.

---

## 🟡 P2 — Robustness

### 8. Timer "Skip" silently discards real work
`pEnd(false)` (line 224) only records a session if `mn >= 1`, i.e. it needs a full minute. Starting a focus block and hitting Skip loses the elapsed time with no feedback, and "Skip" on a fresh timer flips you straight to a break.

**Fix:** record `Math.round(elapsed)` whenever `elapsed > 0` (or floor-to-30s), and toast "Saved 3m of focus" / "Nothing to save yet, tap Reset instead".

### 9. `save()` swallows every error
`try{localStorage.setItem(...)}catch(e){}` (line 133) — quota exceeded (verified) or private-mode failure means the user keeps reviewing and **loses everything on reload** with zero warning.

**Fix:** count failures, show a persistent banner after the third ("Your browser storage is full — export a backup now"), and offer the export sheet.

### 10. Crash when a chapter is deleted mid-session
`sess.ids` holds card ids; `delCh()` removes those cards but not the session. Verified: `TypeError: Cannot read properties of undefined (reading 'label')` in `show()`, and `(reading 'id')` in `grade()`. Hard to reach today (the overlay covers the nav) but it's one refactor away from being a real crash. **Fix:** `show()`/`grade()` should skip ids that no longer resolve, and `delCh()` should drop them from `sess.ids`.

### 11. The service worker never updates for existing users
`sw.js:1` hardcodes `V='168a364ade'`. The stamping step (`unzip.yml:42`) only runs when a **zip** is pushed. Since `index.html` changes don't change `sw.js` bytes, the browser sees no SW update, `controllerchange` never fires, and the cache name never rotates — so **offline users stay on whatever version they first cached**. HTML is network-first, so online users are fine; that masks the bug.

**Fix:** let CI rewrite `V` from the commit SHA on every push to `main` (a tiny action, or a `V` that hashes the files), and register with `updateViaCache:'none'` (already done).

### 12. Precaching is incomplete and all-or-nothing
`ASSETS` (line 1) omits `icons/apple-touch-icon.png` and `icons/icon-512-maskable.png` (verified: 0 matches). And `c.addAll(ASSETS)` **rejects the whole install** if any one URL 404s — the SW then never activates.

**Fix:** add the two icons, and precache individually so one failure doesn't kill the install:
```js
e.waitUntil(Promise.all(ASSETS.map(u => c.add(u).catch(()=>{}))).then(()=>self.skipWaiting()))
```

### 13. Google Fonts is an uncached third-party dependency
Line 17 loads Bricolage Grotesque from `fonts.googleapis.com`. `sw.js:6` skips cross-origin requests, so **offline the app silently loses its entire typography** — the one thing that makes it feel designed. It's also a privacy/third-party request on an app that's otherwise 100% local.

**Fix:** self-host the woff2 (2 weights is ~40 KB), or at minimum cache the font files in the SW. Self-hosting also removes 2 DNS/TLS handshakes from cold start.

**Fixed:** both subsets are now in `fonts/` (60 KB total, one variable file per subset, all weights) with the OFL licence beside them, declared as two `@font-face` rules with `unicode-range`, precached by the service worker, and the three `<link>` tags are gone — including the two `preconnect`s. The app now issues no off-origin request at all. See `THIRD-PARTY.md` for the full licence/cost inventory.

### 14. No export/save format version
`doImp` accepts any object with 3 keys. There is no `v` field, so the day you change the card schema you can't tell old data from new.

**Fix:** add `v:1` on save; in `normalize()` branch on `d.v ?? 0` and migrate.

---

## 🔵 P3 — Accessibility, UX, performance

### 15. Review overlay and sheets aren't accessible dialogs
`#ov` (line 109) and `#sh` (line 129) are plain `div`s: no `role="dialog"`, no `aria-modal`, no focus trap, no Escape-to-close, focus not moved on open, and **focus is lost after `reveal()`** because the Reveal button is `display:none`'d while focus is on it. For an app whose main loop is hundreds of taps, keyboard users are locked out.

**Fix:** `role="dialog" aria-modal="true"`, move focus to the first grade button (or the card) on open, restore to the trigger on close, add `Escape` and `1–4`/Space shortcuts, and an `aria-live="polite"` announcement for "Question 3 of 12".

Also: `#toast` has no `role="status"` / `aria-live`, so toasts are silent to screen readers.

### 16. One real contrast failure
Measured every pair in the palette:

| Pair | Ratio | Verdict |
|---|---|---|
| `--mute` #6F7587 on `--bg` #EAF1FF | **4.05** | ❌ fails AA (needs 4.5) — used for `.sub` 15px, `.lec .t span` 14px, `.chap p` 14px |
| `.note span` (mute @ 75% on `--sun`) | **4.02** | ❌ fails AA |
| `--mute` on white card | 4.59 | ✅ |
| nav inactive `#A9AEC2` on `#17181C` | 8.04 | ✅ |
| All ink-on-color combos | 7.6–12.9 | ✅ |

**Fix:** darken `--mute` to ~`#5A6070` (5.3:1 on `--bg`) — a single token change fixes every instance.

### 17. Nav overflows on 320px screens
Six 48px buttons + 16px padding = 304px needed; the available inner width is `100vw − 36 − 16`. At 320px that's **268px** → buttons get squeezed (verified by arithmetic). At 360px+ it's fine.

**Fix:** `nav button{width:44px}` or `nav{padding:6px}` with `nav button{flex:1}`; or drop "Focus" from the bar into Settings.

### 18. Render cost
`render()` (line 233) rebuilds **all five views** via `innerHTML` on every navigation, and `vToday()` calls `dueQ()` (which sorts with `R()` in the comparator) while `render()` calls `dueQ()` again for the title. Measured with 2,000 cards: `render()` 13 ms, `save()` 1.8 ms, `dueQ()` 0.7 ms. That's acceptable on desktop but a mid-range phone is 5–10× slower — and `save()` (a full JSON serialize + `Cache.put`) fires on **every single grade**.

**Fix:** render only the active view; compute `dueQ()` once per render and pass it in; debounce `save()` (write immediately to memory, flush to `localStorage` after ~250 ms or on `visibilitychange`/`pagehide`).

### 19. Smaller things
- `dueQ()` has **no session cap or daily new-card limit** — after a break you can get a 2,000-card session (verified). Add `sess` limits (e.g. 20 new + all reviews) and a "Study ahead" option.
- The exam clamp (`index.html:155`) only applies while `left > 0`; **on exam day intervals jump back to months** (measured 262 days for a high-stability card). Add an explicit post-exam mode.
- ~~`height:100%` on `html/body/.app` → use `100dvh` so the mobile URL bar collapsing doesn't clip the nav.~~ **This advice was wrong and caused a bug:** `dvh` re-measures on every toolbar transition *and* `:root` carried safe-area padding while `body` kept a `100dvh` floor, so the document stayed scrollable and the shell drifted — the nav slid down and off-screen. The shell is now a `position:fixed` pane pinned at `top:0` with `100dvh` height, `html/body` are `overflow:hidden`, the insets moved onto `.view`/`.ov`, and the keyboard resizes the layout (`interactive-widget=resizes-content`) instead of scrolling it.
- `row()` in Progress emits `<button onclick="">`s — dead focus targets. Render a `div` when there's no action.
- No dark mode; `color-scheme:light` is hardcoded. `prefers-color-scheme` + `theme-color` variants would be ~15 lines.
- Manifest is minimal: no `lang`, `dir`, `categories`, `screenshots`, `shortcuts`, or `display_override`. `screenshots` are what make the Android install dialog look real.
- `snap()` builds the state key from `location.href` (line 247) while `sw.js:9` builds it from `registration.scope` — they agree today, but they diverge if the app is ever reachable at a URL without a trailing slash.
- No README, no tests, no linter, no CI beyond unzipping. Two failed workflow runs are still in the history ("Initial upload", "Deploy Recall").

---

## What's already good (don't refactor these away)

- **No XSS** — `esc()` is applied consistently; verified with `<img onerror>`, `<script>`, and quote payloads.
- **The FSRS math is right** — `R(t=S) = 0.90` exactly, intervals solve from the retention target, difficulty mean-reverts, `chapMod` scales by lapse rate.
- **Undo restores card state exactly** — verified byte-identical `S/D/reps/last` and `log` truncation.
- **Day-streak logic is correct** (verified 3-day streak and the post-gap 0 case), and intervals are day-start-aligned so reviews cluster sensibly.
- **Offline-first with a real SW**, `viewport-fit=cover` + safe-area insets, `prefers-reduced-motion`, 16px inputs (no iOS zoom), focus-visible outlines, and 44px+ tap targets. That's more care than most PWAs get.

---

## Suggested order

1. **Today:** #1 + #2 (one `normalize()` function fixes both, plus a boot guard) — this is the only class of bug that destroys user data.
2. **Today:** #3 — decide the source of truth *before* making any other edits, or your work gets clobbered.
3. **This week:** #4, #5, #7 — the three places where the UI currently misleads the user.
4. **Next:** #11–13 (PWA/infra), then #15–16 (accessibility is a token change + a dialog wrapper).
5. **Then the interesting part:** #6 rework + the "make it better" items (session caps, post-exam mode, dark mode, keyboard shortcuts, stats that mean something).

---

*Harness used for verification lived in a scratch dir and has been removed. Nothing in the app was modified by this audit.*
