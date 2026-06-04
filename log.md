# RL Tracker — Daily Log

## 2026-06-01

### What we built today

**Phase 1 — Core**
- Log form with full keyboard navigation (Tab through every field, no mouse needed)
- W/L selector with W/L keypresses, MVP with Y/N/Space, Enter to submit
- localStorage persistence under key `rl_games`
- Summary bar: Total Games, Win Rate, MVP Rate, Streak
- Rank history line chart (Chart.js)
- Game log table with delete

**Phase 2 — Stats & Sessions**
- Stats dashboard: Avg Goals, Saves, Assists, Shots per game with trend arrows (vs last 5 avg)
- Session auto-grouping (games within 2 hours = same session)
- Session log: W/L record, avg stats, Win/Loss Session badge per session, delete button
- Streak detector: live win/loss streak in summary bar
- Tilt warning: dismissable amber card after 3+ consecutive losses in a session

**Phase 3 — AI Coaching**
- Claude API integration (Haiku, direct browser fetch, no server needed)
- Three pattern detectors: MVP-high/win-low, saves declining, session fatigue
- Coaching alert: blue dismissable card with AI-generated tip, links to concept library
- Fallback tips when API key is missing or call fails
- RL Concept Library: 8 expandable cards (Rotations, Boost Management, Positioning, Shadowing, Kickoffs, Demos, Aerials, Game Sense)

**MMR Overhaul**
- Replaced rank dropdown + W/L selector with a single MMR Change field (+10 or -9)
- Win/loss inferred from sign of MMR change
- Start Session flow: enter current MMR before first game (auto-fills from last session)
- End Session button: saves final MMR to long-term chart (no confirmation)
- Two charts: in-session MMR (game by game) + long-term MMR (one point per session)
- Session log updated: shows Net MMR and End MMR per session

**Phase 4 — Visual Redesign**
- Complete CSS design system using custom properties
- White glassmorphism cards with `backdrop-filter: blur(24px)`
- Soft gradient background blobs (parallax on mouse move via JS lerp)
- Film grain overlay via inline SVG noise texture
- Spring-physics transitions (`cubic-bezier(0.34, 1.56, 0.64, 1)`) on all interactive elements
- Magnetic button hover (cursor offset pulls button 22% toward mouse)
- 3D card tilt on `.stat-card`, `.concept-card`, `.session-card` (perspective + rotateX/Y)
- Staggered scroll entrance animations via IntersectionObserver
- Chart glow via registered Chart.js plugin (`shadowBlur: 14` before dataset draw)
- Gradient fill under chart lines
- App header with gradient "RL" wordmark + dot-grid background texture
- Summary bar with large tabular numbers and staggered load animation

**5 Themes**
- Ghost (default): white glassmorphism, blue accent
- Midnight: near-black navy, electric blue, vivid blobs
- Supersonic: dark navy, RL orange, angular cards (radius 10px)
- Synthwave: deep purple, magenta + cyan, sharp corners (radius 2px), scanline grid
- Carbon: pure black, lime green, zero radius, monospace numbers
- Theme persisted to localStorage; all charts, glow plugin, blobs, wordmark update per theme
- Theme switcher: 5 small gradient sphere buttons in the header

**Rank Icon System**
- 22 rank PNGs sourced and background-removed (Bronze I → Supersonic Legend)
- All icons re-centered on square canvases via Python (PIL bounding box + padding)
- `RANK_ICONS` map wires every rank name to its file path
- `RANK_THRESHOLDS` array maps MMR → rank name (approximate 3v3 competitive values)
- `getRankFromMMR(mmr)` and `getRankIndex(mmr)` helper functions

**Rank Hero Section**
- Full-width focal section showing current rank prominently
- 140px rank icon with two concentric pulsing glow rings
- Rank name in display typography, colored in tier's accent (gold text for Gold, etc.)
- Background watermark: tier name rendered huge and faint via CSS `::after { content: attr(data-tier) }`
- Rank-colored radial ambient glow bleeds from icon position
- Progress bar to next rank with "X MMR to [next rank]" label
- 4 floating ambient particles (CSS keyframe animations)
- All colors crossfade smoothly when rank changes
- Updates live on every game logged; also shows last session's rank when no session active

**Performance Overview Section**
- Win-rate SVG donut ring (animated stroke-dasharray, color shifts with win rate)
- Last 10 games form strip (W/L colored dots, placeholder dots when < 10 games)
- Spotlight stats: Peak MMR, Best Session, Record Streak

