"""Generate the CodeBazaar demo-showcase deck as a .pptx.

Every figure in here is taken from DEMO_SCRIPT.md, which in turn describes the
deterministic seed (RNG_SEED = 20260902). If you retune the scoring engine or
change the archetype mix, re-run `python -m app.seed_demo --report`, update
DEMO_SCRIPT.md, then regenerate this deck — otherwise the slides will quietly
disagree with what's on screen during the demo.

Usage (from the repo root, with backend/venv active or via its interpreter):
    python deck/build_demo_deck.py
"""

from __future__ import annotations

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt

# ── Palette ──────────────────────────────────────────────────────────────────
# Mirrors the product's dark theme so the deck and the live app don't look like
# two different products when you alt-tab between them mid-demo.
BG = RGBColor(0x0A, 0x0E, 0x1A)
SURFACE = RGBColor(0x15, 0x1B, 0x2D)
SURFACE_2 = RGBColor(0x1E, 0x25, 0x3B)
BORDER = RGBColor(0x2B, 0x34, 0x4E)
INK = RGBColor(0xF8, 0xFA, 0xFC)
MUTED = RGBColor(0x94, 0xA3, 0xB8)
DIM = RGBColor(0x64, 0x74, 0x8B)
BRAND = RGBColor(0x63, 0x66, 0xF1)
BRAND_2 = RGBColor(0x8B, 0x5C, 0xF6)
GOOD = RGBColor(0x22, 0xC5, 0x5E)
WARN = RGBColor(0xF5, 0x9E, 0x0B)
BAD = RGBColor(0xEF, 0x44, 0x44)

FONT = "Segoe UI"

W = Inches(13.333)
H = Inches(7.5)
MARGIN = Inches(0.78)
CONTENT_W = W - 2 * MARGIN


# ── Primitives ───────────────────────────────────────────────────────────────
def new_deck() -> Presentation:
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H
    return prs


def blank(prs: Presentation):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H)
    bg.fill.solid()
    bg.fill.fore_color.rgb = BG
    bg.line.fill.background()
    bg.shadow.inherit = False
    return slide


def text(
    slide,
    body: str,
    *,
    left,
    top,
    width,
    height=Inches(0.6),
    size=18,
    color=INK,
    bold=False,
    align=PP_ALIGN.LEFT,
    line=1.25,
    space_after=0,
    anchor=MSO_ANCHOR.TOP,
):
    """Add a text box. `body` may contain newlines for multiple paragraphs."""
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.word_wrap = True
    frame.vertical_anchor = anchor
    frame.margin_left = frame.margin_right = 0
    frame.margin_top = frame.margin_bottom = 0

    for i, chunk in enumerate(body.split("\n")):
        para = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        para.alignment = align
        para.line_spacing = line
        para.space_after = Pt(space_after)
        run = para.add_run()
        run.text = chunk
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = FONT
    return box


def panel(slide, left, top, width, height, *, fill=SURFACE, border=BORDER, radius=True):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
        left, top, width, height,
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.color.rgb = border
    shape.line.width = Pt(1)
    shape.shadow.inherit = False
    if radius:
        # The adjustment is a fraction of the shape's *shorter* side, so leaving
        # it at the default gives a wide panel an absurd stadium curve. Solve for
        # a fixed ~0.14in radius instead, which matches the product's 12px.
        shape.adjustments[0] = min(0.5, Inches(0.14) / min(width, height))
    return shape


def bar(slide, left, top, width, height, color):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.shadow.inherit = False
    shape.adjustments[0] = 0.5
    return shape


def kicker(slide, label, *, color=BRAND_2, top=Inches(0.62)):
    text(
        slide, label.upper(), left=MARGIN, top=top, width=CONTENT_W,
        height=Inches(0.3), size=12, color=color, bold=True,
    )


def heading(slide, title, *, top=Inches(1.0), size=34, color=INK):
    text(
        slide, title, left=MARGIN, top=top, width=CONTENT_W,
        height=Inches(1.0), size=size, color=color, bold=True, line=1.1,
    )


def footer(slide, note):
    text(
        slide, note, left=MARGIN, top=H - Inches(0.62), width=CONTENT_W,
        height=Inches(0.3), size=11, color=DIM,
    )


def say(slide, quote, *, top, width=None, height=Inches(1.05)):
    """The 'say this out loud' box — the line that makes the slide land."""
    width = width or CONTENT_W
    panel(slide, MARGIN, top, width, height, fill=SURFACE_2, border=BRAND)
    accent = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, MARGIN, top + Inches(0.1), Inches(0.045), height - Inches(0.2)
    )
    accent.fill.solid()
    accent.fill.fore_color.rgb = BRAND_2
    accent.line.fill.background()
    accent.shadow.inherit = False
    text(
        slide, f"\u201c{quote}\u201d",
        left=MARGIN + Inches(0.32), top=top + Inches(0.17),
        width=width - Inches(0.64), height=height - Inches(0.34),
        size=15, color=INK, line=1.3,
    )


def bullets(slide, items, *, left, top, width, size=15, gap=Inches(0.52), dot=BRAND):
    """Bulleted list with real dot shapes, so spacing is predictable."""
    y = top
    for item in items:
        d = slide.shapes.add_shape(
            MSO_SHAPE.OVAL, left, y + Inches(0.075), Inches(0.105), Inches(0.105)
        )
        d.fill.solid()
        d.fill.fore_color.rgb = dot
        d.line.fill.background()
        d.shadow.inherit = False
        text(
            slide, item, left=left + Inches(0.26), top=y,
            width=width - Inches(0.26), height=gap, size=size, color=MUTED, line=1.3,
        )
        y += gap
    return y


