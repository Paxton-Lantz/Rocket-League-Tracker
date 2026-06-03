// ============================================================
// RL TRACKER — app.js
//
// Read top to bottom:
// config → constants → state → storage → session management
// → streak → tilt → coaching → charts → game log
// → stats → session log → form → init
// ============================================================




// ============================================================
// RANK DATA
// MMR thresholds and icon paths for each rank.
// Thresholds are approximate standard 3v3 competitive values.
// Add more entries to RANK_ICONS as new art is sourced.
// ============================================================

// MMR thresholds calibrated from two confirmed data points:
//   222 MMR = Bronze II Div 4  →  Bronze II ≈ 155, Bronze III ≈ 240
//   521 MMR = Gold II Div 1    →  Gold II ≈ 510
// Silver and above spaced ~55–60 MMR per rank; Champion+ slightly wider.
// Thresholds shift each season and differ between playlists (1v1/2v2/3v3).
const RANK_THRESHOLDS = [
  { name: "Bronze I",           mmr: 0    },
  { name: "Bronze II",          mmr: 155  },
  { name: "Bronze III",         mmr: 240  },
  { name: "Silver I",           mmr: 300  },
  { name: "Silver II",          mmr: 360  },
  { name: "Silver III",         mmr: 415  },
  { name: "Gold I",             mmr: 460  },
  { name: "Gold II",            mmr: 510  },
  { name: "Gold III",           mmr: 570  },
  { name: "Platinum I",         mmr: 630  },
  { name: "Platinum II",        mmr: 690  },
  { name: "Platinum III",       mmr: 750  },
  { name: "Diamond I",          mmr: 810  },
  { name: "Diamond II",         mmr: 870  },
  { name: "Diamond III",        mmr: 930  },
  { name: "Champion I",         mmr: 990  },
  { name: "Champion II",        mmr: 1070 },
  { name: "Champion III",       mmr: 1150 },
  { name: "Grand Champion I",   mmr: 1230 },
  { name: "Grand Champion II",  mmr: 1310 },
  { name: "Grand Champion III", mmr: 1390 },
  { name: "Supersonic Legend",  mmr: 1470 }
];

