// ============================================================
// RL TRACKER — app.js
//
// Read top to bottom:
// config → constants → state → storage → session management
// → streak → tilt → coaching → charts → game log
// → stats → session log → form → init
// ============================================================


// ============================================================
// ★ API CONFIGURATION — PASTE YOUR KEY HERE ★
//
// 1. Go to https://console.anthropic.com
// 2. Generate an API key (starts with sk-ant-api03-...)
// 3. Replace "paste-your-key-here" with it
//
// Without a key, coaching alerts still work using built-in tips.
// ============================================================
const CLAUDE_API_KEY = "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";


// ============================================================
// RANK DATA
// MMR thresholds and icon paths for each rank.
// Thresholds are approximate standard 3v3 competitive values.
// Add more entries to RANK_ICONS as new art is sourced.
// ============================================================

const RANK_THRESHOLDS = [
  { name: "Bronze I",          mmr: 0    },
  { name: "Bronze II",         mmr: 175  },
  { name: "Bronze III",        mmr: 295  },
  { name: "Silver I",          mmr: 395  },
  { name: "Silver II",         mmr: 455  },
  { name: "Silver III",        mmr: 515  },
  { name: "Gold I",            mmr: 575  },
  { name: "Gold II",           mmr: 635  },
  { name: "Gold III",          mmr: 695  },
  { name: "Platinum I",        mmr: 755  },
  { name: "Platinum II",       mmr: 815  },
  { name: "Platinum III",      mmr: 875  },
  { name: "Diamond I",         mmr: 935  },
  { name: "Diamond II",        mmr: 995  },
  { name: "Diamond III",       mmr: 1055 },
  { name: "Champion I",        mmr: 1115 },
  { name: "Champion II",       mmr: 1195 },
  { name: "Champion III",      mmr: 1275 },
  { name: "Grand Champion I",  mmr: 1355 },
  { name: "Grand Champion II", mmr: 1435 },
  { name: "Grand Champion III",mmr: 1515 },
  { name: "Supersonic Legend", mmr: 1595 }
];

// Map rank name → icon file path.
const RANK_ICONS = {
  "Bronze I":            "ranks/Bronze_I.png",
  "Bronze II":           "ranks/Bronze_II.png",
  "Bronze III":          "ranks/Bronze_III.png",
  "Silver I":            "ranks/Silver_I.png",
  "Silver II":           "ranks/Silver_II.png",
  "Silver III":          "ranks/Silver_III.png",
  "Gold I":              "ranks/Gold_I.png",
  "Gold II":             "ranks/Gold_II.png",
  "Gold III":            "ranks/Gold_III.png",
  "Platinum I":          "ranks/Platinum_I.png",
  "Platinum II":         "ranks/Platinum_II.png",
  "Platinum III":        "ranks/Platinum_III.png",
  "Diamond I":           "ranks/Diamond_I.png",
  "Diamond II":          "ranks/Diamond_II.png",
  "Diamond III":         "ranks/Diamond_III.png",
  "Champion I":          "ranks/Champion_I.png",
  "Champion II":         "ranks/Champion_II.png",
  "Champion III":        "ranks/Champion_III.png",
  "Grand Champion I":    "ranks/Grand_Champion_I.png",
  "Grand Champion II":   "ranks/Grand_Champion_II.png",
  "Grand Champion III":  "ranks/Grand_Champion_III.png",
  "Supersonic Legend":   "ranks/Supersonic_Legend.png"
};

// ---- Rank tier color system ----
// Each tier has a primary color and a glow color used in the rank hero section.
var RANK_TIER_DATA = {
  "Bronze":           { primary: "#cd7f32", glow: "rgba(205,127,50,0.40)"  },
  "Silver":           { primary: "#b0bcc8", glow: "rgba(176,188,200,0.40)" },
  "Gold":             { primary: "#ffd700", glow: "rgba(255,215,0,0.45)"   },
  "Platinum":         { primary: "#38bdf8", glow: "rgba(56,189,248,0.42)"  },
  "Diamond":          { primary: "#3b82f6", glow: "rgba(59,130,246,0.42)"  },
  "Champion":         { primary: "#a855f7", glow: "rgba(168,85,247,0.42)"  },
  "Grand Champion":   { primary: "#ef4444", glow: "rgba(239,68,68,0.42)"   },
  "Supersonic Legend":{ primary: "#ec4899", glow: "rgba(236,72,153,0.42)"  }
};

// Extracts the tier name from a full rank name.
// "Gold II" → "Gold",  "Grand Champion I" → "Grand Champion"
function getRankTier(rankName) {
  if (!rankName || rankName === "—") return null;
  if (rankName === "Supersonic Legend")         return "Supersonic Legend";
  if (rankName.startsWith("Grand Champion"))    return "Grand Champion";
  return rankName.split(" ").slice(0, -1).join(" ");
}

// Returns progress within the current rank division.
function getRankProgress(mmr) {
  if (isNaN(mmr)) return null;
  var idx  = getRankIndex(mmr);
  var next = RANK_THRESHOLDS[idx + 1];
  if (!next) return { pct: 100, mmrToNext: 0, nextName: null };
  var range = next.mmr - RANK_THRESHOLDS[idx].mmr;
  var done  = mmr - RANK_THRESHOLDS[idx].mmr;
  return {
    pct:       Math.min(100, Math.round((done / range) * 100)),
    mmrToNext: next.mmr - mmr,
    nextName:  next.name
  };
}

// Drives the big rank hero section at the top of the page.
function updateRankHero() {
  var hero      = document.getElementById("rank-hero");
  var iconEl    = document.getElementById("rank-hero-icon");
  var nameEl    = document.getElementById("rank-hero-name");
  var mmrEl     = document.getElementById("rank-hero-mmr-display");
  var fillEl    = document.getElementById("rank-hero-bar-fill");
  var progWrap  = document.getElementById("rank-hero-progress-wrap");
  var progLabel = document.getElementById("rank-hero-progress-label");

  // Pick the best available MMR
  var mmr = null;
  if (activeSession)       mmr = getCurrentMmr();
  else if (sessions.length > 0) mmr = sessions[sessions.length - 1].endMmr;

  if (mmr === null) {
    nameEl.textContent         = "—";
    mmrEl.textContent          = "Start a session to track your rank";
    iconEl.style.display       = "none";
    progWrap.style.display     = "none";
    hero.setAttribute("data-tier", "");
    hero.style.removeProperty("--rk-color");
    hero.style.removeProperty("--rk-glow");
    return;
  }

  var rankName = getRankFromMMR(mmr);
  var tier     = getRankTier(rankName);
  var tierData = RANK_TIER_DATA[tier] || { primary: "var(--accent)", glow: "var(--accent-glow)" };

  // Apply rank colors as CSS custom properties on the section
  hero.style.setProperty("--rk-color", tierData.primary);
  hero.style.setProperty("--rk-glow",  tierData.glow);
  hero.setAttribute("data-tier", (tier || "").toUpperCase());

  nameEl.textContent = rankName;
  mmrEl.textContent  = mmr + " MMR";

  // Icon
  if (RANK_ICONS[rankName]) {
    iconEl.src           = RANK_ICONS[rankName];
    iconEl.style.display = "block";
  } else {
    iconEl.style.display = "none";
  }

  // Progress bar — needs a rAF so the width transition fires on first render
  var prog = getRankProgress(mmr);
  if (prog && prog.nextName) {
    progWrap.style.display = "flex";
    requestAnimationFrame(function() {
      fillEl.style.width = prog.pct + "%";
    });
    progLabel.textContent = prog.mmrToNext + " MMR to " + prog.nextName;
  } else {
    progWrap.style.display = "none";
    progLabel.textContent  = "Max rank reached";
  }
}

// Returns the index in RANK_THRESHOLDS for a given MMR (used to detect rank-ups).
function getRankIndex(mmr) {
  var idx = 0;
  for (var i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (mmr >= RANK_THRESHOLDS[i].mmr) { idx = i; } else { break; }
  }
  return idx;
}

// Returns the rank name for a given MMR value.
function getRankFromMMR(mmr) {
  var rank = RANK_THRESHOLDS[0].name;
  for (var i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (mmr >= RANK_THRESHOLDS[i].mmr) {
      rank = RANK_THRESHOLDS[i].name;
    } else {
      break;
    }
  }
  return rank;
}

// Builds the rank icon strip and highlights the active rank.
// Runs once on init, then the active class is updated on MMR change.
function buildRankStrip() {
  var strip = document.getElementById("rank-strip");
  if (!strip) return;
  strip.textContent = "";

  Object.entries(RANK_ICONS).forEach(function(entry) {
    var rankName = entry[0];
    var iconPath = entry[1];

    var item = document.createElement("div");
    item.className    = "rank-strip-item";
    item.dataset.rank = rankName;

    var img = document.createElement("img");
    img.src = iconPath;
    img.alt = rankName;

    var label = document.createElement("span");
    label.textContent = rankName;

    item.appendChild(img);
    item.appendChild(label);
    strip.appendChild(item);
  });
}

function highlightStripRank(rankName) {
  document.querySelectorAll(".rank-strip-item").forEach(function(item) {
    item.classList.toggle("active", item.dataset.rank === rankName);
  });
}

// Updates a rank icon+name pair given element IDs and an MMR value.
function updateRankDisplay(mmr) {
  setRankElements("rank-icon", "rank-name", mmr);
}

function updateStartRankDisplay(mmr) {
  setRankElements("start-rank-icon", "start-rank-name", mmr);
}

