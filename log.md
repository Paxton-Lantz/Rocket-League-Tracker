# RL Tracker — Daily Log

## 2026-06-01

### What we built today

**Phase 1 — Core**
- Log form with full keyboard navigation (Tab through every field, no mouse needed)
- W/L selector with W/L keypresses, MVP with Y/N/Space, Enter to submit
- localStorage persistence under key `rl_games`
- Summary bar: Total Games, Win Rate, MVP Rate, Streak
- Rank history line chart (Chart.js)
- Game log table with delete (confirmation required)

**Phase 2 — Stats & Sessions**
- Stats dashboard: Avg Goals, Saves, Assists, Shots per game
- Session auto-grouping (games within 2 hours = same session)
- Session log: W/L record, avg stats, Win/Loss Session badge per session
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
- End Session button: saves final MMR to long-term chart
- Two charts: in-session MMR (game by game) + long-term MMR (one point per session)
- Session log updated: shows Net MMR and End MMR per session
- Old game data (with rank) handled gracefully — shows — in MMR column

---

## To-Do

- [ ] Visual redesign — attach a screenshot and match the aesthetic (Phase 4)
- [ ] Add rank icons once image files are sourced (22 PNG files needed)
- [ ] MMR range filter for stats dashboard (replace the removed rank filter)
- [ ] Export data to CSV
- [ ] Playlist selector (1v1, 2v2, 3v3) per game log entry