def stat_row(slide, stats, *, top, height=Inches(1.5)):
    """Evenly spaced metric cards: list of (value, label, colour)."""
    n = len(stats)
    gap = Inches(0.22)
    card_w = int((CONTENT_W - gap * (n - 1)) / n)
    for i, (value, label, color) in enumerate(stats):
        x = MARGIN + i * (card_w + gap)
        panel(slide, x, top, card_w, height)
        text(
            slide, value, left=x + Inches(0.26), top=top + Inches(0.26),
            width=card_w - Inches(0.52), height=Inches(0.6),
            size=30, color=color, bold=True, line=1.0,
        )
        text(
            slide, label, left=x + Inches(0.26), top=top + Inches(0.88),
            width=card_w - Inches(0.52), height=Inches(0.5),
            size=11.5, color=MUTED, line=1.2,
        )


def table(slide, headers, rows, *, top, widths, size=12, row_h=Inches(0.42)):
    """Hand-drawn table. pptx's native table ignores most of this theme."""
    total = sum(widths)
    scale = CONTENT_W / total
    cols = [int(w * scale) for w in widths]

    x = MARGIN
    for head, cw in zip(headers, cols):
        text(
            slide, head.upper(), left=x, top=top, width=cw - Inches(0.12),
            height=Inches(0.3), size=10.5, color=DIM, bold=True,
        )
        x += cw

    rule = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, MARGIN, top + Inches(0.3), CONTENT_W, Pt(1)
    )
    rule.fill.solid()
    rule.fill.fore_color.rgb = BORDER
    rule.line.fill.background()
    rule.shadow.inherit = False

    y = top + Inches(0.42)
    for r, row in enumerate(rows):
        if r % 2 == 0:
            band = slide.shapes.add_shape(
                MSO_SHAPE.RECTANGLE, MARGIN - Inches(0.1), y - Inches(0.04),
                CONTENT_W + Inches(0.2), row_h
            )
            band.fill.solid()
            band.fill.fore_color.rgb = SURFACE
            band.line.fill.background()
            band.shadow.inherit = False
        x = MARGIN
        for c, (cell, cw) in enumerate(zip(row, cols)):
            value, color, bold = cell if isinstance(cell, tuple) else (cell, MUTED, False)
            text(
                slide, value, left=x, top=y, width=cw - Inches(0.12),
                height=row_h, size=size, color=color, bold=bold, line=1.15,
            )
            x += cw
        y += row_h
    return y


# ── Slides ───────────────────────────────────────────────────────────────────
def slide_title(prs):
    s = blank(prs)

    glow = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(8.3), Inches(-1.9), Inches(7.4), Inches(7.4))
    glow.fill.solid()
    glow.fill.fore_color.rgb = RGBColor(0x14, 0x1B, 0x3A)
    glow.line.fill.background()
    glow.shadow.inherit = False

    mark = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, MARGIN, Inches(1.5), Inches(0.72), Inches(0.72))
    mark.fill.solid()
    mark.fill.fore_color.rgb = BRAND
    mark.line.fill.background()
    mark.shadow.inherit = False
    mark.adjustments[0] = 0.28
    text(s, "CB", left=MARGIN, top=Inches(1.68), width=Inches(0.72), height=Inches(0.4),
         size=20, color=INK, bold=True, align=PP_ALIGN.CENTER)

    text(s, "CodeBazaar", left=MARGIN, top=Inches(2.52), width=Inches(10.2),
         height=Inches(1.3), size=62, color=INK, bold=True, line=1.0)
    text(s, "The trust layer for student-built software",
         left=MARGIN, top=Inches(3.78), width=Inches(9.6), height=Inches(0.6),
         size=23, color=BRAND_2)
    text(s,
         "Students import their GitHub repos. We score whether they genuinely built them.\n"
         "Buyers, recruiters, incubators and colleges act on that score.",
         left=MARGIN, top=Inches(4.46), width=Inches(9.4), height=Inches(1.0),
         size=15, color=MUTED, line=1.45)

    pill = panel(s, MARGIN, Inches(5.72), Inches(4.25), Inches(0.52),
                 fill=SURFACE_2, border=BRAND)
    text(s, "Live demo  ·  deterministic seed  ·  ~5 min",
         left=MARGIN + Inches(0.28), top=Inches(5.85), width=Inches(3.8),
         height=Inches(0.3), size=12.5, color=INK, bold=True)
    _ = pill

    footer(s, "Every number in this deck is queried from the database, not written into the slide.")
    return s


def slide_problem(prs):
    s = blank(prs)
    kicker(s, "The problem")
    heading(s, "Millions of students build real software.\nNobody can tell which of it is real.")
    text(s,
         "GitHub is the portfolio of record for an entire generation of engineers, and it carries no "
         "notion of evidence. The result is that the signal and the noise look identical.",
         left=MARGIN, top=Inches(2.28), width=Inches(11.1), height=Inches(0.8),
         size=15, color=MUTED, line=1.4)

    cards = [
        ("Recruiters", "Can't tell whether the candidate wrote the repo, forked it, or pasted a tutorial. "
                       "So the repo is ignored and the interview starts from zero."),
        ("Buyers", "Can't tell a working MVP from a weekend clone with an ambitious README. "
                   "So nobody buys, and the work has no market."),
        ("Incubators", "Can't separate the few teams that shipped from the many that didn't. "
                       "So early deal flow is sourced by reputation, not output."),
    ]
    gap = Inches(0.26)
    cw = int((CONTENT_W - gap * 2) / 3)
    for i, (who, pain) in enumerate(cards):
        x = MARGIN + i * (cw + gap)
        panel(s, x, Inches(3.3), cw, Inches(2.42))
        text(s, who, left=x + Inches(0.3), top=Inches(3.56), width=cw - Inches(0.6),
             height=Inches(0.4), size=19, color=INK, bold=True)
        text(s, pain, left=x + Inches(0.3), top=Inches(4.08), width=cw - Inches(0.6),
             height=Inches(1.5), size=13.5, color=MUTED, line=1.4)

    say(s, "And the student who actually built something good has no path from repo to money, "
           "job, or company.", top=Inches(6.0), height=Inches(0.86))
    return s


