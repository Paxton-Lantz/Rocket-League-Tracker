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

  const confirmed = window.confirm(
    "End this session? Your final MMR will be saved to the long-term chart."
  );
  if (!confirmed) return;

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
  const confirmed = window.confirm("Delete this game? This cannot be undone.");
  if (!confirmed) return;

  games = games.filter(function(g) { return g.id !== gameId; });

  saveGames();
  updateSummaryBar();
  updateStreak();
  updateTiltWarning();
  updateInSessionChart();
  updateSessionHeader();
  updateStatsDashboard();
  updateSessionLog();
  updateGameLog();
}


// ============================================================
// STATS DASHBOARD
// Average goals, saves, assists, shots across all games.
// No rank filter since we no longer track rank.
// ============================================================

function updateStatsDashboard() {
  const total = games.length;

  if (total === 0) {
    ["avg-goals", "avg-saves", "avg-assists", "avg-shots"].forEach(function(id) {
      document.getElementById(id).textContent = "—";
    });
    return;
  }

  function sumOf(key) {
    return games.reduce(function(acc, g) { return acc + g[key]; }, 0);
  }

  document.getElementById("avg-goals").textContent   = (sumOf("goals")   / total).toFixed(2);
  document.getElementById("avg-saves").textContent   = (sumOf("saves")   / total).toFixed(2);
  document.getElementById("avg-assists").textContent = (sumOf("assists") / total).toFixed(2);
  document.getElementById("avg-shots").textContent   = (sumOf("shots")   / total).toFixed(2);
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

    header.appendChild(title);
    header.appendChild(badge);

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
  updateSessionLog();
  updateGameLog();

  flashSuccess();
  resetForm();

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

  // Wire up buttons
  document.getElementById("start-session-btn").addEventListener("click", startSession);
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
    // Pre-fill the start MMR input in case the user ends and restarts
    document.getElementById("start-mmr-input").value = activeSession.startMmr;
  } else {
    showStartSessionUI();
    // Pre-fill start MMR with last session's ending MMR if available
    if (sessions.length > 0) {
      document.getElementById("start-mmr-input").value = sessions[sessions.length - 1].endMmr;
    }
  }

  // Build both charts
  buildInSessionChart();
  buildLongTermChart();

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
  updateSessionLog();
  updateGameLog();
}

document.addEventListener("DOMContentLoaded", init);
