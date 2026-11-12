"""Rebuild the README's original SVG explainers; standard library only."""
from pathlib import Path
from html import escape
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "docs/media"
INK, MUTED, PAPER = "#19151f", "#625b70", "#f6f3fa"
VIOLET, LINE, GREEN, AMBER = "#7938df", "#dfd6ea", "#267154", "#936715"


def text(x, y, value, size=20, fill=INK, weight="400", family="Arial,sans-serif", extra=""):
    return f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{fill}" {extra}>{escape(value)}</text>'


def lines(x, y, values, size=19, fill=MUTED, gap=28):
    return "".join(text(x, y + i * gap, value, size, fill) for i, value in enumerate(values))


def box(x, y, w, h, fill="white", stroke=LINE, radius=20):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>'


def pill(x, y, label, fill="#eee5fa", colour=VIOLET, width=None):
    w = width or len(label) * 8 + 28
    return box(x, y, w, 29, fill, fill, 14) + text(x + 14, y + 20, label, 13, colour, "600")


def write(name, body, width, height, title, description):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(description)}</desc>
{body}
</svg>
'''
    (MEDIA / name).write_bytes(svg.encode("utf8"))


def icon(name, x, y, scale=1):
    # Original line illustrations. No protected document or third-party icon assets.
    paths = {
        "report": '''<rect x="19" y="4" width="82" height="119" rx="14" fill="white"/><path d="M47 15H73M32 37H88M32 49H69"/><path d="M33 78 47 65 60 72 83 56" stroke="#267154"/><rect x="31" y="91" width="58" height="20" rx="10" fill="#0070ba" stroke="none"/><path d="m51 100 6 5 11-11" stroke="white"/>''',
        "pack": '''<rect x="4" y="9" width="112" height="99" rx="16" fill="white"/><path d="m42 29-21 14 13 24 13-7v36h29V60l12 7 13-24-23-14-9 10H51Z" fill="#ddd0ef"/><path d="M46 20H17v20M103 79v18H84" stroke="#7938df"/><circle cx="102" cy="110" r="16" fill="#e0f0e8" stroke="#267154"/><path d="m95 110 5 5 10-12" stroke="#267154"/>''',
        "connect": '''<path d="M30 33 86 63 27 100M87 63H118" stroke="#b096d6" stroke-dasharray="4 5"/><rect x="3" y="12" width="53" height="38" rx="10" fill="white"/><rect x="3" y="81" width="53" height="38" rx="10" fill="white"/><path d="M15 26H43M15 35H31M15 95H43M15 104H31"/><circle cx="88" cy="63" r="24" fill="#e7dbf7"/><path d="M78 63H98M88 53V73" stroke="#7938df"/>''',
        "review": '''<path d="M15 14H82l21 21v87H15Z" fill="white"/><path d="M82 14v21h21M30 48H86M30 61H72M30 75H63"/><circle cx="91" cy="96" r="25" fill="#fff0c8" stroke="#936715"/><path d="M91 80v16l9 6" stroke="#936715"/>''',
        "build": '''<rect x="3" y="19" width="114" height="88" rx="14" fill="white"/><path d="M3 41H117M37 60 24 73l13 13M83 60l13 13-13 13M68 54 52 91" stroke="#7938df"/><path d="M16 30H17M27 30H28"/>''',
    }
    return f'<g transform="translate({x} {y}) scale({scale})" fill="none" stroke="{MUTED}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">{paths[name]}</g>'


def lens_cards():
    for name, role, title, subtitle, symbol in [
        ("merchant", "01 / MERCHANT", "Follow the parcel", "Proof, patterns, review", "pack"),
        ("buyer", "02 / BUYER", "See the store", "Facts before payment", "report"),
        ("builder", "03 / BUILDER", "Trace the system", "Contracts, code, receipts", "build"),
    ]:
        body = box(1, 1, 358, 233, PAPER, LINE, 20)
        body += text(23, 32, role, 12, VIOLET, "600", extra='letter-spacing="1.2"')
        body += icon(symbol, 232, 49, .82)
        body += text(23, 101, title, 24, INK, "600")
        body += text(23, 133, subtitle, 17)
        body += '<path d="M24 161H336" stroke="#dfd6ea"/>'
        body += text(23, 204, "OPEN THIS PATH", 12, VIOLET, "600", extra='letter-spacing="1"')
        body += '<path d="M313 194h20m-7-7 7 7-7 7" fill="none" stroke="#7938df" stroke-width="2"/>'
        write(f"path-{name}.svg", body, 360, 235, f"{role[5:].title()} reading path: {title}", f"{title}. {subtitle}. Follow the surrounding README link to explore this path.")


def story_card(x, y, w, number, phase, heading, body_lines, symbol):
    s = box(x, y, w, 262)
    s += pill(x + 20, y + 18, f"0{number} / {phase}", width=174)
    s += icon(symbol, x + 17, y + 83, 1.02)
    s += text(x + 162, y + 102, heading, 23, INK, "600")
    s += lines(x + 162, y + 141, body_lines, 18, gap=27)
    s += f'<path d="M{x + 162} {y + 220}H{x + w - 24}" stroke="{LINE}"/>'
    s += text(x + 162, y + 244, ["Buyer chooses.", "Merchant seals.", "Code tests the pattern.", "PayPal decides disputes."][number - 1], 15, VIOLET, "600")
    return s


def story(mobile):
    width, height = (600, 1370) if mobile else (1120, 740)
    body = box(0, 0, width, height, PAPER, PAPER, 24)
    body += text(32, 36, "THE FAIRFOLD LOOP", 13, VIOLET, "600", extra='letter-spacing="1.6"')
    if mobile:
        body += lines(32, 79, ["A promise. A parcel.", "A shared record."], 31, INK, 37)
        top = 154
    else:
        body += text(32, 88, "A promise. A parcel. A shared record.", 37, INK, "600")
        top = 126
    cards = [
        ("BEFORE PAYMENT", "Read before paying", ["Store facts and reviews.", "A human approves payment."], "report"),
        ("BEFORE DISPATCH", "Record the packing", ["Capture, check and seal.", "Link proof to the order."], "pack"),
        ("ACROSS ORDERS", "Connect complaints", ["Test a possible shared cause.", "Inspect before concluding."], "connect"),
        ("WHEN DISPUTED", "Review the response", ["Evidence or a fair remedy.", "Approve the exact action."], "review"),
    ]
    for i, (phase, heading, values, symbol) in enumerate(cards):
        x = 32 if mobile else 32 + (i % 2) * 544
        y = top + i * 284 if mobile else top + (i // 2) * 284
        body += story_card(x, y, 536 if mobile else 512, i + 1, phase, heading, values, symbol)
    body += text(32, height - 30, "PRODUCT ILLUSTRATION / NOT A SANDBOX TRANSACTION", 12, MUTED)
    write(f"evidence-journey{'-mobile' if mobile else ''}.svg", body, width, height, "One Fairfold order, from checkout to a reviewed response", "Four illustrated moments: the buyer reads a Store Report; the merchant captures and seals packing proof; code tests repeated complaints for a possible common cause; the merchant reviews an exact response or remedy. PayPal decides disputes. Product flow illustration, not observed sandbox acceptance.")


def paypal_map():
    body = box(0, 0, 960, 650, PAPER, PAPER)
    body += text(32, 38, "ONE PAYMENT, TWO RESPONSIBILITIES", 13, VIOLET, "600", extra='letter-spacing="1.5"')
    body += text(32, 88, "PayPal moves the money. Fairfold carries the context.", 29, INK, "600")
    body += box(24, 116, 410, 454, "#e9f3fc", "#c9e0f3") + box(526, 116, 410, 454, "#eee6f8", "#d9c7ef")
    body += text(48, 154, "PayPal sandbox", 25, "#003087", "600") + text(550, 154, "Fairfold", 25, VIOLET, "600")
    body += text(48, 184, "Payment and dispute authority", 17) + text(550, 184, "Evidence and human review", 17)
    rows = [
        ("Create + capture", "Order + capture mapping", "left"),
        ("Seller protection + tracking", "Pack seal + tracking job", "left"),
        ("Verified webhook event", "Receipt + reconciliation", "right"),
        ("Current dispute state", "Evidence + remedy draft", "right"),
        ("Allowed action / capture refund", "Exact merchant approval", "left"),
    ]
    for i, (left, right, direction) in enumerate(rows):
        y = 240 + i * 68
        body += box(40, y - 29, 378, 49, "white", "#c9e0f3", 11) + box(542, y - 29, 378, 49, "white", "#d9c7ef", 11)
        body += text(56, y + 2, left, 19, "#003087") + text(558, y + 2, right, 19)
        end, start = (441, 518) if direction == "left" else (518, 441)
        arrow = f'M{end + 7} {y - 10} {end} {y - 4}l7 6' if direction == "left" else f'M{end - 7} {y - 10} {end} {y - 4}l-7 6'
        body += f'<path d="M{start} {y - 4}H{end} {arrow}" fill="none" stroke="#9477b6" stroke-width="2"/>'
    body += text(32, 606, "Every PayPal call crosses packages/paypal. Every external action needs its required human approval.", 17)
    body += text(32, 632, "INTEGRATION MAP / ACTUAL SANDBOX OUTCOMES REMAIN PENDING", 12, MUTED)
    write("paypal-lifecycle.svg", body, 960, 650, "PayPal and Fairfold integration responsibilities", "PayPal owns create/capture, seller-protection context, tracking and disputes. Fairfold maps the capture, seals evidence, verifies webhook ingress, prepares a draft and records exact human approval before permitted execution. Every PayPal call goes through packages/paypal. Architecture illustration; real sandbox outcomes remain pending.")


def b17_board():
    body = box(0, 0, 960, 640, PAPER, PAPER)
    body += text(32, 37, "UNFOLD THE B17 HYPOTHESIS", 13, VIOLET, "600", extra='letter-spacing="1.4"')
    body += text(32, 82, "A pattern is a reason to inspect.", 33, INK, "600")
    body += box(24, 112, 286, 300) + box(334, 112, 602, 300)
    body += text(44, 150, "Similar complaints", 22, INK, "600")
    for i, label in enumerate(["Seam complaint", "Another seam complaint", "A related report"]):
        body += box(44, 176 + i * 65, 246, 49, PAPER, LINE, 12) + text(59, 207 + i * 65, label, 17)
    body += text(355, 151, "Check the context, not just the wording", 22, INK, "600")
    for i, label in enumerate(["Batch B17?", "Courier lane?", "Listing?", "Packing station?"]):
        body += pill(356 + (i % 2) * 281, 177 + (i // 2) * 51, label, width=258)
    body += lines(356, 316, ["Code checks exposure and alternative explanations.", "Corrected statistical tests qualify a hypothesis."], 18, gap=29)
    body += pill(356, 367, "HYPOTHESIS, NOT A VERDICT", "#fff0cf", AMBER, 293)
    body += '<path d="M479 420v30m-7-7 7 7 7-7" fill="none" stroke="#9477b6" stroke-width="2"/>'
    body += box(24, 460, 912, 120, "#19151f", "#19151f")
    body += icon("review", 41, 475, .65)
    body += text(145, 499, "Inspect remaining stock. Review what the evidence supports.", 23, "#f6f3fa", "600")
    body += lines(145, 530, ["If a defect is confirmed, recommend a remedy rather than a defence.", "The merchant approves each action. Suspicion is not filed as evidence."], 18, "#c8bdd5", 27)
    body += text(32, 616, "ILLUSTRATED SYNTHETIC SCENARIO / PROVIDER-BACKED SCAN AND REAL PHOTOS STILL PENDING", 12)
    write("b17-investigation.svg", body, 960, 640, "B17: from related complaints to a reviewed inspection", "Similar complaints are investigated against batch, courier, listing and packing context. Code computes exposure and corrected statistical tests. A hypothesis is not a verdict. Inspect stock; if a defect is confirmed, recommend a fair remedy. The merchant approves each action. The suspicion itself is not submitted as dispute evidence. Illustrated synthetic scenario; provider and real-photo acceptance are pending.")


def receipt_cards():
    fixture = json.loads((MEDIA / "proof-specimen.json").read_text(encoding="utf8"))
    first, second = fixture["entries"]
    content = {k: v for k, v in first.items() if k not in {"prev_hash", "entry_hash"}}
    content["payload"] = {**content["payload"], "label": "changed-in-memory"}
    changed_hash = hashlib.sha256((first["prev_hash"] + json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)).encode()).hexdigest()
    for changed in [False, True]:
        colour, status = ("#a23549", "MISMATCH DETECTED") if changed else (GREEN, "CHAIN MATCHES")
        body = box(0, 0, 760, 470, PAPER, PAPER)
        body += text(26, 34, "SYNTHETIC PROOF LAB", 13, VIOLET, "600", extra='letter-spacing="1.4"')
        body += text(26, 75, "Change one label. Recompute the hash." if changed else "Two entries. One linked record.", 30, INK, "600")
        body += box(24, 103, 712, 155)
        body += pill(42, 119, "ENTRY 01 / PHOTO", width=186)
        body += text(42, 184, 'label: "changed-in-memory"' if changed else 'label: "item"', 23, colour, "600", "monospace")
        body += text(42, 219, "stored     " + first["entry_hash"][:24] + "…", 18, MUTED, family="monospace")
        body += text(42, 245, "recomputed " + (changed_hash if changed else first["entry_hash"])[:24] + "…", 18, colour, family="monospace")
        body += f'<path d="M91 259v31m-7-7 7 7 7-7" fill="none" stroke="{colour}" stroke-width="2"/>'
        body += text(119, 283, "Stored bytes no longer match." if changed else "The next entry carries the previous hash.", 17, colour)
        body += box(24, 302, 712, 85)
        body += text(42, 334, "ENTRY 02 / PHOTO", 13, VIOLET, "600")
        body += text(42, 365, "prev_hash " + second["prev_hash"][:24] + "…", 18, MUTED, family="monospace")
        body += pill(26, 408, status, "#fae9ee" if changed else "#e1f1e9", colour, 220)
        body += text(26, 457, "HASH-FORMAT EXAMPLE / NOT PHOTO, PAYMENT OR SANDBOX ACCEPTANCE EVIDENCE", 11)
        description = f"Synthetic specimen only. Entry one stored hash {first['entry_hash']}. "
        description += f"Changing only payload.label gives recomputed hash {changed_hash}, so verification fails." if changed else f"Entry two carries that same previous hash. Its hash is {second['entry_hash']}. Both entries verify with production canonical JSON and SHA-256."
        write(f"proof-{'changed' if changed else 'original'}.svg", body, 760, 470, status.title() + ": a synthetic hash-chain illustration", description)


def verification_board():
    body = box(0, 0, 960, 390, PAPER, PAPER)
    body += text(32, 37, "READ THE RECEIPTS", 13, VIOLET, "600", extra='letter-spacing="1.5"')
    body += text(32, 83, "Built locally. Still to be proved externally.", 32, INK, "600")
    cards = [
        ("LOCAL BUILD", "PASS", ["657 offline checks", "575 database checks", "17 focused website checks"], GREEN),
        ("ACCOUNTS + MODELS", "PENDING", ["Real PayPal accounts", "Provider-backed B17", "Real photo evaluation"], AMBER),
        ("HOSTED REHEARSAL", "PENDING", ["First Render deployment", "Actual PayPal outcomes", "Hosted A1–A14 acceptance"], AMBER),
    ]
    for i, (label, status, values, colour) in enumerate(cards):
        x = 24 + i * 312
        body += box(x, 112, 288, 214)
        body += text(x + 18, 144, label, 13, MUTED, "600")
        body += text(x + 18, 184, status, 26, colour, "600")
        body += lines(x + 18, 228, values, 17, gap=29)
    body += lines(32, 355, ["Checks recorded for 6e0268c on 12 November 2026. Suites overlap; counts are not additive.", "Static evidence summary, not a live dashboard or a measure of acceptance completion."], 13, MUTED, 21)
    write("verification-board.svg", body, 960, 390, "Local verification passed; account, model and hosted acceptance pending", "Static summary for website commit 6e0268c, 12 November 2026. Offline checks: 657 passed; database suite: 575 passed; focused website: 17 passed. Counts overlap and are not additive. Real PayPal accounts/outcomes, provider-backed B17, real photos, first Render deployment and hosted A1–A14 acceptance are pending. Not a live dashboard.")


def build_illustrations():
    MEDIA.mkdir(parents=True, exist_ok=True)
    lens_cards()
    story(False)
    story(True)
    paypal_map()
    b17_board()
    receipt_cards()
    verification_board()


if __name__ == "__main__":
    build_illustrations()
    print("PASS: rebuilt 10 original SVG explainers")