function setRankElements(iconId, nameId, mmr) {
  var iconEl = document.getElementById(iconId);
  var nameEl = document.getElementById(nameId);
  if (!iconEl || !nameEl) return;

  if (mmr === null || mmr === undefined || isNaN(mmr)) {
    iconEl.style.display = "none";
    nameEl.textContent   = "";
    return;
  }

  var rankName = getRankFromMMR(mmr);
  nameEl.textContent = rankName;

  if (RANK_ICONS[rankName]) {
    iconEl.src           = RANK_ICONS[rankName];
    iconEl.alt           = rankName;
    iconEl.style.display = "inline-block";
  } else {
    iconEl.style.display = "none";
  }
}


// ============================================================
// CONSTANTS
// ============================================================

// localStorage keys — never change these or you'll lose your data
const STORAGE_KEY        = "rl_games";     // individual game records
const SESSIONS_KEY       = "rl_sessions";  // completed session records
const ACTIVE_SESSION_KEY = "rl_active_session"; // the current in-progress session

// How many games must pass between coaching alerts (prevents spam)
const MIN_GAMES_BETWEEN_ALERTS = 5;


// ============================================================
// CONCEPT LIBRARY DATA
// Eight RL concepts. The `id` is used by coaching alerts to
// deep-link to the right card in the library section.
// ============================================================
const CONCEPTS = [
  {
    id: "rotations",
    title: "Rotations",
    summary: "Staying in sync with your teammates so someone is always in position.",
    content: `In 3v3 Rocket League, three players can't all chase the ball at once. Rotations are the system that prevents this. The idea is simple: one player attacks, one supports, one plays defense — and you cycle through these roles as the ball moves.

At Gold, the most common mistake is ball chasing: everyone chases the ball, nobody is back to defend, and a single miss turns into a free goal. Good rotation means when you commit to a play and miss, you rotate back to the defensive position instead of chasing again.

The basic loop: Attack → miss or clear → drop back behind your teammates → let the next player take the ball. It feels unnatural at first because it means letting your teammate take shots you could reach. But a team that rotates beats a team of three solo players almost every time.`
  },
  {
    id: "boost_management",
    title: "Boost Management",
    summary: "Collecting boost efficiently so you're never caught at zero.",
    content: `Boost is your fuel for speed, power, and aerials. Running out at the wrong moment is one of the most common reasons for missed clears and failed saves.

Small boost pads (12 boost each) are scattered around the field and respawn every 4 seconds. Large pads (100 boost) are in the corners and respawn in 10 seconds. The key habit: always grab small pads as you drive past them, even if you're at 80 boost. Keep yourself topped up constantly.

The critical rule: never go for a play at 0 boost. If you're empty, your job is to grab boost first — even if it means passing up a shot. A weak hit with no boost usually causes a turnover anyway. Let your teammate take the ball while you collect.`
  },
  {
    id: "positioning",
    title: "Positioning",
    summary: "Where to be when you don't have the ball.",
    content: `Most Rocket League improvement doesn't come from flashier plays — it comes from being in the right place to make simple plays. Positioning is knowing where to stand when you're not the one hitting the ball.

When your teammate has the ball, your job is to be ready for the next moment: shadow their attack from a supporting angle, hold mid-field, or be back at net in case it turns over. Don't follow them to the ball — hold your lane.

At Gold, the biggest mistake is being too far forward or too flat with your teammates. Try to always be at a different depth: if they're attacking, be at mid. If they're at mid, be back. This staggers your positions so a single turnover doesn't expose all three of you.`
  },
  {
    id: "shadowing",
    title: "Shadowing & Defending",
    summary: "How to pressure the opponent without overcommitting.",
    content: `Shadowing means retreating toward your own goal while facing the ball carrier — staying between them and the net without fully committing to a challenge. It's the difference between a good defensive play and getting faked out.

The key to shadowing: don't jump at the ball unless you're sure you'll win it. Drift backwards, matching the opponent's speed, cutting off their angles. Wait for them to commit to a move, then challenge.

At Gold, defenders either sit still (easy to drive around) or jump too early (easy to fake). The goal is controlled pressure: close enough that they feel rushed, far enough that they can't easily get past you. When you finally challenge, go hard.`
  },
  {
    id: "kickoffs",
    title: "Kickoff Strategies",
    summary: "What to do in the first two seconds of every play.",
    content: `Every goal starts with a kickoff. Understanding who goes and why is a small investment with a big payoff.

In 3v3, the player closest to the ball takes the kickoff. The second player positions at mid-field (to follow up a win or challenge a loss). The third player stays back as a safety net.

The most reliable kickoff: drive straight at the ball at full speed and hit toward the side to pop it at your opponent's net. Don't try to control it — just get solid, fast contact. A simple, fast, aggressive kickoff beats a slow fancy one every time at Gold.

What not to do: go for a diagonal kickoff before you've practiced it repeatedly in free play.`
  },
  {
    id: "demos",
    title: "Demos (Demolitions)",
    summary: "When running opponents over helps — and when it backfires.",
    content: `A demo (demolition) happens when you hit an opponent at supersonic speed — they explode and respawn a few seconds later, removing them from the field temporarily.

Demos are useful when: you're driving past an opponent who would contest your clear, there's a loose ball and they're the only one who can challenge, or you're chasing someone about to score.

Demos are not useful when: you're the last defender (going for a demo exposes your net), your team needs you in position, or you try and miss (now you're out of position and they still have the ball).

At Gold, the best demo opportunity is driving through a 50/50 at supersonic speed — you get the demo incidentally while making a legitimate play.`
  },
  {
    id: "aerials",
    title: "Aerial Basics",
    summary: "When going for aerials helps you, and when it hurts your team.",
    content: `Aerials are exciting, but at Gold they're often the cause of big mistakes. Here's how to think about them honestly.

Go for an aerial when: the ball is clearly going over everyone's head, you have full boost, you're the nearest player, and missing won't leave your net exposed. If all four are true, go for it.

Don't go for an aerial when: you're low on boost, a teammate is better positioned, the ball is only slightly in the air (a jump shot works), or missing means the opponent gets a free counter.

The honest truth: most players spend too much practice time on aerials and not enough on car control and reads. An aerial you didn't need to take that you miss is worse than not going at all. First, master the jump shot — it's what you need 90% of the time.`
  },
  {
    id: "game_sense",
    title: "Mechanical Skill vs. Game Sense",
    summary: "Why understanding the game matters more than mechanics at your rank.",
    content: `Mechanical skill is how well you can execute: air dribbles, flicks, musty flicks. Game sense is knowing what to do and when: when to challenge, when to hold, who takes the ball, where to be.

At Gold, players generally lose not because they can't perform mechanics — but because they make wrong decisions. Going for a 50/50 they can't win, chasing when they should rotate, shooting when they should pass.

Here's the counterintuitive truth: improving your game sense will raise your rank faster than improving your mechanics at Gold. You don't need to air dribble to beat Gold opponents. You need to rotate correctly, not ball chase, and not overcommit.

The practical way to build game sense: watch your own replays. Don't watch to see your cool plays — watch to find where you were when the goal went in against you, and ask: "Where should I have been?" Decisions come first. Mechanics come second.`
  }
];

// Fallback coaching tips used when no API key is set or the API call fails.
const FALLBACK_TIPS = {
  mvp_no_wins: "You're making strong individual plays but the team wins aren't following. This usually points to a rotation issue — when you win a 50/50, make sure to follow through to the next position rather than waiting to see what happens.",
  saves_declining: "Your defensive numbers have dipped recently. This often happens when you start playing more aggressively and leave yourself too far forward on turnovers. Try consciously checking your depth relative to your teammates.",
  session_fatigue: "Your results tend to drop off in longer sessions. Decision fatigue is real in Rocket League — your mechanics stay sharp but your reads get slower. A 10-minute break every hour often gets you better total results than grinding through."
};


// ============================================================
// STATE
// Variables that live in memory while the page is open.
// ============================================================

let games         = [];   // all individual game records
let sessions      = [];   // completed session records (each ends with a final MMR)
let activeSession = null; // the current in-progress session, or null if none

let inSessionChart = null; // Chart.js object for the in-session MMR chart
let longTermChart  = null; // Chart.js object for the long-term MMR chart

// Tilt warning state
let tiltDismissed = false;

// Coaching alert state
let coachingAlertActive       = false;
let gamesLoggedSinceLastAlert = 0;


// ============================================================
// STORAGE — games
// ============================================================

function loadGames() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveGames() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}


// ============================================================
// STORAGE — completed sessions
// ============================================================