def slide_insight(prs):
    s = blank(prs)
    kicker(s, "The insight")
    heading(s, "Stars aren't evidence. Commit history is.")
    text(s,
         "Stars, forks and follower counts are cheap to buy and easy to coordinate. A year of "
         "distributed, consistent commit history is not. So we score the thing that is expensive "
         "to fake and ignore the things that aren't.",
         left=MARGIN, top=Inches(2.2), width=Inches(10.4), height=Inches(1.0),
         size=16, color=MUTED, line=1.45)

    left_w = Inches(5.9)
    right_x = MARGIN + left_w + Inches(0.45)
    right_w = CONTENT_W - left_w - Inches(0.45)

    panel(s, MARGIN, Inches(3.42), left_w, Inches(2.5), border=BAD)
    text(s, "Barely moves the score", left=MARGIN + Inches(0.32), top=Inches(3.68),
         width=left_w - Inches(0.64), height=Inches(0.35), size=15, color=BAD, bold=True)
    bullets(s, ["Stars and forks — purchasable", "Follower count — coordinated",
                "Self-reported claims — unverifiable", "Screenshots and demo videos"],
            left=MARGIN + Inches(0.32), top=Inches(4.14), width=left_w - Inches(0.64),
            size=13.5, gap=Inches(0.43), dot=BAD)

    panel(s, right_x, Inches(3.42), right_w, Inches(2.5), border=GOOD)
    text(s, "Carries the weight", left=right_x + Inches(0.32), top=Inches(3.68),
         width=right_w - Inches(0.64), height=Inches(0.35), size=15, color=GOOD, bold=True)
    bullets(s, ["Commit cadence over time", "Activity consistency across months",
                "Contributor authenticity", "Documentation depth and repo maturity"],
            left=right_x + Inches(0.32), top=Inches(4.14), width=right_w - Inches(0.64),
            size=13.5, gap=Inches(0.43), dot=GOOD)

    say(s, "Ownership has to be proved through GitHub or a project cannot be verified at all, "
           "whatever it scores.", top=Inches(6.12), height=Inches(0.82))
    return s


def slide_components(prs):
    s = blank(prs)
    kicker(s, "The engine")
    heading(s, "Six weighted components. No black box.", size=32)
    text(s, "Every project page shows weight \u00d7 score = points contributed, then penalties, "
            "then the composite. The rulebook is public and unauthenticated at /verification/methodology.",
         left=MARGIN, top=Inches(1.85), width=Inches(11.2), height=Inches(0.7),
         size=14, color=MUTED, line=1.4)

    comps = [
        ("Commit cadence", 20, GOOD, "Hardest signal to fabricate"),
        ("Activity consistency", 20, GOOD, "Sustained work, not a burst"),
        ("Repo maturity", 15, BRAND, "Structure, tests, history depth"),
        ("Contributor authenticity", 15, BRAND, "Real collaborators vs. sock puppets"),
        ("Documentation", 15, BRAND, "Can someone else run it"),
        ("Originality", 15, WARN, "Capped at 90 \u2014 a proxy, not a scan"),
    ]
    y = Inches(2.72)
    row_h = Inches(0.63)
    label_w = Inches(2.95)
    track_x = MARGIN + label_w + Inches(0.2)
    track_w = Inches(3.5)
    for name, weight, color, note in comps:
        text(s, name, left=MARGIN, top=y + Inches(0.11), width=label_w,
             height=Inches(0.35), size=14, color=INK)
        bar(s, track_x, y + Inches(0.17), track_w, Inches(0.2), BORDER)
        bar(s, track_x, y + Inches(0.17), int(track_w * weight / 20), Inches(0.2), color)
        text(s, f"{weight}%", left=track_x + track_w + Inches(0.18), top=y + Inches(0.11),
             width=Inches(0.7), height=Inches(0.35), size=14, color=color, bold=True)
        text(s, note, left=track_x + track_w + Inches(0.95), top=y + Inches(0.13),
             width=Inches(3.9), height=Inches(0.35), size=12.5, color=DIM)
        y += row_h

    say(s, "We cap what we can't actually prove. That's exactly why the rest is credible.",
        top=Inches(6.52), height=Inches(0.72))
    return s


def slide_run_of_show(prs):
    s = blank(prs)
    kicker(s, "Run of show")
    heading(s, "What you're about to see", size=32)

    rows = [
        [("0", INK, True), "Landing page, signed out", "Live stats queried per request", ("0:20", MUTED, False)],
        [("1", INK, True), ("Explainable score \u2014 SafeWalk 90/100", INK, True),
         "Six components, arithmetic spelled out", ("1:00", GOOD, True)],
        [("1b", INK, True), ("Badge + public report", INK, True),
         "Free distribution, no signup gate", ("0:50", GOOD, True)],
        [("2", INK, True), "Fraud caught in the open", "Fork penalty, one-burst history", ("0:40", MUTED, False)],
        [("3", INK, True), "Reputation as arithmetic", "558 pts, 6/7 verified \u2014 not 7/7", ("0:30", MUTED, False)],
        [("4", INK, True), ("Real money", INK, True), "\u20b9230,550 gross, 10% fee, payout queue", ("0:40", GOOD, True)],
        [("5", INK, True), "Escrow, including the gap", "Ledger is real; settlement is manual", ("0:45", MUTED, False)],
        [("6", INK, True), "Funding + build requests", "Offers across all four states", ("0:30", MUTED, False)],
        [("7", INK, True), "Admin closes the loop", "Reports, resolutions, audit trail", ("0:20", MUTED, False)],
    ]
    table(s, ["#", "Step", "What it proves", "Time"], rows,
          top=Inches(1.82), widths=[0.5, 4.3, 5.4, 1.0], size=13, row_h=Inches(0.405))

    say(s, "Three-minute cut: steps 0, 1, 1b, 2 and 4. Never cut 1 or 1b \u2014 the explainable "
           "score is the product and the badge is the distribution.",
        top=Inches(6.06), height=Inches(0.86))
    return s


