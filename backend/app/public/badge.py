"""
Embeddable "Verified Build" badge.

Rendered as SVG on the server so a GitHub README can hotlink it. GitHub proxies
images through Camo, which strips cookies and ignores JavaScript, so the badge
has to be a single unauthenticated GET returning static SVG.

Text width is estimated rather than measured — there is no font metrics library
in the request path, and a per-character approximation is accurate enough for a
badge while keeping the response allocation-free.
"""
from __future__ import annotations

from xml.sax.saxutils import escape

# Verdana at 11px, averaged. Digits and capitals are wider than lowercase.
_CHAR_WIDTH = 6.2
_PADDING = 9.0

# Band colours mirror the --score-* design tokens so the badge matches the app.
COLOUR_HIGH = "#2f6b4f"      # forest / sage — verified
COLOUR_MID = "#b8730f"       # amber — scored but below threshold
COLOUR_LOW = "#a63f2f"       # terracotta — weak or flagged
COLOUR_UNSCORED = "#6b6560"  # warm grey
LABEL_BG = "#3d3833"         # warm charcoal


def _band_colour(score: int | None, verified: bool) -> str:
    if score is None:
        return COLOUR_UNSCORED
    if verified or score >= 70:
        return COLOUR_HIGH
    if score >= 40:
        return COLOUR_MID
    return COLOUR_LOW


def _text_width(text: str) -> float:
    return len(text) * _CHAR_WIDTH


def render_badge(
    *,
    score: int | None,
    verified: bool,
    label: str = "verified build",
    style: str = "flat",
) -> str:
    """Return an SVG badge string.

    `style="flat"` is the squared-off shields.io look; anything else renders the
    rounded variant. Kept deliberately small — no gradients in flat mode, since
    the point is legibility inside a README, not decoration.
    """
    value = "unscored" if score is None else f"{score}/100"
    colour = _band_colour(score, verified)

    label_w = _text_width(label) + _PADDING * 2
    value_w = _text_width(value) + _PADDING * 2
    total_w = label_w + value_w
    height = 20
    radius = 0 if style == "flat" else 3

    # Coordinates are authored at 10x and each <text> scales itself back down by
    # .1 — this is how shields.io gets consistent sub-pixel centring across
    # renderers. The scale belongs on the text nodes, not the wrapping <g>, or
    # it compounds and the labels collapse into the corner.
    label_x = label_w / 2 * 10
    value_x = (label_w + value_w / 2) * 10
    label_len = _text_width(label) * 10
    value_len = _text_width(value) * 10

    accessible = f"{label}: {value}"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_w:.0f}" \
height="{height}" role="img" aria-label="{escape(accessible)}">
  <title>{escape(accessible)}</title>
  <clipPath id="r"><rect width="{total_w:.0f}" height="{height}" rx="{radius}" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="{label_w:.0f}" height="{height}" fill="{LABEL_BG}"/>
    <rect x="{label_w:.0f}" width="{value_w:.0f}" height="{height}" fill="{colour}"/>
  </g>
  <g fill="#fff" text-anchor="middle" \
font-family="Verdana,DejaVu Sans,Geneva,sans-serif" \
text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="{label_x:.0f}" y="150" fill="#010101" fill-opacity=".3" \
transform="scale(.1)" textLength="{label_len:.0f}">{escape(label)}</text>
    <text x="{label_x:.0f}" y="140" transform="scale(.1)" \
textLength="{label_len:.0f}">{escape(label)}</text>
    <text aria-hidden="true" x="{value_x:.0f}" y="150" fill="#010101" fill-opacity=".3" \
transform="scale(.1)" textLength="{value_len:.0f}">{escape(value)}</text>
    <text x="{value_x:.0f}" y="140" transform="scale(.1)" \
textLength="{value_len:.0f}">{escape(value)}</text>
  </g>
</svg>"""


def render_placeholder(message: str = "not found") -> str:
    """A badge for a project that doesn't exist.

    Returned with HTTP 200 on purpose: GitHub's image proxy caches failures
    aggressively and a 404 renders as a broken-image icon in the README, which
    looks like the badge is broken rather than the link being wrong.
    """
    return render_badge(score=None, verified=False, label="verified build")
