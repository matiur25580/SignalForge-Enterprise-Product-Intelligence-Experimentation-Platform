from pathlib import Path
import cairosvg

IMAGE_DIR = Path("docs/images")
sources = sorted(IMAGE_DIR.glob("dashboard-*.svg"))
if len(sources) != 12:
    raise SystemExit(f"Expected exactly 12 dashboard SVGs, found {len(sources)}")

for source in sources:
    target = source.with_suffix(".png")
    cairosvg.svg2png(
        url=str(source),
        write_to=str(target),
        output_width=1440,
        output_height=900,
    )
    if not target.exists() or target.stat().st_size < 10_000:
        raise SystemExit(f"PNG render looks incomplete: {target}")
    print(f"Rendered {source.name} -> {target.name} ({target.stat().st_size:,} bytes)")

print(f"Successfully rendered {len(sources)} dashboard previews.")
