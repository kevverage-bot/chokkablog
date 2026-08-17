#!/bin/bash
#
# Regenerate the committed icons and the default share card.
#
# WHY THIS IS A SCRIPT AND NOT PART OF THE BUILD
# Rasterising an SVG needs a font engine and an SVG renderer. The Node build has
# neither, and adding one (sharp, resvg, a headless browser) to turn two files
# into five is a dependency the deploy would carry forever. macOS already has
# both, in qlmanage and sips — so the images are generated here, by hand, and
# COMMITTED. They change roughly never.
#
# ⚠ macOS only, and run from the repo root:
#
#     bash scripts/make-icons.sh
#
# Outputs (all committed):
#   public/favicon.ico          48 + 96, PNG payloads — the /favicon.ico a
#                               crawler probes when it ignores the <link> tags
#   public/apple-touch-icon.png 180, the iOS home-screen icon
#   public/icon-192.png         192, for Android / a future web manifest
#   public/img/og-default.png   1200×630, the share card every page falls back to
#
# Sources: public/favicon.svg (the icon) and scripts/og-card.svg (the card).
#
# qlmanage always writes a SQUARE thumbnail, which is why the card is drawn on a
# 1200×1200 canvas with its content in the middle band and then cropped to
# 1200×630. Move anything in og-card.svg and keep it inside y=285..915.
set -euo pipefail

test -f public/favicon.svg || { echo "run me from the repo root"; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# ── The icon ──
cp public/favicon.svg "$tmp/"
qlmanage -t -s 512 -o "$tmp" "$tmp/favicon.svg" >/dev/null 2>&1
for s in 192 180 96 48; do
  sips -z "$s" "$s" "$tmp/favicon.svg.png" --out "$tmp/icon-$s.png" >/dev/null
done
cp "$tmp/icon-180.png" public/apple-touch-icon.png
cp "$tmp/icon-192.png" public/icon-192.png

# An .ico is a 6-byte header, a 16-byte directory entry per image, then the
# payloads. PNG payloads are legal and read by everything current.
python3 - "$tmp" <<'PY'
import struct, sys, pathlib
tmp = pathlib.Path(sys.argv[1])
imgs = [(s, (tmp / f'icon-{s}.png').read_bytes()) for s in (48, 96)]
out = bytearray(struct.pack('<HHH', 0, 1, len(imgs)))
offset = 6 + 16 * len(imgs)
for s, data in imgs:
    out += struct.pack('<BBBBHHII', s, s, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
for _, data in imgs:
    out += data
pathlib.Path('public/favicon.ico').write_bytes(bytes(out))
PY

# ── The share card ──
cp scripts/og-card.svg "$tmp/"
qlmanage -t -s 1200 -o "$tmp" "$tmp/og-card.svg" >/dev/null 2>&1
mkdir -p public/img
sips -c 630 1200 "$tmp/og-card.svg.png" --out public/img/og-default.png >/dev/null

echo "wrote:"
ls -l public/favicon.ico public/apple-touch-icon.png public/icon-192.png public/img/og-default.png
