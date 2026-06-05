"""
RL Capture Daemon
-----------------
Watches your screen for the Rocket League end-of-game scoreboard, reads your
stats via OCR, and makes them available at localhost:7891/latest so the tracker
can pre-fill the log form automatically.

User setup: download rl-capture.exe, double-click it. That's it.
  - Runs silently in the system tray.
  - Registers itself to start automatically with Windows.
  - Username comes from the tracker browser (no config file needed).
"""

import json
import logging
import os
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import cv2
import mss
import numpy as np
import pytesseract
from PIL import Image, ImageDraw, ImageEnhance
from pytesseract import Output

# ── Path resolution ───────────────────────────────────────────────────────────
# sys.frozen is True when running as a PyInstaller .exe.
# sys._MEIPASS is the temp dir where bundled files are extracted at runtime.
# sys.executable is the .exe path — config.json and the log live next to it.

_IS_FROZEN = getattr(sys, "frozen", False)

if _IS_FROZEN:
    _bundle_dir = sys._MEIPASS
    _exe_dir    = Path(sys.executable).parent
    pytesseract.pytesseract.tesseract_cmd = os.path.join(_bundle_dir, "tesseract", "tesseract.exe")
    os.environ["TESSDATA_PREFIX"]         = os.path.join(_bundle_dir, "tessdata")
else:
    _exe_dir = Path(__file__).parent
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ── Logging ───────────────────────────────────────────────────────────────────
# In the frozen .exe there's no console, so write to a log file next to the exe.
# In dev mode, print to stdout as usual.

if _IS_FROZEN:
    logging.basicConfig(
        filename=str(_exe_dir / "rl-capture.log"),
        level=logging.INFO,
        format="%(asctime)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    log = logging.info
else:
    log = print

# ── Config (optional) ─────────────────────────────────────────────────────────
# config.json is entirely optional. Username now comes from the tracker browser.
# Only use config.json to override monitor index or brightness threshold.

_cfg_path = _exe_dir / "config.json"
_cfg = {}
try:
    with open(_cfg_path) as _f:
        _cfg = json.load(_f)
except (FileNotFoundError, json.JSONDecodeError):
    pass  # fine — all values have sensible defaults

PORT                 = _cfg.get("port", 7891)
MONITOR              = _cfg.get("monitor", 1)
BRIGHTNESS_THRESHOLD = _cfg.get("brightness_threshold", 110)

# ── Username (set by tracker browser via query param) ─────────────────────────
# The tracker passes ?username=YourName on every poll request.
# The poll loop uses this to locate the player's row on the scoreboard.

_username_lock = threading.Lock()
_username      = _cfg.get("username", "").lower().strip()  # fallback if set in config

def get_username():
    with _username_lock:
        return _username

def set_username(name):
    global _username
    with _username_lock:
        _username = name.lower().strip()

# ── Daemon health state ───────────────────────────────────────────────────────

_startup_time  = time.time()
_tesseract_ok  = False   # set True after first successful OCR call

# ── Shared capture result ─────────────────────────────────────────────────────

_latest_lock = threading.Lock()
_latest = {
    "timestamp": 0,
    "goals":     0,
    "assists":   0,
    "saves":     0,
    "shots":     0,
    "mvp":       False,
    "mmr_delta": 0,
    "opp_mmr":   None,
}

# ── Screen capture ────────────────────────────────────────────────────────────

def grab_screen():
    with mss.MSS() as sct:
        monitor = sct.monitors[MONITOR]
        shot    = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.rgb)


def preprocess(img):
    gray = img.convert("L")
    return ImageEnhance.Contrast(gray).enhance(1.5)


def is_dark_enough_for_ocr(img):
    """
    Fast pre-check before running Tesseract. The RL end screen darkens the
    background significantly vs. active gameplay. Crops the scoreboard region,
    downsamples to 8x4 px, checks average brightness.

    Returns (passed: bool, avg_brightness: float).
    The caller uses avg_brightness in diagnostic log messages.
    """
    w, h   = img.size
    region = img.crop((int(w * 0.40), int(h * 0.15), int(w * 0.90), int(h * 0.30)))
    thumb  = region.resize((8, 4), Image.LANCZOS).convert("L")
    avg    = float(np.mean(np.array(thumb)))
    return avg < BRIGHTNESS_THRESHOLD, avg