function loadSessions() {
  const raw = localStorage.getItem(SESSIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveSessions() {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}


// ============================================================
// STORAGE — active session
// The active session is persisted so that refreshing the page
// mid-session doesn't lose your in-session chart data.
// ============================================================

function loadActiveSession() {
  const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function saveActiveSession() {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(activeSession));
}

function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}


// ============================================================
// SESSION MANAGEMENT
// ============================================================

// Calculates the running MMR for the current session.
// Starting MMR + sum of all mmrChanges logged so far this session.
function getCurrentMmr() {
  if (!activeSession) return null;

  const sessionGames = games.filter(function(g) {
    return g.sessionId === activeSession.sessionId;
  });

  const netChange = sessionGames.reduce(function(sum, g) {
    return sum + g.mmrChange;
  }, 0);

  return activeSession.startMmr + netChange;
}

// Returns the net MMR change for the current session (positive or negative integer).
function getCurrentSessionNet() {
  if (!activeSession) return 0;

  const sessionGames = games.filter(function(g) {
    return g.sessionId === activeSession.sessionId;
  });

  return sessionGames.reduce(function(sum, g) { return sum + g.mmrChange; }, 0);
}

// Updates the "Current MMR" and "Session Net" values in the form header.
function updateSessionHeader() {
  const mmrEl = document.getElementById("current-mmr-value");
  const netEl = document.getElementById("session-net-value");

  if (!activeSession) {
    mmrEl.textContent = "—";
    netEl.textContent = "—";
    netEl.classList.remove("net-positive", "net-negative");
    updateRankDisplay(null);
    return;
  }

  const currentMmr = getCurrentMmr();
  const net        = getCurrentSessionNet();

  mmrEl.textContent = currentMmr;

  // Format the net change with a + or - sign
  netEl.textContent = (net >= 0 ? "+" : "") + net;
  netEl.classList.remove("net-positive", "net-negative");
  if (net > 0) netEl.classList.add("net-positive");
  if (net < 0) netEl.classList.add("net-negative");

  updateRankDisplay(currentMmr);
  updateRankHero();
}

// Called when the user clicks "Start Session".
// Creates a new session record and switches the UI to the log form.
function startSession() {
  const input    = document.getElementById("start-mmr-input");
  const startMmr = parseInt(input.value);

  if (isNaN(startMmr) || startMmr < 0) {
    alert("Please enter a valid MMR (a number like 845).");
    input.focus();
    return;
  }

  activeSession = {
    sessionId: Date.now(),
    startMmr:  startMmr,
    startDate: new Date().toISOString().split("T")[0]
  };

  saveActiveSession();
  showActiveSessionUI();
  updateSessionHeader();
  updateInSessionChart();
}

// Called when the user clicks "End Session".
// Saves the final MMR to the sessions list, then resets to the start screen.
function endSession() {
  if (!activeSession) return;

  const sessionGames = games.filter(function(g) {
    return g.sessionId === activeSession.sessionId;
  });

  const wins   = sessionGames.filter(function(g) { return g.result === "W"; }).length;
  const losses = sessionGames.filter(function(g) { return g.result === "L"; }).length;
  const net    = getCurrentSessionNet();
  const endMmr = activeSession.startMmr + net;

  // Build and save the session record
  const record = {
    id:        Date.now(),
    sessionId: activeSession.sessionId,
    date:      activeSession.startDate,
    startMmr:  activeSession.startMmr,
    endMmr:    endMmr,
    netChange: net,
    gameCount: sessionGames.length,
    wins:      wins,
    losses:    losses
  };

  sessions.push(record);
  saveSessions();

  clearActiveSession();
  activeSession = null;

  // Pre-fill the start MMR input with the session's ending MMR for next time
  document.getElementById("start-mmr-input").value = endMmr;

  updateLongTermChart();
  updateSessionLog();
  updateRankHero();
  showStartSessionUI();
}

// Shows the "Start Session" card and hides the log form.
function showStartSessionUI() {
  document.getElementById("start-session-card").style.display = "block";
  document.getElementById("log-section").style.display        = "none";
}

// Hides the "Start Session" card and shows the log form.
function showActiveSessionUI() {
  document.getElementById("start-session-card").style.display = "none";
  document.getElementById("log-section").style.display        = "block";
  // Focus the MMR change field so the user can start typing immediately
  document.getElementById("mmr-change-input").focus();
}


// ============================================================
// SESSION GROUPING (used for stats and session log)
// Groups a games array into sessions by sessionId.
// Returns [ { sessionId, games: [...] }, ... ] oldest-first.
// ============================================================

function groupBySessions(gamesArray) {
  const sessionMap = {};
  const result     = [];

  gamesArray.forEach(function(game) {
    if (!sessionMap[game.sessionId]) {
      sessionMap[game.sessionId] = { sessionId: game.sessionId, games: [] };
      result.push(sessionMap[game.sessionId]);
    }
    sessionMap[game.sessionId].games.push(game);
  });

  return result;
}


// ============================================================
// STREAK
// ============================================================

// Returns { type: "W"/"L", count: N } or null if no games.
function getCurrentStreakInfo() {
  if (games.length === 0) return null;

  const lastResult = games[games.length - 1].result;
  let count = 0;

  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].result === lastResult) { count++; } else { break; }
  }

  return { type: lastResult, count: count };
}

function updateStreak() {
  const el   = document.getElementById("streak-display");
  const info = getCurrentStreakInfo();

  el.classList.remove("streak-win", "streak-loss");

  if (!info) { el.textContent = "—"; return; }

  el.textContent = info.type + " " + info.count;
  el.classList.add(info.type === "W" ? "streak-win" : "streak-loss");
}


// ============================================================
// TILT WARNING
// ============================================================

function checkTiltCondition() {
  if (!activeSession || games.length === 0) return false;

  const sessionGames = games.filter(function(g) {
    return g.sessionId === activeSession.sessionId;
  });

  let consecutiveLosses = 0;
  for (let i = sessionGames.length - 1; i >= 0; i--) {
    if (sessionGames[i].result === "L") { consecutiveLosses++; } else { break; }
  }

  return consecutiveLosses >= 3;
}

function updateTiltWarning() {
  const warning = document.getElementById("tilt-warning");

  if (!checkTiltCondition() || tiltDismissed) {
    warning.style.display = "none";
    return;
  }

  warning.style.display = "flex";
}


// ============================================================
// PATTERN DETECTION (for coaching alerts)
// Checks for three patterns after each game is logged.
// Returns a pattern object if found, otherwise null.
// ============================================================

function detectPattern() {
  if (games.length < 6) return null;

  // Pattern 1: MVP high, win rate low → rotation issue
  if (games.length >= 10) {
    const recent  = games.slice(-10);
    const mvpRate = recent.filter(function(g) { return g.mvp; }).length / recent.length;
    const winRate = recent.filter(function(g) { return g.result === "W"; }).length / recent.length;

    if (mvpRate >= 0.5 && winRate < 0.4) {
      return {
        id: "mvp_no_wins",
        description: "MVP rate " + Math.round(mvpRate * 100) + "% but only " + Math.round(winRate * 100) + "% win rate over the last 10 games",
        conceptId: "rotations",
        stats: { mvpRate: Math.round(mvpRate * 100), winRate: Math.round(winRate * 100) }
      };
    }
  }

  // Pattern 2: Saves declining → positioning issue
  if (games.length >= 10) {
    const older  = games.slice(-10, -5);
    const recent = games.slice(-5);
    const avgOld = older.reduce(function(s, g)  { return s + g.saves; }, 0) / older.length;
    const avgNew = recent.reduce(function(s, g) { return s + g.saves; }, 0) / recent.length;

    if (avgOld - avgNew >= 0.5) {
      return {
        id: "saves_declining",
        description: "Average saves dropped from " + avgOld.toFixed(1) + " to " + avgNew.toFixed(1) + " per game over the last 10 games",
        conceptId: "positioning",
        stats: { previousAvg: avgOld.toFixed(1), recentAvg: avgNew.toFixed(1) }
      };
    }
  }

  // Pattern 3: Session fatigue → game sense issue
  if (activeSession) {
    const sessionGames = games.filter(function(g) {
      return g.sessionId === activeSession.sessionId;
    });

    if (sessionGames.length >= 6) {
      const mid      = Math.floor(sessionGames.length / 2);
      const early    = sessionGames.slice(0, mid);
      const late     = sessionGames.slice(mid);
      const earlyWR  = early.filter(function(g) { return g.result === "W"; }).length / early.length;
      const lateWR   = late.filter(function(g)  { return g.result === "W"; }).length / late.length;

      if (earlyWR - lateWR >= 0.4) {
        return {
          id: "session_fatigue",
          description: "Win rate fell from " + Math.round(earlyWR * 100) + "% to " + Math.round(lateWR * 100) + "% in the second half of this session",
          conceptId: "game_sense",
          stats: { earlyWinRate: Math.round(earlyWR * 100), lateWinRate: Math.round(lateWR * 100) }
        };
      }
    }
  }

  return null;
}


// ============================================================
// CLAUDE API
// ============================================================

function isApiKeySet() {
  return CLAUDE_API_KEY && CLAUDE_API_KEY !== "paste-your-key-here";
}

function buildCoachingPrompt(pattern) {
  const total   = games.length;
  const wins    = games.filter(function(g) { return g.result === "W"; }).length;
  const currentMmr = getCurrentMmr();

  function avg(key) {
    return (games.reduce(function(s, g) { return s + g[key]; }, 0) / total).toFixed(1);
  }

  const concept      = CONCEPTS.find(function(c) { return c.id === pattern.conceptId; });
  const conceptTitle = concept ? concept.title : "game fundamentals";

  return (
    "You are a Rocket League coach for a beginner-to-intermediate player. " +
    "Be encouraging, specific, and use plain language.\n\n" +
    "Player stats (" + total + " total games):\n" +
    "- Win rate: " + Math.round((wins / total) * 100) + "%\n" +
    (currentMmr ? "- Current MMR: " + currentMmr + "\n" : "") +
    "- Avg goals: " + avg("goals") + "/game\n" +
    "- Avg saves: " + avg("saves") + "/game\n" +
    "- Avg assists: " + avg("assists") + "/game\n" +
    "- Avg shots: " + avg("shots") + "/game\n\n" +
    "Pattern detected: " + pattern.description + "\n\n" +
    "Write a coaching tip (2–3 sentences) specifically about \"" + conceptTitle + "\" " +
    "that addresses this pattern directly. Be concrete and actionable. " +
    "Do not repeat the pattern description back."
  );
}

async function callClaudeAPI(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) throw new Error("API error " + response.status);

  const data = await response.json();
  return data.content[0].text.trim();
}


// ============================================================
// COACHING ALERT — display
// ============================================================

function showCoachingAlert(message, pattern, isLoading) {
  const alertEl     = document.getElementById("coaching-alert");
  const bodyEl      = document.getElementById("coaching-alert-body");
  const conceptLink = document.getElementById("coaching-concept-link");

  coachingAlertActive  = true;
  alertEl.style.display = "block";
  bodyEl.textContent    = message;

  if (isLoading) {
    conceptLink.style.display = "none";
  } else {
    const concept = CONCEPTS.find(function(c) { return c.id === pattern.conceptId; });
    if (concept) {
      conceptLink.textContent   = "Learn more about " + concept.title + " ↓";
      conceptLink.style.display = "inline";
      conceptLink.onclick = function(e) {
        e.preventDefault();
        openConcept(concept.id);
      };
    }
  }
}