def slide_demo_score(prs):
    s = blank(prs)
    kicker(s, "Demo 1 \u00b7 the moment that lands", color=GOOD)
    heading(s, "SafeWalk \u2014 90 / 100", size=36)
    text(s, "rohan/safewalk  ·  listed at \u20b94,850  ·  ownership proved  ·  high confidence",
         left=MARGIN, top=Inches(1.92), width=Inches(11.0), height=Inches(0.4),
         size=14.5, color=MUTED)

    left_w = Inches(6.5)
    panel(s, MARGIN, Inches(2.5), left_w, Inches(3.3))
    text(s, "Click \u201cWhy this score?\u201d", left=MARGIN + Inches(0.32), top=Inches(2.76),
         width=left_w - Inches(0.64), height=Inches(0.35), size=16, color=INK, bold=True)
    bullets(s, [
        "Radial ring at 90, with a tick at the 70 verified threshold",
        "Six components, each with its real weight and points contributed",
        "Weighted subtotal \u2192 penalties \u2192 composite, shown as arithmetic",
        "Confidence level, plus the commit and contributor counts behind it",
        "Expand Originality: it says it's a capped proxy, not a similarity scan",
    ], left=MARGIN + Inches(0.32), top=Inches(3.26), width=left_w - Inches(0.64),
        size=13.5, gap=Inches(0.49), dot=GOOD)

    right_x = MARGIN + left_w + Inches(0.4)
    right_w = CONTENT_W - left_w - Inches(0.4)
    panel(s, right_x, Inches(2.5), right_w, Inches(3.3), border=BRAND)
    text(s, "Most projects do not clear the bar", left=right_x + Inches(0.32),
         top=Inches(2.76), width=right_w - Inches(0.64), height=Inches(0.35),
         size=16, color=INK, bold=True)
    dist = [("80\u2013100", 31, GOOD), ("70\u201379", 13, GOOD),
            ("40\u201369", 61, WARN), ("Below 40", 14, BAD), ("Unscored", 12, DIM)]
    peak = max(count for _, count, _ in dist)
    track_w = Inches(2.5)
    y = Inches(3.26)
    for band, count, color in dist:
        text(s, band, left=right_x + Inches(0.32), top=y, width=Inches(1.2),
             height=Inches(0.3), size=13, color=MUTED)
        bar(s, right_x + Inches(1.6), y + Inches(0.055),
            max(int(track_w * count / peak), Inches(0.04)), Inches(0.18), color)
        text(s, str(count), left=right_x + Inches(4.25), top=y, width=Inches(0.6),
             height=Inches(0.3), size=13, color=color, bold=True)
        y += Inches(0.42)
    text(s, "A badge that everything gets is worthless.",
         left=right_x + Inches(0.32), top=Inches(5.4), width=right_w - Inches(0.64),
         height=Inches(0.32), size=12.5, color=DIM)

    say(s, "There's no black box and nothing to take on faith. If you disagree with the number, "
           "you can see exactly which component you disagree with.",
        top=Inches(6.02), height=Inches(0.86))
    return s


def slide_demo_fraud(prs):
    s = blank(prs)
    kicker(s, "Demo 2 \u00b7 fraud detection, honestly", color=BAD)
    heading(s, "A detector you can't watch catch something\nisn't a detector", size=31)

    cases = [
        ("ResumeRadar", "15", "karannair78/resumeradar",
         ["Flag: repository is a fork  \u2212 20", "Flag: ownership not verified",
          "Not verified, not for sale, not featured"]),
        ("CommitCanvas", "18", "meerabhat82/commitcanvas",
         ["Flag: entire history in one burst  \u2212 25",
          "Forty commits inside a single day",
          "On a repo claiming months of work"]),
    ]
    gap = Inches(0.4)
    cw = int((CONTENT_W - gap) / 2)
    for i, (name, score, repo, flags) in enumerate(cases):
        x = MARGIN + i * (cw + gap)
        panel(s, x, Inches(2.86), cw, Inches(2.6), border=BAD)
        text(s, name, left=x + Inches(0.34), top=Inches(3.08), width=cw - Inches(2.0),
             height=Inches(0.45), size=22, color=INK, bold=True)
        text(s, f"{score}/100", left=x + cw - Inches(2.1), top=Inches(3.1),
             width=Inches(1.75), height=Inches(0.45), size=22, color=BAD,
             bold=True, align=PP_ALIGN.RIGHT)
        text(s, repo, left=x + Inches(0.34), top=Inches(3.56), width=cw - Inches(0.68),
             height=Inches(0.3), size=12, color=DIM)
        bullets(s, flags, left=x + Inches(0.34), top=Inches(4.0),
                width=cw - Inches(0.68), size=13, gap=Inches(0.45), dot=BAD)

    text(s, "Each flag shows its severity, its point penalty, and a plain-English reason. "
            "The platform does not promote what it has flagged.",
         left=MARGIN, top=Inches(5.64), width=CONTENT_W, height=Inches(0.4),
         size=13.5, color=MUTED)

    say(s, "That's the signature of a code dump. We seeded these deliberately, because a fraud "
           "detector nobody sees catch anything is a claim, not a feature.",
        top=Inches(6.18), height=Inches(0.86))
    return s


