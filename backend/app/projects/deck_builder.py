"""
Assembles the final pitch deck from two different kinds of slide.

The distinction matters more than it looks:

  * NARRATIVE slides (problem, solution, market, model, roadmap) are written by
    the model. They are framing, and framing is what an LLM is good at.
  * DATA slides (verified build score, traction, the ask) are computed here from
    the database. They are the slides an investor will actually check, so letting
    a model write them would be the single most damaging thing this feature could
    do — a hallucinated traction number destroys the credibility of the whole deck
    and of the platform that produced it.

Every figure on a data slide is traceable to a row. Where a figure doesn't exist,
the slide says so rather than estimating.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.verification import scoring

# Slide kinds the frontend renders with distinct layouts.
KIND_COVER = "cover"
KIND_NARRATIVE = "narrative"
KIND_SCORE = "score"
KIND_TRACTION = "traction"
KIND_ASK = "ask"


def _rupees(paise: int | None) -> str:
    if not paise:
        return "—"
    rupees = paise / 100
    if rupees >= 100_000:
        return f"₹{rupees / 100_000:.1f}L"
    return f"₹{rupees:,.0f}"


def _slide(kind: str, title: str, headline: str, bullets: list[str],
           note: str = "", data: dict | None = None) -> dict:
    return {
        "kind": kind,
        "title": title,
        "headline": headline[:300],
        "bullets": [str(b)[:200] for b in bullets][:6],
        "speaker_note": note[:800],
        "data": data or {},
    }


def build_cover_slide(project, owner_profile, score: int | None, tagline: str | None) -> dict:
    subtitle = tagline or (project.description or "")[:180]
    builder = owner_profile.display_name if owner_profile else "Independent builder"
    college = owner_profile.college if owner_profile else None

    return _slide(
        KIND_COVER,
        title=project.title,
        headline=subtitle,
        bullets=[],
        note=(
            "Open on the one-line description, then say who built it and what the "
            "score means. Don't read the slide out."
        ),
        data={
            "builder": builder,
            "college": college,
            "repo": project.repo_full_name,
            "score": score,
            "is_verified": bool(project.is_verified),
            "stage": project.stage.value,
            "language": project.primary_language,
        },
    )


def build_score_slide(project, verification) -> dict:
    """The Verified Build Score, broken down. Entirely computed.

    This is the slide that differentiates the deck: it is third-party-verifiable
    provenance, not a founder's claim about their own diligence.
    """
    if not verification or verification.verified_build_score is None:
        return _slide(
            KIND_SCORE,
            title="Verified Build Score",
            headline="This project has not been scored yet.",
            bullets=[
                "Run verification to produce an auditable score from the repo's git history.",
            ],
            note="Skip this slide until verification has run.",
            data={"scored": False},
        )

    score = verification.verified_build_score
    components = []
    for spec in scoring.COMPONENT_SPEC:
        raw = getattr(verification, spec["field"], None)
        components.append({
            "label": spec["label"],
            "weight": spec["weight"],
            "score": raw,
            "contribution": round(spec["weight"] * raw, 1) if raw is not None else None,
        })

    flags = list(verification.fraud_flags or [])
    # Ownership being unproved is informational, not a fraud signal, and it
    # shouldn't be presented to an investor as one.
    material_flags = [f for f in flags if f != "ownership_unverified"]

    bullets = [
        f"{score}/100, computed from {verification.commits_analyzed or 'the'} commits "
        f"across {verification.contributors_count or 1} contributor(s).",
        f"Threshold for verified status is {scoring.VERIFIED_THRESHOLD}. "
        f"This project {'clears it' if project.is_verified else 'does not clear it yet'}.",
    ]
    if verification.ownership_verified:
        bullets.append("Repository ownership proved via GitHub.")
    if not material_flags:
        bullets.append("No fraud signals detected on the repository.")
    else:
        bullets.append(
            f"{len(material_flags)} trust signal(s) flagged and disclosed: "
            f"{', '.join(material_flags)}."
        )
    bullets.append(
        f"Confidence in the score: {verification.confidence or 'unknown'}. "
        "Full derivation is public."
    )

    return _slide(
        KIND_SCORE,
        title="Verified Build Score",
        headline=(
            f"Independently scored {score}/100 from the repository's real "
            "development history."
        ),
        bullets=bullets,
        note=(
            "This is the slide to slow down on. Point out that the breakdown is "
            "public and that nobody — including us — can edit the history it's "
            "computed from. Offer the link so they can check it themselves."
        ),
        data={
            "scored": True,
            "score": score,
            "threshold": scoring.VERIFIED_THRESHOLD,
            "is_verified": bool(project.is_verified),
            "confidence": verification.confidence,
            "components": components,
            "flags": material_flags,
            "commits_analyzed": verification.commits_analyzed,
            "contributors_count": verification.contributors_count,
            "repo_age_days": verification.repo_age_days,
        },
    )


def build_traction_slide(db: Session, project) -> dict:
    """Traction, from rows only.

    An investor discounts a traction slide the moment one number looks invented,
    so anything not backed by a row is reported as "not yet" rather than filled in.
    """
    from app.growth.models import ProjectView
    from app.payments.models import Payment, PaymentStatus, PaymentType
    from app.projects.models import Collaboration, ProjectEvent

    views = int(
        db.query(func.coalesce(func.sum(ProjectView.count), 0))
        .filter(ProjectView.project_id == project.id, ProjectView.viewer_kind != "owner")
        .scalar() or 0
    )
    collaborators = int(
        db.query(func.count(Collaboration.id))
        .filter(Collaboration.project_id == project.id)
        .scalar() or 0
    )
    sales_count = int(
        db.query(func.count(Payment.id))
        .filter(
            Payment.project_id == project.id,
            Payment.status == PaymentStatus.PAID,
            Payment.payment_type == PaymentType.PROJECT_ACCESS,
        )
        .scalar() or 0
    )
    revenue = int(
        db.query(func.coalesce(func.sum(Payment.seller_net_paise), 0))
        .filter(
            Payment.project_id == project.id,
            Payment.status == PaymentStatus.PAID,
            Payment.payment_type == PaymentType.PROJECT_ACCESS,
        )
        .scalar() or 0
    )
    milestones = int(
        db.query(func.count(ProjectEvent.id))
        .filter(ProjectEvent.project_id == project.id)
        .scalar() or 0
    )

    metrics = [
        {"label": "GitHub stars", "value": f"{project.stars:,}", "has_data": project.stars > 0},
        {"label": "Forks", "value": f"{project.forks:,}", "has_data": project.forks > 0},
        {"label": "Collaborators", "value": str(collaborators + 1), "has_data": True},
        {"label": "Listing views", "value": f"{views:,}", "has_data": views > 0},
        {"label": "Progress", "value": f"{project.progress_percent}%", "has_data": True},
        {
            "label": "Revenue on platform",
            "value": _rupees(revenue) if revenue else "Pre-revenue",
            "has_data": revenue > 0,
        },
    ]

    bullets: list[str] = []
    if project.stars:
        bullets.append(f"{project.stars:,} GitHub stars and {project.forks:,} forks.")
    if views:
        bullets.append(f"{views:,} views on the public listing from outside visitors.")
    if sales_count:
        bullets.append(
            f"{sales_count} paid {'sale' if sales_count == 1 else 'sales'} "
            f"totalling {_rupees(revenue)} net to the builder."
        )
    if collaborators:
        bullets.append(f"{collaborators} active collaborator(s) beyond the original builder.")
    if milestones > 1:
        bullets.append(f"{milestones} recorded progress events on the public timeline.")

    # Say so plainly rather than padding the slide.
    if not bullets:
        bullets = [
            "Pre-traction: this is engineering evidence, not commercial evidence yet.",
            "What exists is a verifiable build history — see the previous slide.",
        ]

    return _slide(
        KIND_TRACTION,
        title="Traction",
        headline=(
            "Where this actually stands today."
            if bullets else "Pre-traction, and honest about it."
        ),
        bullets=bullets,
        note=(
            "Every number here comes from a database row. If asked, say plainly "
            "which metrics don't exist yet rather than reframing them."
        ),
        data={"metrics": metrics, "pre_traction": not any(m["has_data"] for m in metrics[:5])},
    )


def build_ask_slide(db: Session, project, verification, ai_ask: dict | None) -> dict:
    """The ask, anchored to real comparables.

    The suggested range is derived from the project's own asking price and, where
    available, what comparable escrow contracts on the platform have been funded
    at — so it is a reasoned figure rather than a number a model liked.
    """
    from app.escrow.models import EscrowContract

    score = verification.verified_build_score if verification else None

    median_contract = None
    rows = [
        int(r[0]) for r in
        db.query(EscrowContract.total_amount_paise)
        .filter(EscrowContract.total_amount_paise > 0)
        .all()
    ]
    if rows:
        rows.sort()
        median_contract = rows[len(rows) // 2]

    bullets: list[str] = []
    data: dict = {"basis": []}

    if project.is_for_sale and project.price_paise:
        bullets.append(f"Currently listed at {_rupees(project.price_paise)} for {project.price_label or 'the codebase'}.")
        data["basis"].append("current listing price")
        data["listing_paise"] = project.price_paise

    if median_contract:
        bullets.append(
            f"Comparable commissioned builds on CodeBazaar are funded at a median "
            f"of {_rupees(median_contract)}."
        )
        data["basis"].append("median comparable escrow contract")
        data["median_contract_paise"] = median_contract

    if score is not None:
        bullets.append(
            f"A Verified Build Score of {score}/100 means the engineering risk on "
            "this is measurable rather than assumed."
        )
        data["basis"].append("verified build score")

    # Fall back to the model's framing only for the qualitative part.
    if ai_ask and ai_ask.get("bullets"):
        for b in ai_ask["bullets"][:2]:
            if b not in bullets:
                bullets.append(b)

    if not bullets:
        bullets = [
            "No price is set on this project yet.",
            "Set a listing price or open it to offers to make the ask concrete.",
        ]

    headline = (ai_ask or {}).get("headline") or (
        "What we're asking for, and what it's anchored to."
    )

    return _slide(
        KIND_ASK,
        title="The Ask",
        headline=headline,
        bullets=bullets,
        note=(
            (ai_ask or {}).get("speaker_note")
            or "State the number, then immediately state what it's based on. "
               "Never present the range as a valuation."
        ),
        data=data,
    )


# ── Assembly ─────────────────────────────────────────────────────────────────

# Narrative slides taken from the model, in deck order. The model's own
# "Traction" and "The Ask" slides are dropped in favour of computed ones.
_NARRATIVE_ORDER = ["Problem", "Solution", "How It Works", "Market Opportunity",
                    "Business Model", "Roadmap"]
_AI_SLIDES_REPLACED = {"traction", "traction & proof", "the ask"}


def assemble_deck(
    db: Session,
    project,
    verification,
    owner_profile,
    ai_result: dict,
) -> list[dict]:
    """Interleave the model's narrative with computed, verifiable slides."""
    ai_slides = ai_result.get("slides") or []

    def find(name: str) -> dict | None:
        want = name.lower()
        for s in ai_slides:
            title = str(s.get("title", "")).lower()
            if want in title or title in want:
                return s
        return None

    ai_ask = find("the ask") or find("ask")

    deck: list[dict] = [
        build_cover_slide(
            project, owner_profile,
            verification.verified_build_score if verification else None,
            ai_result.get("tagline"),
        )
    ]

    for name in _NARRATIVE_ORDER:
        s = find(name)
        if not s:
            continue
        deck.append(_slide(
            KIND_NARRATIVE,
            title=str(s.get("title") or name),
            headline=str(s.get("headline") or ""),
            bullets=list(s.get("bullets") or []),
            note=str(s.get("speaker_note") or ""),
        ))
        # The two evidence slides land immediately after the solution, while the
        # audience is still deciding whether to believe any of this.
        if name == "Solution":
            deck.append(build_score_slide(project, verification))
            deck.append(build_traction_slide(db, project))

    # If the model returned nothing recognisable, the evidence slides still ship.
    if not any(s["kind"] == KIND_SCORE for s in deck):
        deck.append(build_score_slide(project, verification))
        deck.append(build_traction_slide(db, project))

    deck.append(build_ask_slide(db, project, verification, ai_ask))
    return deck


