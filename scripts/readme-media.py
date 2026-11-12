"""Build README graphics from actual, already-reviewed local website captures.

Optional docs tooling only: python -m pip install Pillow
python scripts/readme-media.py --captures .work/readme-captures
After the first import, the committed captures are enough to rebuild all graphics.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import json
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont
from readme_illustrations import build_illustrations

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "docs/media"
CAPTURES = MEDIA / "captures"
PAGES = [
    ("landing", "landing-1440.png", "The two-sided loop", "/"),
    ("orders", "-console-orders-1440.png", "Orders and the Buyer Signal", "/console/orders"),
    ("pack", "-console-pack-1440.png", "Packing evidence and server checks", "/console/pack"),
    ("disputes", "-console-disputes-1440.png", "Dispute records and human review", "/console/disputes"),
    ("shared-cause", "-console-shared-causes-1440.png", "No provider-backed hypothesis yet", "/console/shared-causes"),
    ("report", "-console-store-report-1440.png", "The public Store Report", "/console/store-report"),
]


def svg(name, body, width, height, title, description):
    text = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{title}</title><desc id="desc">{description}</desc>
{body}
</svg>\n'''
    (MEDIA / name).write_text(text, encoding="utf8")


def hero(dark):
    bg, ink, faint = ("#15131d", "#f3f1f6", "#aba5bc") if dark else ("#f3f1f6", "#15131d", "#625e70")
    paper = "#24202f" if dark else "#ffffff"
    border = "#3a3249" if dark else "#ded9e8"
    accent = "#bba0ff" if dark else "#7435e8"
    body = f'''<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="{faint}" opacity=".22"/></pattern></defs>
<rect width="1280" height="480" rx="28" fill="{bg}"/>
<rect x="760" width="520" height="480" fill="url(#grid)"/>
<path d="M868 0 690 480M1100 0 920 480M1280 120 1140 480" stroke="{accent}" stroke-opacity=".15" fill="none"/>
<g transform="translate(50 38)"><rect width="29" height="29" rx="7" fill="{ink}"/><path d="M0 0 29 29V13L16 0Z" fill="#8b44fa"/><text x="42" y="23" font-family="Arial,sans-serif" font-size="29" font-weight="600" fill="{ink}">Fairfold</text></g>
<rect x="872" y="38" width="358" height="32" rx="16" fill="{paper}" stroke="{border}"/>
<text x="1051" y="59" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" letter-spacing="1.3" fill="{faint}">PAYPAL AI HACKATHON  /  SANDBOX</text>
<text x="50" y="160" font-family="Arial,sans-serif" font-size="58" font-weight="600" letter-spacing="-2.5" fill="{ink}">Proof before dispatch.</text>
<text x="50" y="226" font-family="Georgia,serif" font-size="62" font-style="italic" letter-spacing="-1.5" fill="{accent}">Trust before payment.</text>
<text x="52" y="271" font-family="Arial,sans-serif" font-size="19" fill="{faint}">A neutral witness for both sides of a PayPal payment.</text>
<g transform="translate(890 115) rotate(7 145 100)">
 <rect x="-8" y="12" width="278" height="204" rx="20" fill="#7435e8" opacity=".25"/>
 <path d="M0 0H216L268 52V194H0Z" fill="{paper}" stroke="{border}" stroke-width="2"/>
 <path d="M216 0V52H268" fill="#c9b2ff" stroke="{border}" stroke-width="2"/>
 <text x="24" y="44" font-family="monospace" font-size="12" letter-spacing="1.4" fill="{faint}">PROOF LEDGER</text>
 <path d="M24 65H192M24 124H236M24 158H236" stroke="{border}"/>
 <text x="24" y="101" font-family="Georgia,serif" font-size="29" fill="{ink}">One shared record.</text>
 <text x="24" y="146" font-family="monospace" font-size="12" fill="{accent}">CAPTURE → PACK → SEAL</text>
 <text x="24" y="180" font-family="monospace" font-size="12" fill="{faint}">Human approval before action.</text>
</g>
<path d="M54 325H1226" stroke="{border}"/>
'''
    for x, n, title, text in [(52, "01", "RECORD", "Evidence before conflict"), (470, "02", "CONNECT", "Patterns across orders"), (885, "03", "REVIEW", "A human before action")]:
        body += f'<text x="{x}" y="371" font-family="monospace" font-size="14" fill="{accent}">{n} / {title}</text><text x="{x}" y="410" font-family="Arial,sans-serif" font-size="23" fill="{ink}">{text}</text>\n'
    svg(f"fairfold-hero-{'dark' if dark else 'light'}.svg", body, 1280, 480, "Fairfold — proof before dispatch, trust before payment", "A neutral witness for both sides of a PayPal payment. Record evidence, connect patterns, review before acting. Sandbox hackathon prototype.")


def proof_flow():
    labels = [("PAYPAL", "Payment context", "Capture + dispute IDs"), ("FAIRFOLD", "Shared evidence", "Photos + hash chain"), ("CODE + AI", "A grounded draft", "Rules + structured output"), ("MERCHANT", "Human approval", "Review the exact action"), ("PAYPAL", "Action + decision", "PayPal decides disputes")]
    body = '''<style>.pulse{stroke-dasharray:6 14;animation:move 4s linear infinite}@keyframes move{to{stroke-dashoffset:-80}}@media(prefers-reduced-motion:reduce){.pulse{animation:none}}</style>
<rect width="1280" height="242" rx="24" fill="#15131d"/>
<text x="32" y="35" font-family="monospace" font-size="12" letter-spacing="1.5" fill="#bba0ff">THE APPROVAL BOUNDARY</text>
<path d="M250 112H1010" stroke="#56436d" stroke-width="2"/>
<path d="M250 112H760" stroke="#bba0ff" stroke-width="3" class="pulse"/>
'''
    for i, (over, title, sub) in enumerate(labels):
        x = 30 + i * 250
        body += f'<rect x="{x}" y="65" width="220" height="102" rx="15" fill="{"#332244" if i == 3 else "#24202f"}" stroke="{"#d8ba59" if i == 3 else "#40374f"}"/><text x="{x+16}" y="88" font-family="monospace" font-size="11" letter-spacing="1" fill="#bba0ff">{over}</text><text x="{x+16}" y="120" font-family="Arial,sans-serif" font-size="21" fill="#f3f1f6">{title}</text><text x="{x+16}" y="146" font-family="Arial,sans-serif" font-size="13" fill="#b9b2c8">{sub}</text>\n'
    body += '<text x="1020" y="191" font-family="monospace" font-size="11" fill="#e8ca74">ONLY AFTER APPROVAL</text><text x="32" y="220" font-family="Arial,sans-serif" font-size="12" fill="#aaa2ba">Architecture illustration • not transaction, signature or sandbox acceptance evidence.</text>'
    svg("approval-boundary.svg", body, 1280, 242, "AI stops at the human approval boundary", "Payment context becomes shared evidence and a grounded draft. The merchant must approve the exact action before Fairfold calls PayPal. Motion stops before that boundary; reduced-motion preference disables it.")


def data_image(file):
    return "data:image/png;base64," + base64.b64encode(file.read_bytes()).decode()


def overview():
    desktop = data_image(CAPTURES / "orders.png")
    phone = data_image(CAPTURES / "pack-mobile.png")
    body = f'''<defs><clipPath id="desk"><rect x="49" y="144" width="1100" height="764" rx="0"/></clipPath><clipPath id="phone"><rect x="1117" y="224" width="273" height="700" rx="24"/></clipPath></defs>
<rect width="1440" height="1010" rx="28" fill="#eae5f2"/>
<path d="M1010 0 670 1010M1240 0 900 1010M1440 20 1110 1010" stroke="#d9cde9"/>
<text x="48" y="48" font-family="monospace" font-size="15" letter-spacing="1.4" fill="#625e70">THE ACTUAL LOCAL WEBSITE</text>
<text x="48" y="85" font-family="Arial,sans-serif" font-size="25" font-weight="600" fill="#15131d">A merchant console. The same evidence, on a phone.</text>
<rect x="38" y="98" width="1124" height="809" rx="23" fill="#d5c9e4"/>
<rect x="48" y="100" width="1102" height="810" rx="18" fill="#fbfafd" stroke="#d7cede"/>
<path d="M48 143H1150" stroke="#d7cede"/>
<circle cx="69" cy="121" r="4" fill="#bcabc9"/><circle cx="83" cy="121" r="4" fill="#bcabc9"/><circle cx="97" cy="121" r="4" fill="#bcabc9"/>
<text x="132" y="126" font-family="monospace" font-size="12" fill="#625e70">LOCAL DEMO  /console/orders</text>
<image href="{desktop}" x="49" y="144" width="1100" height="764" clip-path="url(#desk)" preserveAspectRatio="xMinYMin meet"/>
<rect x="1106" y="212" width="295" height="726" rx="36" fill="#15131d"/>
<image href="{phone}" x="1117" y="224" width="273" height="700" clip-path="url(#phone)" preserveAspectRatio="xMinYMin meet"/>
<rect x="1200" y="222" width="106" height="9" rx="4" fill="#15131d"/>
<text x="48" y="960" font-family="Arial,sans-serif" font-size="18" fill="#15131d">Real API-bound screens. Labelled synthetic records. Existing components and styling preserved.</text>
<text x="48" y="990" font-family="monospace" font-size="12" fill="#625e70">SOURCE: 6e0268c • LOCAL CAPTURE • NO PAYPAL TRANSACTION PERFORMED</text>'''
    svg("product-overview.svg", body, 1440, 1010, "Fairfold desktop and mobile website mockup", "Actual local API-bound Orders screen and mobile Pack Station, framed as desktop and phone mockups. All records shown are synthetic. No component was redrawn and no PayPal transaction was performed.")


def make_tour():
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 17)
        small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 13)
    except OSError:
        font = small = ImageFont.load_default()
    frames = []
    for i, (name, _, caption, route) in enumerate(PAGES):
        shot = Image.open(CAPTURES / (name + ".png")).convert("RGB")
        if name == "landing":
            # Focus the tour on the hero; the full original remains linked separately.
            shot = shot.crop((0, 0, shot.width, 790))
        shot.thumbnail((1008, 700), Image.Resampling.LANCZOS)
        frame = Image.new("RGB", (1024, 780), "#15131d")
        draw = ImageDraw.Draw(frame)
        draw.text((14, 12), f"{i+1:02} / {len(PAGES):02}   {caption}", font=font, fill="#f3f1f6")
        draw.text((14, 38), route, font=small, fill="#bba0ff")
        frame.paste(shot, (8, 60 + (700 - shot.height) // 2))
        draw.text((14, 761), "ACTUAL LOCAL BUILD  /  SYNTHETIC DATA  /  NO PAYPAL TRANSACTION", font=small, fill="#b9b2c8")
        draw.rectangle((0, 777, round(1024*(i+1)/len(PAGES)), 779), fill="#a46aff")
        frames.append(frame)
    frames[0].save(MEDIA / "console-tour-still.png", optimize=True)
    frames[0].save(MEDIA / "console-tour.gif", save_all=True, append_images=frames[1:], duration=[2800, 3400, 3400, 3200, 3000, 3400], loop=0, optimize=True, disposal=2)


def receipt():
    previous = "0" * 64
    entries = []
    order = "00000000-0000-4000-8000-000000000091"
    for i, label in enumerate(["item", "size_label"], 1):
        content = {"order_id": order, "seq": i, "type": "photo", "payload": {"label": label, "source": "synthetic-readme-specimen"}, "blob_sha256": None, "actor": "merchant:00000000-0000-4000-8000-000000000001", "server_time": f"2026-11-12T00:00:0{i}.000Z"}
        canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        digest = hashlib.sha256((previous+canonical).encode()).hexdigest()
        entries.append({**content, "prev_hash": previous, "entry_hash": digest})
        previous = digest
    (MEDIA / "proof-specimen.json").write_text(json.dumps({"kind": "synthetic-readme-specimen", "note": "Hash-format demonstration only. These entries were not stored as order evidence; no photo, payment or attestation is asserted.", "entries": entries}, indent=2)+"\n", encoding="utf8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--captures", type=Path)
    args = parser.parse_args()
    CAPTURES.mkdir(parents=True, exist_ok=True)
    if args.captures:
        result = json.loads((args.captures / "runtime-evidence.json").read_text(encoding="utf8"))
        if result.get("result") != "PASS" or result.get("sourceCommit") != "6e0268c":
            raise SystemExit("Expected reviewed API-bound captures for commit 6e0268c")
        for name, source, _, _ in PAGES:
            shutil.copyfile(args.captures / source, CAPTURES / (name+".png"))
        shutil.copyfile(args.captures / "-console-pack-390.png", CAPTURES / "pack-mobile.png")
    hero(False); hero(True); proof_flow(); overview(); make_tour(); receipt(); build_illustrations()
    manifest = {"source_commit": "6e0268c", "captured_on": "2026-11-12", "mode": "actual-local-api-bound-website", "records": "synthetic-seeded-data", "paypal_actions": "none", "capture_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(CAPTURES.glob("*.png"))}}
    (MEDIA / "provenance.json").write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf8")
    subprocess.run(["node", str(ROOT / "node_modules/prettier/bin/prettier.cjs"), "--write", "docs/media/proof-specimen.json", "docs/media/provenance.json"], cwd=ROOT, check=True, stdout=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    for generated in MEDIA.iterdir():
        if generated.suffix in {".svg", ".json"}:
            generated.write_bytes(generated.read_bytes().replace(b"\r\n", b"\n"))
    print(json.dumps({"result": "PASS", "captures": len(manifest["capture_sha256"]), "media_bytes": sum(p.stat().st_size for p in MEDIA.rglob("*") if p.is_file())}))


if __name__ == "__main__":
    main()