def slide_demo_badge(prs):
    s = blank(prs)
    kicker(s, "Demo 1b \u00b7 the distribution story")
    heading(s, "The badge is free distribution.\nThe public report is where it lands.", size=31)

    left_w = Inches(6.1)
    panel(s, MARGIN, Inches(2.86), left_w, Inches(2.74))
    text(s, "Embeddable badge", left=MARGIN + Inches(0.32), top=Inches(3.1),
         width=left_w - Inches(0.64), height=Inches(0.35), size=16, color=INK, bold=True)
    bullets(s, [
        "A real SVG served from /badge/{id}/verified-build.svg",
        "Copy as Markdown, HTML or reST",
        "Pasted into a README that already gets traffic",
        "Doubles as the social preview image on shared links",
    ], left=MARGIN + Inches(0.32), top=Inches(3.6), width=left_w - Inches(0.64),
        size=13.5, gap=Inches(0.48))

    right_x = MARGIN + left_w + Inches(0.4)
    right_w = CONTENT_W - left_w - Inches(0.4)
    panel(s, right_x, Inches(2.86), right_w, Inches(2.74), border=GOOD)
    text(s, "Public report  /verify/[id]", left=right_x + Inches(0.32), top=Inches(3.1),
         width=right_w - Inches(0.64), height=Inches(0.35), size=16, color=INK, bold=True)
    bullets(s, [
        "No login, no paywall, no signup gate",
        "Full six-component derivation and penalties",
        "Server-rendered \u2014 works with JavaScript off",
        "States its own limits: not a code audit or a security review",
    ], left=right_x + Inches(0.32), top=Inches(3.6), width=right_w - Inches(0.64),
        size=13.5, gap=Inches(0.48), dot=GOOD)

    say(s, "A builder promoting their own work is also promoting our verification standard. "
           "And /how-verification-works reads its weights live from the API, so the published "
           "methodology can't drift from the code.",
        top=Inches(6.0), height=Inches(1.0))
    return s


def slide_demo_money(prs):
    s = blank(prs)
    kicker(s, "Demo 4 \u00b7 real money", color=GOOD)
    heading(s, "Integer paise, end to end", size=34)

    stat_row(s, [
        ("\u20b9430,340", "Transacted across the seeded platform", INK),
        ("\u20b9230,550", "Gross project sales", INK),
        ("\u20b923,055", "Platform fee at 10%", BRAND_2),
        ("24", "Completed sales, plus pending, failed and refunded", GOOD),
    ], top=Inches(2.0), height=Inches(1.62))

    panel(s, MARGIN, Inches(3.86), CONTENT_W, Inches(1.95))
    text(s, "What to open", left=MARGIN + Inches(0.32), top=Inches(4.08),
         width=Inches(5.0), height=Inches(0.35), size=16, color=INK, bold=True)
    bullets(s, [
        "/earnings as meera@ \u2014 gross, platform fee and net per transaction, with settlement history",
        "/admin/payouts as admin@ \u2014 a live queue with real outstanding balances and UTR references",
    ], left=MARGIN + Inches(0.32), top=Inches(4.56), width=CONTENT_W - Inches(0.64),
        size=13.5, gap=Inches(0.56), dot=GOOD)
    text(s, "Commission is computed once at sale time and frozen onto the payment row, so a "
            "later price change can never rewrite what was charged.",
         left=MARGIN + Inches(0.32), top=Inches(5.3), width=CONTENT_W - Inches(0.64),
         height=Inches(0.4), size=12.5, color=DIM)

    say(s, "The dashboard isn't suspiciously perfect, because real ones aren't.",
        top=Inches(6.1), height=Inches(0.72))
    return s


def slide_demo_receipt(prs):
    s = blank(prs)
    kicker(s, "Demo \u00b7 the strongest moment", color=GOOD)
    heading(s, "Trust receipt \u2014 frozen at the moment money moved", size=31)

    text(s, "Open /purchases as recruiter@codebazaar.dev and expand a completed sale.",
         left=MARGIN, top=Inches(1.92), width=CONTENT_W, height=Inches(0.35),
         size=14, color=MUTED)

    left_w = Inches(6.1)
    panel(s, MARGIN, Inches(2.45), left_w, Inches(2.56), border=GOOD)
    text(s, "What the receipt freezes", left=MARGIN + Inches(0.32), top=Inches(2.67),
         width=left_w - Inches(0.64), height=Inches(0.35), size=16, color=INK, bold=True)
    bullets(s, [
        "The score and all six component values",
        "Confidence, fraud flags, risk band",
        "Commit and contributor counts",
        "The commercial terms: price, sale type, licence",
    ], left=MARGIN + Inches(0.32), top=Inches(3.15), width=left_w - Inches(0.64),
        size=13.5, gap=Inches(0.44), dot=GOOD)

    right_x = MARGIN + left_w + Inches(0.4)
    right_w = CONTENT_W - left_w - Inches(0.4)
    panel(s, right_x, Inches(2.45), right_w, Inches(2.56), border=BRAND)
    text(s, "Health monitor \u2014 the claim keeps working",
         left=right_x + Inches(0.32), top=Inches(2.67), width=right_w - Inches(0.64),
         height=Inches(0.35), size=16, color=INK, bold=True)
    bullets(s, [
        "164 seeded readings across 24 purchases",
        "A weekly Celery job re-runs the real scoring engine",
        "Declining purchases sort to the top with a warning",
        "\u201cCheck now\u201d triggers a genuine rescore on demand",
    ], left=right_x + Inches(0.32), top=Inches(3.15), width=right_w - Inches(0.64),
        size=13.5, gap=Inches(0.44))

    say(s, "The score is a live number. That's right for discovery and useless in a dispute \u2014 "
           "six weeks later neither party can prove what the buyer was shown. So at payment we "
           "freeze it. payment_id is uniquely constrained, so a replayed webhook cannot overwrite "
           "a receipt with a newer score.",
        top=Inches(5.36), height=Inches(1.2))
    return s