# ── OCR helpers ───────────────────────────────────────────────────────────────

# Headers required to declare "this is the end screen". ASSISTS is intentionally
# excluded because 1v1 scoreboards don't have an ASSISTS column — requiring it
# would block detection entirely in solo queue.
REQUIRED_HEADERS = {"GOALS", "SAVES", "SHOTS"}

# Full stat header set used when extracting column positions. ASSISTS may or
# may not be present depending on game mode; callers handle its absence.
_ALL_HEADERS = {"GOALS", "ASSISTS", "SAVES", "SHOTS"}

def run_ocr(img):
    return pytesseract.image_to_data(img, output_type=Output.DICT)


def _find_headers(words):
    """
    Returns the set of REQUIRED_HEADERS that OCR found (confidence >= 30).
    Threshold lowered from 50 so that RL's stylised scoreboard font scores
    reliably even when Tesseract is less certain about individual characters.
    """
    found = set()
    for i, word in enumerate(words["text"]):
        if word and int(words["conf"][i]) > 30 and word.upper() in REQUIRED_HEADERS:
            found.add(word.upper())
    return found

def is_end_screen(words):
    return _find_headers(words) >= REQUIRED_HEADERS


def find_header_positions(words):
    cols = {}
    for i, word in enumerate(words["text"]):
        w = word.upper() if word else ""
        if w in _ALL_HEADERS and int(words["conf"][i]) > 30:
            if w not in cols:
                cx = words["left"][i] + words["width"][i] // 2
                cols[w] = cx
    return cols