function dismissCoachingAlert() {
  document.getElementById("coaching-alert").style.display = "none";
  coachingAlertActive = false;
}

async function runCoachingCheck() {
  if (coachingAlertActive) return;
  if (gamesLoggedSinceLastAlert < MIN_GAMES_BETWEEN_ALERTS) return;

  const pattern = detectPattern();
  if (!pattern) return;

  gamesLoggedSinceLastAlert = 0;

  if (!isApiKeySet()) {
    const fallback = FALLBACK_TIPS[pattern.id] || "Keep an eye on patterns in your game and take breaks between sessions.";
    showCoachingAlert(fallback, pattern, false);
    return;
  }

  showCoachingAlert("Getting your coaching tip…", pattern, true);

  try {
    const tip = await callClaudeAPI(buildCoachingPrompt(pattern));
    if (!coachingAlertActive) return;
    showCoachingAlert(tip, pattern, false);
  } catch (error) {
    console.error("Coaching API error:", error);
    if (!coachingAlertActive) return;
    const fallback = FALLBACK_TIPS[pattern.id] || "Keep an eye on patterns in your game and take breaks between sessions.";
    showCoachingAlert(fallback, pattern, false);
  }
}


// ============================================================
// CONCEPT LIBRARY
// ============================================================

function updateConceptLibrary() {
  const grid = document.getElementById("concept-grid");
  grid.textContent = "";

  CONCEPTS.forEach(function(concept) {
    const card = document.createElement("div");
    card.className = "concept-card";
    card.id = "concept-card-" + concept.id;

    const title = document.createElement("div");
    title.className = "concept-card-title";
    title.textContent = concept.title;

    const summary = document.createElement("div");
    summary.className = "concept-card-summary";
    summary.textContent = concept.summary;

    const toggle = document.createElement("button");
    toggle.className = "concept-toggle";
    toggle.textContent = "Read more ▼";

    const fullContent = document.createElement("div");
    fullContent.className = "concept-full-content";
    fullContent.textContent = concept.content;

    card.addEventListener("click", function() {
      const isExpanded = card.classList.contains("expanded");
      card.classList.toggle("expanded");
      toggle.textContent = isExpanded ? "Read more ▼" : "Show less ▲";
    });

    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(toggle);
    card.appendChild(fullContent);
    grid.appendChild(card);
  });
}

function openConcept(conceptId) {
  const card = document.getElementById("concept-card-" + conceptId);
  if (!card) return;

  if (!card.classList.contains("expanded")) {
    card.classList.add("expanded");
    const toggle = card.querySelector(".concept-toggle");
    if (toggle) toggle.textContent = "Show less ▲";
  }

  card.classList.add("highlighted");
  setTimeout(function() { card.classList.remove("highlighted"); }, 2000);
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}


// ============================================================
// PERFORMANCE OVERVIEW SECTION
// Win-rate donut, last-10-games form strip, spotlight stats.
// ============================================================

function updatePerformanceSection() {
  var total = games.length;

  // ---- Win-rate donut ----
  var arc    = document.getElementById("winrate-arc");
  var pctEl  = document.getElementById("winrate-pct");
  var CIRC   = 238.76; // 2 * pi * 38

  if (total === 0) {
    arc.setAttribute("stroke-dasharray", "0 " + CIRC);
    pctEl.textContent = "—";
  } else {
    var wins    = games.filter(function(g) { return g.result === "W"; }).length;
    var winRate = Math.round((wins / total) * 100);
    var filled  = (winRate / 100) * CIRC;
    arc.setAttribute("stroke-dasharray", filled.toFixed(2) + " " + CIRC);
    pctEl.textContent = winRate + "%";
    // Colour the arc based on win rate
    var color = winRate >= 55 ? "#16a34a" : winRate >= 45 ? "#2563eb" : "#dc2626";
    arc.setAttribute("stroke", color);
  }

  // ---- Last 10 games form strip ----
  var dotsEl    = document.getElementById("form-dots");
  var summaryEl = document.getElementById("form-summary");
  dotsEl.textContent = "";

  var last10 = games.slice(-10);

  // Pad with empty placeholders if fewer than 10 games
  var placeholders = 10 - last10.length;
  for (var i = 0; i < placeholders; i++) {
    var empty = document.createElement("div");
    empty.className   = "form-dot form-dot-empty";
    empty.textContent = "·";
    dotsEl.appendChild(empty);
  }

  last10.forEach(function(g) {
    var dot = document.createElement("div");
    dot.className   = g.result === "W" ? "form-dot form-dot-win" : "form-dot form-dot-loss";
    dot.textContent = g.result;
    dotsEl.appendChild(dot);
  });

  if (last10.length > 0) {
    var recentWins = last10.filter(function(g) { return g.result === "W"; }).length;
    summaryEl.textContent = recentWins + "W – " + (last10.length - recentWins) + "L in last " + last10.length;
  } else {
    summaryEl.textContent = "No games yet";
  }

  // ---- Spotlight stats ----
  var peakEl    = document.getElementById("stat-peak-mmr");
  var bestEl    = document.getElementById("stat-best-session");
  var streakEl  = document.getElementById("stat-record-streak");

  // Peak MMR: highest endMmr across all completed sessions
  if (sessions.length > 0) {
    var peak = sessions.reduce(function(max, s) { return Math.max(max, s.endMmr); }, -Infinity);
    peakEl.textContent = peak;
  } else {
    peakEl.textContent = "—";
  }

  // Best session: highest positive netChange
  if (sessions.length > 0) {
    var best = sessions.reduce(function(max, s) { return Math.max(max, s.netChange); }, -Infinity);
    bestEl.textContent = best >= 0 ? "+" + best : best;
  } else {
    bestEl.textContent = "—";
  }

  // Record win streak: longest consecutive W streak in all-time games
  var recordStreak = 0, runStreak = 0;
  games.forEach(function(g) {
    if (g.result === "W") { runStreak++; recordStreak = Math.max(recordStreak, runStreak); }
    else { runStreak = 0; }
  });
  streakEl.textContent = recordStreak > 0 ? "W " + recordStreak : "—";
}


// ============================================================
// SUMMARY BAR
// ============================================================

function updateSummaryBar() {
  const total = games.length;

  document.getElementById("total-games").textContent = total;

  if (total === 0) {
    document.getElementById("win-rate").textContent = "—";
    document.getElementById("mvp-rate").textContent = "—";
    return;
  }

  const wins = games.filter(function(g) { return g.result === "W"; }).length;
  const mvps = games.filter(function(g) { return g.mvp === true; }).length;

  document.getElementById("win-rate").textContent = Math.round((wins / total) * 100) + "%";
  document.getElementById("mvp-rate").textContent = Math.round((mvps / total) * 100) + "%";
}


// ============================================================
// IN-SESSION MMR CHART
// Shows MMR movement game by game within the current session.
// X axis: Start, Game 1, Game 2, ...
// Y axis: actual MMR values
// ============================================================

// Calculates the data points for the in-session chart.
// Returns { labels: [...], data: [...] }
function getInSessionChartData() {
  if (!activeSession) return { labels: [], data: [] };

  const sessionGames = games.filter(function(g) {
    return g.sessionId === activeSession.sessionId;
  });

  const labels = ["Start"];
  const data   = [activeSession.startMmr];
  let running  = activeSession.startMmr;

  sessionGames.forEach(function(game, i) {
    running += game.mmrChange;
    labels.push("Game " + (i + 1));
    data.push(running);
  });

  return { labels: labels, data: data };
}

// Builds the in-session chart from scratch. Called once on startup.
function buildInSessionChart() {
  const canvas = document.getElementById("in-session-chart");
  const ctx    = canvas.getContext("2d");
  const { labels, data } = getInSessionChartData();

  inSessionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "MMR",
        data: data,
        fill: false,
        tension: 0.2,
        borderColor: "#4a90e2",
        backgroundColor: "#4a90e2",
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(item) { return " MMR: " + item.raw; }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Game", color: "#888", font: { size: 11 } },
          grid:  { color: "#f0f0f0" }
        },
        y: {
          title: { display: true, text: "MMR", color: "#888", font: { size: 11 } },
          grid:  { color: "#f0f0f0" }
        }
      }
    }
  });
}

// Updates the in-session chart with fresh data and toggles its visibility.
function updateInSessionChart() {
  const container  = document.getElementById("in-session-chart-container");
  const placeholder = document.getElementById("no-session-chart-msg");

  if (!activeSession) {
    container.style.display  = "none";
    placeholder.style.display = "block";
    return;
  }

  placeholder.style.display = "none";
  container.style.display   = "block";

  if (!inSessionChart) return;

  const { labels, data } = getInSessionChartData();
  inSessionChart.data.labels            = labels;
  inSessionChart.data.datasets[0].data  = data;
  inSessionChart.update();
}


// ============================================================
// LONG-TERM MMR CHART
// One point per completed session (the ending MMR).
// Only gets new points when the user clicks End Session.
// ============================================================

function buildLongTermChart() {
  const canvas = document.getElementById("long-term-chart");
  const ctx    = canvas.getContext("2d");

  const labels = sessions.map(function(_, i) { return "Session " + (i + 1); });
  const data   = sessions.map(function(s) { return s.endMmr; });

  longTermChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "MMR",
        data: data,
        fill: false,
        tension: 0.2,
        borderColor: "#4a90e2",
        backgroundColor: "#4a90e2",
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(item) { return " MMR: " + item.raw; }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Session", color: "#888", font: { size: 11 } },
          grid:  { color: "#f0f0f0" }
        },
        y: {
          title: { display: true, text: "MMR", color: "#888", font: { size: 11 } },
          grid:  { color: "#f0f0f0" }
        }
      }
    }
  });
}