def slide_demo_escrow(prs):
    s = blank(prs)
    kicker(s, "Demo 5 \u00b7 including the part we didn't build", color=WARN)
    heading(s, "Escrow: a real ledger with a manual settlement step", size=31)

    stat_row(s, [
        ("14", "Contracts across all six states", INK),
        ("\u20b914,250", "ClauseCheck \u2014 open dispute", WARN),
        ("50 / 50", "CampusEats \u2014 dispute resolved as a split", BRAND_2),
        ("4", "Dispute outcomes: release, refund, split, open", INK),
    ], top=Inches(2.18), height=Inches(1.56))

    panel(s, MARGIN, Inches(3.98), CONTENT_W, Inches(1.5), fill=SURFACE, border=WARN)
    text(s, "The honest bit", left=MARGIN + Inches(0.32), top=Inches(4.2),
         width=Inches(4.0), height=Inches(0.35), size=16, color=WARN, bold=True)
    text(s, "Approving a milestone writes a RELEASE entry to the ledger. It records what the builder "
            "is owed. It does not move money \u2014 there is no automated payout rail, and the interface "
            "says so rather than implying one exists. Taking real escrow funding is refused in "
            "production unless manual settlement is explicitly enabled.",
         left=MARGIN + Inches(0.32), top=Inches(4.64), width=CONTENT_W - Inches(0.64),
         height=Inches(0.8), size=13.5, color=MUTED, line=1.35)

    say(s, "We'd rather show you a real ledger with a manual settlement step than a fake "
           "automated one.", top=Inches(5.76), height=Inches(0.78))
    footer(s, "Every release lands in the admin payout queue and is paid out of band with a UTR recorded against it.")
    return s


def slide_demo_integrity(prs):
    s = blank(prs)
    kicker(s, "Demo \u00b7 integrity screening")
    heading(s, "Duplicates and dependency risk", size=34)

    left_w = Inches(6.1)
    panel(s, MARGIN, Inches(2.0), left_w, Inches(3.52))
    text(s, "Duplicate screening  /admin/duplicates", left=MARGIN + Inches(0.32),
         top=Inches(2.24), width=left_w - Inches(0.64), height=Inches(0.35),
         size=16, color=INK, bold=True)
    bullets(s, [
        "8 seeded flags: a relisted clone, and one tutorial template three students each claimed",
        "Top match scores 100% on four named signals, each with a weight and a reason",
        "Above 72% the listing is withheld from marketplace surfaces \u2014 but stays visible to its owner",
        "It never auto-rejects. One seeded flag is already dismissed as a false positive",
        "It compares listing content and repo shape, not code similarity",
    ], left=MARGIN + Inches(0.32), top=Inches(2.72), width=left_w - Inches(0.64),
        size=13, gap=Inches(0.54), dot=WARN)

    right_x = MARGIN + left_w + Inches(0.4)
    right_w = CONTENT_W - left_w - Inches(0.4)
    panel(s, right_x, Inches(2.0), right_w, Inches(3.52))
    text(s, "Dependency and licence risk", left=right_x + Inches(0.32),
         top=Inches(2.24), width=right_w - Inches(0.64), height=Inches(0.35),
         size=16, color=INK, bold=True)
    bullets(s, [
        "124 seeded audits, folded inside the risk report rather than on their own page",
        "Three projects carry strong copyleft, three declare no licence, one is non-commercial",
        "Genuinely deprecated packages: request, tslint, node-sass",
        "Advisory matches with checkable ranges: lodash@4.17.15, minimist@1.2.0",
        "is_complete_scan is hardcoded false and the advisory source is named",
    ], left=right_x + Inches(0.32), top=Inches(2.72), width=right_w - Inches(0.64),
        size=13, gap=Inches(0.54), dot=WARN)

    say(s, "A dependency absent from our findings is unknown, not verified safe. A clean bill of "
           "health we never actually checked would be worse than no scan at all.",
        top=Inches(5.78), height=Inches(0.86))
    return s


def slide_demo_market(prs):
    s = blank(prs)
    kicker(s, "Demo 6 \u00b7 the market around the score")
    heading(s, "Negotiation, funding, and work flowing both ways", size=32)

    rows = [
        [("Offers", INK, True), "17 across all six states, one three-round thread",
         "Checkout reads the accepted offer, so a discount can't be forged client-side"],
        [("Incubation", INK, True), "8 offers: \u20b91,00,000 for 12% accepted; \u20b925,000 for 8% pending",
         "Equity and revenue-share sit side by side for comparison"],
        [("Revenue share", INK, True), "\u20b94L for 6% of revenue over 36 months, capped at 2.5\u00d7",
         "Shares in basis points \u2014 rounding someone's cut isn't acceptable"],
        [("Build requests", INK, True), "5 briefs, \u20b925,000\u2013\u20b91,20,000, with quotes and timelines",
         "One already assigned, one completed"],
        [("Bundles", INK, True), "2 published; average verified score computed, not claimed",
         "A bundle priced above the sum of its parts is rejected"],
        [("Teams", INK, True), "4 team projects, 11 split rows, one invite left pending",
         "Shares must total exactly 100%; the lost paise go to the lead"],
    ]
    table(s, ["Surface", "What's seeded", "The design point"], rows,
          top=Inches(1.95), widths=[1.9, 5.0, 6.0], size=12.5, row_h=Inches(0.59))

    say(s, "Accepting an offer agreed a price. It did not charge anyone \u2014 a seller can never "
           "create a charge the buyer hasn't authorised.",
        top=Inches(6.06), height=Inches(0.82))
    return s


def slide_demo_campus(prs):
    s = blank(prs)
    kicker(s, "Demo \u00b7 the side nobody expects")
    heading(s, "Colleges get the placement evidence\nthey currently have to assert", size=31)

    stat_row(s, [
        ("64", "Builders across 27 colleges", INK),
        ("3", "Seeded college partners, one left unverified on purpose", INK),
        ("4", "Employer verification requests", BRAND_2),
        ("< 5", "Cohort size below which per-student figures are suppressed", GOOD),
    ], top=Inches(2.5), height=Inches(1.56))

    panel(s, MARGIN, Inches(4.3), CONTENT_W, Inches(1.5), border=GOOD)
    text(s, "The privacy stance, stated on stage", left=MARGIN + Inches(0.32),
         top=Inches(4.52), width=Inches(6.0), height=Inches(0.35), size=16, color=GOOD, bold=True)
    text(s, "Aggregate and read-only. A faculty account cannot see a student's messages, offers or "
            "earnings breakdown. Students appear only because they listed the college on their own "
            "profile \u2014 leave it blank and you're not counted. An average over two people identifies "
            "them both, so small cohorts show nothing.",
         left=MARGIN + Inches(0.32), top=Inches(4.96), width=CONTENT_W - Inches(0.64),
         height=Inches(0.8), size=13.5, color=MUTED, line=1.35)

    say(s, "They didn't sign up to hand their college a surveillance dashboard.",
        top=Inches(6.06), height=Inches(0.72))
    return s