def _edit_distance(a, b):
    """Levenshtein distance — counts substitutions, insertions, and deletions."""
    if a == b:
        return 0
    m, n = len(a), len(b)
    if m < n:
        a, b, m, n = b, a, n, m
    row = list(range(n + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            temp = row[j]
            row[j] = prev if ca == cb else 1 + min(prev, row[j], row[j - 1])
            prev = temp
    return row[n]


def _strip_club_tag(text):
    """Remove a leading [CLUB] tag that Rocket League prepends to player names."""
    return re.sub(r'^\[.*?\]\s*', '', text)


def _username_matches(text, username):
    """
    True if text contains or closely resembles username.

    Strips any leading club tag (e.g. [***], [NUT]) before matching so
    a name like '[***]SaxyPaxy' is treated the same as 'SaxyPaxy'.

    Allows up to 40% of the username length in total edits (substitutions,
    insertions, deletions). For an 8-character name like SaxyPaxy that's 3
    edits, so 'SexyPex' (2 subs + 1 deletion) still matches. Since the
    username is unique, false positives against other players are extremely
    unlikely.
    """
    tl = _strip_club_tag(text.lower())
    if username in tl:
        return True
    n = len(username)
    max_dist = max(2, round(n * 0.4))  # 3 for an 8-char name

    # Short string (individual OCR token): compare directly
    if len(tl) <= n + max_dist:
        return _edit_distance(username, tl) <= max_dist

    # Longer string (joined row): slide windows of varying length to find the best match
    for wlen in range(max(n - max_dist, 4), n + max_dist + 1):
        for start in range(len(tl) - wlen + 1):
            if _edit_distance(username, tl[start:start + wlen]) <= max_dist:
                return True
    return False


def find_username_row(words, username, img_width=0, img_height=0):
    """
    Find the scoreboard row containing the player's username.

    The bottom-left name card (e.g. '[***] SaxyPaxy') is excluded by
    requiring that a token be BOTH in the left 35% AND the bottom 30% of
    the screen before skipping it. Scoreboard rows sit in the upper portion
    of the screen so they are never filtered even if the name column falls
    left of centre.

    Uses fuzzy matching to handle OCR errors like 'SaxyPaxy' → 'SexyPaxy'.
    """
    x_edge = int(img_width  * 0.35) if img_width  else 0
    y_edge = int(img_height * 0.70) if img_height else 0

    def is_name_card(left, top):
        # The bottom-left name card is the only element that is simultaneously
        # far left AND far down. Scoreboard rows are always in the upper half.
        return img_width and img_height and left < x_edge and top > y_edge

    # Fast path: username appears in a single OCR word
    for i, word in enumerate(words["text"]):
        if not word or is_name_card(words["left"][i], words["top"][i]):
            continue
        if _username_matches(word, username):
            row_y = words["top"][i] + words["height"][i] // 2
            return row_y, words["left"][i]

    # Slow path: group words into rows and check joined text
    rows = {}  # row_key -> list of (left, mid_y, text) tuples
    for i, word in enumerate(words["text"]):
        if not word or not word.strip() or is_name_card(words["left"][i], words["top"][i]):
            continue
        mid_y   = words["top"][i] + words["height"][i] // 2
        row_key = round(mid_y / 20) * 20
        rows.setdefault(row_key, []).append((words["left"][i], mid_y, word))

    for row_key, tokens in sorted(rows.items()):
        tokens.sort(key=lambda t: t[0])  # left-to-right
        line = " ".join(t[2] for t in tokens)
        if _username_matches(line, username):
            # 1) A single token contains the whole username
            for left, mid_y, word in tokens:
                if _username_matches(word, username):
                    return mid_y, left
            # 2) Two adjacent tokens form the username (OCR splits "SaxyPaxy" → "Saxy" "Paxy")
            for j in range(len(tokens) - 1):
                pair = tokens[j][2] + " " + tokens[j + 1][2]
                if _username_matches(pair, username):
                    return tokens[j][1], tokens[j][0]
            # 3) First token that contains any letter — skips pure-number MMR/score columns on left
            for left, mid_y, word in tokens:
                if any(c.isalpha() for c in word):
                    return mid_y, left
            # 4) Second token as final fallback (leftmost is always the MMR delta number)
            t = tokens[1] if len(tokens) > 1 else tokens[0]
            return t[1], t[0]

    return None, None


def find_nearest_number(words, col_x, row_y, v_tol=60, h_tol=120):
    best_word = None
    best_dist = float("inf")
    for i, word in enumerate(words["text"]):
        if not word or not word.isdigit():
            continue
        wx = words["left"][i] + words["width"][i] // 2
        wy = words["top"][i] + words["height"][i] // 2
        if abs(wy - row_y) <= v_tol and abs(wx - col_x) <= h_tol:
            dist = abs(wx - col_x) + abs(wy - row_y)
            if dist < best_dist:
                best_dist = dist
                best_word = word
    return best_word


MMR_PATTERN = re.compile(r"^[+-]?\d+$")

def find_mmr_delta(words, row_y, username_x, v_tol=50):
    """
    Find the MMR delta for the player's row.

    The scoreboard layout is: [delta] [current_mmr] [username]
    Both numbers sit to the left of username_x, with the delta furthest left.

    Handles a common OCR misread where '+' is read as '4', turning '+13'
    into '413'. Detection: if the leftmost candidate is large (>= 200) and
    starts with '4', AND a second number is present (confirming this column
    is the delta, not the MMR), strip the leading '4' and return the rest
    as a positive delta.
    """
    candidates = []
    for i, word in enumerate(words["text"]):
        if not word or not MMR_PATTERN.match(word):
            continue
        wx = words["left"][i] + words["width"][i] // 2
        wy = words["top"][i] + words["height"][i] // 2
        if abs(wy - row_y) <= v_tol and wx < username_x:
            candidates.append((wx, int(word)))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0])
    leftmost = candidates[0][1]

    # Clear negative — trust it
    if leftmost < 0:
        return leftmost

    s = str(leftmost)
    # '+' sign OCR-misread as '4': '+8' → '48', '+13' → '413'.
    # Strip the leading '4' when the result is a plausible small positive delta (1-50).
    # At Gold rank the per-game delta is almost always 5-25, never 41-50, so false
    # positives from stripping a legitimate 41-50 value are not a practical risk.
    if s[0] == '4' and len(s) > 1:
        stripped = int(s[1:])
        if 1 <= stripped <= 50:
            return stripped

    # Small-to-medium value — trust as-is
    if 0 <= leftmost <= 200:
        return leftmost

    return None

# ── Opponent MMR ─────────────────────────────────────────────────────────────

