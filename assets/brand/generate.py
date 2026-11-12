"""Generate the project's logo, README banner and badges as SVG (no dependencies).

    python3 assets/brand/generate.py

Writes logo.svg, banner.svg and badges/*.svg next to this file. The pixel font and the logo (a generic
gamepad inside a cloud) are original to this project; no third-party artwork is used.
"""

from __future__ import annotations

import sys
from pathlib import Path

OUT = Path(__file__).parent
sys.path.insert(0, str(OUT.parent.parent / "scripts"))  # the shared pixel font
from pixelfont import GLYPH_HEIGHT, text_cells  # noqa: E402

# Console palette (ui/src/styles.css)
VIOLET = "#7c5cff"
VIOLET_LIGHT = "#a48bff"
VIOLET_DARK = "#4a32b8"
INK = "#12142a"


def pixel_text(text: str, px: int, gap: int = 1) -> tuple[list[tuple[int, int]], int, int]:
    """Pixel coordinates (in font units) for `text`, plus total width/height in output pixels."""
    cells, width = text_cells(text, gap)
    return cells, width * px, GLYPH_HEIGHT * px


def banner() -> str:
    px, shadow = 12, 3
    cells, width, height = pixel_text("EMULATOR UI", px)
    pad = 8
    w, h = width + 2 * pad + shadow, height + 2 * pad + shadow
    rects = []
    # Drop shadow first, then a vertical gradient on the face of each pixel.
    for x, y in cells:
        rects.append(
            f'<rect x="{pad + x * px + shadow}" y="{pad + y * px + shadow}" width="{px}" height="{px}" fill="{VIOLET_DARK}"/>'
        )
    for x, y in cells:
        rects.append(
            f'<rect x="{pad + x * px}" y="{pad + y * px}" width="{px}" height="{px}" fill="url(#face)"/>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
        f'role="img" aria-label="Emulator UI" shape-rendering="crispEdges">\n'
        f"<title>Emulator UI</title>\n"
        f'<defs><linearGradient id="face" x1="0" y1="0" x2="0" y2="{height}" gradientUnits="userSpaceOnUse">'
        f'<stop offset="0" stop-color="{VIOLET_LIGHT}"/><stop offset="1" stop-color="{VIOLET}"/></linearGradient></defs>\n'
        + "\n".join(rects)
        + "\n</svg>\n"
    )


# Hand-drawn cloud silhouette (X = cloud): a big centre puff, a left and a right puff, notches between.
CLOUD = [
    "........XXXXX.........",
    ".......XXXXXXX........",
    "......XXXXXXXXX.XXX...",
    "..XX..XXXXXXXXXXXXXX..",
    ".XXXX.XXXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXX",
    ".XXXXXXXXXXXXXXXXXXXX.",
    "..XXXXXXXXXXXXXXXXXX..",
]


# Hand-drawn generic modern gamepad, 16 x 8 (deliberately not any specific console's design):
# D body, P d-pad, S thumbsticks, Y/L/R/G face buttons (top/left/right/bottom).
GAMEPAD = [
    "..DDDD....DDDD..",
    ".DDDDDDDDDDDDDD.",
    "DDPDDDDDDDDDYDDD",
    "DPPPDDDDDDDLDRDD",
    "DDPDDDDDDDDDGDDD",
    "DDDDDSSDDSSDDDDD",
    "DDDDD......DDDDD",
    ".DDD........DDD.",
]
GAMEPAD_AT = (3, 4)  # top-left cell of the gamepad inside the cloud


def cloud_gamepad() -> dict[str, set[tuple[int, int]]]:
    """Pixel layers for 'a modern gamepad inside a cloud'."""
    cloud = {(x, y) for y, row in enumerate(CLOUD) for x, c in enumerate(row) if c == "X"}
    outline = {
        (x, y)
        for x, y in cloud
        if any((x + dx, y + dy) not in cloud for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    }
    gx, gy = GAMEPAD_AT
    pad: dict[str, set[tuple[int, int]]] = {}
    for y, row in enumerate(GAMEPAD):
        for x, c in enumerate(row):
            if c != ".":
                pad.setdefault(c, set()).add((gx + x, gy + y))
    body = pad["D"]
    rim = {(x, y) for x, y in body if y <= gy + 1}  # lighter top edge for depth
    covered = set().union(*pad.values())
    inner = cloud - outline
    shade = {(x, y) for x, y in inner if y >= 10} - covered
    return {
        "outline": outline - covered,
        "cloud": inner - shade - covered,
        "shade": shade,
        "body": body - rim,
        "rim": rim,
        "dpad": pad["P"],
        "sticks": pad["S"],
        "btn_top": pad["Y"],
        "btn_left": pad["L"],
        "btn_right": pad["R"],
        "btn_bottom": pad["G"],
    }


def logo() -> str:
    """Pixel-art modern gamepad inside a cloud, on a rounded tile."""
    size, cell = 256, 9
    w, h = len(CLOUD[0]), len(CLOUD)
    ox, oy = (size - w * cell) // 2, (size - h * cell) // 2 + 6
    layers = cloud_gamepad()
    fills = {
        "outline": "#5a43d6",
        "cloud": "url(#cloud)",
        "shade": "#c2b5ff",
        "body": "#2a2350",
        "rim": "#3b3270",
        "dpad": "#d4c8ff",
        "sticks": VIOLET,
        "btn_top": "#ff5c8a",
        "btn_left": "#ffb020",
        "btn_right": "#2fd3c0",
        "btn_bottom": VIOLET_LIGHT,
    }
    art = [
        f'<rect x="{ox + x * cell}" y="{oy + y * cell}" width="{cell}" height="{cell}" fill="{fills[name]}"/>'
        for name in fills
        for x, y in sorted(layers[name])
    ]
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}" '
        f'role="img" aria-label="Emulator UI logo" shape-rendering="crispEdges">\n'
        f"<title>Emulator UI</title>\n"
        f"<defs>"
        f'<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2148"/>'
        f'<stop offset="1" stop-color="{INK}"/></linearGradient>'
        f'<linearGradient id="cloud" x1="0" y1="{oy}" x2="0" y2="{oy + h * cell}" gradientUnits="userSpaceOnUse">'
        f'<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2dbff"/></linearGradient>'
        f"</defs>\n"
        f'<rect width="{size}" height="{size}" rx="56" fill="url(#tile)" shape-rendering="geometricPrecision"/>\n'
        f'<rect x="6" y="6" width="{size - 12}" height="{size - 12}" rx="50" fill="none" stroke="{VIOLET}" '
        f'stroke-opacity=".55" stroke-width="4" shape-rendering="geometricPrecision"/>\n'
        + "\n".join(art)
        + "\n</svg>\n"
    )