// Map rank name → icon file path.
const RANK_ICONS = {
  "Bronze I":            "Ranks/Bronze_I.png",
  "Bronze II":           "Ranks/Bronze_II.png",
  "Bronze III":          "Ranks/Bronze_III.png",
  "Silver I":            "Ranks/Silver_I.png",
  "Silver II":           "Ranks/Silver_II.png",
  "Silver III":          "Ranks/Silver_III.png",
  "Gold I":              "Ranks/Gold_I.png",
  "Gold II":             "Ranks/Gold_II.png",
  "Gold III":            "Ranks/Gold_III.png",
  "Platinum I":          "Ranks/Platinum_I.png",
  "Platinum II":         "Ranks/Platinum_II.png",
  "Platinum III":        "Ranks/Platinum_III.png",
  "Diamond I":           "Ranks/Diamond_I.png",
  "Diamond II":          "Ranks/Diamond_II.png",
  "Diamond III":         "Ranks/Diamond_III.png",
  "Champion I":          "Ranks/Champion_I.png",
  "Champion II":         "Ranks/Champion_II.png",
  "Champion III":        "Ranks/Champion_III.png",
  "Grand Champion I":    "Ranks/Grand_Champion_I.png",
  "Grand Champion II":   "Ranks/Grand_Champion_II.png",
  "Grand Champion III":  "Ranks/Grand_Champion_III.png",
  "Supersonic Legend":   "Ranks/Supersonic_Legend.png"
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

// Returns division 1–4 within the current rank based on progress percentage.
// Returns null at max rank (Supersonic Legend).
function getDivision(mmr) {
  var prog = getRankProgress(mmr);
  if (!prog || prog.nextName === null) return null;
  return Math.min(4, Math.floor(prog.pct / 25) + 1);
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

  // Pick the best available MMR for the currently selected mode
  var mmr = null;
  if (activeSession && activeSession.mode === activeMode) {
    mmr = getCurrentMmr();
  } else {
    var ms = getModeSessions();
    if (ms.length > 0) mmr = ms[ms.length - 1].endMmr;
  }

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

  var div = getDivision(mmr);
  nameEl.textContent = div ? rankName + " · Div " + div : rankName;
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
  var div = getDivision(mmr);
  nameEl.textContent = div ? rankName + " · Div " + div : rankName;

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

const MODES = ["1v1", "2v2", "3v3", "2v2 Heatseeker"];


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
    priorityRanks: ["Bronze", "Silver", "Gold", "Platinum"],
    content: `In 3v3, three players can't all chase the ball at once. Rotations are the system that prevents this — one player attacks, one supports, one defends, and you cycle through these roles as the ball moves.

The basic loop: commit to a play → miss or clear → drop behind your teammates → let the next player take the ball. It feels wrong at first because it means passing up balls you could reach. But a team that rotates beats three solo players almost every time.`,
    rankContent: {
      "Bronze": `The single biggest problem at Bronze is everyone chasing the ball at the same time. All three players crowd the ball, nobody is back to defend, and a single miss gives the opponent a completely open net.

The fix is simple: when a teammate goes for the ball, stop and hold your position. Only one person attacks at a time. When they miss, let the next person go — then rotate back so the third person can step up. You don't have to win every touch to help your team.

Start by asking yourself one question every time the ball is in play: "Is it actually my turn?" If a teammate is closer or already committed, the answer is no. Peel off and get back into position.`,
      "Silver": `You've heard of rotations by now but you're probably not doing them consistently. The issue at Silver isn't knowing what rotations are — it's breaking them in the heat of the moment when the ball is right in front of you.

The hardest part: letting a ball go that you could have hit. But if your teammate is already going for it, a second person challenging usually makes things worse — you both whiff, you collide, or you score an own goal.

Work on one thing: after you take a touch, immediately rotate behind your nearest teammate. Don't linger to see what happens. Reset your position every single touch, and the rotation loop builds itself from there.`,
      "Gold": `At Gold, the most common mistake is ball chasing — everyone rushes the ball, nobody is back to defend, and a single miss turns into a free goal for the opponent.

Good rotation means when you commit to a play and miss, you rotate back behind your teammates instead of chasing again. The basic loop: Attack → miss or clear → drop back → let the next player take the ball.

It feels unnatural because it means letting your teammate take shots you could reach. But a team that rotates beats a team of three solo players almost every time. The hardest discipline is staying back when the ball is in an exciting position — that's exactly when rotation matters most.`,
      "Platinum": `At Platinum you're rotating but the problem has shifted: you're breaking rotation at the wrong times. You leave your position early because you read a play correctly — but your execution is half a second off, and the rotation gap gets exposed.

Two things to work on: First, don't fake-rotate. Going through the motion of rotating but staying up the field is worse than fully committing either way. Second, learn when it's actually correct to break rotation — when the ball is about to be scored, when you're clearly the fastest to a contested ball, or when an opponent is in your area alone. These are the exceptions, not the default.

Also start thinking about boost-efficient rotations — don't loop wide around the field just to grab a big pad unless you genuinely need it. Short rotation beats long rotation every time.`,
      "Diamond": `At Diamond, rotation mistakes are subtle. You're not ball chasing — you're making small timing errors. Pre-rotating too early, cutting rotation short, or reading a teammate's play incorrectly and crossing lanes.

The upgrade at this level is anticipatory rotation: start moving into the next position before you know for certain the play is going that way. Read your teammate's body position and speed — if they're committed to a challenge, start rotating immediately, not after they make contact.

The other piece is knowing when to stay. Cutting rotation to hold a position and make a read is correct sometimes — the key is reading the play well enough to know when that applies versus when it's just lazy rotation.`,
      "Champion": `At Champion, rotations are mostly automatic — mistakes here are almost always mental, not mechanical. You know when to rotate; the issue is when you choose not to because you're in a flow state or chasing a highlight.

The next level is using rotation as an offensive weapon. Communicating (via positioning) to your teammates that you're cutting in early to pressure — creating a coordinated 2v1 through a fake rotation. At this rank you can trust your teammates to read your position and adjust.

Watch your replays looking for possession losses that came from a rotation decision, not a mechanical miss. Those are the decisions to clean up.`,
      "Grand Champion": `Rotations at GC are second nature. What separates GC from SSL isn't knowing the rotation system — it's the consistency of execution under pressure, and the ability to read when creative rotation breaks are warranted versus when they're unnecessary risks.

Focus: film study. Identify the 2-3 rotation situations where you make incorrect decisions under pressure, and drill those scenarios in free play and custom training.`,
      "Supersonic Legend": `At SSL, rotation knowledge is fully internalized. The gains here come from micro-timing — the half-second precision of when you leave, when you arrive, and how you carry speed through the rotation path. Shadow mechanics, wave dash recoveries, and reading teammates at the highest level are what refine an already-solid system.`
    }
  },
  {
    id: "boost_management",
    title: "Boost Management",
    summary: "Collecting boost efficiently so you're never caught at zero.",
    priorityRanks: ["Bronze", "Silver", "Gold"],
    content: `Boost is your fuel for speed, power, and aerials. Running out at the wrong moment causes missed clears and failed saves.

Small pads (12 boost) are scattered around the field and respawn every 4 seconds. Large pads (100 boost) are in the corners and respawn in 10 seconds. Always grab small pads as you drive past them. The rule: never go for a play at 0 boost. If you're empty, collect first and let your teammate take the ball.`,
    rankContent: {
      "Bronze": `The most important thing at Bronze: never be at 0 boost. When you have no boost you can't save, can't clear with power, and can't rotate quickly. Running out is often what turns a manageable situation into a goal against.

Two simple habits: first, grab every large boost pad you drive near — they give you 100 boost and respawn fast. Second, never spend all your boost at once. Try to stay above 30 whenever possible.

Don't go out of your way to get boost and miss a play for it — but if you're back in your own third and the ball is far away, that's the time to collect before the next play comes to you.`,
      "Silver": `At Silver you know boost matters, but you're probably still running empty at the wrong moments — usually because you burned it all making an aggressive play that didn't convert.

The habit to build: grab small boost pads (the 12-point ones on the ground) every time you drive over one, even at 80 boost. They respawn every 4 seconds so they're almost always available, and keeping yourself topped up means you're never caught flat-footed.

One more thing: when you're rotating back to defense, take a route that passes through a large boost pad if one is available. You get back to position AND arrive with full boost. This one habit alone saves most boost problems.`,
      "Gold": `At Gold, individual boost management is mostly sorted — the next upgrade is thinking about the opponent's boost. If both corner pads on one side are empty and the opponent is near that side, they're probably low. That's the time to pressure aggressively, because they can't contest you effectively without boost.

Also think about boost denial: if you clear the ball and drive through a boost pad you don't need, you're also taking it away from your opponent. This is a free advantage you're already in position to take.

The rule that never changes: never go for a challenge at 0 boost. A weak hit with no boost usually causes a turnover worse than not challenging at all.`,
      "Platinum": `At Platinum, boost management becomes a team concept. Are your three players collectively maintaining enough boost? If all three of you are low at the same time, your team is vulnerable regardless of positioning.

Start tracking when your teammates are collecting — if they just came back from a pad and have boost, you can be more aggressive. If everyone just spent down, rotate back and collect before the next play.

Boost denial is also worth thinking about deliberately here. Controlling the large pads on your side keeps the opponent in a permanent resource deficit if you do it consistently.`,
      "Diamond": `At Diamond, boost management is mostly automatic — the upgrade is tracking opponent boost levels. Watch for opponents who are collecting versus challenging: a player who drives toward a corner pad is telegraphing that they're low. That's the moment to challenge the remaining two opponents, or pressure the ball aggressively.

Also think about how you use boost during challenges. Many Diamond players burn full boost on a hit that only needed 20. Conserving during ball contact means you have boost left for the follow-up.`,
      "Champion": `At Champion, boost tracking is a full-time read. You should have a rough sense of every player's boost level at all times — not a perfect number, but a sense of "full, medium, low" that informs your decisions. Going wide for a challenge when the opponent is at 0 is different from the same challenge when they have 100.

The refinement here is boost-efficient movement: using powerslides, diagonal approaches, and speed-preserving routes to arrive at positions with more boost than an opponent making a direct path.`,
      "Grand Champion": `At GC, boost is used with near-zero waste. The gains come from macro boost control: reading the boost state of all five other players simultaneously and making team decisions based on boost advantages. Forcing opponents into low-boost situations through sustained pressure and pad denial is a deliberate strategy, not a side effect.`,
      "Supersonic Legend": `At SSL, boost management is fully optimized. The margins are in recovery routing — the precise paths that recover the most boost while losing the least positioning. Flicking through pads, reading which pads teammates will or won't collect, and maintaining team-wide boost health in the middle of a sustained attack are the remaining edges.`
    }
  },
  {
    id: "positioning",
    title: "Positioning",
    summary: "Where to be when you don't have the ball.",
    priorityRanks: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
    content: `Most improvement in Rocket League doesn't come from flashier plays — it comes from being in the right place to make simple plays. Positioning is knowing where to stand when you're not the one hitting the ball.

When your teammate has the ball, be ready for the next moment: shadow their attack from a supporting angle, hold mid-field, or be back at net in case it turns over. Don't follow them to the ball — hold your lane. Always be at a different depth than your nearest teammate.`,
    rankContent: {
      "Bronze": `The most important positioning rule at Bronze: be at a different depth than your teammate. If they're attacking the ball near the opponent's net, you should be at mid-field. If they're at mid, you should be back near your own net. This way, a single mistake doesn't expose all three of you at once.

The mistake almost everyone at Bronze makes: following the ball. The ball moves to the corner, and three players follow it to the corner. Now the entire field is empty, and any clear puts the opponent in open space. Resist the urge to follow. Stay in your lane.

Simple rule: when the ball is in the opponent's half, two players can be up. When it's in your half, at least one player must be back.`,
      "Silver": `At Silver, you're starting to hold positions better, but you're probably cheating up too far when it feels safe — and getting burned when the ball turns over unexpectedly.

The habit to build: always know where your last defender is. Before you push forward, confirm someone is back. If you're the one back, stay back until the play is clearly won — not until it looks like it's going well.

Also stop hugging the wall or the corners when you're not involved in the play. Hold center-field. It gives you the fastest path to any ball on the field and keeps you relevant even when your teammates have possession.`,
      "Gold": `At Gold, the biggest positioning mistake is being too far forward or too flat with your teammates. Always be at a different depth: if they're attacking, be at mid. If they're at mid, be back.

When your teammate has the ball, your job is to be ready for the next moment — shadow their attack from a supporting angle, hold mid-field, or be back at net in case it turns over. Don't follow them to the ball. Hold your lane.

This staggers your positions so a single turnover doesn't expose all three of you. The discomfort of "not being involved" is actually correct positioning — you're available for the follow-up.`,
      "Platinum": `At Platinum, basic depth is sorted — the upgrade is anticipatory positioning. Instead of reacting to where the ball is, start moving toward where the ball will be. Read your teammate's approach angle and the opponent's positioning to predict the next touch, and be in position before it happens.

The other thing to work on: your angle when you're in support position. Don't hold a spot directly behind your teammate — hold an angle that lets you either take possession if it turns over, or challenge the opponent if they break through. Your support position should threaten something.`,
      "Diamond": `At Diamond, positioning is mostly correct in standard situations. Where you can improve is in transition — the moment when possession switches sides. Most Diamond goals come from a positioning error in the half-second after a turnover, not from bad mechanics.

Work on your reading of turnover situations: when does a challenge have a real chance of being won, versus when should you immediately transition to defensive positioning? The players who climb out of Diamond fastest are the ones who reset defensive position before the turnover is confirmed rather than after.`,
      "Champion": `At Champion, positioning decisions are fast and mostly correct. The edge here is third-man positioning — when you're not involved in the current play, where you stand determines whether your team keeps possession or gives it up.

If your two teammates are challenging for the ball, your position should cover the likely turnover angles, not just be behind them. Read where the ball is most likely to go if the challenge fails, and be there.`,
      "Grand Champion": `At GC, positioning is internalized and automatic in standard situations. The refinement is cutting off opponent options — positioning that prevents the opponent from having a comfortable touch rather than just being "in a good spot." Proactive positioning rather than reactive.`,
      "Supersonic Legend": `At SSL, positioning is a strategic tool. Every position you hold sends information to opponents and teammates. The best players at this level use positioning to force opponents into uncomfortable touches, create passing lanes, and set up plays before the ball arrives. Reading and manipulating spatial pressure is where the last margins exist.`
    }
  },
  {
    id: "shadowing",
    title: "Shadowing & Defending",
    summary: "How to pressure the opponent without overcommitting.",
    priorityRanks: ["Silver", "Gold", "Platinum"],
    content: `Shadowing means retreating toward your own goal while facing the ball carrier — staying between them and the net without fully committing to a challenge. It's the difference between a solid defensive play and getting faked out.

Don't jump at the ball unless you're sure you'll win it. Drift backwards, match the opponent's speed, and cut off their angles. Wait for them to commit, then challenge hard.`,
    rankContent: {
      "Bronze": `Shadowing is simply staying between the opponent and your net without jumping at them. Most Bronze defenders either sit completely still (easy to drive around) or charge straight at the ball (easy to fake with a simple dodge).

The basic concept: when an opponent has the ball and is driving toward your net, don't rush at them. Instead, back up slowly toward your net while keeping your car facing the ball. Let them drive toward you. When they commit to a direction, challenge them.

This works because most Bronze opponents will drive straight at you — they're not going to fake you out. You just need to not panic and charge.`,
      "Silver": `At Silver, basic shadowing means retreating toward net while facing the ball carrier, staying between them and the goal. The goal is controlled pressure: close enough they feel rushed, far enough they can't easily get past you.

The key: don't jump at the ball unless you're confident you'll win it. Drifting backwards and matching their speed forces the opponent to make the first move. When they commit to a direction or take a shot, that's when you challenge — hard and direct.

The mistake most Silver players make is waiting passively with no pressure. Shadowing isn't parking in net — it's active, moving pressure that stays between the ball and the goal.`,
      "Gold": `At Gold, defenders either sit still (easy to drive around) or jump too early (easy to fake). The goal is controlled pressure: close enough that they feel rushed, far enough that they can't easily get past you.

Shadow by drifting backwards while facing the ball, matching the opponent's speed. Cut off their angle toward the near post. When they commit to a move, challenge hard — commit fully. A half-hearted challenge is worse than none.

The tell that you're shadowing well: opponents start feeling like they have to rush their decision. If they're taking their time, you're too far back.`,
      "Platinum": `At Platinum you're shadowing, but opponents are starting to fake you out with body fakes and hesitations. The upgrade is reading intent rather than reaction to movement.

Watch their car's nose direction and speed changes — fakes usually involve a speed drop or an exaggerated turn that doesn't match their boost usage. When you see those signs, hold your shadow position instead of committing. Real committed moves are faster and more direct.

Also think about your angle. If you shadow from a central position, they can go either way. If you cut off one side (forcing them toward the weaker post or toward your teammate), you're making them solve a harder problem.`,
      "Diamond": `At Diamond, individual shadowing is mostly correct — the problem is uncoordinated pressure. You're shadowing but your teammates aren't positioned to cover the other angles, so opponents can still work around you with passes and redirects.

The upgrade is communicating your defensive position through where you stand. If you're shadowing on the right side, your second defender should be reading the left. If both of you are shadow-defending the same angle, you're both technically correct but collectively leaving a gap.`,
      "Champion": `At Champion, shadowing is automatic. The refinement is using shadow positioning as a bait — holding back slightly to invite the opponent to commit, then punishing the commit aggressively. The timing window is small, but reading when an opponent is "about to go" versus "still considering" is a legitimate skill difference at this level.`,
      "Grand Champion": `At GC, shadow defending is a team system, not individual positioning. Coordinated pressure — where one player shadows and the other creates a steal threat from the second position — is what makes the defense hard to crack. Reading when to shift from shadow to aggressive challenge, and communicating that switch without chat, is a mark of this rank.`,
      "Supersonic Legend": `At SSL, defensive reads happen before the opponent has decided what they're doing. Shadow defenders at this level are already adjusting to the most likely play before it's been committed to. The defensive skill here is mostly about team synchronization and reading opponent habits in real time.`
    }
  },
  {
    id: "kickoffs",
    title: "Kickoff Strategies",
    summary: "What to do in the first two seconds of every play.",
    priorityRanks: ["Bronze", "Silver", "Gold"],
    content: `Every play starts with a kickoff. In 3v3, the player closest to the ball goes. The second player holds mid-field to follow up a win or contest a loss. The third player stays back as safety.

The most reliable kickoff: drive straight at full speed and hit the ball to the side toward your opponent's net. Fast, direct contact beats a slow fancy approach at most ranks.`,
    rankContent: {
      "Bronze": `Kickoffs are simple at Bronze: go fast, hit the ball hard. The player closest to center goes for the kickoff. The other two should not both rush — one holds mid, one stays back near your own net.

The biggest mistake at Bronze is everyone going for the kickoff at the same time. If all three of you rush, you leave your net wide open. Even if you win the kickoff, the follow-up is chaos.

What to actually do: drive straight at the ball and hit it toward the corner of the opponent's side. Don't try to control it or aim for net — just make solid, fast, hard contact. Speed wins kickoffs at this level.`,
      "Silver": `At Silver, the kickoff positions matter more than the technique. Three roles every kickoff: one person goes for the ball (the closest to center), one holds mid to follow up, one stays back as safety. If you're not the one going, don't chase forward — hold your role.

For the kickoff itself: go straight at full speed. Don't try a diagonal kickoff or anything fancy unless you've practiced it hundreds of times. A direct, fast hit that ties up the opponent is better than a missed trick shot that gives them a free open net.

After the kickoff: the result tells you what to do. If your team won it cleanly, press. If it's a 50/50, the mid player takes the follow-up. If you lost, the back player is your defense.`,
      "Gold": `At Gold, kickoff technique starts mattering. The most reliable approach: drive straight at the ball, boost the whole way, and hit it toward the side of the field — not straight at net. This pops the ball at an angle that's harder for the opponent to redirect.

What not to do: go for a diagonal or flip kickoff before you've practiced it extensively in free play. A missed diagonal leaves you in the wrong position and gives the opponent a clear shot.

Kickoff roles matter too: the second player should hold mid (ready to contest the follow-up), not push up. If the kickoff is lost, someone has to be back.`,
      "Platinum": `At Platinum, the kickoff technique is mostly sorted — what matters now is the read after the kickoff. Kickoffs at this level are often won by neither team cleanly, ending in a contested ball somewhere in mid-field. Your second player's position determines whether you come out ahead.

Work on reading the kickoff result: if your teammate is going to win it cleanly, push. If it's a 50/50, challenge with your second player. If you're losing it, the back player holds the line. Most Platinum players push forward on every kickoff regardless — the ones who read and react correctly consistently come out with possession.`,
      "Diamond": `At Diamond, kickoffs are tactical. Players at this level recognize and react to different kickoff types — diagonal, speed flip, neutral. What matters is your read: if the opponent goes for a diagonal, you know the ball will go to a specific side; you can start positioning for that before they even hit it.

Speed flip kickoffs are common here. If you don't have a consistent speed flip, a controlled straight kickoff with a reliable neutral is still winning — consistency beats an inconsistent trick that sometimes loses you position.`,
      "Champion": `At Champion, kickoffs are fully developed. The edge here is baiting — deliberately going for a kickoff approach that invites the opponent to try a specific kickoff type, then reading and countering it. This is subtle but real at this level.

Also: kickoff aftermath. Most goals that come from kickoffs are won in the 2-3 touches after the initial contact, not the kickoff itself. Your positioning after the kickoff hit — reading where to be for the follow-up — is what converts kickoff advantages into goals.`,
      "Grand Champion": `At GC, kickoffs are fully practiced and rarely lost on technique alone. The difference is macro — how your team uses kickoff spacing to set up the first possession. Coordinated kickoff strategies (one player kicks, two pre-position for specific follow-up scenarios) are what high-level kickoffs look like.`,
      "Supersonic Legend": `At SSL, every kickoff is read and responded to at full speed. The margins are in the post-kickoff read — recognizing within the first 0.2 seconds of contact where the ball is going and being in position before it gets there. The kickoff itself is almost an afterthought; the real contest is the first three touches.`
    }
  },
  {
    id: "demos",
    title: "Demos (Demolitions)",
    summary: "When running opponents over helps — and when it backfires.",
    priorityRanks: ["Platinum", "Diamond", "Champion"],
    content: `A demo happens when you hit an opponent at supersonic speed — they respawn a few seconds later, removing them temporarily.

Demos are useful when you're already making a legitimate play and they happen to be in your path. They're not useful when they require you to leave your position — the detour almost always costs more than the demo gains.`,
    rankContent: {
      "Bronze": `Avoid going out of your way for demos at Bronze. Here's why: to get a demo, you need to hit someone at supersonic speed. If they move even slightly, you miss and you're now completely out of position. Your own net is exposed, and the ball is loose.

At your level, staying in position and hitting the ball cleanly is worth far more than removing one opponent for a few seconds. Save demos for when they happen naturally — you're already going supersonic toward the ball and they're in your path.`,
      "Silver": `Demos start being occasionally useful at Silver, but only when they're on your way to something you were already doing. Don't chase an opponent across the field for a demo — the commitment leaves your team a player down for the entire approach, which is often worse than the demo is worth.

When a demo is worth taking: you're driving toward the ball at supersonic speed and an opponent is directly in your path. At that point, you get the demo and make the play simultaneously. That's the correct demo.`,
      "Gold": `At Gold, the best demo opportunity is incidental — you're driving through a 50/50 at supersonic speed and get the demo while making a legitimate play. Going specifically for a demo on most plays costs more than it gains.

When demos are worth it: the opponent is the only player who can challenge your clear, you're driving past them anyway, or they're about to score and you can reach them in time. When they're not: if you're the last defender, if getting the demo puts you out of rotation, or if you might miss (now you're out of position for nothing).`,
      "Platinum": `At Platinum, demos become a legitimate strategic tool. Specifically: targeting the opponent's strongest player when your team has a clear possession advantage. Taking out their best player for 3-4 seconds during a sustained attack effectively makes it a 3v2.

Start recognizing demo opportunities that are actually worth the route deviation: when you have full boost, the ball is settled with your teammate, and you can reach an isolated opponent with minimal position loss. These are calculated, not reactive.`,
      "Diamond": `At Diamond, demos are part of the game plan. Well-timed demos create openings that good opponents would otherwise close. The upgrade at this level is coordinating demos with your teammate — one person demos while the other attacks the now-short-handed defense.

Also: watch for revenge demos. Going for a demo because you're frustrated is always wrong. Only demo when you've identified a genuine advantage it creates.`,
      "Champion": `At Champion, demos are a regular strategic tool. Opponent reading matters: knowing who on the other team is dangerous and timing a demo to remove them at a critical moment (before a kickoff, during a sustained attack, when they're about to make a save) is a genuine skill.

The discipline: know your demo's expected value. If getting the demo puts you out of position and your team doesn't capitalize, it was a net negative. Track your results.`,
      "Grand Champion": `At GC, demos are fully integrated into the offense. Demo setups — where one player creates a situation that baits an opponent into a predictable position so the second player can demo them — are a deliberate part of attacking. Coordinated demolitions with immediate follow-up are expected at this level.`,
      "Supersonic Legend": `At SSL, demos are surgical. The difference is reading when an opponent is about to make a play that can't be contested conventionally, and using a demo as the correct solution. Demo decisions happen at full speed and are almost always correct or almost never taken.`
    }
  },
  {
    id: "aerials",
    title: "Aerial Basics",
    summary: "When going for aerials helps you, and when it hurts your team.",
    priorityRanks: ["Gold", "Platinum", "Diamond", "Champion"],
    content: `Aerials are exciting but the decision of when to go matters as much as execution. Go for an aerial when the ball is clearly going over everyone's head, you have boost, you're the nearest player, and missing won't leave your net exposed.

Don't go when you're low on boost, a teammate is better positioned, or a jump shot handles it. A missed aerial you didn't need is worse than not going at all.`,
    rankContent: {
      "Bronze": `Don't practice aerials yet. This isn't discouraging — it's practical advice that will save you games.

At Bronze, attempting aerials almost always results in: missing the ball, landing awkwardly, running out of boost mid-air, or all three. Meanwhile your team is down a player and the ball is loose. The time you spend practicing aerials in free play is better spent on car control, boost habits, and not ball chasing.

First master: hitting the ball where you want it on the ground, collecting boost without losing position, and rotating. Aerials will come naturally after those are solid.`,
      "Silver": `At Silver, limit yourself to low aerials only — balls that are 1-2 car lengths off the ground, where you can jump, tilt your car, and make contact without using much boost. These are worth going for.

Full aerials (boosting high into the air after the ball) are still a net negative at this level unless you've put in significant free play practice. The ball moves faster than you expect, your air car control isn't calibrated yet, and the misses hurt more than the hits help.

A reliable jump shot — where you jump, wait for the ball, and hit it cleanly — covers 90% of the "aerial" situations you'll face at Silver. Practice that first.`,
      "Gold": `At Gold, aerials are often the cause of big mistakes. Go for one when the ball is clearly going over everyone's head, you have full boost, you're the nearest player, and missing won't leave your net exposed. All four conditions.

Don't go when you're low on boost, a teammate is better positioned, the ball is only slightly in the air (use a jump shot), or missing means a free counter for the opponent.

The honest truth: most Gold players practice aerials more than anything else and it doesn't help their rank. Game sense and rotation improvements will move you up faster. An aerial you didn't need to take that you miss is worse than not going at all.`,
      "Platinum": `At Platinum, aerials start paying off if you've been putting time into them. The key condition: consistency. If you can hit a full aerial 7 out of 10 times in free play, it's a tool you can use in games. If it's 4 out of 10, it's still hurting your team more than helping.

The decision framework: is this a ball that a ground or jump shot can't handle? If yes, aerial. If a simpler option works, use the simpler option. The players who climb fastest at Platinum are the ones who stopped attempting aerials they couldn't consistently execute and focused on clean ground play while practicing aerials separately.`,
      "Diamond": `At Diamond, aerials are expected in your toolkit. The question isn't whether you can aerial — it's when you choose not to. Some Diamond players go aerial on every ball that's in the air, which leads to misses and rotation gaps.

The upgrade: reading when a ground play or jump shot is actually higher percentage than an aerial, even when you could aerial it. A controlled dribble or a two-touch from the wall is often better than an aerial that could be saved. Pick your aerials based on expected success rate, not because the ball is in the air.`,
      "Champion": `At Champion, aerial execution is consistent and the decisions are mostly correct. The refinement is air dribbles, ceiling shots, and redirects — not just getting to the ball in the air, but controlling what happens after you get there.

The next skill gap: aerial defense. Reading and challenging opponent aerials, redirecting air balls to yourself, and making correct defensive aerial decisions under pressure are what separate Champion players.`,
      "Grand Champion": `At GC, aerials are fully integrated — the distinction is between aerials that maintain pressure and aerials that give possession away. Every aerial has an expected value: how likely is a positive outcome, and what happens if it fails? Players at GC are making those calculations quickly and correctly.

The refinement: fast aerials and the ability to adjust mid-air to account for opponent pressure or ball movement. Static aerial reads are mostly automatic; dynamic mid-air adjustment is the edge.`,
      "Supersonic Legend": `At SSL, aerials are executed at the limit of what the physics engine allows. The remaining margins are in air dribble control, ceiling shot consistency, and the ability to make a second adjustment mid-air when the first read turns out to be wrong. These are refinements on an already-elite skill.`
    }
  },
  {
    id: "game_sense",
    title: "Mechanical Skill vs. Game Sense",
    summary: "Why understanding the game matters more than mechanics at your rank.",
    priorityRanks: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
    content: `Mechanical skill is execution: air dribbles, flicks, fancy touches. Game sense is knowing what to do and when: when to challenge, when to hold, who takes the ball, where to be.

At most ranks, players lose not because their mechanics failed — but because they made wrong decisions. Improving your decision-making raises your rank faster than improving your mechanics, because you execute correct decisions with the mechanics you already have.`,
    rankContent: {
      "Bronze": `At Bronze, almost every loss comes from a decision, not a mechanical failure. The ball was right there and you went for it at the wrong time. You were too far forward when the opponent cleared it. You challenged when you should have waited.

The most important thing you can do to improve right now is not practice mechanics — it's slow down your decision-making. Before challenging, ask: "Is it my turn? Will I definitely win this?" Before going forward, ask: "Is someone back?"

You don't need fancy mechanics to beat Bronze players. You need to be in the right position, not chase the ball when it's not your turn, and make solid contact when you do go. Focus on decisions first. Mechanics will improve naturally through play.`,
      "Silver": `At Silver, you have enough mechanics to execute most plays — the problem is deciding which play to make. You take shots from bad positions because you feel pressure. You challenge when you should shadow. You push because the ball is near the opponent's net and it feels like an opportunity.

The exercise that helps the most: after each goal scored against you, identify the decision that caused it. Not the mechanic — the decision. Usually you'll find it was 2-3 plays before the actual goal. That's where game sense lives.

Spend 5 minutes after every session watching one of your losses. Pause when the goal goes in and rewind to find the moment where the right decision would have prevented it.`,
      "Gold": `At Gold, players lose because they make wrong decisions — not because their mechanics failed. Going for a 50/50 they can't win, chasing when they should rotate, shooting from a position with no realistic chance.

The counterintuitive truth: improving your game sense will raise your rank faster than improving mechanics at Gold. You don't need to air dribble to beat Gold players. You need to rotate correctly, not ball chase, and not overcommit on plays you can't win.

The practical way to build game sense: watch your own replays. Don't watch for cool plays — find where you were when the goal went in against you and ask: "Where should I have been?"`,
      "Platinum": `At Platinum, decisions are faster but pattern recognition is the gap. Your opponents are starting to be readable — they have tendencies, preferred moves, and habits. The players who climb fastest are the ones who start noticing and adapting to these patterns mid-game.

When an opponent keeps going left on 50/50s, start cutting off left. When they over-commit to the ball, shadow and let them expose themselves. This is game sense applied in real time, not in hindsight.

Also start reading your own tendencies: what situations do you consistently make the wrong call in? Identifying your own patterns is the fastest path to fixing them.`,
      "Diamond": `At Diamond, your mechanics are developed enough that most losses come from a timing or reading error, not an execution failure. The upgrade: speed of decision. The best Diamond players make the correct decision not 0.5 seconds after the play develops, but as it's developing.

To improve this: watch Diamond-level replays (Rocket League has a built-in replay system) and practice narrating what you would do before the player does it. Building a mental model of likely outcomes trains you to read situations faster in your own games.`,
      "Champion": `At Champion, decisions are fast and mostly correct. The edge is consistency — making the right call 95% of the time versus 80% of the time. Under pressure, with low boost, in a chaotic play, do you still make the correct read?

The work: identify the 20% of situations where your decision-making degrades. Usually these are high-stress moments (close game, late in the match, on a loss streak). Mental discipline and slowing down in those specific moments is a real skill.`,
      "Grand Champion": `At GC, game sense is the primary separator between players. Mechanics are mostly equivalent — what varies is reading the game. Pre-reading plays before they materialize, exploiting the opponent's mental fatigue, and making adjustments based on how the opponent is playing this specific game (not just general tendencies) are what make GC players different.`,
      "Supersonic Legend": `At SSL, game sense is operating at the limit of human reaction time. Reads are pre-cognitive — you're in position before you've consciously processed why. The refinement is meta-game: reading opponent patterns across a full series, adapting your team's strategy mid-game, and knowing when to play safe versus when to take risks based on score, time, and momentum.`
    }
  }
];

