# rl-capture.spec
#
# PyInstaller spec file that builds a single self-contained rl-capture.exe.
# Bundles Python, all dependencies, the Tesseract binary, its DLLs, and the
# English language data — no installs required on the target machine.
#
# To build: run build.bat  (or: pyinstaller rl-capture.spec --noconfirm)
# Output:   dist/rl-capture.exe  (~80-120 MB)
#
# What to distribute:
#   dist/rl-capture.exe   <-- the executable
#   config.json           <-- user edits this once (username, monitor, etc.)
# Both files must sit in the same folder.

import glob
import os

# ── Tesseract paths ───────────────────────────────────────────────────────────
# Change TESS_DIR if Tesseract is installed to a non-default location.

TESS_DIR = r"C:\Program Files\Tesseract-OCR"

tess_binaries = [
    # The main executable
    (os.path.join(TESS_DIR, "tesseract.exe"), "tesseract"),
]
# All DLLs that tesseract.exe depends on (leptonica, opencv_world, etc.)
for _dll in glob.glob(os.path.join(TESS_DIR, "*.dll")):
    tess_binaries.append((_dll, "tesseract"))

# Only English language data — keeps the exe size reasonable.
# Add more .traineddata files here if other languages are needed.
tess_datas = [
    (os.path.join(TESS_DIR, "tessdata", "eng.traineddata"), "tessdata"),
]

# ── Analysis ──────────────────────────────────────────────────────────────────

block_cipher = None

a = Analysis(
    ["capture.py"],
    pathex=[],
    binaries=tess_binaries,
    datas=tess_datas,
    hiddenimports=[
        "mss",
        "mss.windows",
        "pytesseract",
        "cv2",
        "PIL",
        "PIL.Image",
        "PIL.ImageDraw",
        "PIL.ImageEnhance",
        "numpy",
        "numpy.core._methods",
        "numpy.lib.format",
        "pystray",
        "pystray._win32",
        "pystray._base",
        "winreg",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="rl-capture",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,          # compress with UPX if available — reduces size ~30%
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,     # tray app — no terminal window; logs go to rl-capture.log
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