// Updates the long-term chart and toggles its visibility.
function updateLongTermChart() {
  const container   = document.getElementById("long-term-chart-container");
  const placeholder = document.getElementById("no-long-term-chart-msg");

  if (sessions.length === 0) {
    container.style.display   = "none";
    placeholder.style.display = "block";
    return;
  }

  placeholder.style.display = "none";
  container.style.display   = "block";

  if (!longTermChart) return;

  longTermChart.data.labels           = sessions.map(function(_, i) { return "Session " + (i + 1); });
  longTermChart.data.datasets[0].data = sessions.map(function(s) { return s.endMmr; });
  longTermChart.update();
}


// ============================================================
// GAME LOG TABLE
// ============================================================

function updateGameLog() {
  const tbody      = document.getElementById("game-table-body");
  const noGamesMsg = document.getElementById("no-games-msg");
  const table      = document.getElementById("game-table");

  if (games.length === 0) {
    noGamesMsg.style.display = "block";
    table.style.display      = "none";
    return;
  }

  noGamesMsg.style.display = "none";
  table.style.display      = "table";
  tbody.textContent        = "";

  const newestFirst = [...games].reverse();

  newestFirst.forEach(function(game, reversedIndex) {
    const gameNumber = games.length - reversedIndex;
    const row        = document.createElement("tr");

    function makeCell(text, className) {
      const cell = document.createElement("td");
      cell.textContent = text;
      if (className) cell.className = className;
      return cell;
    }

    // Format MMR change as "+10" or "-9", or "—" for old games without mmrChange
    let mmrDisplay = "—";
    let mmrClass   = "";
    if (game.mmrChange !== undefined) {
      mmrDisplay = (game.mmrChange >= 0 ? "+" : "") + game.mmrChange;
      mmrClass   = game.mmrChange > 0 ? "result-win" : (game.mmrChange < 0 ? "result-loss" : "");
    }

    row.appendChild(makeCell(gameNumber));
    row.appendChild(makeCell(game.date));
    row.appendChild(makeCell(mmrDisplay, mmrClass));
    row.appendChild(makeCell(
      game.result || "—",
      game.result === "W" ? "result-win" : (game.result === "L" ? "result-loss" : "")
    ));
    row.appendChild(makeCell(game.goals));
    row.appendChild(makeCell(game.saves));
    row.appendChild(makeCell(game.assists));
    row.appendChild(makeCell(game.shots));
    row.appendChild(makeCell(game.mvp ? "Yes" : "No"));

    const deleteCell = document.createElement("td");
    const deleteBtn  = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className   = "delete-btn";
    deleteBtn.addEventListener("click", function() { handleDelete(game.id); });
    deleteCell.appendChild(deleteBtn);
    row.appendChild(deleteCell);

    tbody.appendChild(row);
  });
}

function handleDelete(gameId) {
  games = games.filter(function(g) { return g.id !== gameId; });

  saveGames();
  updateSummaryBar();
  updateStreak();
  updateTiltWarning();
  updateInSessionChart();
  updateSessionHeader();
  updateStatsDashboard();
  updatePerformanceSection();
  updateSessionLog();
  updateGameLog();
}


function handleDeleteSession(sessionId) {
  sessions = sessions.filter(function(s) { return s.sessionId !== sessionId; });
  saveSessions();
  updateLongTermChart();
  updateSessionLog();
  updatePerformanceSection();
  updateRankHero();
}


// ============================================================
// STATS DASHBOARD
// Average goals, saves, assists, shots across all games.
// No rank filter since we no longer track rank.
// ============================================================

function updateStatsDashboard() {
  const total = games.length;

  var statKeys = [
    { id: "avg-goals",   key: "goals",   label: "Avg Goals"   },
    { id: "avg-saves",   key: "saves",   label: "Avg Saves"   },
    { id: "avg-assists", key: "assists", label: "Avg Assists" },
    { id: "avg-shots",   key: "shots",   label: "Avg Shots"   }
  ];

  if (total === 0) {
    statKeys.forEach(function(s) {
      document.getElementById(s.id).textContent = "—";
      var trendEl = document.getElementById(s.id + "-trend");
      if (trendEl) trendEl.textContent = "";
    });
    return;
  }

  function avg(arr, key) {
    return arr.reduce(function(acc, g) { return acc + g[key]; }, 0) / arr.length;
  }

  // Compare all-time avg to last-5 avg and show a trend arrow
  var last5 = games.slice(-5);

  statKeys.forEach(function(s) {
    var allAvg  = avg(games, s.key);
    document.getElementById(s.id).textContent = allAvg.toFixed(2);

    // Build or find the trend element inside the same stat-card
    var valueEl = document.getElementById(s.id);
    var card    = valueEl.closest(".stat-card");
    if (!card) return;

    var trendEl = card.querySelector(".stat-trend");
    if (!trendEl) {
      trendEl = document.createElement("div");
      trendEl.className = "stat-trend";
      card.appendChild(trendEl);
    }

    if (last5.length < 2) { trendEl.textContent = ""; return; }

    var recentAvg = avg(last5, s.key);
    var delta     = recentAvg - allAvg;

    if (Math.abs(delta) < 0.05) {
      trendEl.className   = "stat-trend trend-flat";
      trendEl.textContent = "→ same as average";
    } else if (delta > 0) {
      trendEl.className   = "stat-trend trend-up";
      trendEl.innerHTML   = "↑ +" + delta.toFixed(2) + " recent";
    } else {
      trendEl.className   = "stat-trend trend-down";
      trendEl.innerHTML   = "↓ " + delta.toFixed(2) + " recent";
    }
  });
}


// ============================================================
// SESSION LOG
// Shows completed sessions (from the `sessions` array),
// with game stats pulled from the matching games in `games`.
// ============================================================

function updateSessionLog() {
  const noSessionsMsg = document.getElementById("no-sessions-msg");
  const sessionList   = document.getElementById("session-list");

  sessionList.textContent = "";

  if (sessions.length === 0) {
    noSessionsMsg.style.display = "block";
    return;
  }

  noSessionsMsg.style.display = "none";

  // Newest session first
  const newestFirst = [...sessions].reverse();

  newestFirst.forEach(function(record, displayIndex) {
    // Pull the matching individual games for stat averages
    const sg    = games.filter(function(g) { return g.sessionId === record.sessionId; });
    const total = sg.length;

    function sessionAvg(key) {
      if (total === 0) return "—";
      return (sg.reduce(function(acc, g) { return acc + g[key]; }, 0) / total).toFixed(1);
    }

    // Session outcome badge
    let outcomeClass = "even", outcomeLabel = "Even";
    if (record.wins > record.losses)  { outcomeClass = "win";  outcomeLabel = "Win Session";  }
    if (record.losses > record.wins)  { outcomeClass = "loss"; outcomeLabel = "Loss Session"; }

    const sessionNumber = sessions.length - displayIndex;

    const card = document.createElement("div");
    card.className = "session-card";

    // Header: title + outcome badge
    const header = document.createElement("div");
    header.className = "session-card-header";

    const title = document.createElement("span");
    title.className   = "session-title";
    title.textContent = "Session " + sessionNumber + " — " + record.date;

    const badge = document.createElement("span");
    badge.className   = "session-badge session-badge-" + outcomeClass;
    badge.textContent = outcomeLabel;

    const deleteSessionBtn = document.createElement("button");
    deleteSessionBtn.textContent = "Delete";
    deleteSessionBtn.className   = "delete-btn";
    deleteSessionBtn.addEventListener("click", function() { handleDeleteSession(record.sessionId); });

    header.appendChild(title);
    header.appendChild(badge);
    header.appendChild(deleteSessionBtn);

    // Stats row
    const statsRow = document.createElement("div");
    statsRow.className = "session-stats-row";

    function makeSessionStat(label, value) {
      const item = document.createElement("div");
      item.className = "session-stat-item";
      const lbl = document.createElement("span");
      lbl.className   = "session-stat-label";
      lbl.textContent = label;
      const val = document.createElement("span");
      val.className   = "session-stat-value";
      val.textContent = value;
      item.appendChild(lbl);
      item.appendChild(val);
      return item;
    }

    const netDisplay = (record.netChange >= 0 ? "+" : "") + record.netChange + " MMR";

    statsRow.appendChild(makeSessionStat("Record",      record.wins + "W – " + record.losses + "L"));
    statsRow.appendChild(makeSessionStat("Net MMR",     netDisplay));
    statsRow.appendChild(makeSessionStat("End MMR",     record.endMmr));
    statsRow.appendChild(makeSessionStat("Games",       record.gameCount));
    statsRow.appendChild(makeSessionStat("Avg Goals",   sessionAvg("goals")));
    statsRow.appendChild(makeSessionStat("Avg Saves",   sessionAvg("saves")));
    statsRow.appendChild(makeSessionStat("Avg Assists", sessionAvg("assists")));
    statsRow.appendChild(makeSessionStat("Avg Shots",   sessionAvg("shots")));

    card.appendChild(header);
    card.appendChild(statsRow);
    sessionList.appendChild(card);
  });
}


// ============================================================
// FORM SETUP
// ============================================================

// Wires up keyboard shortcuts on the MVP checkbox.
// The MMR change field is a plain text input — no special handling needed.
function setupFormKeyboard() {
  const mvpCheckbox = document.getElementById("mvp-checkbox");
  const form        = document.getElementById("log-form");

  mvpCheckbox.addEventListener("keydown", function(e) {
    if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      mvpCheckbox.checked = true;
    } else if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      mvpCheckbox.checked = false;
    } else if (e.key === "Enter") {
      e.preventDefault();
      form.requestSubmit();
    }
  });
}


// ============================================================
// FORM SUBMIT
// ============================================================

