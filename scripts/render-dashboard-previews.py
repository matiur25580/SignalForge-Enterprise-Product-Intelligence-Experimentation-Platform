from pathlib import Path
import re
import cairosvg

IMAGE_DIR = Path("docs/images")
sources = sorted(IMAGE_DIR.glob("dashboard-*.svg"))
if len(sources) != 12:
    raise SystemExit(f"Expected exactly 12 dashboard SVGs, found {len(sources)}")

# Some SVG text labels contain bare ampersands (for example, "Cohorts & retention").
# Escape only ampersands that are not already valid XML entities before rasterizing.
bare_ampersand = re.compile(r"&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)")

for source in sources:
    svg = source.read_text(encoding="utf-8")
    repaired = bare_ampersand.sub("&amp;", svg)
    if repaired != svg:
        source.write_text(repaired, encoding="utf-8")
        print(f"Repaired XML text entities in {source.name}", flush=True)

    target = source.with_suffix(".png")
    print(f"Rendering {source.name}", flush=True)
    cairosvg.svg2png(
        bytestring=repaired.encode("utf-8"),
        write_to=str(target),
        output_width=1440,
        output_height=900,
    )
    if not target.exists() or target.stat().st_size < 10_000:
        raise SystemExit(f"PNG render looks incomplete: {target}")
    print(f"Rendered {target.name} ({target.stat().st_size:,} bytes)", flush=True)

print(f"Successfully rendered {len(sources)} dashboard previews.")