def find_opponent_mmr(words, player_row_y, img_width, v_tol=40):
    """
    Find the opponent's current MMR from the scoreboard.

    No horizontal boundary — MMR values can appear anywhere on the scoreboard.
    Collects all numbers in the plausible MMR range (100-3500) that are NOT on
    the player's own row, then picks the value closest in Y to the player row.

    Returns None if nothing suitable is found.
    """
    # All numbers in MMR range, anywhere on screen
    candidates = []  # (wx, wy, val)
    for i, word in enumerate(words["text"]):
        if not word or not word.isdigit():
            continue
        val = int(word)
        if val < 100 or val > 3500:
            continue
        wx = words["left"][i] + words["width"][i] // 2
        wy = words["top"][i] + words["height"][i] // 2
        candidates.append((wx, wy, val))

    log(f"    opp_mmr scan: {len(candidates)} numbers in range 100-3500: {[(x, y, v) for x, y, v in candidates]}")

    if not candidates:
        return None

    # Exclude numbers that are ON the player's own row
    off_row = [(wx, wy, val) for wx, wy, val in candidates if abs(wy - player_row_y) > v_tol]

    log(f"    opp_mmr off-player-row: {[(x, y, v) for x, y, v in off_row]}")

    if not off_row:
        return None

    # Bucket by row (quantized y) and pick the best value per row
    row_buckets = {}
    for wx, wy, val in off_row:
        row_key = round(wy / (v_tol * 2)) * (v_tol * 2)
        row_buckets.setdefault(row_key, []).append((wx, val))

    # From each bucket pick the largest value (most likely to be the MMR, not score/stat)
    row_mmrs = []
    for ry, entries in sorted(row_buckets.items()):
        best_val = max(v for _, v in entries)
        row_mmrs.append((ry, best_val))

    log(f"    opp_mmr row candidates: {row_mmrs}")

    # Return the row closest to player_row_y (the opponent's row in 1v1)
    row_mmrs.sort(key=lambda r: abs(r[0] - player_row_y))
    return row_mmrs[0][1]

# ── MVP detection ─────────────────────────────────────────────────────────────

def detect_mvp(img_rgb, row_y, username_x):
    """Gold/yellow pixel cluster (HSV H:20-40, S>100, V>150) left of username."""
    img_np  = np.array(img_rgb)
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    h, w    = img_np.shape[:2]
    y1, y2  = max(0, row_y - 25), min(h, row_y + 25)
    x1, x2  = 0, max(0, username_x - 5)
    if x2 <= x1:
        return False
    region    = img_hsv[y1:y2, x1:x2]
    gold_mask = cv2.inRange(region, np.array([20, 100, 150]), np.array([40, 255, 255]))
    return int(cv2.countNonZero(gold_mask)) > 50

# ── Stat extraction ───────────────────────────────────────────────────────────

def extract_stats(img_pil, words, username):
    cols = find_header_positions(words)
    if len(cols) < 3:
        log(f"  Could not find enough column headers (found: {list(cols.keys())})")
        return None

    row_y, username_x = find_username_row(words, username, img_pil.width, img_pil.height)
    if row_y is None:
        all_words = sorted(set(w for w in words["text"] if w and w.strip()))
        log(f"  Username '{username}' not found. All OCR words: {all_words}")
        return None

    log(f"    row_y={row_y}  username_x={username_x}  cols={cols}")
    stats = {}
    for header in ("GOALS", "ASSISTS", "SAVES", "SHOTS"):
        if header not in cols:
            stats[header.lower()] = 0  # absent in 1v1 (no ASSISTS column)
            continue
        number = find_nearest_number(words, cols[header], row_y)
        stats[header.lower()] = int(number) if number else 0
        log(f"    {header}: col_x={cols[header]} found={number!r}")

    mmr_delta = find_mmr_delta(words, row_y, username_x)
    log(f"    mmr_delta raw={mmr_delta}")

    return {
        "goals":     stats["goals"],
        "assists":   stats["assists"],
        "saves":     stats["saves"],
        "shots":     stats["shots"],
        "mmr_delta": mmr_delta if mmr_delta is not None else 0,
        "mvp":       detect_mvp(img_pil, row_y, username_x),
        "opp_mmr":   find_opponent_mmr(words, row_y, img_pil.width),
    }

# ── Monitor auto-detection ───────────────────────────────────────────────────
# Finds the Rocket League window using the Windows API (ctypes, stdlib-only)
# and returns which monitor (1-indexed) it's on. Called once at startup.

