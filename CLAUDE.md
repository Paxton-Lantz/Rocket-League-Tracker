# CLAUDE.md — Rocket League Tracker

## What this app is
A personal Rocket League stat tracking web app with AI coaching. The user logs every game manually after it ends. The app tracks stats over time, visualizes progress, detects patterns, and delivers AI coaching alerts when it spots something worth flagging. It also includes a built-in Rocket League concept library that explains game mechanics in context.

This is a beginner's first coding project. Code must be clean, simple, and heavily commented so the user can learn from it. No over-engineering. No unnecessary complexity.

---

## Who this is for
One user — the developer himself. No login system, no accounts, no multi-user support. Ever.

---

## Tech stack
- **HTML** — single `index.html` file for structure
- **CSS** — single `styles.css` file for all styling
- **JavaScript** — single `app.js` file for all logic
- **Chart.js** — for all charts and graphs (load via CDN)
- **localStorage** — for all data storage, no backend, no database, no server
- **Claude API** — added in Phase 3 only, for AI coaching alerts

No frameworks. No React. No Vue. No Node. No npm. No build tools. No TypeScript. Plain HTML, CSS, and JavaScript only. The app must open by double-clicking `index.html` in a browser — no local server required until the API is added.

---

## File structure
```
rl-tracker/
├── CLAUDE.md
├── index.html
├── styles.css
└── app.js
```
Do not create additional files unless explicitly asked.

---

## Data structure
Every logged game is stored as a JavaScript object in this exact shape:

```js
{
  id: 1234567890,          // timestamp used as unique ID
  date: "2025-06-01",      // ISO date string
  sessionId: 1234560000,   // groups games played in the same sitting (within 2 hrs of each other)
  rank: "Gold II",         // selected from dropdown
  result: "W",             // "W" or "L"
  goals: 2,                // integer 0–99
  saves: 1,                // integer 0–99
  assists: 0,              // integer 0–99
  shots: 4,                // integer 0–99
  mvp: true,               // boolean
  opponentMmr: 845         // integer or null — opponent's MMR, optional, logged manually
}
```

All games are stored in localStorage under the key `"rl_games"` as a JSON array. Never change this key name or data shape without being asked.

### Rank order (low to high)
Bronze I → Bronze II → Bronze III → Silver I → Silver II → Silver III → Gold I → Gold II → Gold III → Platinum I → Platinum II → Platinum III → Diamond I → Diamond II → Diamond III → Champion I → Champion II → Champion III → Grand Champion I → Grand Champion II → Grand Champion III → Supersonic Legend

---

## Full feature list

### Phase 1 — MVP
- [ ] Log form with full keyboard/tab navigation (see UX rules below)
- [ ] localStorage persistence
- [ ] Rank history line chart (x = game number, y = rank)
- [ ] Summary bar: total games, win rate %, MVP rate %

### Phase 2 — Stats dashboard
- [ ] Full stats dashboard: avg goals, saves, assists, shots per game
- [ ] All stats filterable by rank
- [ ] Session auto-grouping (games within 2 hours = same session)
- [ ] Per-session summary: W/L, avg stats, session result
- [ ] Streak detector: current win/loss streak displayed live
- [ ] Tilt warning: triggered after 3+ consecutive losses in one session

### Phase 3 — AI coaching
- [ ] Claude API integration
- [ ] Pattern-triggered coaching alerts only — never on a schedule
- [ ] Built-in RL concept library (rotations, boost management, positioning, etc.)
- [ ] Concept library entries link contextually to the user's actual stats
- [ ] API key stored in a config variable at top of app.js — never hardcoded elsewhere

### Phase 4 — Polish
- [ ] Visual redesign based on user-provided design inspiration
- [ ] Animations and transitions
- [ ] Dark mode
- [ ] Any additional features requested at that time

---

## UX rules — the most important section

### Logging must take under 15 seconds
The log form is the core of the app. If it's slow or annoying, the user stops using it. These rules are non-negotiable:

1. **Tab navigation** — every field advances to the next on Tab or Enter. The user should never need the mouse to log a game.
2. **Rank field** — dropdown, pre-set to last used rank on open so repeat games need zero interaction here.
3. **W/L field** — single keypress: `W` key = Win, `L` key = Loss. No mouse click needed.
4. **Goals, Saves, Assists, Shots** — number inputs, min 0, no max enforced in UI. Tab moves between them automatically.
5. **MVP field** — `Y` key = yes, `N` key = no, or spacebar to toggle. Last field before submit.
6. **Submit** — Enter key on MVP field submits the form. A visible keyboard shortcut hint should show next to each field.
7. **After submit** — form resets instantly, rank pre-fills to last used rank, cursor jumps back to rank field (or first changed field). A subtle success confirmation appears briefly (green flash or checkmark) then disappears. No full page reload.
8. **Form position** — always visible, never hidden behind a tab or menu. It is the first thing on the page.

### General UI rules
- Mobile is not a priority. Desktop-first always.
- No page reloads for any action.
- Charts update instantly when a new game is logged.
- Keep the interface clean — not cluttered with every stat at once.
- Destructive actions (deleting a game) require a confirmation step.

---

## AI coaching rules (Phase 3)
- Coaching alerts fire only when a meaningful pattern is detected — not after every game, not on a timer.
- Examples of patterns worth flagging:
  - Win rate drops significantly in games 5+ of a session (fatigue/tilt)
  - Save rate has declined over the last 10 games
  - Loss streaks of 3+ are recurring at a specific time of day
  - MVP rate is high but win rate is low (carrying but losing — rotation issue)
- Each alert links to a relevant entry in the RL concept library
- Alerts appear as a non-intrusive banner or card — never a popup that blocks the UI
- The user can dismiss alerts

---

## RL concept library topics to include
These must be written in plain, beginner-friendly language. No jargon without explanation.
- Rotations (what they are, why they matter at Gold)
- Boost management (small pads vs full pads, never be at 0)
- Positioning (where to be when you don't have the ball)
- Shadowing / defending
- Kickoff strategies
- Demo-ing (when it helps, when it hurts)
- Aerial basics (when to go for it, when not to)
- Mechanical vs. game sense improvement (why game sense matters more at Gold)

---

## Build instructions

### Always
- Read this file at the start of every session before writing any code
- Build only the phase explicitly requested — nothing more
- Comment all JavaScript functions explaining what they do
- After completing a phase, suggest what to update in this CLAUDE.md

### Never
- Add a backend, server, or database
- Use any JavaScript framework or library except Chart.js
- Add user authentication or accounts
- Build features from a future phase without being asked
- Change the localStorage key `"rl_games"` or the game data structure without explicit instruction
- Use `innerHTML` to insert user-provided data (XSS risk — use `textContent` instead)
- Assume a design direction — wait for user input on Phase 4

### If something is unclear
Ask before building. A short clarifying question is always better than building the wrong thing.

