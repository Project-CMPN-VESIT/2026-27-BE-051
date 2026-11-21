"""
Delivery Reliability engine.

Given a builder's historical execution signals and a promised timeline, predict
the probability they'll actually deliver on time, the delay risk, a realistic
timeline, and how confident we are given the amount of history available.

Pure and deterministic — no DB, no network. DeliveryService feeds it real data.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DeliverySignals:
    milestones_with_deadline: int = 0   # historical milestones that had a due_date
    on_time_count: int = 0              # of those, how many were submitted by the due date
    avg_turnaround_days: float | None = None  # avg (submitted - created) across submitted milestones
    contracts_completed: int = 0
    delivery_rate: float | None = None  # completed / total contracts (0..1)
    trust_score: int = 0                # 0..100 from reputation
    avg_build_score: int | None = None  # 0..100


@dataclass
class DeliveryPrediction:
    completion_probability: int   # 0..100 — chance of on-time delivery
    confidence: int               # 0..100 — how much we trust the estimate (data volume)
    delay_risk: str               # "low" | "medium" | "high"
    realistic_timeline_days: int  # our data-driven estimate
    promised_days: int
    sample_size: int
    rationale: str


def _clamp(v: float, lo: int = 0, hi: int = 100) -> int:
    return int(max(lo, min(hi, round(v))))


def predict(signals: DeliverySignals, promised_days: int, milestone_count: int = 1) -> DeliveryPrediction:
    promised_days = max(1, promised_days)
    milestone_count = max(1, milestone_count)
    sample_size = signals.milestones_with_deadline + signals.contracts_completed

    # ── Confidence: ~8 data points => high confidence ────────────────────────
    confidence = _clamp((sample_size / 8) * 100)

    on_time_rate = (
        signals.on_time_count / signals.milestones_with_deadline
        if signals.milestones_with_deadline > 0 else None
    )

    # ── Base reliability: weighted blend of the available components ──────────
    components: list[tuple[float, float]] = []
    if on_time_rate is not None:
        components.append((0.45, on_time_rate))
    if signals.delivery_rate is not None:
        components.append((0.35, signals.delivery_rate))
    # Trust always contributes a little (it already blends verified + quality).
    components.append((0.20, signals.trust_score / 100))

    if sample_size == 0:
        # No execution history — stay neutral rather than punishing a new builder.
        base_reliability = 0.5
    else:
        total_w = sum(w for w, _ in components)
        base_reliability = sum(w * v for w, v in components) / total_w

    # ── Ambition factor: are they promising less time than they usually take? ─
    if signals.avg_turnaround_days is not None:
        expected_days = signals.avg_turnaround_days * milestone_count
        ratio = promised_days / expected_days if expected_days > 0 else 1.0
        ambition_factor = max(0.4, min(1.0, ratio))
        realistic_timeline_days = int(round(max(promised_days, expected_days)))
    else:
        expected_days = None
        ambition_factor = 1.0
        realistic_timeline_days = promised_days

    probability = _clamp(base_reliability * ambition_factor * 100)

    if probability >= 75:
        delay_risk = "low"
    elif probability >= 50:
        delay_risk = "medium"
    else:
        delay_risk = "high"

    rationale = _rationale(signals, on_time_rate, ambition_factor, expected_days, promised_days, sample_size, probability)

    return DeliveryPrediction(
        completion_probability=probability,
        confidence=confidence,
        delay_risk=delay_risk,
        realistic_timeline_days=realistic_timeline_days,
        promised_days=promised_days,
        sample_size=sample_size,
        rationale=rationale,
    )


def _rationale(signals, on_time_rate, ambition_factor, expected_days, promised_days, sample_size, probability) -> str:
    if sample_size == 0:
        return ("No delivery history yet — this is a neutral baseline estimate. "
                "Confidence will rise as this builder completes escrow milestones.")
    parts = [f"On-time delivery probability {probability}% based on {sample_size} historical data point(s)."]
    if on_time_rate is not None:
        parts.append(f"Past on-time rate {round(on_time_rate * 100)}%.")
    if signals.delivery_rate is not None:
        parts.append(f"Contract completion rate {round(signals.delivery_rate * 100)}%.")
    if expected_days is not None:
        if ambition_factor < 1.0:
            parts.append(f"The {promised_days}-day promise is more aggressive than their typical "
                         f"~{round(expected_days)}-day turnaround, which lowers the estimate.")
        else:
            parts.append(f"The {promised_days}-day promise is realistic versus their ~{round(expected_days)}-day turnaround.")
    return " ".join(parts)