// YouTube videos linked in each concept card.
// Verified URLs from SunlessKhan, Lethamyr, Kevpert, and Wayton Pilkin.
const CONCEPT_VIDEOS = {
  "rotations": [
    { title: "Rotating and Positioning (RL 101)",       url: "https://www.youtube.com/watch?v=WNOmNhUAErU", creator: "SunlessKhan"  },
    { title: "Most Common Rotation Mistakes (WYSARL)",  url: "https://www.youtube.com/watch?v=_nXMNua2ZXE", creator: "SunlessKhan"  }
  ],
  "boost_management": [
    { title: "Boost and Going Supersonic (RL 101)",     url: "https://www.youtube.com/watch?v=-k_8yyqIKLA", creator: "SunlessKhan"  },
    { title: "How to Master Boost Management",          url: "https://www.youtube.com/watch?v=TSgl1Gx2eaM", creator: "Lethamyr"     }
  ],
  "positioning": [
    { title: "Rotating and Positioning (RL 101)",       url: "https://www.youtube.com/watch?v=WNOmNhUAErU", creator: "SunlessKhan"  },
    { title: "Boost Management & Positioning Ep. 1",    url: "https://www.youtube.com/watch?v=edWi_ATGh9A", creator: "Kevpert"      }
  ],
  "shadowing": [
    { title: "The Best Defense in Rocket League (WYSARL)", url: "https://www.youtube.com/watch?v=2aZA-NCRRgI", creator: "SunlessKhan" }
  ],
  "kickoffs": [
    { title: "Rocket League Academy — Kickoff",         url: "https://www.youtube.com/watch?v=nF68ltp01o0", creator: "RL ft. SunlessKhan" },
    { title: "The Riskiest Kickoff Strategies",         url: "https://www.youtube.com/watch?v=VJyu5wfD8cI", creator: "Wayton Pilkin" }
  ],
  "demos": [
    { title: "Rocket League Academy — Demolitions",     url: "https://www.youtube.com/watch?v=Hes9ybbTiOg", creator: "RL ft. SunlessKhan" },
    { title: "Why You Suck at Demos (WYSARL)",          url: "https://www.youtube.com/watch?v=GOMMXrdZrTQ", creator: "SunlessKhan"  }
  ],
  "aerials": [
    { title: "Aerial Car Control Tutorial",             url: "https://www.youtube.com/watch?v=3YtxID9OgRQ", creator: "Kevpert"      },
    { title: "How to Aerial — Beginner to Advanced",    url: "https://www.youtube.com/watch?v=R3k9O-k_XC0", creator: "Wayton Pilkin" }
  ],
  "game_sense": [
    { title: "Why You Suck — Ball Chasing (WYSARL Ep.1)", url: "https://www.youtube.com/watch?v=Vu_DmCLVKgQ", creator: "SunlessKhan" },
    { title: "The Best Way to Learn Game Sense",        url: "https://www.youtube.com/watch?v=OrrQQEHJ9Lc", creator: "Lethamyr"     }
  ]
};


// Coaching tips — one array per pattern. A random entry is chosen each time
// so the same alert doesn't repeat the same text on every firing.
const FALLBACK_TIPS = {
  mvp_no_wins: [
    "You're clearly the most impactful player on your team individually, but wins come from the team working together. When you win a 50/50, instead of following the ball, immediately rotate behind your teammates — let them attack while you hold position. Your individual skill is there; now use it to enable your teammates instead of bypassing them.",
    "High MVP rate with a low win rate almost always means you're carrying the ball rather than carrying the team. After every goal you score, get back in rotation immediately instead of chasing the next play. The goal is to set your teammate up for the next touch, not to score again yourself.",
    "Being MVP means you're the best individual player in the lobby — but Rocket League is won by teams, not individuals. Focus on the 2-3 games in your recent run where a teammate had a clean look and you cut in front of them. That's the habit to break."
  ],
  saves_declining: [
    "Your save numbers dropping usually means you're pushing too far forward and not getting back in time when it turns over. After every offensive touch, check where your teammates are before committing to a second challenge — if they're already forward, you need to be the one rotating back to net.",
    "Fewer saves often means the ball is getting behind you before you can read it. Try holding a slightly deeper position when your team doesn't have clear possession — it gives you more time to react when a turnover happens.",
    "A drop in saves can mean opponents are getting better looks at net because you're out of position on the transition. Pay attention to the moment possession switches: that's when you need to be retreating, not still committing to the offensive play."
  ],
  session_fatigue: [
    "Your results are noticeably worse in the second half of your sessions — this is decision fatigue, not mechanical failure. Your mechanics stay sharp, but your reads get half a second slower and that compounds over games. A 10-minute break now is worth more than two more games.",
    "You're not getting worse mechanically as sessions go on — you're making slightly worse decisions, and those decisions have a bigger impact than any mechanical mistake. Set a 90-minute limit for your sessions and see if your results stabilize.",
    "The drop in your second half is consistent enough that it's a real pattern. Try capping sessions at 6-8 games, or building in a break after 4. Grinding through the dip almost never recovers it — fresh sessions outperform extended ones."
  ],
  low_shot_accuracy: [
    "You're getting shots off regularly but not converting — most of these are probably rushed from too far out or at a bad angle. Before shooting, ask: is this a realistic chance, or am I just shooting because I have the ball? A touch to get a better angle before shooting wins more games than quick volume shots.",
    "Shot accuracy under 25% at your rate of attempts means you're taking a lot of low-percentage looks. Try passing up shots where you're off-balance or at a narrow angle, even if they feel takeable. Waiting for a set, central look will immediately improve your conversion rate.",
    "High shots, low conversion usually means you're taking shots the keeper or a defender can easily handle. The best shot isn't the fastest one — it's the one taken when you're set, close, and at an angle the goalie has to move for. Slow down the approach by one touch."
  ],
  ball_chasing: [
    "Your assist numbers suggest you're spending most of your time chasing the ball rather than staying in your position. The next time a teammate has the ball, physically stop and hold your lane — let them go, and be ready to receive if they need to pass or to follow up if they miss. You don't need to be touching the ball to be helping.",
    "Low assists usually means you're going for the ball every time it's near you, even when it's not your turn. Try this: after every touch you take, immediately look at where your nearest teammate is and move away from them. If they're going for it, you shouldn't be.",
    "The best players at rotation aren't the ones who chase the most — they're the ones who know when to stop. When a teammate is better positioned than you, pull out completely. Your assist rate will climb when you're consistently available in space rather than competing for every touch."
  ],
  cold_start: [
    "You're consistently losing your first game of sessions — this is a warmup problem, not a skill problem. Your mechanics and reads take 10-15 minutes to fully activate, and right now your first ranked game is also your warmup. Spend 5 minutes in free play before queueing and watch the cold start pattern break.",
    "First-game losses in most of your recent sessions suggest your calibration is off at the start. Your brain is still getting into RL mode when the first game starts. Even 3-5 minutes of training packs before queueing gives your reads time to activate before the first real game.",
    "The first game of a session is always the hardest — your positioning instincts aren't fully online yet, and opponents who've already been playing have a real edge. One training pack or 5 minutes of free play before ranked is the cheapest fix for your most consistent losing pattern."
  ],
  recent_slump: [
    "You're in a slump relative to your historical level — which means you're capable of better, and something specific has slipped. Watch one of your recent losses back and look for the moment before the goal went in. It's almost always a decision (a challenge taken, a position held) rather than a mechanic that failed.",
    "Slumps at your level usually have a single root cause that repeats across games. The fastest way to identify it is to replay 2-3 of your recent losses and look specifically for what's different compared to games you won. It's usually one recurring mistake, not many.",
    "Your recent numbers are below your own baseline, which means this isn't a skill regression — it's a temporary pattern. The most common cause is a habit that's slipped (over-challenging, not rotating out, taking poor shots). Play your next 3 games focusing only on fundamentals and see if the numbers recover."
  ],
  goals_declining: [
    "Scoring less than before usually means you're taking shots from lower-percentage positions. The shots that go in at your level come from being close, set, and at a good angle — not from being the first to reach the ball. Wait for a cleaner look even when it means passing up a rushed shot.",
    "A drop in goals often means you're not making the run after your first touch. After every touch that doesn't score, immediately look for where the ball will be in 2 seconds and start moving there. Goals often come from arriving at the right spot rather than being the first to challenge.",
    "Goal rate dropping while shots stay the same means the quality of your chances has dropped. Look at where you're shooting from: if most attempts are from outside or at a narrow angle, you're settling for the first opportunity instead of manufacturing a better one."
  ],
  long_session_tilt: [
    "You're deep into a session and the last three went badly — the session is over. Not because you can't play, but because the odds of recovering from this specific state are genuinely low and queueing again is more likely to extend the run than end it. Close the game. Come back fresh.",
    "Late-session loss streaks almost never reverse through persistence. The decisions that felt fine 6 games ago are now slightly off because your brain is tired, and tired decisions compound into more losses. The best play you can make right now is to stop.",
    "Eight-plus games deep with a 3-loss finish is a clear signal, not bad luck. Take a break — even if you feel fine mechanically, your decision-making is compromised by fatigue in ways you can't feel from the inside. Come back in 24 hours."
  ],
  losing_to_lower: [
    "Dropping games to lower-ranked opponents is almost always a confidence/focus problem, not a skill problem. You go in expecting to win, and that expectation makes you play looser — you take risks you wouldn't take against stronger opponents, and those risks get punished. Treat every lobby with the same focus and discipline regardless of rank.",
    "Lower-ranked opponents beat you when you underestimate them. You start taking lower-percentage challenges, skipping rotations because it'll be fine, and the small errors add up. There's no such thing as an easy game — approach every match the same way.",
    "When you lose to lower-ranked players, it's rarely because they outplayed you mechanically — it's because you played down to the level of the lobby. The fix is simple but hard: play your best game regardless of who's on the other side."
  ],
  punching_up: [
    "Winning more than half your games against higher-ranked opponents is a clear sign your game sense is ahead of your mechanics. You're reading plays correctly and making good decisions — now clean up the execution. The mechanic most likely to hold you back next is shot accuracy from good positions.",
    "Your results against stronger opponents suggest your rank will keep rising. The main thing that separates your current level from the next is mechanical consistency under pressure — not new skills, just executing the ones you have more reliably when games are tight.",
    "Beating higher-ranked opponents consistently means your game sense is genuinely above your MMR. Focus now on the mechanical skills that convert your good reads into goals — your positioning is creating the chances, your execution just needs to catch up."
  ],
  solo_carry: [
    "You're scoring a lot but not setting teammates up — this means you're often in the same space as the ball when a teammate could be there, cutting off their chance to touch it. After you score, get back in rotation immediately instead of pressing. More assists doesn't mean fewer goals; it means better results.",
    "High goals and very low assists is the signature of someone playing like they're in a 1v1. In 2v2, the moments where you pull back and let your teammate attack often create better opportunities than taking every touch yourself. Try actively looking for your teammate before committing to a touch.",
    "The gap between your goals and assists suggests you're not creating chances for your duo — you're creating chances for yourself and taking them. When you get the ball in a good position, look for your teammate's run before shooting. You'll find you score just as much, and win more."
  ],
  no_saves: [
    "Very few saves over 10 games usually means one of two things: either your teammates are handling all the defense (great), or you're consistently too far forward when attacks come and can't get back in time. If you're losing games where opponents score unchallenged, you need to hold deeper.",
    "Not making saves doesn't necessarily mean you're playing badly, but if you're losing games where opponents are scoring without pressure, nobody is home when attacks happen. Make sure at least one player is in a position to contest shots when possession turns over.",
    "Low save numbers paired with losses suggests opponents are getting clean shots without challenge. Before every opponent attack, ask: if my teammate misses this clear, can I get to the resulting shot? If the answer is no, you're too far forward."
  ],
  accuracy_declining: [
    "Your shot accuracy has dropped recently, which usually means you're taking the first opportunity instead of the best one. Slow down by one touch on plays where you have time — use it to reposition for a better angle before shooting. The extra half-second is worth more than the rushed look.",
    "When shot accuracy falls, the fix is almost never to aim better — it's to shoot from better positions. Try passing up shots where you're off-balance or at a narrow angle, even if they feel takeable. Waiting for a set, central look will immediately improve your conversion rate.",
    "Your recent shot accuracy is notably lower than before. Most of these misses are probably from too far out, too wide, or while moving in the wrong direction. One rule: if you'd have to aim perfectly for the shot to go in, don't take it. Only shoot when your position gives you margin for error."
  ],
  win_streak: [
    "You're on a real win streak — your reads and rotation are clicking right now. The one thing to watch: streaks end when you start playing to protect them instead of playing to win. Keep doing exactly what got you here and don't adjust anything based on the streak number.",
    "Strong win streak. Stay locked in — don't let the streak make you overconfident or cautious. Both reactions break streaks faster than anything an opponent can do. Just keep playing your game.",
    "You're playing some of your best recent Rocket League. The streak is a result of good decisions, not luck — trust the process and keep rotating correctly. The only way to end it early is to start thinking about it too much."
  ],
  defensive_anchor: [
    "You're making a lot of saves — which often means your teammates are leaving you more exposed than they should. If your saves are high and you're still losing, your team might be over-committing while you cover for them. Consider communicating your position so they know when they can push.",
    "High save rate with losses means you're doing your job defensively but the offensive end isn't converting. This pattern sometimes means you're staying back too conservatively when your team has possession — try pushing slightly higher when your teammate has a clear scoring chance.",
    "Making lots of saves while losing tells a specific story: opponents are getting enough high-quality looks to score despite your defense. Either your team is conceding too many attacks, or your offensive output isn't enough to offset them. Try being more aggressive on kickoffs and early possession."
  ],
  no_contribution: [
    "Very few goals and assists combined over 10 games means you're often in the wrong place at the wrong time — not close enough to shoot when opportunities open up, not in position to support when teammates attack. Focus less on where the ball is and more on where it will be in 2 seconds.",
    "Low overall contribution usually means you're spending too much time recovering from being out of position. Every time you're driving back to your own half, that's time you can't be contributing offensively. Work on your rotation so you're always recovered and available before the next play develops.",
    "When goals and assists are both low, the cause is almost always positioning — specifically, not being in the right place when chances open up. After every touch, ask yourself: where will I be most useful in the next 3 seconds? Shadowing the play from a central, supporting position usually puts you in the right place."
  ]
};