function handleFormSubmit(e) {
  e.preventDefault();

  if (!activeSession) {
    alert("Start a session first before logging a game.");
    return;
  }

  // Parse the MMR change — accept "+10", "-9", "10", "-9", etc.
  const rawInput = document.getElementById("mmr-change-input").value.trim();
  const mmrChange = parseInt(rawInput, 10);

  if (isNaN(mmrChange) || mmrChange === 0) {
    alert("Please enter a valid MMR change (e.g. +10 or -9). Zero is not valid.");
    document.getElementById("mmr-change-input").focus();
    return;
  }

  // Snapshot rank BEFORE adding the game so we can detect a rank-up
  const preRankIdx = getRankIndex(getCurrentMmr());

  // Infer win/loss from the sign of the MMR change
  // Positive MMR change = Win, Negative = Loss
  const result = mmrChange > 0 ? "W" : "L";

  const newGame = {
    id:        Date.now(),
    date:      new Date().toISOString().split("T")[0],
    sessionId: activeSession.sessionId,
    mmrChange: mmrChange,
    result:    result,
    goals:     parseInt(document.getElementById("goals-input").value)   || 0,
    saves:     parseInt(document.getElementById("saves-input").value)   || 0,
    assists:   parseInt(document.getElementById("assists-input").value) || 0,
    shots:     parseInt(document.getElementById("shots-input").value)   || 0,
    mvp:       document.getElementById("mvp-checkbox").checked
  };

  games.push(newGame);
  saveGames();

  tiltDismissed = false;
  gamesLoggedSinceLastAlert++;

  updateSummaryBar();
  updateStreak();
  updateTiltWarning();
  updateSessionHeader();
  updateInSessionChart();
  updateStatsDashboard();
  updatePerformanceSection();
  updateSessionLog();
  updateGameLog();

  flashSuccess();
  resetForm();

  // Check for rank-up and fire the explosion if so
  var postRankIdx = getRankIndex(getCurrentMmr());
  if (postRankIdx > preRankIdx) {
    setTimeout(function() {
      triggerRankUpAnimation(RANK_THRESHOLDS[postRankIdx].name);
    }, 350);
  }

  runCoachingCheck();
}

function flashSuccess() {
  const logSection = document.getElementById("log-section");
  logSection.classList.add("success");
  setTimeout(function() { logSection.classList.remove("success"); }, 500);
}

// Resets the form for the next game entry.
function resetForm() {
  document.getElementById("mmr-change-input").value  = "";
  document.getElementById("goals-input").value        = 0;
  document.getElementById("saves-input").value        = 0;
  document.getElementById("assists-input").value      = 0;
  document.getElementById("shots-input").value        = 0;
  document.getElementById("mvp-checkbox").checked    = false;

  // Return focus to MMR change so the next game can be entered immediately
  document.getElementById("mmr-change-input").focus();
}


// ============================================================
// INITIALIZATION
// Everything starts here when the page loads.
// ============================================================

function init() {
  // Load all persisted data
  games         = loadGames();
  sessions      = loadSessions();
  activeSession = loadActiveSession();

  // Apply saved theme (before charts build so colors are correct from the start)
  var savedTheme = localStorage.getItem("rl_theme") || "ghost";
  currentTheme = savedTheme;
  document.documentElement.setAttribute("data-theme", savedTheme);

  // Wire theme switcher buttons
  document.querySelectorAll(".theme-btn").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.theme === savedTheme);
    btn.addEventListener("click", function() { setTheme(btn.dataset.theme); });
  });

  // Wire up buttons
  document.getElementById("start-session-btn").addEventListener("click", startSession);

  // Build the rank icon strip
  buildRankStrip();

  // Live rank display + strip highlight on the start-session MMR input
  document.getElementById("start-mmr-input").addEventListener("input", function() {
    var val = parseInt(this.value);
    updateStartRankDisplay(isNaN(val) ? null : val);
    if (!isNaN(val)) highlightStripRank(getRankFromMMR(val));
  });
  document.getElementById("end-session-btn").addEventListener("click", endSession);
  document.getElementById("tilt-dismiss-btn").addEventListener("click", function() {
    tiltDismissed = true;
    document.getElementById("tilt-warning").style.display = "none";
  });
  document.getElementById("coaching-dismiss-btn").addEventListener("click", dismissCoachingAlert);
  document.getElementById("log-form").addEventListener("submit", handleFormSubmit);

  // Wire up keyboard shortcuts
  setupFormKeyboard();

  // Show the correct UI based on whether a session is already in progress
  if (activeSession) {
    showActiveSessionUI();
    document.getElementById("start-mmr-input").value = activeSession.startMmr;
  } else {
    showStartSessionUI();
    if (sessions.length > 0) {
      var lastMmr = sessions[sessions.length - 1].endMmr;
      document.getElementById("start-mmr-input").value = lastMmr;
      updateStartRankDisplay(lastMmr);
    }
  }

  // Build both charts, then apply theme colors
  buildInSessionChart();
  buildLongTermChart();
  updateChartColors(savedTheme);

  // Build the concept library (static, built once)
  updateConceptLibrary();

  // Render all data-driven sections
  updateSummaryBar();
  updateStreak();
  updateTiltWarning();
  updateSessionHeader();
  updateInSessionChart();
  updateLongTermChart();
  updateStatsDashboard();
  updatePerformanceSection();
  updateRankHero();
  updateSessionLog();
  updateGameLog();
}

document.addEventListener("DOMContentLoaded", init);


// ============================================================
// THEME MANAGEMENT
// ============================================================

var THEME_PALETTE = {
  ghost:      { hex: "#2563eb", rgb: "37,99,235",   grid: "rgba(0,0,0,0.04)"   },
  midnight:   { hex: "#60a5fa", rgb: "96,165,250",  grid: "rgba(255,255,255,0.05)" },
  supersonic: { hex: "#f97316", rgb: "249,115,22",  grid: "rgba(255,255,255,0.05)" },
  synthwave:  { hex: "#e040fb", rgb: "224,64,251",  grid: "rgba(255,255,255,0.04)" },
  carbon:     { hex: "#a3e635", rgb: "163,230,53",  grid: "rgba(255,255,255,0.03)" }
};

var currentTheme = "ghost";

function setTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("rl_theme", theme);

  // Update active swatch
  document.querySelectorAll(".theme-btn").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });

  // Update chart colors to match new theme
  updateChartColors(theme);
}

function updateChartColors(theme) {
  var p = THEME_PALETTE[theme] || THEME_PALETTE.ghost;

  [inSessionChart, longTermChart].forEach(function(chart) {
    if (!chart || !chart.data.datasets[0]) return;

    var hex = p.hex;
    var r   = parseInt(hex.slice(1,3), 16);
    var g   = parseInt(hex.slice(3,5), 16);
    var b   = parseInt(hex.slice(5,7), 16);

    chart.data.datasets[0].borderColor         = hex;
    chart.data.datasets[0].pointBackgroundColor = hex;
    chart.data.datasets[0].pointBorderColor     = theme === "ghost" ? "#ffffff" : "rgba(0,0,0,0.3)";

    chart.data.datasets[0].backgroundColor = function(context) {
      var c    = context.chart;
      var area = c.chartArea;
      if (!area) return "rgba(" + r + "," + g + "," + b + ",0)";
      var grad = c.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      grad.addColorStop(0, "rgba(" + r + "," + g + "," + b + ",0.18)");
      grad.addColorStop(1, "rgba(" + r + "," + g + "," + b + ",0)");
      return grad;
    };

    // Update grid colors
    chart.options.scales.x.grid = { color: p.grid, drawBorder: false };
    chart.options.scales.y.grid = { color: p.grid, drawBorder: false };

    var tickColor = theme === "ghost" ? "#9aa4be" : "rgba(255,255,255,0.3)";
    chart.options.scales.x.ticks = { color: tickColor, font: { size: 11 } };
    chart.options.scales.y.ticks = { color: tickColor, font: { size: 11 } };

    chart.update();
  });
}

// ============================================================
// CHART GLOW PLUGIN
// Registered globally so all charts get a glowing line.
// Sets a canvas shadow before each dataset draws.
// ============================================================
Chart.register({
  id: "lineGlow",
  beforeDatasetDraw: function(chart) {
    var p = THEME_PALETTE[currentTheme] || THEME_PALETTE.ghost;
    chart.ctx.save();
    chart.ctx.shadowColor = "rgba(" + p.rgb + ", 0.55)";
    chart.ctx.shadowBlur  = 14;
  },
  afterDatasetDraw: function(chart) {
    chart.ctx.restore();
  }
});


// ============================================================
// DESIGN SYSTEM INIT
// Called once after the page loads to wire up all visual
// effects: cursor, parallax, magnetic buttons, card tilt,
// scroll animations, and chart gradient fills.
// ============================================================