def deck_as_markdown(project, tagline: str | None, slides: list[dict]) -> str:
    """Plain-text export, for pasting into an email or a doc."""
    out = [f"# {project.title}", ""]
    if tagline:
        out += [f"*{tagline}*", ""]
    out += [f"Repository: {project.repo_full_name}", ""]
    out.append("---")
    out.append("")

    for i, s in enumerate(slides, start=1):
        out.append(f"## {i}. {s.get('title', '')}")
        out.append("")
        if s.get("headline"):
            out.append(f"**{s['headline']}**")
            out.append("")
        for b in s.get("bullets") or []:
            out.append(f"- {b}")
        data = s.get("data") or {}
        if s.get("kind") == KIND_SCORE and data.get("scored"):
            out.append("")
            out.append("| Component | Weight | Score | Contribution |")
            out.append("| --- | --- | --- | --- |")
            for c in data.get("components") or []:
                out.append(
                    f"| {c['label']} | {int(c['weight'] * 100)}% | "
                    f"{c['score'] if c['score'] is not None else '—'} | "
                    f"{c['contribution'] if c['contribution'] is not None else '—'} |"
                )
        if s.get("kind") == KIND_TRACTION:
            out.append("")
            for m in data.get("metrics") or []:
                out.append(f"- {m['label']}: {m['value']}")
        if s.get("speaker_note"):
            out.append("")
            out.append(f"> Speaker note: {s['speaker_note']}")
        out.append("")

    out.append("---")
    out.append("")
    out.append(
        f"Generated by CodeBazaar on "
        f"{datetime.now(timezone.utc).strftime('%d %b %Y')}. "
        "Score and traction figures are computed from platform data."
    )
    return "\n".join(out)