// Returns a random tip string for the given pattern ID.
function getTip(patternId) {
  var tips = FALLBACK_TIPS[patternId];
  if (!tips) return "Keep an eye on patterns in your game and take breaks between sessions.";
  if (Array.isArray(tips)) return tips[Math.floor(Math.random() * tips.length)];
  return tips;
}


// Training packs prescribed for each detected pattern.
// "code" is a Custom Training code (enter in Training → Custom Training → enter code).
// "workshop" means it requires BakkesMod — find it in the Workshop browser.
const TRAINING_PACKS = {
  mvp_no_wins: [
    {
      name:   "Wall Shot Mastery",
      trains: "Converting plays from the wall — the shots you win but can't finish",
      code:   "8989-46CE-AE49-0561"
    },
    {
      name:   "Power Shots — Gold",
      trains: "Quick, decisive shots after winning a 50/50",
      code:   "3B69-B8C9-D4B2-A7E3"
    },
    {
      name:   "Rings Course",
      trains: "Field awareness & aerial control",
      code:   "BakkesMod Workshop → search \"Rings by Lethamyr\""
    }
  ],
  saves_declining: [
    {
      name:   "Protein Goalie",
      trains: "Reading shot angles from deep in net",
      code:   "776F-E2BB-2993-78D7"
    },
    {
      name:   "Recovery Training",
      trains: "Getting back into position after a first save",
      code:   "DA42-75B1-0469-8A0F"
    },
    {
      name:   "[Why You Suck] Shadow Defense",
      trains: "Shadow defending and depth awareness",
      code:   "5CCE-FB29-7B05-A0B1"
    }
  ],
  session_fatigue: [
    {
      name:   "Ground Shots — Gold",
      trains: "Consistent ground mechanics that hold up late in long sessions",
      code:   "6EB1-79B2-33B8-681C"
    },
    {
      name:   "Dribbling (Wayprotein)",
      trains: "Ball control — the first mechanic to slip when you're mentally tired",
      code:   "3CD7-85FA-811B-BC25"
    }
  ],
  low_shot_accuracy: [
    {
      name:   "Power Shots — Gold",
      trains: "Clean, decisive contact from controlled positions",
      code:   "3B69-B8C9-D4B2-A7E3"
    },
    {
      name:   "Wall Shot Mastery",
      trains: "Finishing from awkward angles — forces better contact habits",
      code:   "8989-46CE-AE49-0561"
    },
    {
      name:   "Patcher's Shots Consistency",
      trains: "Hitting the net from various ground positions",
      code:   "6CF3-4C0B-32B4-1AC7"
    }
  ],
  ball_chasing: [
    {
      name:   "[Why You Suck] Shadow Defense",
      trains: "Reading the play from depth instead of rushing the ball",
      code:   "5CCE-FB29-7B05-A0B1"
    },
    {
      name:   "Protein Goalie",
      trains: "Being useful in net — the position you should be in when you're not on the ball",
      code:   "776F-E2BB-2993-78D7"
    }
  ],
  cold_start: [
    {
      name:   "Ground Shots — Gold",
      trains: "Simple, repeatable shots to calibrate your aim before ranked",
      code:   "6EB1-79B2-33B8-681C"
    },
    {
      name:   "Dribbling (Wayprotein)",
      trains: "Ball feel warmup — gets your car control active before the first game",
      code:   "3CD7-85FA-811B-BC25"
    }
  ],
  recent_slump: [
    {
      name:   "Ground Shots — Gold",
      trains: "Back to basics — rebuild consistent mechanics from the ground up",
      code:   "6EB1-79B2-33B8-681C"
    },
    {
      name:   "Protein Goalie",
      trains: "Shore up the defensive side while you work through the slump",
      code:   "776F-E2BB-2993-78D7"
    }
  ],
  goals_declining: [
    {
      name:   "Power Shots — Gold",
      trains: "Waiting for a controlled look and finishing it cleanly",
      code:   "3B69-B8C9-D4B2-A7E3"
    },
    {
      name:   "Wall Shot Mastery",
      trains: "Finishing plays off the wall where positioning is imperfect",
      code:   "8989-46CE-AE49-0561"
    }
  ],
  long_session_tilt: [],
  losing_to_lower: [
    {
      name:   "[Why You Suck] Shadow Defense",
      trains: "Controlled pressure — the discipline to not overcommit against weaker opponents",
      code:   "5CCE-FB29-7B05-A0B1"
    },
    {
      name:   "Protein Goalie",
      trains: "Staying solid in net — stops careless concedes from overaggression",
      code:   "776F-E2BB-2993-78D7"
    }
  ],
  punching_up: [
    {
      name:   "Power Shots — Gold",
      trains: "Converting the reads your game sense earns you",
      code:   "3B69-B8C9-D4B2-A7E3"
    },
    {
      name:   "Wall Shot Mastery",
      trains: "Finishing in the tight windows that open against stronger opponents",
      code:   "8989-46CE-AE49-0561"
    }
  ],
  solo_carry: [
    {
      name:   "Wall Shot Mastery",
      trains: "Finishing from the wall — but let your teammate set it up for you",
      code:   "8989-46CE-AE49-0561"
    },
    {
      name:   "Rings Course",
      trains: "Field awareness — knowing where your teammate is as you move",
      code:   "BakkesMod Workshop → search \"Rings by Lethamyr\""
    }
  ],
  no_saves: [
    {
      name:   "Protein Goalie",
      trains: "Reading shot angles and getting back to net in time",
      code:   "776F-E2BB-2993-78D7"
    },
    {
      name:   "Recovery Training",
      trains: "Getting back into defensive position after being caught forward",
      code:   "DA42-75B1-0469-8A0F"
    }
  ],
  accuracy_declining: [
    {
      name:   "Power Shots — Gold",
      trains: "Shooting from set, controlled positions instead of rushed looks",
      code:   "3B69-B8C9-D4B2-A7E3"
    },
    {
      name:   "Patcher's Shots Consistency",
      trains: "Hitting the net cleanly from various ground positions",
      code:   "6CF3-4C0B-32B4-1AC7"
    }
  ],
  win_streak: [],
  defensive_anchor: [
    {
      name:   "Dribbling (Wayprotein)",
      trains: "Ball control — being dangerous when you do push forward",
      code:   "3CD7-85FA-811B-BC25"
    },
    {
      name:   "Power Shots — Gold",
      trains: "Converting the few offensive chances you take into goals",
      code:   "3B69-B8C9-D4B2-A7E3"
    }
  ],
  no_contribution: [
    {
      name:   "Ground Shots — Gold",
      trains: "Simple, repeatable shots so you convert when you do get a chance",
      code:   "6EB1-79B2-33B8-681C"
    },
    {
      name:   "Dribbling (Wayprotein)",
      trains: "Ball control — arriving at the ball in a position to do something useful",
      code:   "3CD7-85FA-811B-BC25"
    }
  ]
};


// ============================================================
// STATE
// Variables that live in memory while the page is open.
// ============================================================

let games         = [];   // all individual game records
let sessions      = [];   // completed session records (each ends with a final MMR)
let activeSession = null; // the current in-progress session, or null if none
let activeMode    = "3v3"; // the currently selected game mode tab

let inSessionChart    = null; // Chart.js object for the in-session MMR chart
let longTermChart     = null; // Chart.js object for the long-term MMR chart
let sessionHoverChart = null; // Chart.js object for the session card hover popup
let sessionHoverTimer = null; // delay timer before the hover popup appears

// Tilt warning state
let tiltDismissed = false;

// Coaching alert state
let coachingAlertActive       = false;
let gamesLoggedSinceLastAlert = 0;

// Capture daemon state
let lastCaptureTimestamp   = 0;
let lastCaptureWallTime    = 0;   // Date.now() of the last successful capture
let capturePollingInterval = null;

// Returns the stored Epic username, or empty string if not set.
function getCaptureUsername() {
  return localStorage.getItem("rl_capture_username") || "";
}

// Saves the username and syncs the input field value.
function setCaptureUsername(name) {
  localStorage.setItem("rl_capture_username", name.trim());
}


// ============================================================
// STORAGE — games
// ============================================================

function loadGames() {
  const raw = localStorage.getItem(STORAGE_KEY);
  var loaded = raw ? JSON.parse(raw) : [];
  var dirty = false;
  loaded.forEach(function(g) {
    if (!g.mode) { g.mode = "3v3"; dirty = true; }
    // Every win is an MVP — back-fill historical data
    if (g.result === "W" && g.mvp !== true) { g.mvp = true; dirty = true; }
    // Losses can never be MVP
    if (g.result === "L" && g.mvp === true) { g.mvp = false; dirty = true; }
  });
  if (dirty) localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
  return loaded;
}

function saveGames() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}


// ============================================================
// STORAGE — completed sessions
// ============================================================

function loadSessions() {
  const raw = localStorage.getItem(SESSIONS_KEY);
  var loaded = raw ? JSON.parse(raw) : [];
  loaded.forEach(function(s) { if (!s.mode) s.mode = "3v3"; });
  return loaded;
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
  if (!raw) return null;
  var session = JSON.parse(raw);
  if (session && !session.mode) session.mode = "3v3";
  return session;
}

function saveActiveSession() {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(activeSession));
}

function clearActiveSession() {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
}

// Returns games filtered to the currently selected mode tab.
function getModeGames() {
  return games.filter(function(g) { return g.mode === activeMode; });
}

// Returns completed sessions filtered to the currently selected mode tab.
function getModeSessions() {
  return sessions.filter(function(s) { return s.mode === activeMode; });
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

  if (!activeSession || activeSession.mode !== activeMode) {
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
  updateMiniWidget();
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
    startDate: new Date().toISOString().split("T")[0],
    mode:      activeMode
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
    mode:      activeSession.mode,
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
// If there's an active session in another mode, disables the start button.
function showStartSessionUI() {
  document.getElementById("start-session-card").style.display = "block";
  document.getElementById("log-section").style.display        = "none";
  stopCapturePolling();

  var notice   = document.getElementById("active-mode-notice");
  var startBtn = document.getElementById("start-session-btn");
  if (activeSession && activeSession.mode !== activeMode) {
    notice.textContent   = "Active " + activeSession.mode + " session running — end it first.";
    notice.style.display = "block";
    startBtn.disabled    = true;
  } else {
    notice.style.display = "none";
    startBtn.disabled    = false;
  }
}

// Hides the "Start Session" card and shows the log form.
function showActiveSessionUI() {
  document.getElementById("start-session-card").style.display = "none";
  document.getElementById("log-section").style.display        = "block";
  // Focus the MMR change field so the user can start typing immediately
  document.getElementById("mmr-change-input").focus();
  startCapturePolling();
}


// ============================================================
// CAPTURE DAEMON INTEGRATION
// Polls localhost:7891/latest (the Python capture daemon) every 2
// seconds while a session is active. When new data arrives, it
// pre-fills the log form. The user still hits Enter to confirm.
// ============================================================

const CAPTURE_PORT = 7891;

// Start polling — called automatically when a session begins.
function startCapturePolling() {
  if (capturePollingInterval) return; // already running
  capturePollingInterval = setInterval(pollCapture, 2000);
}

// Stop polling — called automatically when a session ends.
function stopCapturePolling() {
  if (capturePollingInterval) {
    clearInterval(capturePollingInterval);
    capturePollingInterval = null;
  }
  updateCaptureStatus("idle");
}

// Fetch the latest capture result from the daemon.
// Passes the username as a query param so the daemon knows whose row to find —
// the user sets it once in the browser; no config file editing required.
function pollCapture() {
  var username = getCaptureUsername();
  var url      = "http://localhost:" + CAPTURE_PORT + "/latest"
               + (username ? "?username=" + encodeURIComponent(username) : "");

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      updateCaptureStatus("connected");
      if (data.timestamp && data.timestamp !== lastCaptureTimestamp) {
        lastCaptureTimestamp = data.timestamp;
        applyCapture(data);
      }
    })
    .catch(function() {
      updateCaptureStatus("disconnected");
    });
}

// Pre-fill the log form with captured stats.
function applyCapture(data) {
  var mmrSign = data.mmr_delta >= 0 ? "+" : "";
  document.getElementById("mmr-change-input").value = mmrSign + data.mmr_delta;
  document.getElementById("goals-input").value       = data.goals;
  document.getElementById("assists-input").value     = data.assists;
  document.getElementById("saves-input").value       = data.saves;
  document.getElementById("shots-input").value       = data.shots;
  document.getElementById("mvp-checkbox").checked    = data.mvp;

  // Focus the MMR field so the user can review and hit Enter immediately
  var mmrInput = document.getElementById("mmr-change-input");
  if (mmrInput) mmrInput.focus();

  // Brief green flash on the log form
  var form = document.getElementById("log-form");
  form.classList.add("capture-flash");
  setTimeout(function() { form.classList.remove("capture-flash"); }, 1000);

  // Big MMR pop in the mini widget if it's open
  showMiniFlash(data.mmr_delta);

  lastCaptureWallTime = Date.now();
  updateCaptureStatus("connected");
}

