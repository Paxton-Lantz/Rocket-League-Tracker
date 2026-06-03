"""
RL Capture Daemon
-----------------
Polls the screen every second, detects the Rocket League end screen via OCR,
extracts your stats, and serves them as JSON at localhost:7891/latest.

The tracker app polls this endpoint and pre-fills the log form automatically.
You still hit Enter to confirm -- nothing auto-submits.

Setup: run install.bat once, then edit config.json with your username,
then run start.bat before each session.
"""

import json
import re
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import cv2
import mss
import numpy as np
import pytesseract
from PIL import Image, ImageEnhance
from pytesseract import Output

# ── Config ────────────────────────────────────────────────────────────────────

CONFIG_PATH = Path(__file__).parent / "config.json"

def load_config():
    try:
        with open(CONFIG_PATH) as f:
            cfg = json.load(f)
    except FileNotFoundError:
        print("ERROR: config.json not found. Copy it from the capture folder and edit your username.")
        sys.exit(1)

    if cfg.get("username", "YourUsernameHere") == "YourUsernameHere":
        print("ERROR: Edit config.json and set your in-game username before running.")
        sys.exit(1)

    return cfg

CONFIG   = load_config()
USERNAME = CONFIG["username"].lower()
PORT     = CONFIG.get("port", 7891)
MONITOR  = CONFIG.get("monitor", 1)  # 1 = primary monitor; change to 2 for secondary

# Brightness threshold for the fast pre-check (0-255).
# The end screen dims the game background; gameplay is brighter.
# Lower = stricter (fewer false OCR runs). Raise it if captures are missed.
# Can also be set in config.json as "brightness_threshold".
BRIGHTNESS_THRESHOLD = CONFIG.get("brightness_threshold", 70)

# Point pytesseract at the default Tesseract install location on Windows.
# If you installed to a custom path, change this.
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ── Shared state (written by poll loop, read by HTTP handler) ─────────────────

_latest_lock = threading.Lock()
_latest = {
    "timestamp": 0,
    "goals":     0,
    "assists":   0,
    "saves":     0,
    "shots":     0,
    "mvp":       False,
    "mmr_delta": 0,
}

# ── Screen capture ────────────────────────────────────────────────────────────

def grab_screen():
    """Capture the configured monitor and return a PIL RGB image."""
    with mss.mss() as sct:
        monitor = sct.monitors[MONITOR]
        shot = sct.grab(monitor)
        return Image.frombytes("RGB", shot.size, shot.rgb)


def preprocess(img):
    """Convert to grayscale + boost contrast for better OCR on dark backgrounds."""
    gray = img.convert("L")
    return ImageEnhance.Contrast(gray).enhance(1.5)


def is_dark_enough_for_ocr(img):
    """
    Fast pre-check that runs BEFORE Tesseract to avoid wasting CPU every second.

    Crops a proportional strip where the scoreboard header sits (~40-90% width,
    15-30% height), downsamples it to 8x4 pixels, and checks average brightness.

    The RL end screen dims the game background significantly. During active
    gameplay the arena is much brighter. If brightness >= BRIGHTNESS_THRESHOLD
    we skip OCR entirely — Tesseract never runs.

    If you're missing captures (end screen not detected), raise brightness_threshold
    in config.json. If OCR runs too often during gameplay, lower it.
    """
    w, h = img.size
    region = img.crop((int(w * 0.40), int(h * 0.15),
                       int(w * 0.90), int(h * 0.30)))
    thumb  = region.resize((8, 4), Image.LANCZOS).convert("L")
    pixels = list(thumb.getdata())
    avg    = sum(pixels) / len(pixels)
    return avg < BRIGHTNESS_THRESHOLD

# ── OCR helpers ───────────────────────────────────────────────────────────────

# The four column headers that only appear together on the post-game scoreboard.
REQUIRED_HEADERS = {"GOALS", "ASSISTS", "SAVES", "SHOTS"}

def run_ocr(img):
    """Run Tesseract on a preprocessed image. Returns the pytesseract data dict."""
    return pytesseract.image_to_data(img, output_type=Output.DICT)


def is_end_screen(words):
    """Return True if all four stat column headers are found with confidence > 50."""
    found = set()
    for i, word in enumerate(words["text"]):
        if word and int(words["conf"][i]) > 50 and word.upper() in REQUIRED_HEADERS:
            found.add(word.upper())
    return found >= REQUIRED_HEADERS


def find_header_positions(words):
    """Return {header: center_x} for each of the four stat column headers."""
    cols = {}
    for i, word in enumerate(words["text"]):
        w = word.upper() if word else ""
        if w in REQUIRED_HEADERS and int(words["conf"][i]) > 50:
            if w not in cols:  # take the first (topmost) occurrence
                cx = words["left"][i] + words["width"][i] // 2
                cols[w] = cx
    return cols


