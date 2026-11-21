"""
Near-duplicate detection for newly imported projects.

Pure functions. Given a candidate's text/metadata and a list of existing
candidates' text/metadata, produce a similarity score and the signals behind it.

## What this is, and what it is not

This compares **listing content and repo shape** — titles, descriptions, topics,
language, dependency fingerprint, directory layout. It is a strong detector of
the actual abuse it targets: the same project relisted under a new name, or a
tutorial/template cloned by twenty students and each listed as original work.

It is **not** code-similarity scanning. It does not diff source files, so it
cannot catch a rewrite that preserves logic while changing names, and it cannot
prove plagiarism. Nothing in the product claims it does — `score_originality_proxy`
in the scoring engine is capped at 90 for exactly this reason, and that cap stays.

The output is a review queue item, never an automatic rejection. A false positive
that silently blocks a legitimate builder costs far more trust than a duplicate
waiting a day for a human look.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# Words that carry no signal about what a project *is*. Without this,
# every "A web app built with React" matches every other one.
STOPWORDS = frozenset("""
a an the and or but if then than that this these those of for to in on at by
with from as is are was were be been being it its it's do does did doing have
has had having i you he she we they my your our their me him her them
app application project simple easy basic quick small full using built build
built-in made make made-with clone copy demo example sample test tests final
year semester college university student assignment submission version final
web website site frontend backend fullstack full-stack api server client
system platform tool toolkit library framework based use used uses
my-project new updated latest v1 v2 v3 main master
""".split())

# Generic tech nouns that are true of thousands of projects. Kept separate from
# STOPWORDS because they are worth a *weak* signal, not zero.
COMMON_TECH = frozenset("""
react nextjs next node express django flask fastapi spring vue angular svelte
mongodb postgres postgresql mysql sqlite redis docker kubernetes aws firebase
python javascript typescript java golang rust php ruby swift kotlin
tailwind bootstrap css html sql rest graphql websocket jwt oauth
""".split())


@dataclass
class DuplicateSignal:
    signal: str
    weight: int
    detail: str

    def as_dict(self) -> dict:
        return {"signal": self.signal, "weight": self.weight, "detail": self.detail}


@dataclass
class DuplicateMatch:
    """One suspected duplicate pairing."""
    project_id: str
    similarity: int
    signals: list[DuplicateSignal] = field(default_factory=list)
    title: str | None = None

    def as_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "similarity": self.similarity,
            "title": self.title,
            "signals": [s.as_dict() for s in self.signals],
        }


@dataclass
class ProjectFingerprint:
    """Everything the comparison needs about one project.

    Built from data we already have at import time — no extra GitHub calls.
    """
    project_id: str
    title: str = ""
    description: str = ""
    topics: tuple[str, ...] = ()
    primary_language: str | None = None
    repo_full_name: str = ""
    # Optional, only present once analysis has run.
    top_level_dirs: tuple[str, ...] = ()
    dependency_names: tuple[str, ...] = ()
    file_count: int | None = None


# Similarity at or above this is worth a human look.
REVIEW_THRESHOLD = 55
# Above this, the pairing is strong enough to hold the listing back from the
# marketplace until reviewed.
WITHHOLD_THRESHOLD = 72


def _tokens(text: str) -> set[str]:
    """Meaningful lowercase word tokens."""
    if not text:
        return set()
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {w for w in words if len(w) > 2 and w not in STOPWORDS}


def _distinctive(tokens: set[str]) -> set[str]:
    """Tokens that actually distinguish a project from the generic crowd."""
    return tokens - COMMON_TECH


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _shingles(text: str, size: int = 3) -> set[str]:
    """Word n-grams — catches copied prose that token overlap alone would miss."""
    words = [w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 1]
    if len(words) < size:
        return set()
    return {" ".join(words[i:i + size]) for i in range(len(words) - size + 1)}


def _normalise_repo_name(full_name: str) -> str:
    """Strip the owner and common suffixes so `alice/todo-app-v2` ≈ `bob/todo-app`."""
    name = (full_name or "").split("/")[-1].lower()
    name = re.sub(r"[-_.]?(v?\d+(\.\d+)*|final|new|copy|clone|fork|old|updated)$", "", name)
    return re.sub(r"[-_.\s]+", "", name)


def compare(a: ProjectFingerprint, b: ProjectFingerprint) -> DuplicateMatch:
    """Score how much two projects look like the same work.

    Weights are additive and capped at 100. They are ordered by how hard the
    signal is to produce accidentally: an identical normalised repo slug plus
    identical dependency set is near-conclusive; two projects sharing the word
    "dashboard" is close to nothing.
    """
    signals: list[DuplicateSignal] = []
    total = 0

    a_title, b_title = _tokens(a.title), _tokens(b.title)
    a_desc, b_desc = _tokens(a.description), _tokens(b.description)

    # ── 1. Normalised repo slug ──────────────────────────────────────────────
    a_slug, b_slug = _normalise_repo_name(a.repo_full_name), _normalise_repo_name(b.repo_full_name)
    if a_slug and a_slug == b_slug:
        total += 30
        signals.append(DuplicateSignal(
            "repo_slug_identical", 30,
            f"Repository names normalise to the same slug ('{a_slug}') once owner "
            "and version suffixes are removed.",
        ))

    # ── 2. Title overlap, weighted by distinctiveness ────────────────────────
    title_sim = _jaccard(a_title, b_title)
    shared_distinctive = _distinctive(a_title) & _distinctive(b_title)
    if title_sim >= 0.5 and shared_distinctive:
        weight = 26 if title_sim >= 0.8 else 18
        total += weight
        signals.append(DuplicateSignal(
            "title_overlap", weight,
            f"Titles share the distinctive term(s) {', '.join(sorted(shared_distinctive))} "
            f"({int(title_sim * 100)}% token overlap).",
        ))
    elif title_sim >= 0.5:
        total += 6
        signals.append(DuplicateSignal(
            "title_overlap_generic", 6,
            f"Titles overlap {int(title_sim * 100)}%, but only on generic terms.",
        ))

    # ── 3. Copied description prose ──────────────────────────────────────────
    a_shingles, b_shingles = _shingles(a.description), _shingles(b.description)
    if a_shingles and b_shingles:
        shingle_sim = _jaccard(a_shingles, b_shingles)
        if shingle_sim >= 0.55:
            total += 28
            signals.append(DuplicateSignal(
                "description_verbatim", 28,
                f"{int(shingle_sim * 100)}% of three-word phrases in the description "
                "appear in the other listing — the text is substantially copied.",
            ))
        elif shingle_sim >= 0.28:
            total += 14
            signals.append(DuplicateSignal(
                "description_similar", 14,
                f"{int(shingle_sim * 100)}% phrase overlap in the descriptions.",
            ))
    desc_sim = _jaccard(a_desc, b_desc)
    if desc_sim >= 0.6 and not any(s.signal.startswith("description") for s in signals):
        total += 10
        signals.append(DuplicateSignal(
            "description_topic_match", 10,
            f"Descriptions share {int(desc_sim * 100)}% of their meaningful words.",
        ))

    # ── 4. Dependency fingerprint ────────────────────────────────────────────
    a_deps, b_deps = set(a.dependency_names), set(b.dependency_names)
    if len(a_deps) >= 5 and len(b_deps) >= 5:
        dep_sim = _jaccard(a_deps, b_deps)
        if dep_sim >= 0.85:
            total += 22
            signals.append(DuplicateSignal(
                "dependency_set_identical", 22,
                f"{int(dep_sim * 100)}% of declared dependencies match across "
                f"{len(a_deps)} and {len(b_deps)} packages — same stack, same versions of it.",
            ))
        elif dep_sim >= 0.65:
            total += 10
            signals.append(DuplicateSignal(
                "dependency_set_similar", 10,
                f"{int(dep_sim * 100)}% dependency overlap.",
            ))

    # ── 5. Directory layout ──────────────────────────────────────────────────
    a_dirs, b_dirs = set(d.lower() for d in a.top_level_dirs), set(d.lower() for d in b.top_level_dirs)
    if len(a_dirs) >= 3 and len(b_dirs) >= 3:
        dir_sim = _jaccard(a_dirs, b_dirs)
        if dir_sim >= 0.85:
            total += 12
            signals.append(DuplicateSignal(
                "layout_identical", 12,
                f"Top-level directory structure is {int(dir_sim * 100)}% identical.",
            ))

    # ── 6. Topics ────────────────────────────────────────────────────────────
    a_topics = {t.lower() for t in a.topics}
    b_topics = {t.lower() for t in b.topics}
    if len(a_topics) >= 2 and len(b_topics) >= 2:
        topic_sim = _jaccard(a_topics, b_topics)
        if topic_sim >= 0.7:
            total += 8
            signals.append(DuplicateSignal(
                "topics_match", 8,
                f"GitHub topics are {int(topic_sim * 100)}% the same.",
            ))

    # ── 7. Same language, as a weak corroborator only ────────────────────────
    # Never scores on its own — half the catalogue is TypeScript.
    if (
        a.primary_language and a.primary_language == b.primary_language
        and total >= 30
    ):
        total += 4
        signals.append(DuplicateSignal(
            "same_language", 4,
            f"Both are primarily {a.primary_language}.",
        ))

    return DuplicateMatch(
        project_id=b.project_id,
        similarity=max(0, min(100, total)),
        signals=signals,
        title=b.title or None,
    )


def find_duplicates(
    candidate: ProjectFingerprint,
    existing: list[ProjectFingerprint],
    *,
    threshold: int = REVIEW_THRESHOLD,
    limit: int = 5,
) -> list[DuplicateMatch]:
    """Compare a candidate against existing projects, strongest matches first."""
    matches: list[DuplicateMatch] = []
    for other in existing:
        if other.project_id == candidate.project_id:
            continue
        match = compare(candidate, other)
        if match.similarity >= threshold:
            matches.append(match)
    matches.sort(key=lambda m: -m.similarity)
    return matches[:limit]


def verdict(similarity: int) -> str:
    """What the platform should do at a given similarity."""
    if similarity >= WITHHOLD_THRESHOLD:
        return "withhold"    # keep out of the marketplace pending review
    if similarity >= REVIEW_THRESHOLD:
        return "review"      # visible, but queued for a human
    return "clear"