// Show the full-widget MMR flash for 3 seconds, then fade back to normal.
var _miniFlashTimer = null;

function showMiniFlash(mmrDelta) {
  var flash  = document.getElementById("mini-flash");
  var mmrEl  = document.getElementById("mini-flash-mmr");
  var widget = document.getElementById("mini-widget");
  if (!flash || !mmrEl || !widget || !widget.classList.contains("visible")) return;

  if (_miniFlashTimer) clearTimeout(_miniFlashTimer);

  var isWin = mmrDelta > 0;
  mmrEl.textContent = (mmrDelta > 0 ? "+" : "") + mmrDelta;
  flash.classList.remove("flash-win", "flash-loss", "flash-active");
  // Force a reflow so removing + re-adding "flash-active" always re-triggers the transition
  flash.offsetWidth;
  flash.classList.add(isWin ? "flash-win" : "flash-loss", "flash-active");

  _miniFlashTimer = setTimeout(function() {
    flash.classList.remove("flash-active");
    _miniFlashTimer = null;
  }, 3000);
}

// Update the small status pill shown above the log form.
// "connected" state shows time-relative text based on lastCaptureWallTime.
function updateCaptureStatus(state) {
  var el = document.getElementById("capture-status");
  if (!el) return;

  var label    = "";
  var cssState = state;

  if (state === "idle") {
    // If username is not set, nudge the user instead of staying silent
    if (!getCaptureUsername()) {
      label    = "← Set your Epic username to enable auto-fill";
      cssState = "hint";
    }
  } else if (state === "connected") {
    if (lastCaptureWallTime) {
      var secsAgo = Math.floor((Date.now() - lastCaptureWallTime) / 1000);
      if (secsAgo < 8) {
        label    = "Captured!";
        cssState = "captured";
      } else if (secsAgo < 60) {
        label = "Captured " + secsAgo + "s ago";
      } else {
        label = "Captured " + Math.floor(secsAgo / 60) + "m ago";
      }
    } else {
      label = "Capture Ready";
    }
  } else if (state === "disconnected") {
    // Amber + pulsing dot when offline during an active session; grey otherwise
    if (activeSession) {
      label    = "Capture Offline";
      cssState = "warning";
    } else {
      label = "Capture Offline";
    }
  }

  el.className   = "capture-status capture-status-" + cssState;
  el.textContent = label;
}

// One-shot connection test — used by the "Test" button.
function testCaptureConnection() {
  var username = getCaptureUsername();
  var url      = "http://localhost:" + CAPTURE_PORT + "/latest"
               + (username ? "?username=" + encodeURIComponent(username) : "");
  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function() { updateCaptureStatus("connected"); })
    .catch(function() { updateCaptureStatus("disconnected"); });
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