**Rank Strip**
- Horizontal row of all 22 rank icons in the Start Session card
- Highlights the active rank matching the MMR input (live as you type)

**Rank-Up Particle Explosion**
- Fires automatically when a logged game crosses a rank threshold
- Dark backdrop fades in so additive glow compositing creates genuine bloom
- Instant colored screen flash + screen shake (oscillating decay, 520ms)
- ~430 particles: confetti rectangles, circles, stars (source-over) + glow blobs and sparks (lighter/additive)
- 4 shockwave rings at different speeds; secondary burst fires at t=380ms
- "RANK UP" text with staggered per-letter entrance (60ms between each letter)
- Rank icon springs in with spring physics
- 3.2 second dead time before fade (long enough to register the achievement)

**UX Improvements**
- Delete games: no confirmation prompt
- Delete sessions: no confirmation prompt
- End session: no confirmation prompt
- Session delete button added to each session card in the session log

---

## 2026-06-03

### What we worked on today

**Capture Daemon Setup**
- Installed Python 3.12, Tesseract 5.4.0, and all Python packages (`mss`, `pytesseract`, `opencv-python`, `Pillow`, `pystray`) via winget/pip
- Installed Git and confirmed remote is `Paxton-Lantz/Rocket-League-Tracker` on GitHub

**capture.py fixes**
- `find_username_row`: added a slow-path fallback that groups OCR words by row (20px buckets), joins the full line of text, and checks if the username appears anywhere in it — handles club tags like `[TAG]SaxyPaxy` whether OCR merges them into one token or reads them separately
- When username is not found, now logs all OCR words to the terminal so we can see exactly what the screen capture is reading — useful for diagnosing mismatches
- `extract_stats`: debug log now prints every OCR word found when username matching fails

**config.json**
- Set `username` to `SaxyPaxy` (was placeholder `YourUsernameHere`) so the daemon works from startup without needing the browser to send it first

**start.bat**
- Updated to use full Python path (`C:\Users\paxto\AppData\Local\Programs\Python\Python312\python.exe`) since Python wasn't on system PATH yet

### For next session — read this first

**The capture daemon is built and mostly working. One bug remains: it can't find "SaxyPaxy" on the scoreboard.**

Here is exactly where we left off and what to do:

1. The daemon (`capture/capture.py`) watches the screen for the RL end-of-game scoreboard, reads stats via OCR, and serves them to the browser at `localhost:7891/latest`. The browser (`app.js`) polls that endpoint and auto-fills the log form. The user just hits Enter to confirm.

2. The end screen IS being detected (brightness check passes). Column headers (GOALS, ASSISTS, SAVES, SHOTS) ARE being found. But `SaxyPaxy` is NOT being found — the log says "username not found on scoreboard." Opponent MMR was found correctly, which confirms OCR is working.

3. The suspected cause is that the in-game name shows as `[***]SaxyPaxy` with a club tag, and there is also a small title/badge beneath the name. OCR might be misreading or merging these.

4. **The debug code is already in place.** When the username fails to match, `capture.py` now logs every word OCR read from the screen. The user just needs to:
   - Open Rocket League
   - Double-click `capture/start.bat` to start the daemon
   - Make sure `index.html` is open in the browser with Epic Username set to `SaxyPaxy` (no space) in the Setup tab
   - Play one game
   - When the end screen shows and "username not found" appears in the terminal, scroll up and copy the line that starts with `All OCR words: [...]`
   - Paste it here so you can see exactly what the OCR is reading and fix the matching

5. Once you have the OCR word list, update `find_username_row` in `capture.py` to match whatever text is actually on screen.

6. Python is at `C:\Users\paxto\AppData\Local\Programs\Python\Python312\python.exe` (not on system PATH yet). Git is installed. Remote is `Paxton-Lantz/Rocket-League-Tracker` on GitHub.

### Still investigating
- Username `SaxyPaxy` is still not being found on the scoreboard — OCR word dump not yet captured
- Suspected cause: in-game club tag or title badge beneath the name is confusing the row detection
- Next step: restart daemon, play a game, and paste the full OCR word list from the terminal

---

## To-Do

- [ ] MMR range filter for stats dashboard
- [ ] Export data to CSV
- [ ] Playlist selector (1v1, 2v2, 3v3) per game log entry