def slide_personas(prs):
    s = blank(prs)
    kicker(s, "Who it's for")
    heading(s, "One signal, six jobs to be done", size=34)

    people = [
        ("Builder", "Import, get verified, list, sell, take contracts, build a streak"),
        ("Contributor", "Find projects seeking help, get skill-matched, join"),
        ("Buyer", "Compare, negotiate, buy, get a receipt and ongoing health monitoring"),
        ("Recruiter", "Pro plan, contact unlock, directory, employer verification requests"),
        ("Incubator", "Pipeline, saved searches, shortlist, five structured offer types"),
        ("College", "Read-only aggregate dashboard, campus leaderboard, admin-verified"),
    ]
    gap = Inches(0.26)
    cw = int((CONTENT_W - gap * 2) / 3)
    ch = Inches(1.52)
    for i, (who, what) in enumerate(people):
        col, row = i % 3, i // 3
        x = MARGIN + col * (cw + gap)
        y = Inches(2.1) + row * (ch + Inches(0.28))
        panel(s, x, y, cw, ch)
        text(s, who, left=x + Inches(0.28), top=y + Inches(0.24), width=cw - Inches(0.56),
             height=Inches(0.38), size=18, color=INK, bold=True)
        text(s, what, left=x + Inches(0.28), top=y + Inches(0.7), width=cw - Inches(0.56),
             height=Inches(0.7), size=12.5, color=MUTED, line=1.35)

    say(s, "Each side has standalone value, which is what keeps this from being a cold-start "
           "problem across all of them at once.",
        top=Inches(5.9), height=Inches(0.82))
    footer(s, "Plus mentors (directory, sessions, and a per-project AI mentor) and admin (verification, moderation, payouts, audit).")
    return s


def slide_model(prs):
    s = blank(prs)
    kicker(s, "Business model")
    heading(s, "We take a cut of the transactions\ntrust makes possible", size=33)

    rows = [
        [("Sale commission", INK, True), "10% of every project sale", "Wired through Cashfree; fee and net frozen per payment"],
        [("Pro subscriptions", INK, True), "Recruiters and incubators", "Contact unlock, saved searches, shortlist pipeline"],
        [("Escrow contracts", INK, True), "Commission on milestone work", "Ledger live; settlement currently manual"],
        [("Paid artefacts", INK, True), "AI audit, startup report, pitch deck", "Eight payment types implemented end to end"],
        [("Placement", INK, True), "Premium listings, featured slots", "Never sold on flagged or unverified projects"],
    ]
    table(s, ["Line", "What it is", "Status"], rows,
          top=Inches(2.5), widths=[2.5, 4.3, 6.1], size=13, row_h=Inches(0.6))

    text(s, "India-first, deliberately: the largest student developer population in the world, "
            "colleges under real pressure to prove placement outcomes, and incubators short of "
            "verifiable early deal flow. Money is in paise on a domestic rail, and the weekly "
            "digest ships at 11:30 IST because that's a weekday morning for this audience.",
         left=MARGIN, top=Inches(5.72), width=CONTENT_W, height=Inches(1.0),
         size=13.5, color=MUTED, line=1.4)
    return s


def slide_built(prs):
    s = blank(prs)
    kicker(s, "What's actually built")
    heading(s, "Running software, not a prototype", size=34)

    stat_row(s, [
        ("34", "API route groups", INK),
        ("22", "Alembic migrations, linear", INK),
        ("190", "Backend tests, green", GOOD),
        ("12", "Celery tasks on 5 schedules", INK),
        ("4", "Docker Compose targets", INK),
    ], top=Inches(2.1), height=Inches(1.5))

    left_w = Inches(6.1)
    panel(s, MARGIN, Inches(3.84), left_w, Inches(2.1))
    text(s, "Backend", left=MARGIN + Inches(0.32), top=Inches(4.06), width=Inches(3.0),
         height=Inches(0.35), size=16, color=INK, bold=True)
    text(s, "FastAPI · SQLAlchemy 2.0 · Postgres · Alembic · Celery + Redis · Python 3.12\n"
            "JWT with hashed rotating refresh tokens, 2FA, OAuth, role guards, fail-open rate "
            "limiting, audit logging, Sentry, structlog",
         left=MARGIN + Inches(0.32), top=Inches(4.5), width=left_w - Inches(0.64),
         height=Inches(1.2), size=12.5, color=MUTED, line=1.4)

    right_x = MARGIN + left_w + Inches(0.4)
    right_w = CONTENT_W - left_w - Inches(0.4)
    panel(s, right_x, Inches(3.84), right_w, Inches(2.1))
    text(s, "Frontend", left=right_x + Inches(0.32), top=Inches(4.06), width=Inches(3.0),
         height=Inches(0.35), size=16, color=INK, bold=True)
    text(s, "Next.js App Router · React 19 · TypeScript · Tailwind v4 · TanStack Query · Zustand\n"
            "Builder, buyer, recruiter, incubator, campus and admin surfaces, plus a public "
            "unauthenticated trust layer that is server-rendered for SEO",
         left=right_x + Inches(0.32), top=Inches(4.5), width=right_w - Inches(0.64),
         height=Inches(1.2), size=12.5, color=MUTED, line=1.4)

    say(s, "CI runs the suite and a typechecked production build on every push. Migrations are "
           "applied by the container entrypoint, not by the app.",
        top=Inches(6.2), height=Inches(0.8))
    return s