def detect_rl_monitor():
    if sys.platform != "win32":
        return None
    try:
        import ctypes, ctypes.wintypes

        found = []

        @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
        def _cb(hwnd, _):
            n = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            if n:
                buf = ctypes.create_unicode_buffer(n + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buf, n + 1)
                if "Rocket League" in buf.value:
                    found.append(hwnd)
            return True

        ctypes.windll.user32.EnumWindows(_cb, 0)
        if not found:
            return None

        rect = ctypes.wintypes.RECT()
        ctypes.windll.user32.GetWindowRect(found[0], ctypes.byref(rect))
        cx = (rect.left + rect.right)  // 2
        cy = (rect.top  + rect.bottom) // 2

        with mss.MSS() as sct:
            for idx, m in enumerate(sct.monitors[1:], start=1):
                if m["left"] <= cx < m["left"] + m["width"] and \
                   m["top"]  <= cy < m["top"]  + m["height"]:
                    return idx
    except Exception as e:
        log(f"Monitor auto-detect: {e}")
    return None


# ── Tesseract health check ────────────────────────────────────────────────────

def check_tesseract():
    global _tesseract_ok
    try:
        pytesseract.image_to_string(Image.new("L", (4, 4), 255))
        _tesseract_ok = True
        log("Tesseract: OK")
    except Exception as e:
        _tesseract_ok = False
        log(f"Tesseract: FAILED — {e}")

# ── Poll loop ─────────────────────────────────────────────────────────────────

def poll_loop():
    global _tesseract_ok, _latest
    log("RL Capture started. Watching for end screens...")

    end_screen_showing  = False
    end_screen_captured = False  # True once we get a successful capture for this showing
    last_captured_at    = 0.0
    dark_window_active  = False  # True while brightness pre-check is passing
    last_logged_headers = None   # tracks last header set logged to avoid repeat spam

    while True:
        try:
            username = get_username()
            if not username:
                # Wait for the tracker to send a username before doing anything
                time.sleep(2)
                continue

            img = grab_screen()
            dark_ok, avg = is_dark_enough_for_ocr(img)

            if not dark_ok:
                # Screen became bright again — log what happened during the dark window
                if dark_window_active:
                    if end_screen_showing and not end_screen_captured:
                        log(f"  Screen bright again (avg {avg:.0f}) — end screen left without a clean capture")
                    elif end_screen_showing:
                        log(f"  Screen bright again (avg {avg:.0f}) — end screen dismissed")
                    elif last_logged_headers is not None:
                        log(f"  Screen bright again (avg {avg:.0f}) — OCR ran but no full end screen (last headers: {last_logged_headers})")
                    dark_window_active  = False
                    last_logged_headers = None
                end_screen_showing  = False
                end_screen_captured = False
                time.sleep(1)
                continue

            # Screen is dark enough — run OCR
            if not dark_window_active:
                log(f"  Screen darkened (avg brightness {avg:.0f}, threshold {BRIGHTNESS_THRESHOLD}) — running OCR...")
                dark_window_active  = True
                last_logged_headers = None  # reset for this new dark window

            proc  = preprocess(img)
            words = run_ocr(proc)
            _tesseract_ok = True  # OCR ran without crashing — Tesseract is working

            found = _find_headers(words)

            if found >= REQUIRED_HEADERS:
                now = time.time()
                if not end_screen_showing:
                    end_screen_showing  = True
                    end_screen_captured = False
                    if now - last_captured_at < 10:
                        log("  End screen detected (debounced)")
                    else:
                        log("  End screen detected — extracting stats...")

                # Retry every loop until we get a clean capture for this showing.
                # The debounce only skips the very first attempt if a capture
                # happened recently (same game shown twice on rematch).
                if not end_screen_captured and now - last_captured_at >= 10:
                    result = extract_stats(img, words, username)
                    if result:
                        with _latest_lock:
                            _latest = {"timestamp": int(now * 1000), **result}
                        last_captured_at    = now
                        end_screen_captured = True
                        log(f"  Captured: {result}")
            else:
                # Log what headers were found, but only when the set changes to avoid spam
                if found != last_logged_headers:
                    if found:
                        log(f"  Partial headers found: {found} — still missing: {REQUIRED_HEADERS - found}")
                    else:
                        log(f"  OCR ran on dark screen — no scoreboard headers found (avg {avg:.0f})")
                    last_logged_headers = found

                if end_screen_showing and not end_screen_captured:
                    log("  End screen dismissed without a clean capture")
                elif end_screen_showing:
                    log("  End screen dismissed")
                end_screen_showing  = False
                end_screen_captured = False

        except Exception as e:
            log(f"  Poll error: {e}")

        time.sleep(1)