function initDesign() {

  // --- Parallax blobs + header ---
  var blobTargetX = 0, blobTargetY = 0;
  var blobCurrentX = 0, blobCurrentY = 0;
  var blob1 = document.getElementById("blob-1");
  var blob2 = document.getElementById("blob-2");
  var blob3 = document.getElementById("blob-3");
  var appHeader = document.getElementById("app-header");

  document.addEventListener("mousemove", function(e) {
    blobTargetX = (e.clientX / window.innerWidth)  - 0.5;
    blobTargetY = (e.clientY / window.innerHeight) - 0.5;
  });

  function tick() {
    blobCurrentX += (blobTargetX - blobCurrentX) * 0.04;
    blobCurrentY += (blobTargetY - blobCurrentY) * 0.04;
    if (blob1) blob1.style.transform = "translate(" + (blobCurrentX * -48) + "px, " + (blobCurrentY * -32) + "px)";
    if (blob2) blob2.style.transform = "translate(" + (blobCurrentX *  36) + "px, " + (blobCurrentY *  24) + "px)";
    if (blob3) blob3.style.transform = "translate(" + (blobCurrentX *  20) + "px, " + (blobCurrentY * -18) + "px)";
    if (appHeader) appHeader.style.transform = "translate(" + (blobCurrentX * 8) + "px, " + (blobCurrentY * 4) + "px)";
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);


  // --- Magnetic buttons ---
  // The button shifts slightly toward the cursor on mousemove.
  function setupMagnetic(btn) {
    btn.addEventListener("mousemove", function(e) {
      var rect = btn.getBoundingClientRect();
      var dx = (e.clientX - (rect.left + rect.width  / 2)) * 0.22;
      var dy = (e.clientY - (rect.top  + rect.height / 2)) * 0.22;
      btn.style.transform = "translate(" + dx + "px, " + dy + "px)";
    });
    btn.addEventListener("mouseleave", function() {
      btn.style.transform = "";
    });
  }

  document.querySelectorAll(
    "#submit-btn, #start-session-btn, #end-session-btn, " +
    "#tilt-dismiss-btn, #coaching-dismiss-btn"
  ).forEach(setupMagnetic);

  // Also wire future delete buttons (delegated on table body)
  var tableBody = document.getElementById("game-table-body");
  if (tableBody) {
    tableBody.addEventListener("mouseover", function(e) {
      if (e.target.classList.contains("delete-btn") && !e.target._magnetic) {
        e.target._magnetic = true;
        setupMagnetic(e.target);
      }
    });
  }


  // --- 3D card tilt on hover ---
  // Cards rotate on the X/Y axis toward the cursor, creating depth.
  function setupTilt(card) {
    card.addEventListener("mousemove", function(e) {
      var rect = card.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width  - 0.5;
      var y = (e.clientY - rect.top)  / rect.height - 0.5;
      var rotX = -y * 7;
      var rotY =  x * 7;
      card.style.transform  = "perspective(700px) rotateX(" + rotX + "deg) rotateY(" + rotY + "deg) translateZ(4px)";
      card.style.transition = "box-shadow 0.3s ease";
    });
    card.addEventListener("mouseleave", function() {
      card.style.transform  = "";
      card.style.transition = "transform 0.55s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease";
    });
  }

  document.querySelectorAll(".stat-card, .concept-card, .session-card").forEach(setupTilt);

  // Concept cards and session cards get rebuilt by JS — re-apply tilt after each update.
  // We monkey-patch the render functions to run setupTilt after they finish.
  var _origConceptLib = updateConceptLibrary;
  updateConceptLibrary = function() {
    _origConceptLib();
    document.querySelectorAll(".concept-card").forEach(setupTilt);
  };

  var _origSessionLog = updateSessionLog;
  updateSessionLog = function() {
    _origSessionLog();
    document.querySelectorAll(".session-card").forEach(setupTilt);
    document.querySelectorAll(".session-card button").forEach(setupMagnetic);
  };

  var _origGameLog = updateGameLog;
  updateGameLog = function() {
    _origGameLog();
    document.querySelectorAll(".delete-btn").forEach(function(btn) {
      if (!btn._magnetic) { btn._magnetic = true; setupMagnetic(btn); }
    });
  };


  // --- Scroll-driven entrance animations ---
  // Adds .animate-on-scroll to lower sections, then IntersectionObserver
  // adds .visible as each enters the viewport.
  var scrollSections = document.querySelectorAll(
    "#stats-section, #in-session-chart-section, #long-term-chart-section, " +
    "#session-log-section, #game-log-section, #concept-library-section"
  );

  scrollSections.forEach(function(el, i) {
    el.classList.add("animate-on-scroll");
    // Stagger each section slightly
    el.style.transitionDelay = (i * 60) + "ms";
  });

  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target); // animate once
      }
    });
  }, { threshold: 0.08 });

  scrollSections.forEach(function(el) { observer.observe(el); });


  // --- Chart gradient fills ---
  // Patches both chart dataset configs after charts are already built
  // to add a gradient fill under the line.
  function applyGradientFill(chart) {
    if (!chart || !chart.data || !chart.data.datasets[0]) return;
    chart.data.datasets[0].fill = true;
    chart.data.datasets[0].backgroundColor = function(context) {
      var c = context.chart;
      var area = c.chartArea;
      if (!area) return "rgba(37,99,235,0)";
      var grad = c.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      grad.addColorStop(0, "rgba(37,99,235,0.14)");
      grad.addColorStop(1, "rgba(37,99,235,0)");
      return grad;
    };
    chart.data.datasets[0].borderColor        = "#2563eb";
    chart.data.datasets[0].borderWidth        = 2.5;
    chart.data.datasets[0].pointBackgroundColor = "#2563eb";
    chart.data.datasets[0].pointBorderColor    = "#ffffff";
    chart.data.datasets[0].pointBorderWidth    = 2;
    chart.data.datasets[0].pointRadius        = 4;
    chart.data.datasets[0].pointHoverRadius   = 6;
    chart.data.datasets[0].tension            = 0.35;

    // Cleaner grid styling
    chart.options.scales.x.grid  = { color: "rgba(0,0,0,0.04)", drawBorder: false };
    chart.options.scales.y.grid  = { color: "rgba(0,0,0,0.04)", drawBorder: false };
    chart.options.scales.x.ticks = { color: "#9aa4be", font: { size: 11 } };
    chart.options.scales.y.ticks = { color: "#9aa4be", font: { size: 11 } };
    chart.options.scales.x.title = { display: false };
    chart.options.scales.y.title = { display: false };
    chart.options.scales.x.border = { display: false };
    chart.options.scales.y.border = { display: false };

    chart.update();
  }

  // Charts are built inside init(), which runs before initDesign().
  // inSessionChart and longTermChart are in outer scope — access directly.
  applyGradientFill(inSessionChart);
  applyGradientFill(longTermChart);
}

document.addEventListener("DOMContentLoaded", initDesign);


// ============================================================
// RANK-UP PARTICLE EXPLOSION — PREMIUM
//
// Techniques used:
//  • Dark backdrop so additive ("lighter") glow actually blooms
//  • globalCompositeOperation "lighter" — overlapping glow particles
//    add their colors together, creating authentic bloom
//  • Screen shake with decay oscillation
//  • Instant colored screen flash
//  • Staggered letter entrance on "RANK UP" text
//  • Two-burst pattern: primary at t=0, secondary ring at t=380ms
//  • Four shockwave rings at different speeds
//  • Dead time: overlay stays visible 2.4 seconds so the player
//    can register the achievement before it fades
// ============================================================

// Color palettes per rank tier — used for particle colors.
var RANK_COLORS = {
  "Bronze":          ["#cd7f32","#b87333","#e8965a","#daa068","#f0c080"],
  "Silver":          ["#c0c0c0","#a8a8a8","#d8d8d8","#e8e8e8","#909090"],
  "Gold":            ["#ffd700","#ffa500","#ffe066","#c8a200","#ffcc00"],
  "Platinum":        ["#a5f2f3","#70d5dd","#38b2c8","#00bcd4","#b0e8f0"],
  "Diamond":         ["#1a6fff","#4488ff","#60a0ff","#0044cc","#80b8ff"],
  "Champion":        ["#8b5cf6","#6d28d9","#a78bfa","#7c3aed","#c4b5fd"],
  "Grand Champion":  ["#ef4444","#dc2626","#ff6b6b","#b91c1c","#fca5a5"],
  "Supersonic Legend":["#ec4899","#db2777","#f472b6","#fbbf24","#fde68a"]
};

function getRankColors(rankName) {
  var keys = Object.keys(RANK_COLORS);
  for (var i = keys.length - 1; i >= 0; i--) {
    if (rankName.indexOf(keys[i]) !== -1) return RANK_COLORS[keys[i]];
  }
  return ["#2563eb","#60a5fa","#93c5fd","#1d4ed8","#3b82f6"];
}

// Oscillating screen shake with decay — feels physical rather than random.
function shakeScreen() {
  var el    = document.getElementById("app");
  var start = Date.now();
  var dur   = 520;
  var amp   = 8;

  (function tick() {
    var t = (Date.now() - start) / dur;
    if (t >= 1) { el.style.transform = ""; return; }
    var decay = Math.pow(1 - t, 1.8);
    var x = (Math.random() * 2 - 1) * amp * decay;
    var y = (Math.random() * 2 - 1) * amp * 0.45 * decay;
    el.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)";
    requestAnimationFrame(tick);
  })();
}

// Animate each character of an element's text independently.
function staggerLetters(el, baseDelay, letterDelay) {
  var text  = el.textContent;
  el.textContent = "";
  text.split("").forEach(function(ch, i) {
    var span = document.createElement("span");
    span.textContent = ch === " " ? " " : ch;
    span.style.cssText =
      "display:inline-block;opacity:0;transform:translateY(18px) scale(0.75);" +
      "transition:opacity 0.38s ease,transform 0.45s cubic-bezier(0.34,1.56,0.64,1);" +
      "transition-delay:" + (baseDelay + i * letterDelay) + "ms";
    el.appendChild(span);
    // Double rAF ensures transition triggers after the element is in the DOM
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        span.style.opacity   = "1";
        span.style.transform = "translateY(0) scale(1)";
      });
    });
  });
}

// Factory: create one particle object.
function makeParticle(cx, cy, colors, speedMin, speedMax, shapes) {
  var angle = Math.random() * Math.PI * 2;
  var speed = speedMin + Math.random() * (speedMax - speedMin);
  var shape = shapes[Math.floor(Math.random() * shapes.length)];
  var roll  = Math.random();
  var color = roll < 0.12 ? "#ffffff"
            : roll < 0.18 ? colors[Math.min(colors.length - 1, 4)] || colors[0]
            : colors[Math.floor(Math.random() * colors.length)];
  return {
    x: cx + (Math.random() - 0.5) * 24,
    y: cy + (Math.random() - 0.5) * 24,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - Math.random() * 4,
    w:  5 + Math.random() * 13,
    h:  7 + Math.random() * 17,
    r:  3 + Math.random() * 7,
    color: color,
    alpha: 1,
    decay: 0.0038 + Math.random() * 0.0055,
    gravity: 0.24 + Math.random() * 0.1,
    drag:    0.981,
    rot:  Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.28,
    shape: shape,
    glow: false
  };
}