def _text_width(text: str) -> int:
    return round(sum(4.2 if c in "il.1 " else 6.6 for c in text)) + 12


def badge(label: str, value: str, color: str) -> str:
    """Two-part badge in the familiar flat style (rendered locally, so the README makes no external calls)."""
    lw, vw = _text_width(label), _text_width(value)
    w = lw + vw
    font = "DejaVu Sans,Verdana,Geneva,sans-serif"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="20" role="img" aria-label="{label}: {value}">'
        f"<title>{label}: {value}</title>"
        f'<clipPath id="r"><rect width="{w}" height="20" rx="3"/></clipPath>'
        f'<g clip-path="url(#r)"><rect width="{lw}" height="20" fill="#555"/>'
        f'<rect x="{lw}" width="{vw}" height="20" fill="{color}"/></g>'
        f'<g fill="#fff" text-anchor="middle" font-family="{font}" font-size="11">'
        f'<text x="{lw / 2}" y="14">{label}</text><text x="{lw + vw / 2}" y="14">{value}</text></g></svg>\n'
    )


BADGES = {
    "services": ("services", "436", VIOLET),
    "emulator": ("tested with", "emulator v1.0.322", "#d9822b"),
    "python": ("Python", "3.11+", "#3572a5"),
    "react": ("React", "18.3", "#3572a5"),
    "fastapi": ("FastAPI", "0.115+", "#3572a5"),
    "license": ("license", "Apache 2.0", "#2fa36b"),
}


# --- favicon: the gamepad alone, pixel-exact on a 16 x 16 grid (no cloud - it doesn't survive 16 px) ---
FAVICON_COLORS = {
    "bg": VIOLET,
    "D": "#ffffff",  # controller body
    "P": INK,  # d-pad
    "S": VIOLET_DARK,  # thumbsticks
    "Y": "#ff5c8a",
    "L": "#ffb020",
    "R": "#2fd3c0",
    "G": INK,
}


def favicon_grid() -> list[list[str | None]]:
    """16 x 16 colours (None = transparent): rounded violet tile with the gamepad centred."""
    n = 16
    grid: list[list[str | None]] = [[FAVICON_COLORS["bg"]] * n for _ in range(n)]
    for x, y in ((0, 0), (1, 0), (0, 1), (n - 2, 0), (n - 1, 0), (n - 1, 1)):  # rounded corners
        grid[y][x] = None
        grid[n - 1 - y][x] = None
    oy = (n - len(GAMEPAD)) // 2
    for y, row in enumerate(GAMEPAD):
        for x, c in enumerate(row):
            if c != ".":
                grid[oy + y][x] = FAVICON_COLORS[c]
    return grid


def favicon_svg() -> str:
    rects = "".join(
        f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>'
        for y, row in enumerate(favicon_grid())
        for x, color in enumerate(row)
        if color
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16" '
        f'shape-rendering="crispEdges">{rects}</svg>\n'
    )


def _png(size: int) -> bytes:
    """Minimal RGBA PNG of the favicon grid scaled to `size` px (stdlib only)."""
    import struct
    import zlib

    grid = favicon_grid()
    scale = size // 16
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        for x in range(size):
            color = grid[y // scale][x // scale]
            raw += bytes(int(color[i : i + 2], 16) for i in (1, 3, 5)) + b"\xff" if color else b"\0\0\0\0"

    def chunk(kind: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def favicon_ico(sizes: tuple[int, ...] = (16, 32, 48)) -> bytes:
    """ICO with embedded PNGs (supported by all current browsers)."""
    import struct

    images = [_png(s) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    for size, data in zip(sizes, images, strict=True):
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    return header + entries + b"".join(images)


def main() -> None:
    (OUT / "banner.svg").write_text(banner())
    (OUT / "logo.svg").write_text(logo())
    (OUT / "favicon.svg").write_text(favicon_svg())
    (OUT / "favicon.ico").write_bytes(favicon_ico())
    (OUT / "apple-touch-icon.png").write_bytes(_png(176))  # 11 px per cell; iOS scales it
    (OUT / "badges").mkdir(exist_ok=True)
    for name, spec in BADGES.items():
        (OUT / "badges" / f"{name}.svg").write_text(badge(*spec))
    print(f"wrote banner.svg, logo.svg and {len(BADGES)} badges to {OUT}")


if __name__ == "__main__":
    main()