// Returns { type: "W"/"L", count: N } or null if no games for the active mode.
function getCurrentStreakInfo() {
  var mg = getModeGames();
  if (mg.length === 0) return null;

  var lastResult = mg[mg.length - 1].result;
  var count = 0;

  for (var i = mg.length - 1; i >= 0; i--) {
    if (mg[i].result === lastResult) { count++; } else { break; }
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
  updateMiniWidget();
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
  var mg = getModeGames();
  if (mg.length < 6) return null;

  // Pattern 1: MVP high, win rate low → rotation issue
  if (mg.length >= 10) {
    const recent  = mg.slice(-10);
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
  if (mg.length >= 10) {
    const older  = mg.slice(-10, -5);
    const recent = mg.slice(-5);
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

  // Pattern 4: Low shot accuracy → finishing issue
  if (mg.length >= 10) {
    const recent    = mg.slice(-10);
    const totalShots = recent.reduce(function(s, g) { return s + g.shots; }, 0);
    const totalGoals = recent.reduce(function(s, g) { return s + g.goals; }, 0);
    const avgShots   = totalShots / recent.length;
    const accuracy   = totalShots > 0 ? totalGoals / totalShots : 0;

    if (avgShots >= 3 && accuracy < 0.25) {
      return {
        id: "low_shot_accuracy",
        description: Math.round(avgShots * 10) / 10 + " shots/game but only " + Math.round(accuracy * 100) + "% shot accuracy over the last 10 games",
        conceptId: "game_sense",
        stats: { avgShots: avgShots.toFixed(1), accuracy: Math.round(accuracy * 100) }
      };
    }
  }

  // Pattern 5: Ball chasing — low assists over last 10 games
  if (mg.length >= 10) {
    const recent     = mg.slice(-10);
    const avgAssists = recent.reduce(function(s, g) { return s + g.assists; }, 0) / recent.length;

    if (avgAssists < 0.25) {
      return {
        id: "ball_chasing",
        description: "Averaging only " + avgAssists.toFixed(2) + " assists per game over the last 10 games",
        conceptId: "rotations",
        stats: { avgAssists: avgAssists.toFixed(2) }
      };
    }
  }

  // Pattern 6: Cold start — lost the first game in 4 of the last 5 sessions
  if (sessions.length >= 5) {
    var lastFiveSessions = getModeSessions().slice(-5);
    var coldStarts = 0;

    lastFiveSessions.forEach(function(s) {
      var firstGame = games.find(function(g) { return g.sessionId === s.sessionId; });
      if (firstGame && firstGame.result === "L") coldStarts++;
    });

    if (coldStarts >= 4) {
      return {
        id: "cold_start",
        description: "Lost the first game of " + coldStarts + " out of the last 5 sessions",
        conceptId: "game_sense",
        stats: { coldStarts: coldStarts }
      };
    }
  }

  // Pattern 7: Recent slump — last 5 well below all-time win rate
  if (mg.length >= 10) {
    var allTimeWR  = mg.filter(function(g) { return g.result === "W"; }).length / mg.length;
    var recentFive = mg.slice(-5);
    var recentWR   = recentFive.filter(function(g) { return g.result === "W"; }).length / recentFive.length;

    if (allTimeWR >= 0.45 && recentWR <= 0.2) {
      return {
        id: "recent_slump",
        description: Math.round(recentWR * 100) + "% win rate over your last 5 games vs your " + Math.round(allTimeWR * 100) + "% all-time rate",
        conceptId: "positioning",
        stats: { recentWR: Math.round(recentWR * 100), allTimeWR: Math.round(allTimeWR * 100) }
      };
    }
  }

  // Pattern 8: Goals declining — scoring less than before
  if (mg.length >= 10) {
    const olderGoals  = mg.slice(-10, -5);
    const recentGoals = mg.slice(-5);
    const avgOldGoals = olderGoals.reduce(function(s, g) { return s + g.goals; }, 0) / olderGoals.length;
    const avgNewGoals = recentGoals.reduce(function(s, g) { return s + g.goals; }, 0) / recentGoals.length;

    if (avgOldGoals - avgNewGoals >= 0.6) {
      return {
        id: "goals_declining",
        description: "Average goals dropped from " + avgOldGoals.toFixed(1) + " to " + avgNewGoals.toFixed(1) + " per game over the last 10 games",
        conceptId: "game_sense",
        stats: { previousAvg: avgOldGoals.toFixed(1), recentAvg: avgNewGoals.toFixed(1) }
      };
    }
  }

  // Pattern 9: Long session tilt — 8+ games in, last 3 are all losses
  if (activeSession) {
    const sessionGames = games.filter(function(g) {
      return g.sessionId === activeSession.sessionId;
    });

    if (sessionGames.length >= 8) {
      const lastThree = sessionGames.slice(-3);
      const allLosses = lastThree.every(function(g) { return g.result === "L"; });

      if (allLosses) {
        return {
          id: "long_session_tilt",
          description: "Lost the last 3 games in a row in a session that has gone " + sessionGames.length + " games",
          conceptId: "game_sense",
          stats: { sessionLength: sessionGames.length }
        };
      }
    }
  }

  // Pattern 10: Struggling against lower-ranked opponents — mental/tilt indicator
  var gamesWithOpp = mg.filter(function(g) { return g.opponentMmr != null && g.opponentMmr > 0; });
  if (gamesWithOpp.length >= 5) {
    var vsLowerRecent = gamesWithOpp.slice(-10).filter(function(g) {
      var pMmr = getPlayerMmrBeforeGame(g);
      return pMmr !== null && g.opponentMmr < pMmr - 15;
    });

    if (vsLowerRecent.length >= 3) {
      var vsLowerWins = vsLowerRecent.filter(function(g) { return g.result === "W"; }).length;
      var vsLowerWR   = vsLowerWins / vsLowerRecent.length;

      if (vsLowerWR < 0.4) {
        return {
          id: "losing_to_lower",
          description: Math.round(vsLowerWR * 100) + "% win rate against lower-ranked opponents (" + vsLowerRecent.length + " games)",
          conceptId: "shadowing",
          stats: { winRate: Math.round(vsLowerWR * 100), games: vsLowerRecent.length }
        };
      }
    }

    // Pattern 11: Consistently punching up — positive reinforcement
    var vsHigherRecent = gamesWithOpp.slice(-10).filter(function(g) {
      var pMmr = getPlayerMmrBeforeGame(g);
      return pMmr !== null && g.opponentMmr > pMmr + 15;
    });

    if (vsHigherRecent.length >= 4) {
      var vsHigherWins = vsHigherRecent.filter(function(g) { return g.result === "W"; }).length;
      var vsHigherWR   = vsHigherWins / vsHigherRecent.length;

      if (vsHigherWR >= 0.55) {
        return {
          id: "punching_up",
          description: Math.round(vsHigherWR * 100) + "% win rate against higher-ranked opponents (" + vsHigherRecent.length + " games)",
          conceptId: "positioning",
          stats: { winRate: Math.round(vsHigherWR * 100), games: vsHigherRecent.length }
        };
      }
    }
  }

  // Pattern 12: Solo carry — lots of goals but almost no assists
  if (mg.length >= 10) {
    var scRecent   = mg.slice(-10);
    var scGoals    = scRecent.reduce(function(s, g) { return s + g.goals; }, 0) / scRecent.length;
    var scAssists  = scRecent.reduce(function(s, g) { return s + g.assists; }, 0) / scRecent.length;

    if (scGoals >= 2.0 && scAssists < 0.4) {
      return {
        id: "solo_carry",
        description: scGoals.toFixed(1) + " goals/game but only " + scAssists.toFixed(2) + " assists/game over the last 10 games",
        conceptId: "rotations",
        stats: { avgGoals: scGoals.toFixed(1), avgAssists: scAssists.toFixed(2) }
      };
    }
  }

  // Pattern 13: No saves — barely registering defensively while losing
  if (mg.length >= 10) {
    var nsRecent  = mg.slice(-10);
    var nsAvgSave = nsRecent.reduce(function(s, g) { return s + g.saves; }, 0) / nsRecent.length;
    var nsLossRate = nsRecent.filter(function(g) { return g.result === "L"; }).length / nsRecent.length;

    if (nsAvgSave < 0.3 && nsLossRate > 0.5) {
      return {
        id: "no_saves",
        description: "Averaging only " + nsAvgSave.toFixed(2) + " saves per game over the last 10 games while losing " + Math.round(nsLossRate * 100) + "% of them",
        conceptId: "positioning",
        stats: { avgSaves: nsAvgSave.toFixed(2), lossRate: Math.round(nsLossRate * 100) }
      };
    }
  }

  // Pattern 14: Shot accuracy declining — was better before
  if (mg.length >= 10) {
    var olderShots   = mg.slice(-10, -5);
    var recentShots2 = mg.slice(-5);
    var oldAcc  = (function() { var s = olderShots.reduce(function(a, g) { return a + g.shots; }, 0); return s > 0 ? olderShots.reduce(function(a, g) { return a + g.goals; }, 0) / s : 0; })();
    var newAcc  = (function() { var s = recentShots2.reduce(function(a, g) { return a + g.shots; }, 0); return s > 0 ? recentShots2.reduce(function(a, g) { return a + g.goals; }, 0) / s : 0; })();
    var oldShotAvg = olderShots.reduce(function(a, g) { return a + g.shots; }, 0) / olderShots.length;

    if (oldShotAvg >= 2 && oldAcc - newAcc >= 0.15) {
      return {
        id: "accuracy_declining",
        description: "Shot accuracy dropped from " + Math.round(oldAcc * 100) + "% to " + Math.round(newAcc * 100) + "% over the last 10 games",
        conceptId: "game_sense",
        stats: { previousAcc: Math.round(oldAcc * 100), recentAcc: Math.round(newAcc * 100) }
      };
    }
  }

  // Pattern 15: Win streak — positive reinforcement (fires at 5+)
  var streakInfo = getCurrentStreakInfo();
  if (streakInfo && streakInfo.type === "W" && streakInfo.count >= 5) {
    return {
      id: "win_streak",
      description: streakInfo.count + "-game win streak",
      conceptId: "game_sense",
      stats: { streak: streakInfo.count }
    };
  }

  // Pattern 16: Defensive anchor — lots of saves but still losing
  if (mg.length >= 10) {
    var daRecent   = mg.slice(-10);
    var daAvgSaves = daRecent.reduce(function(s, g) { return s + g.saves; }, 0) / daRecent.length;
    var daLossRate = daRecent.filter(function(g) { return g.result === "L"; }).length / daRecent.length;

    if (daAvgSaves >= 1.8 && daLossRate > 0.6) {
      return {
        id: "defensive_anchor",
        description: daAvgSaves.toFixed(1) + " saves/game over the last 10 games but losing " + Math.round(daLossRate * 100) + "% of them",
        conceptId: "positioning",
        stats: { avgSaves: daAvgSaves.toFixed(1), lossRate: Math.round(daLossRate * 100) }
      };
    }
  }

  // Pattern 17: No contribution — goals + assists both near zero
  if (mg.length >= 10) {
    var ncRecent      = mg.slice(-10);
    var ncAvgGoals    = ncRecent.reduce(function(s, g) { return s + g.goals; }, 0) / ncRecent.length;
    var ncAvgAssists  = ncRecent.reduce(function(s, g) { return s + g.assists; }, 0) / ncRecent.length;

    if (ncAvgGoals + ncAvgAssists < 0.6) {
      return {
        id: "no_contribution",
        description: (ncAvgGoals + ncAvgAssists).toFixed(2) + " combined goals + assists per game over the last 10 games",
        conceptId: "positioning",
        stats: { avgGoals: ncAvgGoals.toFixed(2), avgAssists: ncAvgAssists.toFixed(2) }
      };
    }
  }

  return null;
}


// ============================================================
// COACHING ALERT — display
// ============================================================

function showCoachingAlert(message, pattern) {
  const alertEl     = document.getElementById("coaching-alert");
  const bodyEl      = document.getElementById("coaching-alert-body");
  const packsEl     = document.getElementById("coaching-packs");
  const conceptLink = document.getElementById("coaching-concept-link");

  coachingAlertActive   = true;
  alertEl.style.display = "block";
  bodyEl.textContent    = message;

  // Training packs
  packsEl.textContent = "";
  var packs = TRAINING_PACKS[pattern.id] || [];
  if (packs.length > 0) {
    var label = document.createElement("div");
    label.className   = "coaching-packs-label";
    label.textContent = "Prescribed Training";
    packsEl.appendChild(label);

    packs.forEach(function(pack) {
      var card = document.createElement("div");
      card.className = "coaching-pack-card";

      var name = document.createElement("div");
      name.className   = "coaching-pack-name";
      name.textContent = pack.name;

      var trains = document.createElement("div");
      trains.className   = "coaching-pack-trains";
      trains.textContent = pack.trains;

      var how = document.createElement("div");
      how.className   = "coaching-pack-how";
      how.textContent = pack.code;

      card.appendChild(name);
      card.appendChild(trains);
      card.appendChild(how);
      packsEl.appendChild(card);
    });
  }

  const concept = CONCEPTS.find(function(c) { return c.id === pattern.conceptId; });
  if (concept) {
    conceptLink.textContent   = "Learn more about " + concept.title + " ↓";
    conceptLink.style.display = "inline";
    conceptLink.onclick = function(e) {
      e.preventDefault();
      openConcept(concept.id);
    };
  } else {
    conceptLink.style.display = "none";
  }
}

function dismissCoachingAlert() {
  document.getElementById("coaching-alert").style.display = "none";
  coachingAlertActive = false;
}

function runCoachingCheck() {
  if (coachingAlertActive) return;
  if (gamesLoggedSinceLastAlert < MIN_GAMES_BETWEEN_ALERTS) return;

  const pattern = detectPattern();
  if (!pattern) return;

  gamesLoggedSinceLastAlert = 0;
  showCoachingAlert(getTip(pattern.id), pattern);
}


// ============================================================
// CONCEPT LIBRARY
// ============================================================

function updateConceptLibrary() {
  const grid       = document.getElementById("concept-grid");
  const contextEl  = document.getElementById("concept-rank-context");
  grid.textContent = "";

  // Determine current rank tier from latest MMR
  var currentTier = null;
  var mmr = null;
  if (activeSession && activeSession.mode === activeMode) {
    mmr = getCurrentMmr();
  } else {
    var ms = getModeSessions();
    if (ms.length > 0) mmr = ms[ms.length - 1].endMmr;
  }
  if (mmr !== null) currentTier = getRankTier(getRankFromMMR(mmr));

  // Update rank context line
  if (currentTier) {
    contextEl.textContent = "Showing tips for " + currentTier;
  } else {
    contextEl.textContent = "";
  }

  // Sort: priority concepts for current rank come first
  var sorted = CONCEPTS.slice().sort(function(a, b) {
    var aPriority = currentTier && a.priorityRanks && a.priorityRanks.indexOf(currentTier) !== -1 ? 0 : 1;
    var bPriority = currentTier && b.priorityRanks && b.priorityRanks.indexOf(currentTier) !== -1 ? 0 : 1;
    return aPriority - bPriority;
  });

  sorted.forEach(function(concept) {
    var isFocus  = currentTier && concept.priorityRanks && concept.priorityRanks.indexOf(currentTier) !== -1;
    var bodyText = (currentTier && concept.rankContent && concept.rankContent[currentTier])
      ? concept.rankContent[currentTier]
      : concept.content;

    const card = document.createElement("div");
    card.className = "concept-card";
    card.id = "concept-card-" + concept.id;

    // Key Focus badge — only shown on priority concepts for this rank
    if (isFocus) {
      const badge = document.createElement("div");
      badge.className   = "concept-focus-badge";
      badge.textContent = "Key Focus";
      card.appendChild(badge);
    }

    const title = document.createElement("div");
    title.className   = "concept-card-title";
    title.textContent = concept.title;

    const summary = document.createElement("div");
    summary.className   = "concept-card-summary";
    summary.textContent = concept.summary;

    const toggle = document.createElement("button");
    toggle.className   = "concept-toggle";
    toggle.textContent = "Read more ▼";

    const fullContent = document.createElement("div");
    fullContent.className   = "concept-full-content";
    fullContent.textContent = bodyText;

    // Video links section — shown when the card is expanded
    var videos = CONCEPT_VIDEOS[concept.id];
    var videosEl = document.createElement("div");
    videosEl.className = "concept-videos";

    if (videos && videos.length > 0) {
      var videoLabel = document.createElement("div");
      videoLabel.className   = "concept-video-label";
      videoLabel.textContent = "Watch";
      videosEl.appendChild(videoLabel);

      videos.forEach(function(v) {
        var link = document.createElement("a");
        link.className  = "concept-video-link";
        link.href       = v.url;
        link.target     = "_blank";
        link.rel        = "noopener noreferrer";

        var arrow = document.createTextNode("▶ ");
        var titleSpan = document.createElement("span");
        titleSpan.textContent = v.title;

        var creator = document.createElement("span");
        creator.className   = "concept-video-creator";
        creator.textContent = "— " + v.creator;

        link.appendChild(arrow);
        link.appendChild(titleSpan);
        link.appendChild(creator);
        videosEl.appendChild(link);
      });
    }

    card.addEventListener("click", function(e) {
      // Don't toggle expand when clicking a video link
      if (e.target.closest("a")) return;
      const isExpanded = card.classList.contains("expanded");
      card.classList.toggle("expanded");
      toggle.textContent = isExpanded ? "Read more ▼" : "Show less ▲";
    });

    card.appendChild(title);
    card.appendChild(summary);
    card.appendChild(toggle);
    card.appendChild(fullContent);
    card.appendChild(videosEl);
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
  var mg    = getModeGames();
  var ms    = getModeSessions();
  var total = mg.length;

  // ---- Win-rate donut ----
  var arc    = document.getElementById("winrate-arc");
  var pctEl  = document.getElementById("winrate-pct");
  var CIRC   = 238.76; // 2 * pi * 38

  if (total === 0) {
    arc.setAttribute("stroke-dasharray", "0 " + CIRC);
    pctEl.textContent = "—";
  } else {
    var wins    = mg.filter(function(g) { return g.result === "W"; }).length;
    var winRate = Math.round((wins / total) * 100);
    var filled  = (winRate / 100) * CIRC;
    arc.setAttribute("stroke-dasharray", filled.toFixed(2) + " " + CIRC);
    pctEl.textContent = winRate + "%";
    // Colour the arc based on win rate — read from CSS vars so it matches the active theme
    var cs = getComputedStyle(document.documentElement);
    var color = winRate >= 55
      ? cs.getPropertyValue("--win").trim()
      : winRate >= 45
        ? cs.getPropertyValue("--accent").trim()
        : cs.getPropertyValue("--loss").trim();
    arc.style.stroke = color;
  }

  // ---- Last 10 games form strip ----
  var dotsEl    = document.getElementById("form-dots");
  var summaryEl = document.getElementById("form-summary");
  dotsEl.textContent = "";

  var last10 = mg.slice(-10);

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

  // Peak MMR: highest endMmr across completed sessions for this mode
  if (ms.length > 0) {
    var peak = ms.reduce(function(max, s) { return Math.max(max, s.endMmr); }, -Infinity);
    peakEl.textContent = peak;
  } else {
    peakEl.textContent = "—";
  }

  // Best session: highest positive netChange for this mode
  if (ms.length > 0) {
    var best = ms.reduce(function(max, s) { return Math.max(max, s.netChange); }, -Infinity);
    bestEl.textContent = best >= 0 ? "+" + best : best;
  } else {
    bestEl.textContent = "—";
  }

  // Record win streak: longest consecutive W streak for this mode
  var recordStreak = 0, runStreak = 0;
  mg.forEach(function(g) {
    if (g.result === "W") { runStreak++; recordStreak = Math.max(recordStreak, runStreak); }
    else { runStreak = 0; }
  });
  streakEl.textContent = recordStreak > 0 ? "W " + recordStreak : "—";
}


// ============================================================
// SUMMARY BAR
// ============================================================

// Counts an element's displayed number to a new value with an ease-out animation.
// Handles plain integers and percentages (e.g. "54%"). Non-numeric values snap instantly.
function animateCounter(el, newText) {
  var currentText = el.textContent.trim();
  if (currentText === newText) return;

  var suffix  = newText.replace(/[\d.-]/g, "");
  var newNum  = parseFloat(newText);

  // Can't animate a non-number target — just snap
  if (isNaN(newNum)) { el.textContent = newText; return; }

  // When starting from "—" or any non-numeric state, count up from 0
  var startNum = parseFloat(currentText);
  var start    = isNaN(startNum) ? 0 : startNum;

  var duration  = 450;
  var startTime = null;

  function step(ts) {
    if (!startTime) startTime = ts;
    var t     = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    el.textContent = Math.round(start + (newNum - start) * eased) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function updateSummaryBar() {
  var mg    = getModeGames();
  var total = mg.length;

  animateCounter(document.getElementById("total-games"), String(total));

  if (total === 0) {
    document.getElementById("win-rate").textContent = "—";
    document.getElementById("mvp-rate").textContent = "—";
    return;
  }

  var wins = mg.filter(function(g) { return g.result === "W"; }).length;
  var mvps = mg.filter(function(g) { return g.mvp === true; }).length;

  animateCounter(document.getElementById("win-rate"), Math.round((wins / total) * 100) + "%");
  // MVP rate = MVPs out of wins (losses can never be MVP)
  if (wins === 0) {
    document.getElementById("mvp-rate").textContent = "—";
  } else {
    animateCounter(document.getElementById("mvp-rate"), Math.round((mvps / wins) * 100) + "%");
  }
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

  if (!activeSession || activeSession.mode !== activeMode) {
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
  var ms = getModeSessions();

  if (ms.length === 0) {
    container.style.display   = "none";
    placeholder.style.display = "block";
    return;
  }

  placeholder.style.display = "none";
  container.style.display   = "block";

  if (!longTermChart) return;

  longTermChart.data.labels           = ms.map(function(_, i) { return "Session " + (i + 1); });
  longTermChart.data.datasets[0].data = ms.map(function(s) { return s.endMmr; });
  longTermChart.update();
}


// ============================================================
// GAME LOG TABLE
// ============================================================

function updateGameLog() {
  const tbody      = document.getElementById("game-table-body");
  const noGamesMsg = document.getElementById("no-games-msg");
  const table      = document.getElementById("game-table");
  var mg = getModeGames();

  if (mg.length === 0) {
    noGamesMsg.style.display = "block";
    table.style.display      = "none";
    return;
  }

  noGamesMsg.style.display = "none";
  table.style.display      = "table";
  tbody.textContent        = "";

  const newestFirst = [...mg].reverse();

  newestFirst.forEach(function(game, reversedIndex) {
    const gameNumber = mg.length - reversedIndex;
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

    // Builds a pill-badge cell for the W/L result column
    function makeResultCell(result) {
      var td = document.createElement("td");
      if (!result) { td.textContent = "—"; return td; }
      var badge = document.createElement("span");
      badge.textContent = result;
      badge.className   = result === "W" ? "result-badge result-badge-win" : "result-badge result-badge-loss";
      td.appendChild(badge);
      return td;
    }

    // Builds the opponent MMR cell — shows the number and rank name as a tooltip
    function makeOppCell(oppMmr) {
      var td = document.createElement("td");
      if (oppMmr == null) { td.textContent = "—"; return td; }
      td.textContent = oppMmr;
      td.title       = "Highest opp: " + getRankFromMMR(oppMmr);
      td.style.color = "var(--text-2)";
      return td;
    }

    row.appendChild(makeCell(gameNumber));
    row.appendChild(makeCell(game.date));
    row.appendChild(makeCell(mmrDisplay, mmrClass));
    row.appendChild(makeResultCell(game.result));
    row.appendChild(makeOppCell(game.opponentMmr != null ? game.opponentMmr : null));
    row.appendChild(makeCell(game.goals));
    row.appendChild(makeCell(game.assists));
    row.appendChild(makeCell(game.saves));
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
// OPPONENT MMR HELPER
// Returns the player's MMR immediately before a given game was
// played — used to decide whether each game was vs a higher or
// lower-ranked opponent.
// ============================================================

function getPlayerMmrBeforeGame(game) {
  // Find the session this game belongs to (completed or active)
  var session = sessions.find(function(s) { return s.sessionId === game.sessionId; });
  var startMmr;
  if (session) {
    startMmr = session.startMmr;
  } else if (activeSession && activeSession.sessionId === game.sessionId) {
    startMmr = activeSession.startMmr;
  } else {
    return null;
  }

  // Sum the MMR changes of every game in this session that was logged before this one
  var priorChange = games
    .filter(function(g) { return g.sessionId === game.sessionId && g.id < game.id; })
    .reduce(function(sum, g) { return sum + (g.mmrChange || 0); }, 0);

  return startMmr + priorChange;
}


// ============================================================
// STATS DASHBOARD
// Average goals, saves, assists, shots across all games.
// No rank filter since we no longer track rank.
// ============================================================

function updateStatsDashboard() {
  var mg    = getModeGames();
  var total = mg.length;

  var statKeys = [
    { id: "avg-goals",   key: "goals",   label: "Avg Goals"   },
    { id: "avg-assists", key: "assists", label: "Avg Assists" },
    { id: "avg-saves",   key: "saves",   label: "Avg Saves"   },
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

  var last5 = mg.slice(-5);

  statKeys.forEach(function(s) {
    var allAvg  = avg(mg, s.key);
    document.getElementById(s.id).textContent = allAvg.toFixed(2);

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

  // ---- Matchup breakdown (opponent MMR) ----
  updateMatchupRow(mg);
}


// Builds or clears the matchup breakdown row inside the stats section.
// Requires at least 3 games with opponent MMR logged to show.
function updateMatchupRow(mg) {
  var rowEl = document.getElementById("matchup-row");
  if (!rowEl) return;

  var withOpp = mg.filter(function(g) {
    return g.opponentMmr != null && !isNaN(g.opponentMmr) && g.opponentMmr > 0;
  });

  if (withOpp.length < 3) {
    rowEl.textContent = "";
    rowEl.classList.remove("visible");
    return;
  }

  // Split into "vs higher" and "vs lower" using the player's MMR at the time of each game
  var vsHigher = [], vsLower = [], vsSame = [];
  withOpp.forEach(function(g) {
    var playerMmr = getPlayerMmrBeforeGame(g);
    if (playerMmr === null) return;
    var diff = g.opponentMmr - playerMmr;
    if      (diff >  15) vsHigher.push(g);
    else if (diff < -15) vsLower.push(g);
    else                 vsSame.push(g);
  });

  function winRate(arr) {
    if (arr.length === 0) return null;
    return Math.round(arr.filter(function(g) { return g.result === "W"; }).length / arr.length * 100);
  }

  function makeMatchupCard(label, games, pct, subtext) {
    var card = document.createElement("div");
    card.className = "matchup-card";

    var lbl = document.createElement("div");
    lbl.className   = "matchup-label";
    lbl.textContent = label;

    var val = document.createElement("div");
    val.className   = "matchup-value";
    if (pct === null) {
      val.textContent = "—";
    } else {
      val.textContent = pct + "%";
      val.style.color = pct >= 55 ? "var(--win)" : pct >= 45 ? "var(--text)" : "var(--loss)";
    }

    var sub = document.createElement("div");
    sub.className   = "matchup-sublabel";
    sub.textContent = subtext;

    card.appendChild(lbl);
    card.appendChild(val);
    card.appendChild(sub);
    return card;
  }

  rowEl.textContent = "";

  rowEl.appendChild(makeMatchupCard(
    "vs Higher MMR",
    vsHigher,
    winRate(vsHigher),
    vsHigher.length === 0 ? "No games logged" : vsHigher.length + " game" + (vsHigher.length === 1 ? "" : "s")
  ));

  rowEl.appendChild(makeMatchupCard(
    "vs Lower MMR",
    vsLower,
    winRate(vsLower),
    vsLower.length === 0 ? "No games logged" : vsLower.length + " game" + (vsLower.length === 1 ? "" : "s")
  ));

  rowEl.appendChild(makeMatchupCard(
    "vs Even MMR",
    vsSame,
    winRate(vsSame),
    vsSame.length === 0 ? "No games logged" : vsSame.length + " game" + (vsSame.length === 1 ? "" : "s") + " (±15 MMR)"
  ));

  rowEl.classList.add("visible");
}


// ============================================================
// SESSION HOVER POPUP
// Cumulative MMR line chart with gradient fill, shown after a
// short hover delay on session cards.
// ============================================================

function showSessionHoverChart(sessionId, label, anchorEl) {
  const popup      = document.getElementById("session-hover-popup");
  const titleEl    = document.getElementById("session-hover-title");
  const netEl      = document.getElementById("session-hover-net");
  const recordEl   = document.getElementById("session-hover-record");
  const canvas     = document.getElementById("session-hover-canvas");

  // Get this session's games in chronological order
  const sg = games
    .filter(function(g) { return g.sessionId === sessionId; })
    .sort(function(a, b) { return a.id - b.id; });

  if (sg.length === 0) return;

  // Cumulative MMR starting from 0
  var cumulative = 0;
  var data   = [0];
  var labels = [""];
  sg.forEach(function(g) {
    cumulative += (g.mmrChange || 0);
    data.push(cumulative);
    labels.push("");
  });

  var net = cumulative;
  var isPositive = net > 0;
  var lineColor  = isPositive ? "#22c55e" : net < 0 ? "#ef4444" : "#888";

  // W/L record
  var wins   = sg.filter(function(g) { return g.result === "W"; }).length;
  var losses = sg.filter(function(g) { return g.result === "L"; }).length;

  // Header: session label + net MMR + record
  titleEl.textContent = label;
  netEl.textContent   = (net >= 0 ? "+" : "") + net + " MMR";
  netEl.style.color   = lineColor;
  recordEl.textContent = wins + "W – " + losses + "L · " + sg.length + " games";

  // Destroy previous chart before creating a new one
  if (sessionHoverChart) { sessionHoverChart.destroy(); sessionHoverChart = null; }

  var ctx = canvas.getContext("2d");

  // Gradient fill from line color down to transparent
  var gradient = ctx.createLinearGradient(0, 0, 0, 120);
  if (isPositive) {
    gradient.addColorStop(0, "rgba(34,197,94,0.28)");
    gradient.addColorStop(1, "rgba(34,197,94,0)");
  } else if (net < 0) {
    gradient.addColorStop(0, "rgba(239,68,68,0.28)");
    gradient.addColorStop(1, "rgba(239,68,68,0)");
  } else {
    gradient.addColorStop(0, "rgba(148,163,184,0.15)");
    gradient.addColorStop(1, "rgba(148,163,184,0)");
  }

  var cs        = getComputedStyle(document.documentElement);
  var textColor = cs.getPropertyValue("--text-3").trim() || "#888";
  var gridColor = cs.getPropertyValue("--border").trim() || "rgba(0,0,0,0.06)";

  // Plugin: draws a subtle dashed line at y=0 (the session starting point)
  var zeroBaselinePlugin = {
    id: "zeroBaseline",
    afterDraw: function(chart) {
      var yScale = chart.scales.y;
      // Only draw if 0 is within the visible y range
      if (yScale.min > 0 || yScale.max < 0) return;
      var y   = yScale.getPixelForValue(0);
      var ctx = chart.ctx;
      var area = chart.chartArea;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth   = 1;
      ctx.strokeStyle = "rgba(148,163,184,0.4)";
      ctx.moveTo(area.left,  y);
      ctx.lineTo(area.right, y);
      ctx.stroke();
      ctx.restore();
    }
  };

  sessionHoverChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        data: data,
        fill: true,
        cubicInterpolationMode: "monotone",
        borderColor: lineColor,
        backgroundColor: gradient,
        pointRadius: 0,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250, easing: "easeOutQuart" },
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        x: {
          grid:  { display: false },
          ticks: { display: false },
          border:{ display: false }
        },
        y: {
          grid:  { color: gridColor },
          ticks: { color: textColor, font: { size: 9 }, maxTicksLimit: 4 },
          border:{ display: false }
        }
      }
    },
    plugins: [zeroBaselinePlugin]
  });

  // Position popup above the card; flip below if near top of viewport
  var rect   = anchorEl.getBoundingClientRect();
  var popupH = 175;
  var top    = rect.top - popupH - 10;
  if (top < 8) top = rect.bottom + 10;
  var left = rect.left;
  if (left + 300 > window.innerWidth - 8) left = window.innerWidth - 308;

  popup.style.top  = top  + "px";
  popup.style.left = left + "px";
  popup.classList.add("visible");
}

function hideSessionHoverChart() {
  var popup = document.getElementById("session-hover-popup");
  popup.classList.remove("visible");
  // Destroy the chart after the CSS fade-out finishes so it doesn't flash on the next hover
  setTimeout(function() {
    if (sessionHoverChart && !popup.classList.contains("visible")) {
      sessionHoverChart.destroy();
      sessionHoverChart = null;
    }
  }, 220);
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
  var ms = getModeSessions();

  if (ms.length === 0) {
    noSessionsMsg.style.display = "block";
    return;
  }

  noSessionsMsg.style.display = "none";

  // Newest session first
  const newestFirst = [...ms].reverse();

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

    const sessionNumber = ms.length - displayIndex;

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
    statsRow.appendChild(makeSessionStat("Avg Assists", sessionAvg("assists")));
    statsRow.appendChild(makeSessionStat("Avg Saves",   sessionAvg("saves")));
    statsRow.appendChild(makeSessionStat("Avg Shots",   sessionAvg("shots")));

    // Hover: show mini chart popup after a short delay (avoids flashing on quick mouse-overs)
    var hoverLabel = "Session " + sessionNumber + " — " + record.date;
    card.addEventListener("mouseenter", function() {
      clearTimeout(sessionHoverTimer);
      sessionHoverTimer = setTimeout(function() {
        showSessionHoverChart(record.sessionId, hoverLabel, card);
      }, 320);
    });
    card.addEventListener("mouseleave", function() {
      clearTimeout(sessionHoverTimer);
      hideSessionHoverChart();
    });

    card.appendChild(header);
    card.appendChild(statsRow);
    sessionList.appendChild(card);
  });
}


// ============================================================
// FORM SETUP
// ============================================================

// Wires up keyboard shortcuts on the MVP checkbox and shows/hides the MVP
// row based on whether the MMR change is positive (win) or negative (loss).
function setupFormKeyboard() {
  const mvpCheckbox = document.getElementById("mvp-checkbox");
  const mvpRow      = document.getElementById("mvp-row");
  const mmrInput    = document.getElementById("mmr-change-input");
  const form        = document.getElementById("log-form");

  // Auto-select the full value on focus so typing replaces it rather than appending.
  // Without this, tabbing to Goals (showing "0") requires a backspace before typing.
  ["mmr-change-input", "opp-mmr-input", "goals-input", "assists-input", "saves-input", "shots-input"].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("focus", function() { this.select(); });
  });

  // Live rank preview on the opponent MMR field — same behaviour as the start-session MMR input.
  var oppMmrInput = document.getElementById("opp-mmr-input");
  var oppIconEl   = document.getElementById("opp-rank-icon");
  var oppNameEl   = document.getElementById("opp-rank-name");

  oppMmrInput.addEventListener("input", function() {
    var val = parseInt(this.value);
    if (isNaN(val) || val <= 0) {
      oppIconEl.style.display = "none";
      oppNameEl.textContent   = "";
      return;
    }
    var rankName = getRankFromMMR(val);
    oppNameEl.textContent = rankName;
    if (RANK_ICONS[rankName]) {
      oppIconEl.src           = RANK_ICONS[rankName];
      oppIconEl.alt           = rankName;
      oppIconEl.style.display = "inline-block";
    } else {
      oppIconEl.style.display = "none";
    }
  });

  // Show MVP row only when the entered value is a win (positive number)
  mmrInput.addEventListener("input", function() {
    var val = parseFloat(mmrInput.value);
    var isWin = !isNaN(val) && val > 0;
    mvpRow.style.display = isWin ? "" : "none";
    if (!isWin) mvpCheckbox.checked = false;
  });

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

  var rawOppMmr = parseInt(document.getElementById("opp-mmr-input").value);

  const newGame = {
    id:          Date.now(),
    date:        new Date().toISOString().split("T")[0],
    sessionId:   activeSession.sessionId,
    mode:        activeSession.mode,
    mmrChange:   mmrChange,
    result:      result,
    goals:       parseInt(document.getElementById("goals-input").value)   || 0,
    assists:     parseInt(document.getElementById("assists-input").value) || 0,
    saves:       parseInt(document.getElementById("saves-input").value)   || 0,
    shots:       parseInt(document.getElementById("shots-input").value)   || 0,
    mvp:         document.getElementById("mvp-checkbox").checked,
    opponentMmr: isNaN(rawOppMmr) || rawOppMmr <= 0 ? null : rawOppMmr
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
  updateConceptLibrary();

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
  document.getElementById("mmr-change-input").value = "";
  document.getElementById("opp-mmr-input").value    = "";
  document.getElementById("goals-input").value      = 0;
  document.getElementById("assists-input").value    = 0;
  document.getElementById("saves-input").value      = 0;
  document.getElementById("shots-input").value      = 0;
  document.getElementById("mvp-checkbox").checked   = false;

  // Clear the opponent rank preview
  document.getElementById("opp-rank-icon").style.display = "none";
  document.getElementById("opp-rank-name").textContent   = "";

  // Return focus to MMR change so the next game can be entered immediately
  document.getElementById("mmr-change-input").focus();
}


// ============================================================
// MODE TABS
// ============================================================

// Switches the active mode, saves it, re-renders everything.
function setActiveMode(mode) {
  activeMode = mode;
  localStorage.setItem("rl_active_mode", mode);

  document.querySelectorAll(".mode-tab").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  // Pre-fill start MMR with last known MMR for this mode
  if (!activeSession) {
    var ms = getModeSessions();
    if (ms.length > 0) {
      document.getElementById("start-mmr-input").value = ms[ms.length - 1].endMmr;
      updateStartRankDisplay(ms[ms.length - 1].endMmr);
    } else {
      document.getElementById("start-mmr-input").value = "";
      updateStartRankDisplay(null);
    }
  }

  // Show the right session UI for this mode
  if (activeSession && activeSession.mode === activeMode) {
    showActiveSessionUI();
  } else {
    showStartSessionUI();
  }

  // Re-render all data sections
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

// Wires up the mode tab buttons.
// Wires the Tracker / Setup Guide tabs in the main nav.
function initMainNav() {
  document.querySelectorAll(".main-tab").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".main-tab").forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");

      var view = btn.dataset.view;
      document.getElementById("tracker-view").style.display = view === "tracker" ? "block" : "none";
      document.getElementById("setup-view").style.display   = view === "setup"   ? "block" : "none";
    });
  });
}

function initModeTabs() {
  document.querySelectorAll(".mode-tab").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.mode === activeMode);
    btn.addEventListener("click", function() { setActiveMode(btn.dataset.mode); });
  });
}