function triggerRankUpAnimation(rankName) {
  var bgEl    = document.getElementById("rankup-bg");
  var canvas  = document.getElementById("rankup-canvas");
  var overlay = document.getElementById("rankup-overlay");
  var iconEl  = document.getElementById("rankup-icon-large");
  var labelEl = document.getElementById("rankup-label");
  var nameEl  = document.getElementById("rankup-rank-name");
  var colors  = getRankColors(rankName);

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  var ctx = canvas.getContext("2d");
  var cx  = canvas.width  / 2;
  var cy  = canvas.height / 2;
  var maxR = Math.hypot(cx, cy) * 1.35;

  // ---- 1. Dark backdrop fades in (makes "lighter" glow bloom) ----
  bgEl.style.display = "block";
  requestAnimationFrame(function() { bgEl.style.opacity = "0.78"; });

  // ---- 2. Instant colored screen flash ----
  var flash = document.createElement("div");
  flash.style.cssText =
    "position:fixed;inset:0;z-index:99989;pointer-events:none;" +
    "background:" + colors[0] + ";opacity:0.5;transition:opacity 0.14s ease";
  document.body.appendChild(flash);
  requestAnimationFrame(function() {
    flash.style.opacity = "0";
    setTimeout(function() { flash.remove(); }, 220);
  });

  // ---- 3. Screen shake ----
  shakeScreen();

  // ---- 4. Canvas on ----
  canvas.style.display = "block";

  // ---- 5. Build particle arrays ----
  var regular = [];  // drawn with source-over (confetti, shapes)
  var glows   = [];  // drawn with "lighter" (bloom)

  var CONF_SHAPES = ["rect","rect","rect","circle","star"];
  var GLOW_SHAPES = ["circle"];

  // Primary burst — 200 confetti + 50 glow blobs
  for (var i = 0; i < 200; i++) {
    regular.push(makeParticle(cx, cy, colors, 5, 22, CONF_SHAPES));
  }
  for (var i = 0; i < 60; i++) {
    var gp  = makeParticle(cx, cy, colors, 3, 14, GLOW_SHAPES);
    gp.r    = 6 + Math.random() * 18;
    gp.alpha = 0.7 + Math.random() * 0.3;
    gp.decay = 0.005 + Math.random() * 0.005;
    gp.glow  = true;
    glows.push(gp);
  }

  // Sparks — tiny fast dots, additive blend
  for (var i = 0; i < 90; i++) {
    var sp   = makeParticle(cx, cy, colors, 10, 32, GLOW_SHAPES);
    sp.r     = 1.5 + Math.random() * 3;
    sp.decay = 0.009 + Math.random() * 0.011;
    sp.color = Math.random() < 0.5 ? "#ffffff" : colors[0];
    sp.glow  = true;
    glows.push(sp);
  }

  // Top-rain confetti falls from the top edge
  for (var i = 0; i < 70; i++) {
    regular.push({
      x: Math.random() * canvas.width,
      y: -8 - Math.random() * 90,
      vx: (Math.random() - 0.5) * 4,
      vy: 2.5 + Math.random() * 5,
      w:  4 + Math.random() * 11,
      h:  6 + Math.random() * 15,
      r:  3,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      decay: 0.003 + Math.random() * 0.004,
      gravity: 0.15,
      drag: 0.992,
      rot:  Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.22,
      shape: "rect",
      glow: false
    });
  }

  // Secondary burst at t=380ms — softer outer ring feel
  setTimeout(function() {
    for (var i = 0; i < 80; i++) {
      var p2 = makeParticle(cx, cy, colors, 4, 14, CONF_SHAPES);
      p2.decay = 0.005 + Math.random() * 0.007;
      regular.push(p2);
    }
    for (var i = 0; i < 30; i++) {
      var g2 = makeParticle(cx, cy, colors, 2, 9, GLOW_SHAPES);
      g2.r = 8 + Math.random() * 16;
      g2.glow = true;
      glows.push(g2);
    }
  }, 380);

  // ---- 6. Shockwave rings ----
  var waves = [
    { r: 0, speed: 20, alpha: 0.9, color: colors[0],              width: 4 },
    { r: 0, speed: 13, alpha: 0.65, color: colors[1] || colors[0], width: 3 },
    { r: 0, speed: 7,  alpha: 0.45, color: "#ffffff",              width: 2 },
    { r: 0, speed: 16, alpha: 0.55, color: colors[2] || colors[0], width: 2.5, delay: 500 }
  ];
  var waveStart = Date.now();

  // ---- 7. Draw helpers ----
  function drawStar(x, y, r) {
    ctx.beginPath();
    for (var k = 0; k < 10; k++) {
      var a  = (k * Math.PI) / 5 - Math.PI / 2;
      var rr = k % 2 === 0 ? r : r * 0.42;
      if (k === 0) ctx.moveTo(rr * Math.cos(a), rr * Math.sin(a));
      else         ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a));
    }
    ctx.closePath();
  }

  function drawRegular(p) {
    if (p.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle   = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.shape === "rect") {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else if (p.shape === "circle") {
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    } else {
      drawStar(0, 0, p.r * 1.4); ctx.fill();
    }
    ctx.restore();
  }

  // ---- 8. Main animation loop ----
  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var elapsed = Date.now() - waveStart;

    // --- Shockwaves (source-over) ---
    var waveAlive = false;
    for (var w = 0; w < waves.length; w++) {
      var wave = waves[w];
      if (wave.delay && elapsed < wave.delay) continue;
      wave.r    += wave.speed;
      wave.alpha = Math.max(0, wave.alpha * 0.91);
      if (wave.alpha > 0.01 && wave.r < maxR) {
        waveAlive = true;
        ctx.save();
        ctx.globalAlpha = wave.alpha;
        ctx.strokeStyle = wave.color;
        ctx.lineWidth   = wave.width;
        ctx.shadowColor = wave.color;
        ctx.shadowBlur  = 18;
        ctx.beginPath();
        ctx.arc(cx, cy, wave.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // --- Regular confetti / shapes (source-over) ---
    var alive = false;
    ctx.globalCompositeOperation = "source-over";
    for (var i = 0; i < regular.length; i++) {
      var p = regular[i];
      if (p.alpha <= 0) continue;
      p.x  += p.vx; p.y  += p.vy;
      p.vy += p.gravity; p.vx *= p.drag;
      p.rot += p.rotV; p.alpha -= p.decay;
      if (p.alpha > 0) { alive = true; drawRegular(p); }
    }

    // --- Glow / spark layer ("lighter" = additive bloom) ---
    // With the dark backdrop behind the canvas, additive blending
    // creates genuine bright bloom where particles cluster.
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < glows.length; i++) {
      var g = glows[i];
      if (g.alpha <= 0) continue;
      g.x  += g.vx; g.y  += g.vy;
      g.vy += g.gravity; g.vx *= g.drag;
      g.rot += g.rotV; g.alpha -= g.decay;
      if (g.alpha <= 0) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(0, g.alpha);
      ctx.fillStyle   = g.color;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";

    if (alive || waveAlive) {
      requestAnimationFrame(frame);
    } else {
      canvas.style.display = "none";
    }
  }

  requestAnimationFrame(frame);

  // ---- 9. Overlay entrance — staggered letters + icon ----
  overlay.style.display   = "flex";
  overlay.style.opacity   = "1";
  overlay.style.transition = "";

  // Letters stagger in starting at t=340ms
  setTimeout(function() {
    labelEl.textContent = "RANK UP";
    staggerLetters(labelEl, 0, 60);
    nameEl.style.opacity   = "0";
    nameEl.style.transform = "translateY(10px)";
    nameEl.textContent     = rankName;
    nameEl.style.transition = "opacity 0.4s ease, transform 0.4s ease";
    nameEl.style.transitionDelay = "420ms";
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        nameEl.style.opacity   = "1";
        nameEl.style.transform = "translateY(0)";
      });
    });
  }, 340);

  // Icon springs in at t=520ms
  if (RANK_ICONS[rankName]) {
    iconEl.src           = RANK_ICONS[rankName];
    iconEl.style.display = "block";
    iconEl.style.opacity = "0";
    iconEl.style.transform = "scale(0.2) rotate(-12deg)";
    iconEl.style.transition = "none";
    setTimeout(function() {
      iconEl.style.transition = "opacity 0.5s ease, transform 0.55s cubic-bezier(0.34,1.56,0.64,1)";
      iconEl.style.opacity    = "1";
      iconEl.style.transform  = "scale(1) rotate(0deg)";
    }, 520);
  } else {
    iconEl.style.display = "none";
  }

  // ---- 10. Dead time: 3.2s before fade — player needs to register the achievement ----
  setTimeout(function() {
    overlay.style.transition = "opacity 0.65s ease";
    overlay.style.opacity    = "0";
    bgEl.style.transition    = "opacity 0.65s ease";
    bgEl.style.opacity       = "0";
    setTimeout(function() {
      overlay.style.display  = "none";
      overlay.style.opacity  = "";
      overlay.style.transition = "";
      bgEl.style.display     = "none";
      bgEl.style.opacity     = "";
      bgEl.style.transition  = "";
      iconEl.style.cssText   = "";
      labelEl.textContent    = "";
      nameEl.style.cssText   = "";
    }, 700);
  }, 3200);
}