# ── HTTP server ───────────────────────────────────────────────────────────────

class CaptureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global _latest
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        # Both endpoints accept ?username= so the tracker can register it from either call
        if "username" in params:
            set_username(params["username"][0])

        if parsed.path == "/latest":
            with _latest_lock:
                payload = json.dumps(_latest).encode()
            self._json(payload)

        elif parsed.path == "/status":
            payload = json.dumps({
                "ok":              True,
                "username":        get_username(),
                "tesseract_ok":    _tesseract_ok,
                "monitor":         MONITOR,
                "uptime_seconds":  int(time.time() - _startup_time),
            }).encode()
            self._json(payload)

        elif parsed.path == "/inject" and not _IS_FROZEN:
            # Dev/test only — not available in the distributed .exe.
            # Simulates a capture result so the browser auto-fill path can be
            # verified without needing to play a game.
            # Usage: GET /inject?goals=3&saves=1&shots=5&mmr_delta=8&mvp=true
            def _qi(key, default=0):
                try:   return int(params.get(key, [default])[0])
                except: return default
            def _qb(key):
                return str(params.get(key, ["false"])[0]).lower() in ("true", "1", "yes")
            injected = {
                "timestamp": int(time.time() * 1000),
                "goals":     _qi("goals"),
                "assists":   _qi("assists"),
                "saves":     _qi("saves"),
                "shots":     _qi("shots"),
                "mmr_delta": _qi("mmr_delta"),
                "mvp":       _qb("mvp"),
                "opp_mmr":   _qi("opp_mmr") or None,
            }
            with _latest_lock:
                _latest = injected
            log(f"  [inject] Test data pushed: {injected}")
            self._json(json.dumps({"ok": True, "injected": injected}).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def _json(self, payload):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass


def start_http_server():
    server = HTTPServer(("localhost", PORT), CaptureHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    log(f"HTTP server at http://localhost:{PORT}/latest")

# ── Windows startup registration ──────────────────────────────────────────────
# Adds the .exe to HKCU Run so it starts automatically with Windows.
# Only runs when frozen (the built .exe), never in dev mode.

def register_startup():
    if not _IS_FROZEN:
        return
    try:
        import winreg
        exe_path = f'"{sys.executable}"'
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE | winreg.KEY_QUERY_VALUE,
        )
        try:
            existing = winreg.QueryValueEx(key, "RLCapture")[0]
            if existing == exe_path:
                winreg.CloseKey(key)
                return  # already registered
        except FileNotFoundError:
            pass
        winreg.SetValueEx(key, "RLCapture", 0, winreg.REG_SZ, exe_path)
        winreg.CloseKey(key)
        log("Registered in Windows startup.")
    except Exception as e:
        log(f"Could not register startup: {e}")

# ── System tray ───────────────────────────────────────────────────────────────
# Shows a small icon in the Windows system tray. No terminal window.
# Right-click the icon to quit.

def _make_tray_icon():
    img  = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([2, 2, 62, 62], fill=(37, 99, 235, 255))   # blue outer circle
    draw.ellipse([20, 20, 44, 44], fill=(255, 255, 255, 255)) # white inner dot
    return img

def run_tray():
    import pystray

    def on_quit(icon, item):
        icon.stop()
        os._exit(0)

    icon = pystray.Icon(
        name="rl-capture",
        icon=_make_tray_icon(),
        title="RL Capture — Running",
        menu=pystray.Menu(
            pystray.MenuItem("RL Capture", None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", on_quit),
        ),
    )
    icon.run()  # blocks main thread until Quit is clicked

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Auto-detect which monitor Rocket League is on (overrides config if found)
    detected = detect_rl_monitor()
    if detected:
        MONITOR = detected
        log(f"Rocket League detected on monitor {detected}")
    else:
        log(f"Using monitor {MONITOR} (Rocket League window not found — start RL first if capture misses)")

    # Verify Tesseract is accessible before anyone connects
    check_tesseract()

    register_startup()
    start_http_server()

    poll_thread = threading.Thread(target=poll_loop, daemon=True)
    poll_thread.start()

    if _IS_FROZEN:
        run_tray()   # silent tray app — blocks until user quits
    else:
        poll_thread.join()  # dev mode: stay alive until Ctrl-C