// ============================================================
// INITIALIZATION
// Everything starts here when the page loads.
// ============================================================

// ============================================================
// MINI MODE
// A small draggable overlay the user can switch to while on
// a call. Shows only rank, MMR, session net, and streak.
// ============================================================

// Reads current state and refreshes all mini widget elements.
function updateMiniWidget() {
  var rankNameEl = document.getElementById("mini-rank-name");
  var mmrEl      = document.getElementById("mini-mmr");
  var iconEl     = document.getElementById("mini-rank-icon");
  var recordEl   = document.getElementById("mini-record");
  var netEl      = document.getElementById("mini-session-net");
  var streakEl   = document.getElementById("mini-streak");
  if (!rankNameEl) return;

  // Rank + MMR — use the active session's mode if live, else fall back to this mode's last session
  var mmr = null;
  if (activeSession)                   mmr = getCurrentMmr();
  else { var ms = getModeSessions(); if (ms.length > 0) mmr = ms[ms.length - 1].endMmr; }

  if (mmr === null) {
    rankNameEl.textContent = "—";
    mmrEl.textContent      = "No session";
    iconEl.style.display   = "none";
  } else {
    var rankName = getRankFromMMR(mmr);
    var div      = getDivision(mmr);
    rankNameEl.textContent = div ? rankName + " · Div " + div : rankName;
    mmrEl.textContent      = mmr + " MMR";
    if (RANK_ICONS[rankName]) {
      iconEl.src           = RANK_ICONS[rankName];
      iconEl.alt           = rankName;
      iconEl.style.display = "block";
    } else {
      iconEl.style.display = "none";
    }
  }

  // Session W/L record
  if (activeSession) {
    var sessionGames = games.filter(function(g) { return g.sessionId === activeSession.sessionId; });
    var wins   = sessionGames.filter(function(g) { return g.result === "W"; }).length;
    var losses = sessionGames.filter(function(g) { return g.result === "L"; }).length;
    recordEl.textContent = wins + "W · " + losses + "L";
  } else {
    recordEl.textContent = "—";
  }

  // Session net
  netEl.classList.remove("net-positive", "net-negative");
  if (activeSession) {
    var net = getCurrentSessionNet();
    netEl.textContent = (net >= 0 ? "+" : "") + net;
    if (net > 0) netEl.classList.add("net-positive");
    if (net < 0) netEl.classList.add("net-negative");
  } else {
    netEl.textContent = "—";
  }

  // Streak
  streakEl.classList.remove("streak-win", "streak-loss");
  var info = getCurrentStreakInfo();
  if (info) {
    streakEl.textContent = info.type + info.count;
    streakEl.classList.add(info.type === "W" ? "streak-win" : "streak-loss");
  } else {
    streakEl.textContent = "—";
  }
}

// Wires the minimize/restore buttons and the drag handle.
function initMiniMode() {
  var widget     = document.getElementById("mini-widget");
  var minBtn     = document.getElementById("minimize-btn");
  var restoreBtn = document.getElementById("mini-restore-btn");
  var handle     = document.getElementById("mini-drag-handle");
  var appEl      = document.getElementById("app");

  minBtn.addEventListener("click", function() {
    updateMiniWidget();
    widget.classList.add("visible");
    appEl.style.display = "none";
  });

  restoreBtn.addEventListener("click", function() {
    widget.classList.remove("visible");
    appEl.style.display = "";
  });

  // Drag: convert bottom/right origin to top/left so mouse deltas work cleanly.
  var dragging = false;
  var startX, startY, startLeft, startTop;

  handle.addEventListener("mousedown", function(e) {
    dragging = true;
    var rect  = widget.getBoundingClientRect();
    startLeft = rect.left;
    startTop  = rect.top;
    startX    = e.clientX;
    startY    = e.clientY;
    widget.style.right  = "auto";
    widget.style.bottom = "auto";
    widget.style.left   = startLeft + "px";
    widget.style.top    = startTop  + "px";
    e.preventDefault();
  });

  document.addEventListener("mousemove", function(e) {
    if (!dragging) return;
    widget.style.left = (startLeft + e.clientX - startX) + "px";
    widget.style.top  = (startTop  + e.clientY - startY) + "px";
  });

  document.addEventListener("mouseup", function() { dragging = false; });
}

