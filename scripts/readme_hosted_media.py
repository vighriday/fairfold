"""Build passive README frames from reviewed hosted screenshots; no UI is repainted.

Optional documentation tooling: python -m pip install Pillow
python scripts/readme_hosted_media.py [--captures .work/render-captures]
The committed originals and manifest suffice for subsequent offline rebuilds.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "docs/media/render"
CAPTURES = MEDIA / "captures"
COMMIT = "d23ee86adc2adfd4e38f3b001689327cde2791d6"
BASE = "https://fairfold-api.onrender.com"
PAGES = [
    ("landing", "landing-1440.png", "One side's proof. The other side's trust.", "/"),
    ("orders", "-console-orders-1440.png", "344 synthetic Neel orders, loaded from Render", "/console/orders"),
    ("pack", "-console-pack-1440.png", "Actual packing state; no capture or seal performed", "/console/pack"),
    ("disputes", "-console-disputes-1440.png", "A seeded resolved dispute, clearly separated", "/console/disputes"),
    ("shared-cause", "-console-shared-causes-1440.png", "Missing provider: an honest empty state", "/console/shared-causes"),
    ("report", "-console-store-report-1440.png", "Computed Store Report and seeded reviews", "/console/store-report"),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image(name):
    return "data:image/png;base64," + base64.b64encode((CAPTURES / name).read_bytes()).decode()


def svg(name, width, height, title, description, body):
    (MEDIA / name).write_bytes(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{title}</title><desc id="desc">{description}</desc>
{body}
</svg>
'''.encode("utf8"))


def overview():
    svg("overview.svg", 1440, 1040, "Fairfold on Render — actual hosted desktop and mobile screens",
        "Captured 13 November 2026 IST from the deployed Orders console and mobile Pack Station. All records are synthetic. No component was redrawn, payment performed or model outcome fabricated.", f'''
<defs><clipPath id="desktop"><rect x="49" y="164" width="1100" height="764"/></clipPath><clipPath id="phone"><rect x="1117" y="244" width="273" height="700" rx="24"/></clipPath></defs>
<rect width="1440" height="1040" rx="28" fill="#eae5f2"/>
<path d="M1010 0 670 1040M1240 0 900 1040M1440 20 1110 1040" stroke="#d9cde9"/>
<circle cx="57" cy="41" r="6" fill="#15845c"/><text x="75" y="47" font-family="monospace" font-size="15" letter-spacing="1" fill="#625e70">RENDER CAPTURE / 13 NOV 2026 IST / SYNTHETIC DATA</text>
<text x="48" y="88" font-family="Arial,sans-serif" font-size="28" font-weight="600" fill="#15131d">Seeded on Render. Ready to explore.</text>
<rect x="38" y="118" width="1124" height="817" rx="23" fill="#d5c9e4"/>
<rect x="48" y="120" width="1102" height="810" rx="18" fill="#fbfafd" stroke="#d7cede"/>
<path d="M48 163H1150" stroke="#d7cede"/><circle cx="69" cy="141" r="4" fill="#bcabc9"/><circle cx="83" cy="141" r="4" fill="#bcabc9"/><circle cx="97" cy="141" r="4" fill="#bcabc9"/>
<text x="132" y="146" font-family="monospace" font-size="13" fill="#625e70">fairfold-api.onrender.com/console/orders</text>
<image href="{image('orders.png')}" x="49" y="164" width="1100" height="764" clip-path="url(#desktop)" preserveAspectRatio="xMinYMin meet"/>
<rect x="1106" y="232" width="295" height="726" rx="36" fill="#15131d"/>
<image href="{image('pack-mobile.png')}" x="1117" y="244" width="273" height="700" clip-path="url(#phone)" preserveAspectRatio="xMinYMin meet"/>
<rect x="1200" y="242" width="106" height="9" rx="4" fill="#15131d"/>
<text x="48" y="980" font-family="Arial,sans-serif" font-size="20" fill="#15131d">393 seeded orders · 85 reviews · 16 complaints · 3 stores</text>
<text x="48" y="1014" font-family="monospace" font-size="13" fill="#625e70">SOURCE d23ee86 / REAL HTTPS + API / PAYPAL AND PROVIDER ACCEPTANCE PENDING</text>''')
    svg("overview-mobile.svg", 520, 1270, "Fairfold's hosted mobile Pack Station",
        "An unaltered mobile screenshot in a presentation frame. Synthetic order; no photo, seal or PayPal action performed.", f'''
<rect width="520" height="1270" rx="26" fill="#eae5f2"/>
<text x="32" y="42" font-family="monospace" font-size="14" fill="#625e70">RENDER / 13 NOV 2026 IST</text>
<text x="32" y="83" font-family="Arial,sans-serif" font-size="28" font-weight="600" fill="#15131d">Packing proof, on a phone.</text>
<rect x="46" y="112" width="428" height="1080" rx="28" fill="#15131d"/>
<image href="{image('pack-mobile.png')}" x="56" y="125" width="408" height="1046" preserveAspectRatio="xMidYMin meet"/>
<text x="32" y="1227" font-family="Arial,sans-serif" font-size="17" fill="#15131d">Actual hosted screen. Synthetic records.</text>
<text x="32" y="1253" font-family="monospace" font-size="12" fill="#625e70">NO PAYPAL ACTION PERFORMED / d23ee86</text>''')


def tour():
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)
        small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 13)
    except OSError:
        font = small = ImageFont.load_default()
    frames = []
    for i, (name, _, caption, route) in enumerate(PAGES):
        shot = Image.open(CAPTURES / (name + ".png")).convert("RGB")
        shot.thumbnail((1008, 700), Image.Resampling.LANCZOS)
        frame = Image.new("RGB", (1024, 780), "#15131d")
        draw = ImageDraw.Draw(frame)
        draw.text((14, 12), f"{i + 1:02} / 06   {caption}", font=font, fill="#f3f1f6")
        draw.text((14, 38), BASE + route, font=small, fill="#bba0ff")
        frame.paste(shot, ((1024 - shot.width) // 2, 60 + (700 - shot.height) // 2))
        draw.text((14, 761), "ACTUAL RENDER CAPTURE / SYNTHETIC DATA / NO PAYPAL TRANSACTION", font=small, fill="#b9b2c8")
        draw.rectangle((0, 777, round(1024 * (i + 1) / 6), 779), fill="#a46aff")
        frames.append(frame)
    frames[0].save(MEDIA / "tour-still.png", optimize=True)
    frames[0].save(MEDIA / "tour.gif", save_all=True, append_images=frames[1:], duration=3400, loop=0, optimize=True, disposal=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--captures", type=Path)
    args = parser.parse_args()
    CAPTURES.mkdir(parents=True, exist_ok=True)
    if args.captures:
        receipt = json.loads((args.captures / "evidence.json").read_text(encoding="utf8"))
        if receipt.get("result") != "PASS" or receipt.get("sourceCommit") != COMMIT or receipt.get("base") != BASE:
            raise SystemExit("Expected verified hosted captures at the recorded deployed commit")
        if len(receipt.get("browser", {}).get("views", [])) != 12 or receipt.get("browserErrors") or receipt.get("failedRequests"):
            raise SystemExit("Expected twelve passing desktop/mobile views without browser/API errors")
        for name, source, _, _ in PAGES:
            shutil.copyfile(args.captures / source, CAPTURES / (name + ".png"))
        shutil.copyfile(args.captures / "-console-pack-390.png", CAPTURES / "pack-mobile.png")
        manifest = {"source_commit": COMMIT, "deployment_id": "dep-dbr09a8n74is73b3i4q0", "capture_started_at_utc": receipt["timestamp"], "captured_on_ist": "2026-11-13", "origin": BASE, "mode": "actual-render-api-bound-website", "records": "synthetic-seeded-data", "paypal_actions": "none", "provider_configured": False}
    else:
        manifest = json.loads((MEDIA / "provenance.json").read_text(encoding="utf8"))
        for name, expected in manifest["capture_sha256"].items():
            if digest(CAPTURES / name) != expected:
                raise SystemExit("A recorded original capture changed: " + name)
    overview()
    tour()
    manifest["capture_sha256"] = {p.name: digest(p) for p in sorted(CAPTURES.glob("*.png"))}
    manifest["derived_sha256"] = {name: digest(MEDIA / name) for name in ["overview.svg", "overview-mobile.svg", "tour.gif", "tour-still.png"]}
    (MEDIA / "provenance.json").write_bytes((json.dumps(manifest, indent=2) + "\n").encode("utf8"))
    print(json.dumps({"result": "PASS", "hosted_captures": len(manifest["capture_sha256"]), "derived_assets": len(manifest["derived_sha256"])}))


if __name__ == "__main__":
    main()
