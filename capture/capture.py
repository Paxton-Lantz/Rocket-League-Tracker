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
BRIGHTNESS_THRESHOLD = _cfg.get("brightness_threshold", 70)

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
    with mss.mss() as sct:
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
    downsamples to 8x4 px, checks average brightness. Returns True if dark
    enough to be worth running OCR.
    """
    w, h   = img.size
    region = img.crop((int(w * 0.40), int(h * 0.15), int(w * 0.90), int(h * 0.30)))
    thumb  = region.resize((8, 4), Image.LANCZOS).convert("L")
    pixels = list(thumb.getdata())
    avg    = sum(pixels) / len(pixels)
    return avg < BRIGHTNESS_THRESHOLD

# ── OCR helpers ───────────────────────────────────────────────────────────────

REQUIRED_HEADERS = {"GOALS", "ASSISTS", "SAVES", "SHOTS"}

def run_ocr(img):
    return pytesseract.image_to_data(img, output_type=Output.DICT)


def is_end_screen(words):
    found = set()
    for i, word in enumerate(words["text"]):
        if word and int(words["conf"][i]) > 50 and word.upper() in REQUIRED_HEADERS:
            found.add(word.upper())
    return found >= REQUIRED_HEADERS


def find_header_positions(words):
    cols = {}
    for i, word in enumerate(words["text"]):
        w = word.upper() if word else ""
        if w in REQUIRED_HEADERS and int(words["conf"][i]) > 50:
            if w not in cols:
                cx = words["left"][i] + words["width"][i] // 2
                cols[w] = cx
    return cols


def find_username_row(words, username):
    for i, word in enumerate(words["text"]):
        if word and username in word.lower():
            row_y = words["top"][i] + words["height"][i] // 2
            return row_y, words["left"][i]
    return None, None


def find_nearest_number(words, col_x, row_y, v_tol=50, h_tol=80):
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
    candidates = []
    for i, word in enumerate(words["text"]):
        if not word or not MMR_PATTERN.match(word):
            continue
        wx = words["left"][i] + words["width"][i] // 2
        wy = words["top"][i] + words["height"][i] // 2
        if abs(wy - row_y) <= v_tol and wx < username_x:
            candidates.append((wx, int(word)))
    if not candidates:
        return 0
    candidates.sort(key=lambda c: c[0])
    return candidates[0][1]

# ── Opponent MMR ─────────────────────────────────────────────────────────────

def find_opponent_mmr(words, player_row_y, img_width, v_tol=40):
    """
    Find the average MMR of all opponents on the scoreboard.

    Current MMR values appear as unsigned 3-4 digit integers in the left ~45%
    of the screen. Readings are grouped by approximate row so each opponent
    counts once even if OCR finds the number twice. The average across all
    opponent rows is more representative of match difficulty than the max.
    """
    left_boundary = img_width * 0.45
    row_values = {}  # quantized y -> list of candidate MMR readings for that row

    for i, word in enumerate(words["text"]):
        if not word or not word.isdigit():
            continue
        val = int(word)
        if val < 100 or val > 3000:
            continue
        wx = words["left"][i] + words["width"][i] // 2
        wy = words["top"][i] + words["height"][i] // 2
        if wx > left_boundary:
            continue
        if abs(wy - player_row_y) <= v_tol:  # skip the user's own row
            continue
        row_key = round(wy / (v_tol * 2)) * (v_tol * 2)
        row_values.setdefault(row_key, []).append(val)

    if not row_values:
        return None

    # One MMR per opponent (best reading within each row), then average
    per_player = [max(vals) for vals in row_values.values()]
    return round(sum(per_player) / len(per_player))

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
    if len(cols) < 4:
        log(f"  Could not find all column headers (found: {list(cols.keys())})")
        return None

    row_y, username_x = find_username_row(words, username)
    if row_y is None:
        log(f"  Username '{username}' not found on screen")
        return None

    stats = {}
    for header in ("GOALS", "ASSISTS", "SAVES", "SHOTS"):
        number = find_nearest_number(words, cols[header], row_y)
        stats[header.lower()] = int(number) if number else 0

    return {
        "goals":     stats["goals"],
        "assists":   stats["assists"],
        "saves":     stats["saves"],
        "shots":     stats["shots"],
        "mmr_delta": find_mmr_delta(words, row_y, username_x),
        "mvp":       detect_mvp(img_pil, row_y, username_x),
        "opp_mmr":   find_opponent_mmr(words, row_y, img_pil.width),
    }

# ── Poll loop ─────────────────────────────────────────────────────────────────

def poll_loop():
    log("RL Capture started. Watching for end screens...")

    end_screen_showing = False
    last_captured_at   = 0.0

    while True:
        try:
            username = get_username()
            if not username:
                # Wait for the tracker to send a username before doing anything
                time.sleep(2)
                continue

            img = grab_screen()

            if not is_dark_enough_for_ocr(img):
                end_screen_showing = False
                time.sleep(1)
                continue

            proc  = preprocess(img)
            words = run_ocr(proc)

            if is_end_screen(words):
                if not end_screen_showing:
                    end_screen_showing = True
                    now = time.time()
                    if now - last_captured_at < 10:
                        log("  End screen detected (debounced)")
                    else:
                        log("  End screen detected — extracting stats...")
                        result = extract_stats(img, words, username)
                        if result:
                            with _latest_lock:
                                _latest = {"timestamp": int(now), **result}
                            last_captured_at = now
                            log(f"  Captured: {result}")
                        else:
                            log("  Extraction failed — username not found on scoreboard")
            else:
                if end_screen_showing:
                    log("  End screen dismissed")
                end_screen_showing = False

        except Exception as e:
            log(f"  Poll error: {e}")

        time.sleep(1)

# ── HTTP server ───────────────────────────────────────────────────────────────

class CaptureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path != "/latest":
            self.send_response(404)
            self.end_headers()
            return

        # Accept username from the tracker browser so users never edit a config file
        params = parse_qs(parsed.query)
        if "username" in params:
            set_username(params["username"][0])

        with _latest_lock:
            payload = json.dumps(_latest).encode()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass  # suppress per-request noise


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
    register_startup()
    start_http_server()

    poll_thread = threading.Thread(target=poll_loop, daemon=True)
    poll_thread.start()

    if _IS_FROZEN:
        run_tray()   # silent tray app — blocks until user quits
    else:
        poll_thread.join()  # dev mode: stay alive until Ctrl-C