def slide_not_built(prs):
    s = blank(prs)
    kicker(s, "Credibility", color=WARN)
    heading(s, "What we deliberately didn't build", size=34)
    text(s, "Stated before anyone asks, because a roadmap that admits things is the only kind "
            "worth trusting.",
         left=MARGIN, top=Inches(1.94), width=Inches(10.5), height=Inches(0.4),
         size=14.5, color=MUTED)

    gaps = [
        ("No automated payout rail",
         "Escrow approval writes a RELEASE ledger entry. Settlement is a manual transfer with a "
         "UTR recorded. Production refuses real funding unless manual settlement is enabled."),
        ("Originality is a proxy, not a scan",
         "Real originality needs code-similarity scanning against a corpus. Not implemented, so "
         "the component is inferred from fork status, description and README \u2014 and capped at 90."),
        ("AI analysis needs a key",
         "Without one, AI features return a styled \u201cnot configured\u201d message. Seeded analyses are "
         "marked seed:deterministic-v1 rather than pretending a model wrote them."),
        ("The dataset is a seed, not traction",
         "136 projects, 64 builders, \u20b9430,340 transacted \u2014 all deterministic seed data, there so "
         "the product is demonstrable end to end. Real usage is the next milestone."),
    ]
    gap = Inches(0.26)
    cw = int((CONTENT_W - gap) / 2)
    for i, (title, detail) in enumerate(gaps):
        col, row = i % 2, i // 2
        x = MARGIN + col * (cw + gap)
        y = Inches(2.56) + row * (Inches(1.72) + Inches(0.26))
        panel(s, x, y, cw, Inches(1.72), border=WARN)
        text(s, title, left=x + Inches(0.3), top=y + Inches(0.22), width=cw - Inches(0.6),
             height=Inches(0.35), size=16, color=WARN, bold=True)
        text(s, detail, left=x + Inches(0.3), top=y + Inches(0.68), width=cw - Inches(0.6),
             height=Inches(0.9), size=12.5, color=MUTED, line=1.35)

    say(s, "A fraud-detection product that oversells itself has already failed its own test.",
        top=Inches(6.34), height=Inches(0.72))
    return s


def slide_logins(prs):
    s = blank(prs)
    kicker(s, "Appendix \u00b7 demo logins")
    heading(s, "Password is Password123! for every account", size=30)

    rows = [
        [("meera@codebazaar.dev", INK, False), "Builder \u2014 elite", "558 pts, 6/7 verified, \u20b942,660 earned"],
        [("aarav@codebazaar.dev", INK, False), "Builder \u2014 elite", "Campus ambassador; use for referrals and growth"],
        [("rohan@codebazaar.dev", INK, False), "Builder \u2014 trusted", "Owns SafeWalk, the top project at 90/100"],
        [("incubator@codebazaar.dev", INK, False), "Incubator", "Has sent 6 offers; sees the funding pipeline"],
        [("recruiter@codebazaar.dev", INK, False), "Recruiter / founder", "Pro subscriber \u2014 contact unlock and purchases"],
        [("admin@codebazaar.dev", INK, False), "Admin", "Payouts, moderation, duplicates, audit log"],
        [("faculty.nittrichy@codebazaar.dev", INK, False), "Faculty \u2014 verified", "NIT Trichy placement cell, ranked #1"],
        [("faculty.bitspilani@codebazaar.dev", INK, False), "Faculty \u2014 unverified", "Shows the locked state, then approve it as admin"],
    ]
    table(s, ["Email", "Role", "Why you'd use it"], rows,
          top=Inches(1.98), widths=[4.3, 2.6, 6.0], size=12.5, row_h=Inches(0.48))

    footer(s, "Run against local Postgres, not Neon: a full seed is tens of thousands of statements and must not depend on venue wifi.")
    return s


def slide_close(prs):
    s = blank(prs)
    glow = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-2.2), Inches(2.6), Inches(8.0), Inches(8.0))
    glow.fill.solid()
    glow.fill.fore_color.rgb = RGBColor(0x14, 0x1B, 0x3A)
    glow.line.fill.background()
    glow.shadow.inherit = False

    text(s, "GitHub is full of student software\nnobody can trust.",
         left=MARGIN, top=Inches(1.9), width=Inches(11.2), height=Inches(1.7),
         size=40, color=INK, bold=True, line=1.15)
    text(s, "CodeBazaar scores whether a repo was genuinely built by the person claiming it, "
            "then lets that score be acted on \u2014 buy the project, hire the builder, fund the "
            "milestone, or verify the candidate.",
         left=MARGIN, top=Inches(3.84), width=Inches(10.4), height=Inches(1.1),
         size=17, color=MUTED, line=1.45)
    text(s, "We take 10% of the transactions that trust makes possible.",
         left=MARGIN, top=Inches(5.0), width=Inches(10.4), height=Inches(0.5),
         size=19, color=BRAND_2, bold=True)

    panel(s, MARGIN, Inches(5.86), Inches(4.0), Inches(0.62), fill=SURFACE_2, border=BRAND)
    text(s, "Questions \u2014 and try to break it", left=MARGIN + Inches(0.3),
         top=Inches(6.02), width=Inches(3.6), height=Inches(0.3),
         size=14, color=INK, bold=True)
    return s


BUILDERS = [
    slide_title,
    slide_problem,
    slide_insight,
    slide_components,
    slide_run_of_show,
    slide_demo_score,
    slide_demo_badge,
    slide_demo_fraud,
    slide_demo_money,
    slide_demo_receipt,
    slide_demo_escrow,
    slide_demo_integrity,
    slide_demo_market,
    slide_demo_campus,
    slide_personas,
    slide_model,
    slide_built,
    slide_not_built,
    slide_logins,
    slide_close,
]


def main() -> None:
    prs = new_deck()
    for build in BUILDERS:
        build(prs)

    out = Path(__file__).resolve().parent / "CodeBazaar-Demo-Deck.pptx"
    prs.save(out)
    print(f"{len(BUILDERS)} slides -> {out}")


if __name__ == "__main__":
    main()