def find_username_row(words):
    """
    Find the row containing the player's username.
    Returns (row_y, username_left_x) or (None, None) if not found.
    """
    for i, word in enumerate(words["text"]):
        if word and USERNAME in word.lower():
            row_y = words["top"][i] + words["height"][i] // 2
            return row_y, words["left"][i]
    return None, None


def find_nearest_number(words, col_x, row_y, v_tol=50, h_tol=80):
    """
    Find the numeric word closest to (col_x, row_y) within the tolerance window.
    Returns the word string or None.
    """
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
    Find the MMR change value to the left of the username in the player row.
    Looks for a token matching +N or -N (or bare N) at x < username_x.
    Returns the integer value (positive for win, negative for loss).
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
        return 0
    # Take the leftmost match (MMR delta is the furthest-left number in the row)
    candidates.sort(key=lambda c: c[0])
    return candidates[0][1]

# ── MVP detection (color-based) ───────────────────────────────────────────────

def detect_mvp(img_rgb, row_y, username_x):
    """
    Look for a gold/yellow star pixel cluster to the left of the username
    at the player's row y-position.

    Gold in HSV: H 20-40, S > 100, V > 150.
    Returns True if enough gold pixels are found, else False.
    """
    img_np  = np.array(img_rgb)
    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    h, w = img_np.shape[:2]
    y1 = max(0, row_y - 25)
    y2 = min(h, row_y + 25)
    x1 = 0
    x2 = max(0, username_x - 5)

    if x2 <= x1:
        return False

    region    = img_hsv[y1:y2, x1:x2]
    gold_mask = cv2.inRange(region,
                            np.array([20, 100, 150]),
                            np.array([40, 255, 255]))
    return int(cv2.countNonZero(gold_mask)) > 50

# ── Stat extraction ───────────────────────────────────────────────────────────

def extract_stats(img_pil, words):
    """
    Given the raw PIL image and the OCR word dict, extract all stats.
    Returns a dict with keys: goals, assists, saves, shots, mmr_delta, mvp.
    Returns None if the player's row could not be located.
    """
    cols = find_header_positions(words)
    if len(cols) < 4:
        print(f"  Could not find all column headers (found: {list(cols.keys())})")
        return None

    row_y, username_x = find_username_row(words)
    if row_y is None:
        print(f"  Username '{CONFIG['username']}' not found on screen")
        return None

    stats = {}
    for header in ("GOALS", "ASSISTS", "SAVES", "SHOTS"):
        col_x  = cols[header]
        number = find_nearest_number(words, col_x, row_y)
        stats[header.lower()] = int(number) if number else 0

    mmr_delta = find_mmr_delta(words, row_y, username_x)
    mvp       = detect_mvp(img_pil, row_y, username_x)

    return {
        "goals":     stats["goals"],
        "assists":   stats["assists"],
        "saves":     stats["saves"],
        "shots":     stats["shots"],
        "mmr_delta": mmr_delta,
        "mvp":       mvp,
    }

# ── Poll loop ─────────────────────────────────────────────────────────────────

def poll_loop():
    """Main loop: screenshot every second, detect end screen, extract stats."""
    global _latest

    end_screen_showing = False
    last_captured_at   = 0.0

    print(f"Watching for Rocket League end screen (username: {CONFIG['username']})...")

    while True:
        try:
            img = grab_screen()

            # Fast brightness check — skip OCR during bright active gameplay.
            # This runs in microseconds vs ~500ms for Tesseract.
            if not is_dark_enough_for_ocr(img):
                end_screen_showing = False
                time.sleep(1)
                continue

            proc  = preprocess(img)
            words = run_ocr(proc)

            if is_end_screen(words):
                if not end_screen_showing:
                    # End screen just appeared
                    end_screen_showing = True
                    now = time.time()

                    # Debounce: ignore if we captured less than 10s ago
                    if now - last_captured_at < 10:
                        print("  End screen detected (debounced, too soon)")
                    else:
                        print("  End screen detected — extracting stats...")
                        result = extract_stats(img, words)
                        if result:
                            with _latest_lock:
                                _latest = {"timestamp": int(now), **result}
                            last_captured_at = now
                            print(f"  Captured: {_latest}")
                        else:
                            print("  Extraction failed — check username in config.json")
            else:
                if end_screen_showing:
                    print("  End screen dismissed")
                end_screen_showing = False

        except Exception as e:
            print(f"  Poll error: {e}")

        time.sleep(1)

# ── HTTP server ───────────────────────────────────────────────────────────────

class CaptureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/latest":
            self.send_response(404)
            self.end_headers()
            return

        with _latest_lock:
            payload = json.dumps(_latest).encode()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        pass  # suppress per-request logs to keep terminal clean


def start_http_server():
    server = HTTPServer(("localhost", PORT), CaptureHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    print(f"HTTP server running at http://localhost:{PORT}/latest")

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    start_http_server()
    poll_loop()