function init() {
  // Load all persisted data
  games         = loadGames();
  sessions      = loadSessions();
  activeSession = loadActiveSession();

  // Load saved mode (must happen after data loads so getModeGames works)
  activeMode = localStorage.getItem("rl_active_mode") || "3v3";
  // If there's an active session, snap to its mode so the log form shows
  if (activeSession && activeSession.mode) activeMode = activeSession.mode;

  // Load saved custom colors (or use defaults on first run)
  var savedColors   = localStorage.getItem("rl_custom_colors");
  var initialColors = savedColors ? JSON.parse(savedColors) : DEFAULT_COLORS;

  // Sync the color picker inputs to whatever is saved
  document.getElementById("color-accent").value  = initialColors.accent;
  document.getElementById("color-bg").value      = initialColors.bg;
  document.getElementById("color-surface").value = initialColors.surface;
  document.getElementById("color-win").value     = initialColors.win;
  document.getElementById("color-loss").value    = initialColors.loss;

  // Apply colors immediately so the page renders in the right palette
  applyColors(initialColors);

  // Wire up color pickers — applyColors fires live as the user drags
  function readPickerColors() {
    return {
      accent:  document.getElementById("color-accent").value,
      bg:      document.getElementById("color-bg").value,
      surface: document.getElementById("color-surface").value,
      win:     document.getElementById("color-win").value,
      loss:    document.getElementById("color-loss").value
    };
  }

  ["color-accent","color-bg","color-surface","color-win","color-loss"].forEach(function(id) {
    document.getElementById(id).addEventListener("input", function() {
      applyColors(readPickerColors());
    });
  });

  // Build preset swatches for each color row
  document.querySelectorAll(".color-row").forEach(function(row) {
    var input      = row.querySelector("input[type='color']");
    var swatchesEl = row.querySelector(".color-swatches");
    if (!input || !swatchesEl) return;

    var presets = COLOR_PRESETS[input.id];
    if (!presets) return;

    presets.forEach(function(color) {
      var btn = document.createElement("button");
      btn.type             = "button";
      btn.className        = "color-swatch";
      btn.dataset.color    = color;
      btn.style.background = color;
      btn.title            = color;

      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        input.value = color;
        input.dispatchEvent(new Event("input")); // triggers applyColors via picker listener
      });

      swatchesEl.appendChild(btn);
    });
  });

  // Marks the swatch matching the current picker value as active.
  // Called after applyColors so the ring stays in sync.
  function syncSwatches() {
    document.querySelectorAll(".color-row").forEach(function(row) {
      var input = row.querySelector("input[type='color']");
      if (!input) return;
      row.querySelectorAll(".color-swatch").forEach(function(swatch) {
        swatch.classList.toggle("active",
          swatch.dataset.color.toLowerCase() === input.value.toLowerCase());
      });
    });
  }

  syncSwatches(); // mark the initial active swatches on load

  // Re-sync after every color change so the active ring moves to the new selection
  ["color-accent","color-bg","color-surface","color-win","color-loss"].forEach(function(id) {
    document.getElementById(id).addEventListener("input", syncSwatches);
  });

  // Reset button restores factory defaults
  document.getElementById("reset-colors-btn").addEventListener("click", function() {
    applyColors(DEFAULT_COLORS);
    document.getElementById("color-accent").value  = DEFAULT_COLORS.accent;
    document.getElementById("color-bg").value      = DEFAULT_COLORS.bg;
    document.getElementById("color-surface").value = DEFAULT_COLORS.surface;
    document.getElementById("color-win").value     = DEFAULT_COLORS.win;
    document.getElementById("color-loss").value    = DEFAULT_COLORS.loss;
    syncSwatches();
  });

  // Toggle the customize panel; close on any outside click
  var customizeBtn   = document.getElementById("customize-btn");
  var customizePanel = document.getElementById("customize-panel");

  // Move panel to <body> so it escapes #app's stacking context (z-index:1).
  // Without this, even z-index:9000 is capped inside #app's stacking context.
  document.body.appendChild(customizePanel);

  customizeBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    var isOpen = customizePanel.classList.toggle("open");
    if (isOpen) {
      var rect = customizeBtn.getBoundingClientRect();
      customizePanel.style.top   = (rect.bottom + 8) + "px";
      customizePanel.style.right = (window.innerWidth - rect.right) + "px";
    }
  });
  document.addEventListener("click", function(e) {
    if (!e.target.closest("#color-customizer") && !e.target.closest("#customize-panel")) {
      customizePanel.classList.remove("open");
    }
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

  // Pre-fill username input from localStorage; auto-save + auto-test on change
  var usernameInput    = document.getElementById("capture-username-input");
  var usernameTestTimer = null;
  if (usernameInput) {
    usernameInput.value = getCaptureUsername();
    usernameInput.addEventListener("input", function() {
      setCaptureUsername(usernameInput.value);
      // Show hint state while field is empty, clear debounce timer
      if (!usernameInput.value.trim()) {
        updateCaptureStatus("idle");
        clearTimeout(usernameTestTimer);
        return;
      }
      // Auto-test connection 1 second after typing stops — gives instant feedback
      clearTimeout(usernameTestTimer);
      usernameTestTimer = setTimeout(testCaptureConnection, 1000);
    });
  }

  // Show username hint on page load if field is empty
  updateCaptureStatus("idle");

  // Wire capture test button
  var captureTestBtn = document.getElementById("capture-test-btn");
  if (captureTestBtn) captureTestBtn.addEventListener("click", testCaptureConnection);

  // Wire up keyboard shortcuts
  setupFormKeyboard();

  // Wire up mini mode (minimize button + drag)
  initMiniMode();

  // Wire up main nav (Tracker / Setup Guide tabs)
  initMainNav();

  // Wire up mode tabs
  initModeTabs();

  // Show the correct UI based on whether a session is already in progress
  if (activeSession) {
    showActiveSessionUI();
    document.getElementById("start-mmr-input").value = activeSession.startMmr;
  } else {
    showStartSessionUI();
    var ms = getModeSessions();
    if (ms.length > 0) {
      var lastMmr = ms[ms.length - 1].endMmr;
      document.getElementById("start-mmr-input").value = lastMmr;
      updateStartRankDisplay(lastMmr);
    }
  }

  // Build both charts, then apply the current accent color
  buildInSessionChart();
  buildLongTermChart();
  updateChartColors(customAccentHex, customAccentRgb);

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

// ============================================================
// COLOR CUSTOMIZER
// Replaces the old preset theme system. The user can freely
// pick any accent, background, card, win, and loss color.
// All derived values (accent-dim, glow, shadow-glow, etc.)
// are computed from the chosen colors and written as CSS vars.
// ============================================================

// Factory-default colors — what "Reset to default" restores.
var DEFAULT_COLORS = {
  accent:  "#2563eb",
  bg:      "#f3f6ff",
  surface: "#ffffff",
  win:     "#16a34a",
  loss:    "#dc2626"
};

// Preset swatches shown for each color picker.
// The first entry in each array matches the factory default.
var COLOR_PRESETS = {
  "color-accent":  ["#2563eb","#7c3aed","#f97316","#0891b2","#e040fb","#16a34a"],
  "color-bg":      ["#f3f6ff","#ffffff","#faf8f5","#f5f5f5","#fefce8","#f0fdf4"],
  "color-surface": ["#ffffff","#fafafa","#fdf8f0","#f0f4ff","#f8fafc","#fefce8"],
  "color-win":     ["#16a34a","#059669","#0891b2","#3b82f6","#8b5cf6"],
  "color-loss":    ["#dc2626","#ef4444","#f43f5e","#f97316","#d97706"]
};

// Current accent as an "r,g,b" string — shared by chart glow plugin.
var customAccentRgb = "37,99,235";
var customAccentHex = "#2563eb";

// Converts a 6-digit hex color to an {r, g, b} object.
function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
}

// Converts a hex color + alpha (0–1) to an rgba() string.
function hexToRgba(hex, alpha) {
  var c = hexToRgb(hex);
  return "rgba(" + c.r + "," + c.g + "," + c.b + "," + alpha + ")";
}

// Returns a darkened version of a hex color (for hover states).
function darkenHex(hex, amount) {
  var c = hexToRgb(hex);
  return "#" + [c.r - amount, c.g - amount, c.b - amount]
    .map(function(v) { return Math.max(0, v).toString(16).padStart(2, "0"); })
    .join("");
}

// Writes all color CSS variables from a colors object, updates
// charts, updates the wordmark gradient, and saves to localStorage.
function applyColors(colors) {
  var root = document.documentElement;
  var a    = hexToRgb(colors.accent);
  var aRgb = a.r + "," + a.g + "," + a.b;
  customAccentRgb = aRgb;
  customAccentHex = colors.accent;

  // Accent and its derived opacity/hover variants
  root.style.setProperty("--accent",       colors.accent);
  root.style.setProperty("--accent-dim",   "rgba(" + aRgb + ",0.10)");
  root.style.setProperty("--accent-glow",  "rgba(" + aRgb + ",0.22)");
  root.style.setProperty("--accent-hover", darkenHex(colors.accent, 25));
  root.style.setProperty("--shadow-glow",
    "0 0 0 1px rgba(" + aRgb + ",0.20), 0 8px 32px rgba(" + aRgb + ",0.20)");

  // Background and card surface (surface keeps 80% opacity for glassmorphism)
  root.style.setProperty("--bg",            colors.bg);
  root.style.setProperty("--surface",       hexToRgba(colors.surface, 0.80));
  root.style.setProperty("--surface-solid", colors.surface);

  // Win color and its background tint
  var w    = hexToRgb(colors.win);
  var wRgb = w.r + "," + w.g + "," + w.b;
  root.style.setProperty("--win",    colors.win);
  root.style.setProperty("--win-bg", "rgba(" + wRgb + ",0.08)");

  // Loss color and its background tint
  var l    = hexToRgb(colors.loss);
  var lRgb = l.r + "," + l.g + "," + l.b;
  root.style.setProperty("--loss",    colors.loss);
  root.style.setProperty("--loss-bg", "rgba(" + lRgb + ",0.08)");

  // Update the RL wordmark gradient and the background blobs to match
  var wordmarkEl = document.getElementById("app-wordmark");
  if (wordmarkEl) {
    wordmarkEl.style.background = "linear-gradient(135deg, " + colors.accent + " 0%, #7c3aed 100%)";
    wordmarkEl.style.webkitBackgroundClip = "text";
    wordmarkEl.style.backgroundClip       = "text";
    wordmarkEl.style.webkitTextFillColor  = "transparent";
  }

  // Sync blob tint to accent so they glow with the chosen color
  var blobGrad = "radial-gradient(circle, rgba(" + aRgb + ",0.14) 0%, transparent 70%)";
  var b1 = document.getElementById("blob-1");
  var b2 = document.getElementById("blob-2");
  if (b1) b1.style.background = blobGrad;
  if (b2) b2.style.background = "radial-gradient(circle, rgba(" + aRgb + ",0.10) 0%, transparent 70%)";

  // Update chart line colors
  updateChartColors(colors.accent, aRgb);

  localStorage.setItem("rl_custom_colors", JSON.stringify(colors));
}

// Updates both line charts to use the given accent hex and rgb string.
function updateChartColors(hex, rgb) {
  [inSessionChart, longTermChart].forEach(function(chart) {
    if (!chart || !chart.data.datasets[0]) return;

    chart.data.datasets[0].borderColor         = hex;
    chart.data.datasets[0].pointBackgroundColor = hex;
    chart.data.datasets[0].pointBorderColor     = "#ffffff";

    chart.data.datasets[0].backgroundColor = function(context) {
      var c    = context.chart;
      var area = c.chartArea;
      if (!area) return "rgba(" + rgb + ",0)";
      var grad = c.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      grad.addColorStop(0, "rgba(" + rgb + ",0.18)");
      grad.addColorStop(1, "rgba(" + rgb + ",0)");
      return grad;
    };

    chart.options.scales.x.grid  = { color: "rgba(0,0,0,0.04)", drawBorder: false };
    chart.options.scales.y.grid  = { color: "rgba(0,0,0,0.04)", drawBorder: false };
    chart.options.scales.x.ticks = { color: "#9aa4be", font: { size: 11 } };
    chart.options.scales.y.ticks = { color: "#9aa4be", font: { size: 11 } };

    chart.update();
  });
}

// ============================================================
// CHART GLOW PLUGIN
// Registered globally so all charts get a glowing line.
// Uses customAccentRgb so it always matches the chosen color.
// ============================================================
Chart.register({
  id: "lineGlow",
  beforeDatasetDraw: function(chart) {
    chart.ctx.save();
    chart.ctx.shadowColor = "rgba(" + customAccentRgb + ",0.55)";
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
  var blobTicking = false;  // true only while there is motion left to animate
  var blob1 = document.getElementById("blob-1");
  var blob2 = document.getElementById("blob-2");
  var blob3 = document.getElementById("blob-3");
  var appHeader = document.getElementById("app-header");

  // { passive: true } lets the browser scroll without waiting for this handler to return.
  document.addEventListener("mousemove", function(e) {
    blobTargetX = (e.clientX / window.innerWidth)  - 0.5;
    blobTargetY = (e.clientY / window.innerHeight) - 0.5;
    if (!blobTicking) {
      blobTicking = true;
      requestAnimationFrame(tick);
    }
  }, { passive: true });

  function tick() {
    blobCurrentX += (blobTargetX - blobCurrentX) * 0.04;
    blobCurrentY += (blobTargetY - blobCurrentY) * 0.04;
    if (blob1) blob1.style.transform = "translate(" + (blobCurrentX * -48) + "px, " + (blobCurrentY * -32) + "px)";
    if (blob2) blob2.style.transform = "translate(" + (blobCurrentX *  36) + "px, " + (blobCurrentY *  24) + "px)";
    if (blob3) blob3.style.transform = "translate(" + (blobCurrentX *  20) + "px, " + (blobCurrentY * -18) + "px)";
    if (appHeader) appHeader.style.transform = "translate(" + (blobCurrentX * 8) + "px, " + (blobCurrentY * 4) + "px)";

    // Keep looping only while there is still perceptible movement remaining.
    // Once converged, stop entirely — next mousemove restarts it.
    if (Math.abs(blobTargetX - blobCurrentX) > 0.001 || Math.abs(blobTargetY - blobCurrentY) > 0.001) {
      requestAnimationFrame(tick);
    } else {
      blobTicking = false;
    }
  }

  // --- Scroll performance guard ---
  // Adds .is-scrolling to <body> while the user scrolls so CSS can suppress
  // hover-triggered paints on cards and sections.
  var scrollGuardTimer = null;
  window.addEventListener("scroll", function() {
    document.body.classList.add("is-scrolling");
    clearTimeout(scrollGuardTimer);
    scrollGuardTimer = setTimeout(function() {
      document.body.classList.remove("is-scrolling");
    }, 150);
  }, { passive: true });


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
  // will-change is set only while hovered so we don't hold GPU layers for every card at once.
  function setupTilt(card) {
    card.addEventListener("mouseenter", function() {
      card.style.willChange = "transform";
    });
    card.addEventListener("mousemove", function(e) {
      var rect = card.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width  - 0.5;
      var y = (e.clientY - rect.top)  / rect.height - 0.5;
      card.style.transform  = "perspective(700px) rotateX(" + (-y * 7) + "deg) rotateY(" + (x * 7) + "deg) translateZ(4px)";
      card.style.transition = "box-shadow 0.3s ease";
    });
    card.addEventListener("mouseleave", function() {
      card.style.willChange = "auto";  // release compositor layer
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
    // Use customAccentRgb/Hex so the gradient always matches the chosen color
    chart.data.datasets[0].backgroundColor = function(context) {
      var c    = context.chart;
      var area = c.chartArea;
      if (!area) return "rgba(" + customAccentRgb + ",0)";
      var grad = c.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      grad.addColorStop(0, "rgba(" + customAccentRgb + ",0.14)");
      grad.addColorStop(1, "rgba(" + customAccentRgb + ",0)");
      return grad;
    };
    chart.data.datasets[0].borderColor         = customAccentHex;
    chart.data.datasets[0].borderWidth         = 2.5;
    chart.data.datasets[0].pointBackgroundColor = customAccentHex;
    chart.data.datasets[0].pointBorderColor     = "#ffffff";
    chart.data.datasets[0].pointBorderWidth     = 2;
    chart.data.datasets[0].pointRadius         = 4;
    chart.data.datasets[0].pointHoverRadius    = 6;
    chart.data.datasets[0].tension             = 0.35;

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
