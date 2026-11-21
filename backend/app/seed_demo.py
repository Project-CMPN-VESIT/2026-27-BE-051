"""
Demo seed for CodeBazaar — a full, live-looking marketplace.

    python -m app.seed_demo            # seed
    python -m app.seed_demo --report   # print the distribution of what exists
    python -m app.seed_demo --reset    # clear a disposable DB before reseeding

Design notes
────────────
1. **Scores are computed, not written.** Every Verified Build Score comes from
   `verification.scoring.compute_build_score` run against synthesised repository
   signals; hackathon verdicts come from `hackathon.engine.compute_authenticity`;
   tiers and trust scores come from `users.reputation.ReputationService`. Nothing
   here hardcodes a score, so every number on screen is reproducible from its
   inputs and defensible if a judge asks how it was derived.

2. **Deterministic.** A fixed RNG seed means the same dataset every run — the
   demo script can name exact projects and they will look the same tomorrow.

3. **Money is real arithmetic.** Escrow contracts are driven through the actual
   `EscrowService`, so commission splits and ledger entries are computed by the
   same code that runs in production, in paise.

4. **Honest gaps stay visible.** Fraud-flagged projects are seeded deliberately
   so fraud detection can be demonstrated rather than described. AI analyses are
   marked `seed:deterministic-v1` in `model_used` rather than pretending an LLM
   wrote them.
"""
from __future__ import annotations

import argparse
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password

logger = get_logger("seed_demo")
settings = get_settings()

# Everything is generated from this one seed.
RNG_SEED = 20260902
SEED_MARKER_EMAIL = "admin@codebazaar.dev"
DEMO_PASSWORD = "Password123!"

NOW = datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _paise(rupees: float) -> int:
    return int(round(rupees * 100))


def rupees(paise: int | None) -> str:
    if paise is None:
        return "—"
    return f"₹{paise / 100:,.0f}"


# ══════════════════════════════════════════════════════════════════════════════
# Content pools — Indian colleges, plausible names, real-sounding project ideas
# ══════════════════════════════════════════════════════════════════════════════

COLLEGES = [
    "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kanpur", "IIT Kharagpur",
    "IIT Roorkee", "IIT Guwahati", "IIT Hyderabad", "BITS Pilani", "BITS Goa",
    "NIT Trichy", "NIT Surathkal", "NIT Warangal", "NIT Calicut",
    "IIIT Hyderabad", "IIIT Bangalore", "IIIT Delhi", "IIIT Allahabad",
    "VIT Vellore", "SRM Chennai", "Manipal Institute of Technology",
    "Delhi Technological University", "NSUT Delhi", "Thapar University",
    "College of Engineering Pune", "PES University", "RV College of Engineering",
    "Jadavpur University", "Anna University", "Amrita Vishwa Vidyapeetham",
]

CITIES = [
    "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai",
    "Kolkata", "Ahmedabad", "Jaipur", "Kochi", "Indore", "Bhubaneswar",
]

FIRST_NAMES = [
    "Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Ishita", "Aditya", "Saanvi",
    "Reyansh", "Meera", "Kabir", "Aisha", "Rohan", "Kavya", "Dhruv", "Tara",
    "Krishna", "Nithya", "Siddharth", "Riya", "Yash", "Sneha", "Ayaan", "Pooja",
    "Karan", "Shreya", "Manav", "Divya", "Rahul", "Anjali", "Nikhil", "Priya",
    "Varun", "Neha", "Aryan", "Swara", "Ved", "Lakshmi", "Ishaan", "Gauri",
    "Tanmay", "Bhavya", "Om", "Charvi", "Advait", "Myra", "Rudra", "Aadhya",
    "Kiaan", "Anika", "Devansh", "Ira", "Harsh", "Naina", "Parth", "Trisha",
    "Sarthak", "Mahika", "Vivaan", "Zara",
]

LAST_NAMES = [
    "Sharma", "Patel", "Reddy", "Iyer", "Nair", "Gupta", "Singh", "Mehta",
    "Desai", "Rao", "Joshi", "Kulkarni", "Banerjee", "Chatterjee", "Bose",
    "Menon", "Pillai", "Agarwal", "Kapoor", "Malhotra", "Verma", "Mishra",
    "Bhat", "Shetty", "Naidu", "Chauhan", "Sinha", "Ghosh", "Dutta", "Saxena",
]

BIO_TEMPLATES = [
    "Final-year CS student. I build {focus} and care more about shipping than pitching.",
    "{focus} developer. Two hackathon wins, one production deployment, plenty of scars.",
    "Self-taught, then formally taught. Currently deep in {focus}.",
    "I like problems where the hard part is the data, not the UI. Mostly {focus}.",
    "Building {focus} because the existing tools annoyed me enough to start over.",
    "Backend-leaning full-stack. {focus} is where I spend most weekends.",
    "Ex-intern turned maintainer. {focus} is my main line of work.",
    "I write {focus} and maintain two libraries nobody asked for but several people use.",
    "Interested in {focus} and in making student projects outlive the demo day.",
    "{focus}, mostly. I document as I go, which is apparently unusual.",
]

FOCUS_AREAS = [
    "developer tooling", "ML infrastructure", "civic-tech dashboards",
    "payment integrations", "computer vision", "NLP for Indian languages",
    "campus logistics software", "healthtech backends", "agritech sensing",
    "fintech data pipelines", "edtech platforms", "geospatial analytics",
    "distributed systems", "browser extensions", "accessibility tooling",
]

SKILL_POOL = [
    "Python", "TypeScript", "React", "Next.js", "FastAPI", "Django", "Node.js",
    "PostgreSQL", "Redis", "Docker", "Kubernetes", "AWS", "GraphQL", "Go",
    "Rust", "Flutter", "React Native", "TensorFlow", "PyTorch", "scikit-learn",
    "Pandas", "Celery", "Kafka", "Terraform", "Tailwind CSS", "Figma",
    "Solidity", "OpenCV", "spaCy", "Elasticsearch",
]

LANGUAGES = ["Python", "TypeScript", "JavaScript", "Go", "Rust", "Java", "Dart", "C++"]

# (title, slug, description, topics, primary_language)
PROJECT_IDEAS = [
    ("StudyBuddy AI", "studybuddy", "Turns lecture PDFs into spaced-repetition decks and tracks which concepts you keep forgetting.", ["education", "ai", "flashcards"], "Python"),
    ("CampusEats", "campuseats", "Pre-order canteen food between lectures so you aren't queueing for twenty minutes.", ["food", "campus", "logistics"], "TypeScript"),
    ("MetroMind", "metromind", "Crowd-sourced metro crowding predictions built from anonymised check-in patterns.", ["transit", "ml", "civic"], "Python"),
    ("KrishiSense", "krishisense", "Soil-moisture sensing dashboard for smallholder farms, works offline and syncs later.", ["agritech", "iot", "offline-first"], "Python"),
    ("LedgerLite", "ledgerlite", "Double-entry bookkeeping for tiny businesses. GST-aware, exports to Tally.", ["fintech", "accounting", "gst"], "TypeScript"),
    ("DocuMitra", "documitra", "Extracts structured fields from scanned Indian government forms.", ["ocr", "documents", "govtech"], "Python"),
    ("HostelHub", "hostelhub", "Room allocation, complaint tracking and mess billing for university hostels.", ["campus", "operations"], "TypeScript"),
    ("VernacularQA", "vernacularqa", "Question answering over Hindi and Marathi text without translating to English first.", ["nlp", "indic", "ai"], "Python"),
    ("PillPal", "pillpal", "Medication adherence reminders that actually work for shared family phones.", ["healthtech", "mobile"], "Dart"),
    ("CommitCanvas", "commitcanvas", "Visualises a repository's real development rhythm rather than a contribution square grid.", ["devtools", "git", "visualisation"], "TypeScript"),
    ("QueueZero", "queuezero", "Token-based appointment system for small clinics with SMS fallback.", ["healthtech", "sms"], "Python"),
    ("BusTrackr", "bustrackr", "Live college shuttle tracking using driver phones as the only hardware.", ["transit", "realtime"], "TypeScript"),
    ("ResumeRadar", "resumeradar", "Tells you which job description keywords your resume genuinely supports.", ["careers", "nlp"], "Python"),
    ("SplitSquad", "splitsquad", "Group expense splitting with UPI settlement links and no signup for guests.", ["fintech", "upi", "social"], "TypeScript"),
    ("LabQueue", "labqueue", "Instrument booking for shared research labs, with no-show penalties.", ["research", "scheduling"], "Python"),
    ("CodeCoach", "codecoach", "Reviews student submissions against a rubric and explains the deduction.", ["education", "ai", "grading"], "Python"),
    ("WasteWise", "wastewise", "Municipal waste-collection route optimiser fed by bin-fill reports.", ["civic", "optimisation"], "Go"),
    ("ScholarNet", "scholarnet", "Finds scholarships you are actually eligible for instead of listing all of them.", ["education", "search"], "TypeScript"),
    ("AirLog", "airlog", "Hyperlocal air-quality logging from low-cost sensors with drift correction.", ["environment", "iot"], "Python"),
    ("MentorMatch", "mentormatch", "Pairs juniors with seniors by overlapping skills and actual availability.", ["community", "matching"], "TypeScript"),
    ("InvoiceOwl", "invoiceowl", "Freelance invoicing with automatic TDS and GST computation for Indian clients.", ["fintech", "freelance"], "TypeScript"),
    ("FieldNotes", "fieldnotes", "Offline-first survey collection for NGO fieldwork in low-connectivity areas.", ["ngo", "offline-first"], "Dart"),
    ("StackSage", "stacksage", "Suggests which dependency to upgrade first based on real vulnerability reachability.", ["devtools", "security"], "Rust"),
    ("TutorTide", "tutortide", "Scheduling and payment rails for independent tutors running small batches.", ["edtech", "payments"], "TypeScript"),
    ("GreenRoute", "greenroute", "Cycling route planner that weights air quality and gradient, not just distance.", ["mobility", "geospatial"], "Python"),
    ("ClauseCheck", "clausecheck", "Highlights unusual clauses in rental agreements against a corpus of standard ones.", ["legaltech", "nlp"], "Python"),
    ("ShelfSense", "shelfsense", "Small-retail inventory forecasting that runs on a single shop's history.", ["retail", "forecasting"], "Python"),
    ("PeerReview", "peerreview", "Anonymous double-blind peer review workflow for student journals.", ["academia", "workflow"], "TypeScript"),
    ("SafeWalk", "safewalk", "Shares a live walking route with chosen contacts and alerts on deviation.", ["safety", "mobile"], "Dart"),
    ("DataDhaba", "datadhaba", "Self-hosted dataset catalogue with lineage for small research groups.", ["data", "catalogue"], "Python"),
    ("ExamEase", "examease", "Seating-plan and invigilator allocation solver for large examination halls.", ["campus", "optimisation"], "Go"),
    ("BloodBridge", "bloodbridge", "Connects verified blood donors to nearby requests with cooldown tracking.", ["healthtech", "civic"], "TypeScript"),
    ("RepoRadar", "reporadar", "Watches dependencies for abandonment signals before they become a problem.", ["devtools", "supply-chain"], "Rust"),
    ("CivicPulse", "civicpulse", "Tracks municipal complaint resolution times and publishes ward-level scorecards.", ["civic", "transparency"], "Python"),
    ("FarmFair", "farmfair", "Mandi price aggregation with transport cost so farmers can compare net realisation.", ["agritech", "pricing"], "Python"),
]

TECH_DEBT_NOTES = [
    "Business logic sits in route handlers in three places; extracting a service layer would make it testable.",
    "No integration tests around the payment path — the riskiest code has the least coverage.",
    "Database access happens inside request handlers without a repository boundary, so swapping stores would be invasive.",
    "Frontend state is duplicated between local component state and the query cache, which is why stale values appear after mutations.",
    "Error handling is inconsistent: some failures surface to the user, others are swallowed silently.",
    "Configuration is read from environment variables at import time, which makes the module hard to test in isolation.",
    "The migration history has two heads that were merged manually; the schema and the migrations have drifted.",
]

MISSING_FEATURES_POOL = [
    "Password reset flow", "Rate limiting on public endpoints", "Audit logging",
    "Bulk CSV export", "Role-based permissions", "Email notifications",
    "Offline mode", "Two-factor authentication", "Search pagination",
    "Webhook retries", "Soft deletes", "Internationalisation",
]

REVIEW_HEADLINES = [
    ("Clean architecture, easy handover", 5),
    ("Solid engineering, thin documentation", 4),
    ("Worked exactly as described", 5),
    ("Good bones, needs tests", 4),
    ("Handover was smoother than expected", 5),
    ("Useful, though setup took a while", 4),
    ("Responsive to questions after purchase", 5),
    ("Decent code, ambitious scope", 3),
    ("Delivered on time and documented the gotchas", 5),
    ("Fine for the price, some rough edges", 3),
]

REVIEW_BODIES = [
    "Read through the whole codebase before buying and it matched what the score suggested. Module boundaries are sensible and the migrations run cleanly on a fresh database.",
    "The commit history told an honest story, which is why I trusted the listing. Documentation covers setup but not deployment, so budget a day for that.",
    "Bought this to avoid rebuilding an integration from scratch and it saved roughly three weeks. The builder answered two follow-up questions within a day.",
    "Code quality is genuinely good. Test coverage is thinner than I would like around the billing path, but nothing was misrepresented.",
    "Handover included environment variables and a short call. That is more than I expected at this price point.",
    "Scope is broader than it needed to be, which shows in a few half-finished screens. The core flow is solid though.",
]

DM_OPENERS = [
    ("Interested in acquiring this", "Saw the verified score and the commit history. Is the price negotiable if we take the whole repo plus a month of support?"),
    ("Contributor availability", "I work on similar problems and have about ten hours a week. Are you still looking for contributors on this?"),
    ("Incubation conversation", "We run a small pre-seed programme and this fits our thesis. Could we set up a call this week?"),
    ("Question before buying", "Does the delivery include the deployment configuration, or just application code?"),
    ("Hiring for a similar build", "We need something close to this built from scratch. Would you consider a fixed-scope contract?"),
    ("Licence clarification", "Can we use this commercially with modifications, or is it source-available only?"),
]


# ══════════════════════════════════════════════════════════════════════════════
# Repository archetypes
#
# Each archetype describes a *shape* of development history. The scoring engine
# is then run against it for real. Expected bands are documented so the seed can
# assert them and fail loudly if the engine is retuned — a score that silently
# drifts out of its intended band would make the demo misleading.
# ══════════════════════════════════════════════════════════════════════════════

# name -> (expected_min, expected_max) for the composite score.
#
# These bands were measured, not guessed: _t/probe_archetypes.py runs each
# archetype through the real engine 140 times and reports the quartiles. They
# exist to catch silent drift — if the engine is retuned, the seed says so loudly
# instead of quietly producing a misleading demo.
ARCHETYPE_BANDS: dict[str, tuple[int, int]] = {
    "flagship":    (84, 100),
    "hackathon":   (66, 88),   # genuine 48h build plus follow-through
    "strong":      (70, 90),
    "mid":         (46, 75),
    "early":       (26, 52),
    "unscored":    (0, 0),     # never scored — no verification run at all
    "fraud_burst": (10, 36),
    "fraud_fork":  (0, 46),
    "stale":       (10, 40),
}


def _commit_dates(
    rng: random.Random,
    *,
    count: int,
    span_days: int,
    end_days_ago: int,
    regular: bool = True,
) -> list[datetime]:
    """Synthesise plausible commit timestamps.

    `regular=True` spreads commits across many distinct days (what sustained work
    looks like); `regular=False` clumps them, which the consistency scorer
    penalises via the coefficient of variation of the day gaps.
    """
    end = NOW - timedelta(days=end_days_ago)
    start = end - timedelta(days=max(span_days, 1))
    out: list[datetime] = []
    for _ in range(count):
        if regular:
            offset = rng.uniform(0, span_days)
        else:
            # Cluster around a few bursts.
            centre = rng.choice([0.05, 0.12, 0.9]) * span_days
            offset = min(max(rng.gauss(centre, span_days * 0.02), 0), span_days)
        out.append(start + timedelta(days=offset, hours=rng.uniform(0, 23)))
    return sorted(out)


def build_signals_for(archetype: str, rng: random.Random):
    """Return (BuildSignals, extra_project_fields) for an archetype."""
    from app.verification.scoring import BuildSignals

    if archetype == "flagship":
        age = rng.randint(420, 900)
        commits = _commit_dates(rng, count=rng.randint(140, 260), span_days=age - 40, end_days_ago=rng.randint(1, 8))
        return BuildSignals(
            repo_created_at=NOW - timedelta(days=age),
            repo_pushed_at=NOW - timedelta(days=rng.randint(1, 6)),
            is_fork=False, has_license=True, has_description=True,
            topics_count=rng.randint(3, 6),
            stars=rng.randint(180, 1400), forks=rng.randint(20, 190),
            open_issues=rng.randint(3, 24),
            readme_length=rng.randint(2600, 8000),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=rng.randint(4, 11),
            top_contributor_share=rng.uniform(0.35, 0.6),
            ownership_verified=True, hackathon_verified=rng.random() < 0.4,
        ), {"stars_hint": None}

    if archetype == "hackathon":
        # A real hackathon build: a dense 48-hour burst, then follow-through.
        # The follow-up commits are what keep it clear of the burst fraud flag —
        # a genuine winner keeps working on it, a code dump does not.
        event_start = NOW - timedelta(days=rng.randint(70, 260))
        event_end = event_start + timedelta(days=2)
        window = sorted(
            event_start + timedelta(hours=rng.uniform(0, 48))
            for _ in range(rng.randint(24, 38))
        )
        follow = _commit_dates(
            rng, count=rng.randint(9, 18),
            span_days=rng.randint(30, 90), end_days_ago=rng.randint(3, 25),
        )
        commits = sorted(window + follow)
        return BuildSignals(
            repo_created_at=event_start - timedelta(days=rng.randint(0, 2)),
            repo_pushed_at=max(commits),
            is_fork=False, has_license=True, has_description=True,
            topics_count=rng.randint(3, 5),
            stars=rng.randint(20, 260), forks=rng.randint(2, 40),
            open_issues=rng.randint(0, 10),
            readme_length=rng.randint(1400, 3200),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=rng.randint(2, 4),
            top_contributor_share=rng.uniform(0.4, 0.7),
            ownership_verified=True, hackathon_verified=False,
        ), {"hackathon_window": (event_start, event_end)}

    if archetype == "strong":
        age = rng.randint(220, 430)
        commits = _commit_dates(rng, count=rng.randint(45, 95), span_days=rng.randint(90, 200), end_days_ago=rng.randint(6, 30))
        return BuildSignals(
            repo_created_at=NOW - timedelta(days=age),
            repo_pushed_at=NOW - timedelta(days=rng.randint(5, 28)),
            is_fork=False, has_license=rng.random() < 0.8, has_description=True,
            topics_count=rng.randint(2, 3),
            stars=rng.randint(25, 180), forks=rng.randint(3, 40),
            open_issues=rng.randint(1, 14),
            readme_length=rng.randint(1100, 2100),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=rng.randint(2, 3),
            top_contributor_share=rng.uniform(0.5, 0.8),
            ownership_verified=True, hackathon_verified=False,
        ), {}

    if archetype == "mid":
        # Deliberately lands below the verified threshold for most instances:
        # a catalogue where nearly everything passes would make the score
        # meaningless.
        age = rng.randint(120, 300)
        commits = _commit_dates(rng, count=rng.randint(14, 34), span_days=rng.randint(20, 55), end_days_ago=rng.randint(45, 120))
        return BuildSignals(
            repo_created_at=NOW - timedelta(days=age),
            repo_pushed_at=NOW - timedelta(days=rng.randint(45, 115)),
            is_fork=False, has_license=rng.random() < 0.25, has_description=True,
            topics_count=rng.randint(0, 2),
            stars=rng.randint(2, 45), forks=rng.randint(0, 9),
            open_issues=rng.randint(0, 7),
            readme_length=rng.randint(340, 820),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=rng.randint(1, 2),
            top_contributor_share=rng.uniform(0.7, 1.0),
            ownership_verified=rng.random() < 0.6, hackathon_verified=False,
        ), {}

    if archetype == "early":
        age = rng.randint(35, 110)
        commits = _commit_dates(rng, count=rng.randint(6, 15), span_days=rng.randint(8, 26), end_days_ago=rng.randint(20, 70))
        return BuildSignals(
            repo_created_at=NOW - timedelta(days=age),
            repo_pushed_at=NOW - timedelta(days=rng.randint(18, 65)),
            is_fork=False, has_license=False, has_description=True,
            topics_count=rng.randint(0, 1),
            stars=rng.randint(0, 12), forks=rng.randint(0, 3),
            open_issues=rng.randint(0, 4),
            readme_length=rng.randint(130, 420),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=1, top_contributor_share=1.0,
            ownership_verified=rng.random() < 0.4, hackathon_verified=False,
        ), {}

    if archetype == "fraud_burst":
        # A repo claiming substance whose entire history lands inside one day.
        age = rng.randint(20, 60)
        day = NOW - timedelta(days=rng.randint(10, 18))
        commits = sorted(day.replace(hour=0) + timedelta(minutes=rng.randint(0, 1400)) for _ in range(rng.randint(28, 55)))
        return BuildSignals(
            repo_created_at=NOW - timedelta(days=age),
            repo_pushed_at=day,
            is_fork=False, has_license=False, has_description=True,
            topics_count=1,
            stars=rng.randint(0, 6), forks=0, open_issues=0,
            readme_length=rng.randint(140, 420),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=1, top_contributor_share=1.0,
            ownership_verified=False, hackathon_verified=False,
        ), {}

    if archetype == "fraud_fork":
        age = rng.randint(30, 120)
        commits = _commit_dates(rng, count=rng.randint(6, 20), span_days=rng.randint(4, 14), end_days_ago=rng.randint(8, 40), regular=False)
        return BuildSignals(
            repo_created_at=NOW - timedelta(days=age),
            repo_pushed_at=NOW - timedelta(days=rng.randint(8, 35)),
            is_fork=True, has_license=True, has_description=True,
            topics_count=rng.randint(0, 2),
            stars=rng.randint(0, 9), forks=0, open_issues=rng.randint(0, 3),
            readme_length=rng.randint(300, 1200),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=1, top_contributor_share=1.0,
            ownership_verified=False, hackathon_verified=False,
        ), {}

    if archetype == "stale":
        age = rng.randint(400, 1100)
        commits = _commit_dates(rng, count=rng.randint(1, 2), span_days=3, end_days_ago=age - 5)
        return BuildSignals(
            repo_created_at=NOW - timedelta(days=age),
            repo_pushed_at=NOW - timedelta(days=age - 5),
            is_fork=False, has_license=False, has_description=True,
            topics_count=0,
            stars=rng.randint(0, 4), forks=0, open_issues=0,
            readme_length=rng.randint(110, 300),
            commit_dates=commits, commit_history_complete=True,
            contributors_count=1, top_contributor_share=1.0,
            ownership_verified=False, hackathon_verified=False,
        ), {}

    raise ValueError(f"Unknown archetype: {archetype}")


# ══════════════════════════════════════════════════════════════════════════════
# Builders
# ══════════════════════════════════════════════════════════════════════════════

# The distribution of archetypes across the project catalogue. Deliberately
# includes fraud cases so detection can be shown, not just claimed.
ARCHETYPE_MIX: list[tuple[str, int]] = [
    ("flagship", 9),
    ("hackathon", 10),
    ("strong", 21),
    ("mid", 39),
    ("early", 27),
    ("unscored", 12),
    ("fraud_burst", 5),
    ("fraud_fork", 4),
    ("stale", 4),
]

NAMED_BUILDERS = [
    # (email, display name, college, archetype bias) — referenced by DEMO_SCRIPT.md
    ("aarav@codebazaar.dev", "Aarav Sharma", "IIT Bombay"),
    ("diya@codebazaar.dev", "Diya Patel", "BITS Pilani"),
    ("meera@codebazaar.dev", "Meera Iyer", "IIIT Hyderabad"),
    ("rohan@codebazaar.dev", "Rohan Desai", "NIT Trichy"),
]


def _seed_users(db, rng: random.Random) -> dict:
    """Create the cast: admin, staff, buyers, and 64 builders across four tiers."""
    from app.users.models import User, UserRole
    from app.users.repository import UserRepository

    repo = UserRepository(db)
    # bcrypt is intentionally slow; every demo account shares one password, so
    # hash once rather than ~80 times (saves roughly half a minute per run).
    pw = hash_password(DEMO_PASSWORD)

    def mk(email, name, role, *, college=None, city=None, bio=None,
           grad=None, github=None, ambassador=False, referred_by=None) -> User:
        user = repo.create(
            email=email, hashed_password=pw, display_name=name,
            role=role, is_verified=True, referred_by_id=referred_by,
        )
        repo.update_profile(
            user.id,
            bio=bio, college=college, location=city, graduation_year=grad,
            github_username=github,
            linkedin_url=f"https://linkedin.com/in/{github}" if github else None,
        )
        if ambassador:
            repo.update(user, is_campus_ambassador=True)
        return user

    admin = mk(SEED_MARKER_EMAIL, "Platform Admin", UserRole.ADMIN, city="Bengaluru")

    # Buyers / funders — these are the accounts that spend money in the demo.
    incubator = mk("incubator@codebazaar.dev", "Prayog Ventures", UserRole.INCUBATOR,
                   city="Bengaluru",
                   bio="Pre-seed fund backing student-built software. We write first cheques of ₹5–25L.")
    recruiter = mk("recruiter@codebazaar.dev", "Nikhil Rao", UserRole.FOUNDER,
                   city="Hyderabad",
                   bio="Head of Engineering. Hiring interns who have actually shipped something.")
    founder2 = mk("founder@codebazaar.dev", "Shreya Menon", UserRole.FOUNDER,
                  city="Pune", bio="Building in logistics. I buy rather than rebuild when the code is verifiable.")
    mentor = mk("mentor@codebazaar.dev", "Kabir Bose", UserRole.MENTOR,
                city="Kolkata", bio="Fifteen years in backend infrastructure. I review student architectures for free.")

    builders: list[User] = []
    used_emails = set()

    # Four named builders drive the scripted walkthrough.
    for i, (email, name, college) in enumerate(NAMED_BUILDERS):
        gh = email.split("@")[0]
        u = mk(email, name, UserRole.BUILDER, college=college,
               city=rng.choice(CITIES),
               bio=rng.choice(BIO_TEMPLATES).format(focus=rng.choice(FOCUS_AREAS)),
               grad=rng.choice([2026, 2027]), github=gh,
               ambassador=(i == 0))
        builders.append(u)
        used_emails.add(email)

    # Then a realistic long tail.
    for i in range(60):
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        gh = f"{first.lower()}{last.lower()}{rng.randint(10, 99)}"
        email = f"{gh}@example.dev"
        if email in used_emails:
            continue
        used_emails.add(email)
        role = UserRole.CONTRIBUTOR if rng.random() < 0.22 else UserRole.BUILDER
        u = mk(
            email, f"{first} {last}", role,
            college=rng.choice(COLLEGES),
            city=rng.choice(CITIES),
            bio=rng.choice(BIO_TEMPLATES).format(focus=rng.choice(FOCUS_AREAS)),
            grad=rng.choice([2025, 2026, 2027, 2028]),
            github=gh,
            ambassador=(i % 17 == 0),
            # A referral chain so the growth dashboard has real attribution.
            referred_by=builders[0].id if i % 6 == 0 else None,
        )
        builders.append(u)

    db.commit()
    return {
        "admin": admin, "incubator": incubator, "recruiter": recruiter,
        "founder2": founder2, "mentor": mentor, "builders": builders,
    }


def _seed_skills(db, cast: dict, rng: random.Random) -> dict[str, uuid.UUID]:
    """Create the skill vocabulary and attach skills to builders."""
    from app.skills.models import Skill, UserSkill

    skills: dict[str, uuid.UUID] = {}
    for name in SKILL_POOL:
        s = Skill(name=name, category=_skill_category(name))
        db.add(s)
        db.flush()
        skills[name] = s.id

    for user in cast["builders"]:
        chosen = rng.sample(SKILL_POOL, rng.randint(3, 7))
        for name in chosen:
            db.add(UserSkill(
                user_id=user.id, skill_id=skills[name],
                proficiency=rng.choices(
                    ["expert", "intermediate", "beginner"], weights=[2, 5, 3]
                )[0],
            ))
    db.commit()
    return skills


_SKILL_CATEGORIES = {
    "language": {"Python", "TypeScript", "Go", "Rust", "Solidity"},
    "frontend": {"React", "Next.js", "Tailwind CSS", "Figma", "React Native", "Flutter"},
    "backend": {"FastAPI", "Django", "Node.js", "GraphQL", "Celery"},
    "data": {"PostgreSQL", "Redis", "Kafka", "Elasticsearch", "Pandas"},
    "ml": {"TensorFlow", "PyTorch", "scikit-learn", "OpenCV", "spaCy"},
    "infra": {"Docker", "Kubernetes", "AWS", "Terraform"},
}


_ROMAN = ["", "II", "III", "IV", "V", "VI", "VII", "VIII"]


def _skill_category(name: str) -> str:
    for category, members in _SKILL_CATEGORIES.items():
        if name in members:
            return category
    return "other"


# ══════════════════════════════════════════════════════════════════════════════
# Projects — scored by the real engine
# ══════════════════════════════════════════════════════════════════════════════

def _seed_projects(db, cast: dict, skills: dict, rng: random.Random) -> dict:
    """Create the project catalogue and score every scorable one for real."""
    from app.projects.models import (
        AnalysisStatus, ProjectEventType, ProjectLanguage, ProjectStage, ProjectStatus,
    )
    from app.projects.repository import ProjectRepository
    from app.projects.timeline import record_event
    from app.skills.models import ProjectSkill
    from app.verification.scoring import compute_build_score

    repo = ProjectRepository(db)
    builders = cast["builders"]

    plan: list[str] = []
    for archetype, count in ARCHETYPE_MIX:
        plan.extend([archetype] * count)
    rng.shuffle(plan)

    # ── Ownership is assigned per quality tier, deliberately ─────────────────
    # Three constraints have to hold at once, and they pull against each other:
    #
    #   1. A few builders must accumulate enough verified work to reach `elite`.
    #      Spreading projects evenly makes the top tier unreachable and the whole
    #      tier system decorative.
    #   2. Those same builders must NOT own the fraud-flagged repos. A demo where
    #      the top-ranked builder owns four forked repos discredits both the
    #      reputation engine and the fraud detection.
    #   3. The "top projects" rail must not be a single name.
    #
    # Weight-shuffling satisfied one at a time, so ownership is assigned
    # explicitly by archetype group instead.
    STRONG = {"flagship", "hackathon", "strong"}
    WEAK = {"fraud_burst", "fraud_fork", "stale"}

    named = builders[:len(NAMED_BUILDERS)]
    second_tier = builders[len(NAMED_BUILDERS):12]
    long_tail = builders[26:] or builders[12:]

    # Named builders take a triple share of the strong work, interleaved so the
    # first few flagships land on four different people.
    strong_cycle: list = []
    for _ in range(3):
        strong_cycle.extend(named)
    strong_cycle.extend(second_tier)

    # Everything mid-range spreads wide, with named builders taking a slice so
    # their profiles show unverified work too — 8-for-8 verified looks staged.
    middle_cycle = list(builders[len(NAMED_BUILDERS):]) + named

    # Fraud and abandonment only ever land on long-tail accounts.
    weak_cycle = list(long_tail)

    quality_rank = {
        "flagship": 0, "hackathon": 1, "strong": 2, "mid": 3,
        "early": 4, "unscored": 5, "fraud_burst": 6, "fraud_fork": 7, "stale": 8,
    }
    plan.sort(key=lambda a: quality_rank[a])

    cursors = {"strong": 0, "middle": 0, "weak": 0}

    def owner_for(archetype: str):
        if archetype in STRONG:
            cycle, key = strong_cycle, "strong"
        elif archetype in WEAK:
            cycle, key = weak_cycle, "weak"
        else:
            cycle, key = middle_cycle, "middle"
        owner = cycle[cursors[key] % len(cycle)]
        cursors[key] += 1
        return owner

    # Clean, un-suffixed titles (cycle 0) go to everything a judge actually
    # opens: the hero listings AND the fraud examples. Allocating them purely
    # best-first left every flagged project named "… IV", which is a visible
    # tell that the bad data was generated as an afterthought. The mid-range
    # bulk carries the numbered variants instead, because it's background.
    title_priority = {
        "flagship": 0, "hackathon": 1,
        "fraud_fork": 2, "fraud_burst": 3, "stale": 4,
        "strong": 5, "mid": 6, "early": 7, "unscored": 8,
    }
    all_slots = [
        (i % len(PROJECT_IDEAS), i // len(PROJECT_IDEAS))
        for i in range(len(plan))
    ]
    rng.shuffle(all_slots)
    all_slots.sort(key=lambda pair: pair[1])          # cycle 0 first
    positions = sorted(range(len(plan)), key=lambda i: title_priority[plan[i]])

    idea_slots: list = [None] * len(plan)
    for slot, position in zip(all_slots, positions):
        idea_slots[position] = slot

    created: list[dict] = []
    repo_id = 900_000
    band_violations: list[str] = []

    for index, archetype in enumerate(plan):
        idea_index, cycle = idea_slots[index]
        title, slug, description, topics, language = PROJECT_IDEAS[idea_index]
        # Later cycles get a variant suffix so titles stay distinct and honest.
        if cycle:
            title = f"{title} {_ROMAN[cycle]}"
            slug = f"{slug}-v{cycle + 1}"

        owner = owner_for(archetype)
        gh_user = owner.profile.github_username or "builder"
        repo_id += 1

        scorable = archetype != "unscored"
        signals, extra = build_signals_for(archetype, rng) if scorable else (None, {})

        # Discovery placement. Fraud archetypes are never featured or for sale —
        # the platform should not be promoting what it has flagged.
        clean = archetype in {"flagship", "strong", "mid", "early"}
        for_sale = clean and rng.random() < 0.42
        seeking = clean and not for_sale and rng.random() < 0.45
        revived = archetype in {"mid", "early"} and rng.random() < 0.12
        dormant = archetype == "stale"

        price_paise = None
        sale_type = None
        price_label = None
        if for_sale:
            tier = rng.choice([
                (250_000, 600_000, "source_code", "Full source code + handover call"),
                (600_000, 1_800_000, "source_code", "Source code, docs and deployment config"),
                (1_800_000, 4_500_000, "custom", "Codebase, domain and existing users"),
                (120_000, 320_000, "collab_access", "Collaborator access + code walkthrough"),
            ])
            price_paise = rng.randrange(tier[0], tier[1], 5_000)
            sale_type = tier[2]
            price_label = tier[3]

        status = (
            ProjectStatus.REVIVED if revived
            else ProjectStatus.DORMANT if dormant
            else ProjectStatus.ACTIVE
        )
        stage = (
            ProjectStage.PRODUCTION if archetype == "flagship"
            else ProjectStage.MVP if archetype in {"strong", "mid"}
            else ProjectStage.PROTOTYPE if archetype in {"early", "fraud_burst", "fraud_fork"}
            else ProjectStage.IDEA
        )

        created_at = signals.repo_created_at if signals else NOW - timedelta(days=rng.randint(10, 90))
        pushed_at = signals.repo_pushed_at if signals else NOW - timedelta(days=rng.randint(1, 30))

        project = repo.create(
            owner_id=owner.id,
            github_repo_id=repo_id,
            repo_full_name=f"{gh_user}/{slug}",
            title=title,
            description=description,
            homepage_url=f"https://{slug}.vercel.app" if clean and rng.random() < 0.4 else None,
            stage=stage,
            status=status,
            stars=signals.stars if signals else rng.randint(0, 12),
            forks=signals.forks if signals else 0,
            open_issues=signals.open_issues if signals else 0,
            watchers=(signals.stars // 3) if signals else 0,
            primary_language=language,
            topics=list(topics),
            github_created_at=_iso(created_at),
            github_pushed_at=_iso(pushed_at),
            progress_percent=(
                rng.randint(80, 100) if archetype == "flagship"
                else rng.randint(45, 85) if archetype in {"strong", "mid"}
                else rng.randint(10, 45)
            ),
            is_seeking_contributors=seeking,
            is_open_for_adoption=dormant or (revived and rng.random() < 0.4),
            is_featured=archetype == "flagship" and rng.random() < 0.5,
            is_for_sale=for_sale,
            price_paise=price_paise,
            price_label=price_label,
            sale_type=sale_type,
            delivery_url=(
                f"https://github.com/{gh_user}/{slug}/archive/refs/heads/main.zip"
                if for_sale else None
            ),
            delivery_instructions=(
                "Clone the archive, copy .env.example to .env and fill the four "
                "required keys, then run `docker compose up`. A 30-minute handover "
                "call is included — reply on the thread to book it."
                if for_sale else None
            ),
            sale_license=(
                "Perpetual, non-exclusive commercial licence for one product. "
                "Redistribution as a competing template is not permitted."
                if for_sale else None
            ),
            last_synced_at=_iso(NOW - timedelta(minutes=rng.randint(4, 900))),
        )

        # Language breakdown so the project page has a real composition chart.
        primary_pct = rng.randint(58, 88)
        db.add(ProjectLanguage(
            project_id=project.id, language=language,
            bytes_count=rng.randint(40_000, 900_000), percentage=primary_pct,
        ))
        secondary = rng.choice([l for l in LANGUAGES if l != language])
        db.add(ProjectLanguage(
            project_id=project.id, language=secondary,
            bytes_count=rng.randint(4_000, 90_000), percentage=100 - primary_pct,
        ))

        # Required skills, so contributor matching has something real to match on.
        needed = rng.sample(SKILL_POOL, rng.randint(2, 4))
        for i, name in enumerate(needed):
            db.add(ProjectSkill(
                project_id=project.id, skill_id=skills[name], is_required=i < 2,
            ))

        result = None
        if scorable:
            # ── The real engine. No hardcoded scores anywhere. ────────────────
            result = compute_build_score(signals)

            lo, hi = ARCHETYPE_BANDS[archetype]
            if not (lo <= result.verified_build_score <= hi):
                band_violations.append(
                    f"{archetype}: {project.repo_full_name} scored "
                    f"{result.verified_build_score}, expected {lo}-{hi}"
                )

            verification = repo.get_verification(project.id)
            repo.update_verification(
                verification,
                ownership_verified=signals.ownership_verified,
                hackathon_verified=signals.hackathon_verified,
                verified_at=_iso(NOW - timedelta(hours=rng.randint(1, 300))),
                notes=result.reasoning,
                **result.as_verification_fields(),
            )

            # Verified status uses exactly the production rule.
            from app.verification import scoring as _scoring
            project.is_verified = (
                result.verified_build_score >= _scoring.VERIFIED_THRESHOLD
                and signals.ownership_verified
                and not (_scoring.DISQUALIFYING_FLAGS & set(result.fraud_flags))
            )

            # Analysis, derived from the same signals rather than invented.
            # model_used records that this was seeded, not LLM-generated.
            analysis = repo.get_analysis(project.id)
            health = min(100, int(result.verified_build_score * 0.85 + (primary_pct / 10)))
            repo.update_analysis(
                analysis,
                status=AnalysisStatus.COMPLETED,
                health_score=health,
                completion_score=project.progress_percent,
                startup_potential=max(5, min(100, int(result.verified_build_score * 0.7 + rng.randint(-6, 18)))),
                impact_potential=max(5, min(100, int(result.verified_build_score * 0.62 + rng.randint(-4, 26)))),
                missing_features=rng.sample(MISSING_FEATURES_POOL, rng.randint(2, 4)),
                technical_debt_summary=rng.choice(TECH_DEBT_NOTES),
                contributor_recommendations=rng.sample(needed, min(2, len(needed))),
                repo_signals={
                    "has_tests": archetype in {"flagship", "strong"} or rng.random() < 0.3,
                    "has_ci": archetype in {"flagship", "strong"},
                    "has_dockerfile": rng.random() < 0.55,
                    "commits_analyzed": len(signals.commit_dates),
                    "contributors": signals.contributors_count,
                    "readme_chars": signals.readme_length,
                },
                code_reviewed=False,
                reasoning=(
                    f"Derived from repository signals: {len(signals.commit_dates)} commits "
                    f"across {len({c.date() for c in signals.commit_dates})} active days, "
                    f"{signals.contributors_count} contributor(s), "
                    f"{signals.readme_length} characters of README. "
                    f"{result.reasoning}"
                ),
                model_used="seed:deterministic-v1",
            )

        # Timeline events give the project page a real history.
        record_event(
            db, project.id, ProjectEventType.CREATED,
            title="Project imported from GitHub",
            description=f"Repository {project.repo_full_name} connected to CodeBazaar.",
        )
        if project.is_verified and result is not None:
            record_event(
                db, project.id, ProjectEventType.VERIFIED,
                title=f"Verified Build Score {result.verified_build_score}/100",
                description=result.reasoning[:900],
            )
        if for_sale:
            record_event(
                db, project.id, ProjectEventType.LISTED_FOR_SALE,
                title=f"Listed for sale at {rupees(price_paise)}",
                description=price_label,
            )
        if revived:
            record_event(
                db, project.id, ProjectEventType.ADOPTED,
                title="Project revived",
                description="Picked up by a new maintainer after a dormant period.",
            )

        created.append({
            "project": project, "archetype": archetype, "owner": owner,
            "score": result.verified_build_score if result else None,
            "for_sale": for_sale, "price_paise": price_paise,
            "flags": list(result.fraud_flags) if result else [],
            "signals": signals,
            "hackathon_window": extra.get("hackathon_window"),
        })

        if index % 25 == 0:
            db.commit()

    db.commit()

    if band_violations:
        # Loud on purpose: silently drifting scores would make the demo dishonest.
        logger.warning("seed_band_violations", extra={"count": len(band_violations)})
        for v in band_violations[:10]:
            print(f"  ! band drift: {v}")

    return {"projects": created, "band_violations": band_violations}


# ══════════════════════════════════════════════════════════════════════════════
# Marketplace transactions — real paise, real commission split
# ══════════════════════════════════════════════════════════════════════════════

def _seed_marketplace(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Payments across every product type, plus the states that aren't happy."""
    from app.payments.models import (
        PAYMENT_PRICES, Payment, PaymentStatus, PaymentType, ProjectAccess,
        PayoutTransaction, SellerPayoutDetail,
    )
    from app.notifications.models import Notification, NotificationType

    commission_bps = settings.commission_bps
    buyers = [cast["incubator"], cast["recruiter"], cast["founder2"], cast["mentor"]]
    for_sale = [c for c in catalogue if c["for_sale"] and c["price_paise"]]
    rng.shuffle(for_sale)

    payments: list[Payment] = []
    order_seq = 50_000

    def mk_payment(user, ptype, amount, status, project=None, *, days_ago=None) -> Payment:
        nonlocal order_seq
        order_seq += 1
        created = NOW - timedelta(days=days_ago if days_ago is not None else rng.randint(1, 120),
                                  hours=rng.randint(0, 23))
        fee = net = None
        if ptype == PaymentType.PROJECT_ACCESS and status == PaymentStatus.PAID:
            fee = amount * commission_bps // 10_000
            net = amount - fee
        p = Payment(
            user_id=user.id,
            project_id=project.id if project is not None else None,
            order_id=f"CB_DEMO_{order_seq}",
            payment_type=ptype,
            amount_paise=amount,
            platform_fee_paise=fee,
            seller_net_paise=net,
            status=status,
            cf_payment_id=f"cf_demo_{order_seq}" if status == PaymentStatus.PAID else None,
            created_at=created,
            updated_at=created,
        )
        db.add(p)
        db.flush()
        payments.append(p)
        return p

    # ── 24 completed project sales ────────────────────────────────────────────
    sales = 0
    for entry in for_sale[:24]:
        project = entry["project"]
        buyer = rng.choice(buyers)
        pay = mk_payment(buyer, PaymentType.PROJECT_ACCESS, entry["price_paise"],
                         PaymentStatus.PAID, project)
        db.add(ProjectAccess(
            user_id=buyer.id, project_id=project.id, payment_id=pay.id,
            access_type=project.sale_type or "source_code",
            created_at=pay.created_at, updated_at=pay.created_at,
        ))
        # Both sides get told, which is what makes the notification feed real.
        db.add(Notification(
            recipient_id=project.owner_id,
            type=NotificationType.PROJECT_ACCESS_PURCHASED,
            title=f"{project.title} sold for {rupees(entry['price_paise'])}",
            body=(
                f"Your net earnings are {rupees(pay.seller_net_paise)} after a "
                f"{commission_bps / 100:.0f}% platform fee."
            ),
            link=f"/earnings",
            is_read=rng.random() < 0.6,
            created_at=pay.created_at, updated_at=pay.created_at,
        ))
        sales += 1

    # ── Subscriptions and per-project SKUs ────────────────────────────────────
    from app.subscriptions.models import Subscription

    for user, ptype in [
        (cast["recruiter"], PaymentType.RECRUITER_PRO),
        (cast["incubator"], PaymentType.INCUBATOR_PRO),
        (cast["founder2"], PaymentType.RECRUITER_PRO),
    ]:
        pay = mk_payment(user, ptype, PAYMENT_PRICES[ptype], PaymentStatus.PAID, days_ago=rng.randint(2, 20))
        db.add(Subscription(
            user_id=user.id,
            plan=ptype.value,
            expires_at=NOW + timedelta(days=rng.randint(8, 28)),
            payment_id=pay.id,
            created_at=pay.created_at, updated_at=pay.created_at,
        ))

    clean = [c for c in catalogue if c["score"] is not None and c["score"] >= 60]
    for ptype in (PaymentType.PREMIUM_LISTING, PaymentType.FEATURED_PLACEMENT,
                  PaymentType.STARTUP_REPORT, PaymentType.AI_AUDIT, PaymentType.PITCH_DECK):
        for _ in range(rng.randint(1, 3)):
            entry = rng.choice(clean)
            owner = entry["owner"]
            mk_payment(owner, ptype, PAYMENT_PRICES[ptype], PaymentStatus.PAID, entry["project"])
            if ptype == PaymentType.PITCH_DECK:
                entry["project"].pitch_deck_unlocked = True
            if ptype == PaymentType.STARTUP_REPORT:
                entry["project"].startup_report_unlocked = True
            if ptype == PaymentType.FEATURED_PLACEMENT:
                entry["project"].is_featured = True

    # ── The unhappy states, so the dashboard isn't suspiciously perfect ───────
    for entry in for_sale[24:27]:
        mk_payment(rng.choice(buyers), PaymentType.PROJECT_ACCESS,
                   entry["price_paise"], PaymentStatus.CREATED, entry["project"], days_ago=0)
    for entry in for_sale[27:29]:
        mk_payment(rng.choice(buyers), PaymentType.PROJECT_ACCESS,
                   entry["price_paise"], PaymentStatus.FAILED, entry["project"])
    for entry in for_sale[29:31]:
        refunded = mk_payment(rng.choice(buyers), PaymentType.PROJECT_ACCESS,
                              entry["price_paise"], PaymentStatus.REFUNDED, entry["project"])
        refunded.platform_fee_paise = None
        refunded.seller_net_paise = None

    db.commit()

    # ── Payout details + settlements for the top sellers ──────────────────────
    seller_totals: dict[uuid.UUID, int] = {}
    for p in payments:
        if p.payment_type == PaymentType.PROJECT_ACCESS and p.status == PaymentStatus.PAID and p.project_id:
            from app.projects.models import Project
            proj = db.get(Project, p.project_id)
            if proj:
                seller_totals[proj.owner_id] = seller_totals.get(proj.owner_id, 0) + (p.seller_net_paise or 0)

    settled_count = 0
    for seller_id, total in sorted(seller_totals.items(), key=lambda kv: -kv[1]):
        db.add(SellerPayoutDetail(
            user_id=seller_id,
            method=rng.choice(["upi", "bank"]),
            upi_id=f"builder{str(seller_id)[:6]}@okhdfcbank",
            account_holder_name="Demo Builder",
            account_number=f"{rng.randint(10**9, 10**10 - 1)}",
            ifsc="HDFC0001234",
            pan=f"ABCDE{rng.randint(1000, 9999)}F",
            is_verified=rng.random() < 0.7,
        ))
        # Settle roughly two-thirds of what's owed, leaving a real payout queue.
        if total > 200_000 and rng.random() < 0.65:
            amount = int(total * rng.uniform(0.4, 0.9))
            db.add(PayoutTransaction(
                seller_id=seller_id,
                amount_paise=amount,
                method="upi",
                reference=f"UTR{rng.randint(10**11, 10**12 - 1)}",
                note="Demo settlement recorded by admin after UPI transfer.",
                status="completed",
                created_by_id=cast["admin"].id,
                created_at=NOW - timedelta(days=rng.randint(1, 25)),
            ))
            settled_count += 1

    db.commit()
    gross = sum(p.amount_paise for p in payments if p.status == PaymentStatus.PAID)
    return {
        "payments": len(payments), "sales": sales,
        "gross_paise": gross, "settlements": settled_count,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Escrow — driven through the real service so ledger maths is production maths
# ══════════════════════════════════════════════════════════════════════════════

def _seed_escrow(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    from app.escrow.models import EscrowContractStatus
    from app.escrow.schemas import (
        ContractCreate, DisputeCreate, DisputeResolve, MilestoneCreate, MilestoneSubmit,
    )
    from app.escrow.models import DisputeStatus
    from app.escrow.service import EscrowService

    svc = EscrowService(db)
    clients = [cast["incubator"], cast["recruiter"], cast["founder2"]]
    # Build contracts against strong projects, whose owners are the builders.
    # Named builders come first: completed contracts and released revenue are
    # reputation inputs, so concentrating some here is what lets the top tier be
    # reached by arithmetic rather than assignment.
    named_emails = {e for e, _, _ in NAMED_BUILDERS}
    candidates = [c for c in catalogue if c["score"] is not None and c["score"] >= 55]
    rng.shuffle(candidates)
    candidates.sort(key=lambda c: 0 if c["owner"].email in named_emails else 1)

    WORK = [
        ("Add multi-tenant workspaces", ["Schema + migrations", "Workspace switching UI", "Permissions and audit"]),
        ("Production hardening", ["Test coverage to 70%", "CI pipeline + staging deploy"]),
        ("Payments integration", ["Cashfree order flow", "Webhook reconciliation", "Refund handling"]),
        ("Mobile companion app", ["Auth + offline cache", "Core screens", "Play Store release"]),
        ("Analytics rebuild", ["Event schema", "Dashboard queries"]),
        ("Import pipeline", ["CSV + XLSX parsing", "Validation and error report"]),
    ]

    outcomes = {"completed": 0, "active": 0, "disputed": 0, "resolved": 0,
                "awaiting_funding": 0, "cancelled": 0}
    contracts = []

    def make(entry, client, plan, *, late: bool) -> object:
        title, milestone_titles = plan
        per = rng.randrange(150_000, 900_000, 10_000)
        milestones = []
        for i, mt in enumerate(milestone_titles):
            # due_date drives DeliveryService's on-time calculation. Submissions
            # happen "now", so a future due date reads on-time and a past one late.
            offset = rng.randint(4, 30) if not late else -rng.randint(2, 18)
            milestones.append(MilestoneCreate(
                title=mt,
                description=f"{mt} for {entry['project'].title}.",
                amount_paise=per + i * 25_000,
                due_date=NOW + timedelta(days=offset),
            ))
        return svc.create_contract(client, ContractCreate(
            builder_id=entry["owner"].id,
            project_id=entry["project"].id,
            title=f"{title} — {entry['project'].title}",
            description=(
                "Fixed-scope engagement agreed through CodeBazaar. Funds are held "
                "against milestones and released on approval."
            ),
            commission_bps=settings.commission_bps,
            milestones=milestones,
        ))

    used_projects: set = set()

    def take(prefer_email: str | None = None):
        """Next unused candidate, preferring one owned by a specific builder."""
        if prefer_email:
            for c in candidates:
                if c["project"].id not in used_projects and c["owner"].email == prefer_email:
                    used_projects.add(c["project"].id)
                    return c
        for c in candidates:
            if c["project"].id not in used_projects:
                used_projects.add(c["project"].id)
                return c
        raise RuntimeError("Ran out of candidate projects for escrow contracts")

    # ── 7 completed, spread across the named builders ─────────────────────────
    # Completed contracts and released revenue are reputation inputs, so who gets
    # them decides who reaches the top tier. Spreading them over the four scripted
    # builders means several legitimately cross the elite threshold instead of one
    # doing so by luck of the shuffle.
    completed_targets = [
        NAMED_BUILDERS[0][0], NAMED_BUILDERS[1][0], NAMED_BUILDERS[2][0],
        NAMED_BUILDERS[3][0], NAMED_BUILDERS[0][0], NAMED_BUILDERS[1][0],
        NAMED_BUILDERS[2][0],
    ]
    for i, target_email in enumerate(completed_targets):
        entry = take(target_email)
        client = clients[i % len(clients)]
        c = make(entry, client, WORK[i % len(WORK)], late=(i == 3))
        svc._mark_funded(c)
        db.commit()
        c = svc.get_contract(c.id, client)
        for m in c.milestones:
            svc.submit_milestone(entry["owner"], m.id, MilestoneSubmit(
                proof_url=f"https://github.com/{entry['project'].repo_full_name}/pull/{rng.randint(10, 90)}",
                proof_note="Merged to main. Migration notes are in the PR description.",
            ))
            svc.approve_milestone(client, m.id)
        db.commit()
        contracts.append(c)
        outcomes["completed"] += 1

    # 3 active, partially delivered
    for i in range(3):
        entry = take()
        client = clients[i % len(clients)]
        c = make(entry, client, WORK[(i + 2) % len(WORK)], late=(i == 1))
        svc._mark_funded(c)
        db.commit()
        c = svc.get_contract(c.id, client)
        done = max(1, len(c.milestones) - 1)
        for j, m in enumerate(c.milestones):
            if j < done - 1:
                svc.submit_milestone(entry["owner"], m.id, MilestoneSubmit(proof_note="Delivered."))
                svc.approve_milestone(client, m.id)
            elif j == done - 1:
                # Submitted, awaiting the client — the state that needs an action.
                svc.submit_milestone(entry["owner"], m.id, MilestoneSubmit(
                    proof_note="Ready for review. Staging link in the thread.",
                ))
        db.commit()
        contracts.append(c)
        outcomes["active"] += 1

    # 2 disputed — one open, one resolved by an admin
    for i in range(2):
        entry = take()
        client = clients[i % len(clients)]
        c = make(entry, client, WORK[(i + 4) % len(WORK)], late=True)
        svc._mark_funded(c)
        db.commit()
        c = svc.get_contract(c.id, client)
        m = c.milestones[0]
        svc.submit_milestone(entry["owner"], m.id, MilestoneSubmit(proof_note="Submitted for review."))
        dispute = svc.raise_dispute(client, c.id, DisputeCreate(
            milestone_id=m.id,
            reason=(
                "The submitted build is missing the bulk import described in "
                "milestone scope, and the staging environment returns a 500 on login."
            ),
        ))
        db.commit()
        if i == 1:
            svc.resolve_dispute(cast["admin"], dispute.id, DisputeResolve(
                resolution=DisputeStatus.RESOLVED_SPLIT,
                note=(
                    "Reviewed the PR and the staging logs. Import was partially "
                    "delivered; login regression was fixed within a day. Split 50/50 "
                    "and the remaining scope moved to the next milestone."
                ),
            ))
            db.commit()
            outcomes["resolved"] += 1
        else:
            outcomes["disputed"] += 1
        contracts.append(c)

    # 1 awaiting funding, 1 cancelled
    entry = take()
    c = make(entry, clients[0], WORK[1], late=False)
    contracts.append(c)
    outcomes["awaiting_funding"] += 1

    entry = take()
    c = make(entry, clients[1], WORK[2], late=False)
    svc.cancel_contract(clients[1], c.id)
    contracts.append(c)
    outcomes["cancelled"] += 1

    db.commit()
    return {"contracts": len(contracts), "outcomes": outcomes}


# ══════════════════════════════════════════════════════════════════════════════
# Revival, incubation, build requests
# ══════════════════════════════════════════════════════════════════════════════

def _seed_revival_and_incubation(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    from app.adoption.models import AdoptionRequest
    from app.build_requests.models import BuildApplication, BuildRequest
    from app.incubation.models import IncubationOffer, OfferStatus, OfferType
    from app.notifications.models import Notification, NotificationType

    builders = cast["builders"]
    counts = {"offers": 0, "adoption": 0, "build_requests": 0, "applications": 0}

    # ── Incubation offers across every state ──────────────────────────────────
    high = [c for c in catalogue if c["score"] is not None and c["score"] >= 72]
    rng.shuffle(high)
    offer_plan = [
        (OfferType.FUNDING, OfferStatus.PENDING, "Seed cheque", 2_500_000, 8),
        (OfferType.FUNDING, OfferStatus.PENDING, "Pre-seed investment", 1_500_000, 6),
        (OfferType.INCUBATION, OfferStatus.ACCEPTED, "Winter cohort place", 500_000, 4),
        (OfferType.FUNDING, OfferStatus.ACCEPTED, "Seed round lead", 10_000_000, 12),
        (OfferType.MENTORSHIP, OfferStatus.PENDING, "Technical mentorship", None, None),
        (OfferType.ACQUISITION, OfferStatus.WITHDRAWN, "Acqui-hire discussion", 8_000_000, None),
        (OfferType.FUNDING, OfferStatus.DECLINED, "Angel cheque", 800_000, 15),
        (OfferType.INCUBATION, OfferStatus.PENDING, "Accelerator invitation", 300_000, 3),
    ]
    for i, (otype, status, title, amount, equity) in enumerate(offer_plan):
        if i >= len(high):
            break
        entry = high[i]
        created = NOW - timedelta(days=rng.randint(2, 45))
        message = {
            OfferType.FUNDING: (
                f"We reviewed {entry['project'].title} and its Verified Build Score of "
                f"{entry['score']}/100. The commit history shows sustained work rather than a "
                f"sprint, which is what we look for. Offering {rupees(amount)} for {equity}%."
            ),
            OfferType.INCUBATION: (
                "We'd like to offer a place in the next cohort: twelve weeks, weekly "
                "technical review, and an introduction round at the end."
            ),
            OfferType.MENTORSHIP: (
                "Not an investment offer — I'd like to mentor this. Your architecture is "
                "sound but the data model will bite you at scale, and that's fixable now."
            ),
            OfferType.ACQUISITION: (
                "We were interested in acquiring this outright, but our roadmap shifted "
                "this quarter. Withdrawing for now — happy to revisit."
            ),
        }[otype]

        offer = IncubationOffer(
            incubator_id=cast["incubator"].id if otype != OfferType.MENTORSHIP else cast["mentor"].id,
            project_id=entry["project"].id,
            offer_type=otype, title=title, message=message,
            amount_paise=amount, equity_percent=equity,
            status=status,
            response_note=(
                "Accepted. Let's start next Monday." if status == OfferStatus.ACCEPTED
                else "Thanks, but the valuation doesn't work for us yet." if status == OfferStatus.DECLINED
                else "Withdrawn by the incubator." if status == OfferStatus.WITHDRAWN
                else None
            ),
            responded_at=(created + timedelta(days=rng.randint(1, 6))) if status != OfferStatus.PENDING else None,
            created_at=created, updated_at=created,
        )
        db.add(offer)
        counts["offers"] += 1
        if status == OfferStatus.PENDING:
            db.add(Notification(
                recipient_id=entry["owner"].id, type=NotificationType.SYSTEM,
                title=f"New {otype.value} offer on {entry['project'].title}",
                body=title, link="/incubation", is_read=False,
                created_at=created, updated_at=created,
            ))

    # ── Adoption requests on dormant projects ─────────────────────────────────
    dormant = [c for c in catalogue if c["project"].is_open_for_adoption]
    for i, entry in enumerate(dormant[:6]):
        requester = builders[(i * 7 + 3) % len(builders)]
        if requester.id == entry["owner"].id:
            continue
        status = ["pending", "pending", "approved", "rejected", "withdrawn", "pending"][i % 6]
        created = NOW - timedelta(days=rng.randint(1, 30))
        db.add(AdoptionRequest(
            project_id=entry["project"].id,
            requester_id=requester.id,
            message=(
                f"I've been using {entry['project'].title} and it stopped getting updates. "
                "I'd like to take it over and keep it maintained."
            ),
            continuation_plan=(
                "First: upgrade dependencies and get CI green. Then triage open issues, "
                "ship the two most-requested features, and publish a proper release."
            ),
            status=status,
            resolved_at=(created + timedelta(days=2)) if status != "pending" else None,
            resolution_note=(
                "Approved — thanks for picking this up." if status == "approved"
                else "Going in a different direction." if status == "rejected"
                else "Withdrawn by requester." if status == "withdrawn" else None
            ),
            created_at=created, updated_at=created,
        ))
        counts["adoption"] += 1

    # ── Build request board ───────────────────────────────────────────────────
    briefs = [
        ("Internal tool for warehouse stock counts", 45_000_00, ["React", "FastAPI", "PostgreSQL"], 30,
         "We count stock on paper and reconcile in Excel. We need a tablet-friendly web app for counts, variance reports and a CSV export our accountant can use."),
        ("WhatsApp bot for appointment reminders", 25_000_00, ["Python", "Redis"], 21,
         "Clinic sends reminders manually. We want an opt-in WhatsApp reminder flow with reschedule handling and a simple admin view."),
        ("Migrate a Django monolith to a read-replica setup", 80_000_00, ["Django", "PostgreSQL", "AWS"], 45,
         "Reporting queries are locking our primary. We need read/write splitting, query routing and load tests proving the improvement."),
        ("React Native app for field agents", 120_000_00, ["React Native", "TypeScript"], 60,
         "Offline-first data capture with photo attachments and background sync. Android only for now."),
        ("Dashboard for solar inverter telemetry", 60_000_00, ["Python", "TypeScript", "Kafka"], 40,
         "We ingest telemetry from 400 inverters and currently look at raw tables. We need alerting on underperformance and a per-site dashboard."),
    ]
    posters = [cast["recruiter"], cast["founder2"], cast["incubator"]]
    for i, (title, budget, skills_needed, days, description) in enumerate(briefs):
        status = ["open", "open", "in_progress", "open", "completed"][i]
        created = NOW - timedelta(days=rng.randint(3, 40))
        req = BuildRequest(
            poster_id=posters[i % len(posters)].id,
            title=title, description=description,
            budget_paise=budget, skills=skills_needed, timeline_days=days,
            status=status,
            created_at=created, updated_at=created,
        )
        db.add(req)
        db.flush()
        counts["build_requests"] += 1

        applicants = rng.sample(builders, rng.randint(2, 5))
        for j, b in enumerate(applicants):
            app_status = "pending"
            if status in ("in_progress", "completed") and j == 0:
                app_status = "accepted"
                req.assigned_builder_id = b.id
                if status == "completed":
                    req.completed_at = created + timedelta(days=days)
            elif status in ("in_progress", "completed") and j == 1:
                app_status = "rejected"
            db.add(BuildApplication(
                request_id=req.id, builder_id=b.id,
                cover_note=(
                    "I've built something close to this before — happy to walk through "
                    "the repo. I'd start with the data model and get a thin end-to-end "
                    "slice working in week one so you can see progress early."
                ),
                quoted_paise=int(budget * rng.uniform(0.8, 1.15)),
                estimated_days=int(days * rng.uniform(0.8, 1.3)),
                status=app_status,
                created_at=created + timedelta(days=rng.randint(0, 4)),
            ))
            counts["applications"] += 1

    db.commit()
    return counts


# ══════════════════════════════════════════════════════════════════════════════
# Social + safety
# ══════════════════════════════════════════════════════════════════════════════

def _seed_social(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    from app.messaging.models import Message, Thread
    from app.moderation.models import Report
    from app.notifications.models import Notification, NotificationType
    from app.reviews.models import Review, ReviewRole

    counts = {"reviews": 0, "threads": 0, "messages": 0, "reports": 0, "notifications": 0}
    reviewers = [
        (cast["mentor"], ReviewRole.MENTOR),
        (cast["recruiter"], ReviewRole.FOUNDER),
        (cast["founder2"], ReviewRole.FOUNDER),
        (cast["incubator"], ReviewRole.FOUNDER),
    ]
    good = [c for c in catalogue if c["score"] is not None and c["score"] >= 58]
    rng.shuffle(good)

    for entry in good[:26]:
        reviewer, role = rng.choice(reviewers)
        headline, score = rng.choice(REVIEW_HEADLINES)
        created = NOW - timedelta(days=rng.randint(1, 90))
        db.add(Review(
            project_id=entry["project"].id, reviewer_id=reviewer.id, reviewer_role=role,
            overall_score=score,
            code_quality=max(1, min(5, score + rng.choice([-1, 0, 0]))),
            idea_score=max(1, min(5, score + rng.choice([-1, 0, 1]))),
            market_potential=max(1, min(5, score + rng.choice([-2, -1, 0]))),
            headline=headline, body=rng.choice(REVIEW_BODIES), is_public=True,
            created_at=created, updated_at=created,
        ))
        counts["reviews"] += 1
        db.add(Notification(
            recipient_id=entry["owner"].id, type=NotificationType.NEW_REVIEW,
            title=f"New review on {entry['project'].title}",
            body=headline, link=f"/projects/{entry['project'].id}",
            is_read=rng.random() < 0.5, created_at=created, updated_at=created,
        ))
        counts["notifications"] += 1

    # ── Direct messages ───────────────────────────────────────────────────────
    for i, (subject, opener) in enumerate(DM_OPENERS):
        entry = good[i % len(good)]
        buyer = [cast["recruiter"], cast["founder2"], cast["incubator"]][i % 3]
        if buyer.id == entry["owner"].id:
            continue
        created = NOW - timedelta(days=rng.randint(0, 14))
        thread = Thread(
            participant_a=buyer.id, participant_b=entry["owner"].id,
            project_id=entry["project"].id, subject=subject,
            created_at=created, updated_at=created,
        )
        db.add(thread)
        db.flush()
        counts["threads"] += 1

        db.add(Message(thread_id=thread.id, sender_id=buyer.id, body=opener,
                       is_read=True, created_at=created, updated_at=created))
        counts["messages"] += 1
        # Most threads have a reply; one is left unanswered, which is realistic.
        if i != 2:
            reply_at = created + timedelta(hours=rng.randint(2, 30))
            db.add(Message(
                thread_id=thread.id, sender_id=entry["owner"].id,
                body=(
                    "Thanks for reaching out. Happy to walk you through the codebase — "
                    "the deployment config and environment variables are included in the "
                    "handover. When suits you this week?"
                ),
                is_read=rng.random() < 0.7, created_at=reply_at, updated_at=reply_at,
            ))
            counts["messages"] += 1
            db.add(Notification(
                recipient_id=buyer.id, type=NotificationType.NEW_MESSAGE,
                title=f"Reply from {entry['owner'].profile.display_name}",
                body=subject, link="/messages", is_read=False,
                created_at=reply_at, updated_at=reply_at,
            ))
            counts["notifications"] += 1

    # ── Content reports feeding the moderation queue ──────────────────────────
    flagged = [c for c in catalogue if c["archetype"] in {"fraud_fork", "fraud_burst"}]
    report_plan = [
        ("copied_repo", "open", None,
         "This is a fork of an existing MIT-licensed project with the original attribution removed from the README."),
        ("fake_hackathon", "open", None,
         "The listing claims a hackathon win but every commit lands after the event closed."),
        ("plagiarism", "resolved", "remove_target",
         "Large portions of this appear copied from a public tutorial repository without credit."),
        ("misleading", "dismissed", "none",
         "Listing says production-ready but there is no deployment configuration in the repo."),
    ]
    for i, (reason, status, action, details) in enumerate(report_plan):
        if not flagged:
            break
        entry = flagged[i % len(flagged)]
        created = NOW - timedelta(days=rng.randint(1, 20))
        db.add(Report(
            reporter_id=cast["builders"][i + 5].id,
            target_type="project", target_id=str(entry["project"].id),
            reason=reason, details=details,
            status=status, action_taken=action,
            resolution_note=(
                "Confirmed against the upstream repository. Listing removed and the owner notified."
                if status == "resolved"
                else "Reviewed — the description is optimistic but not deceptive. No action."
                if status == "dismissed" else None
            ),
            resolved_by_id=cast["admin"].id if status != "open" else None,
            resolved_at=(created + timedelta(days=1)) if status != "open" else None,
            created_at=created, updated_at=created,
        ))
        counts["reports"] += 1

    db.commit()
    return counts


# ══════════════════════════════════════════════════════════════════════════════
# Hackathon claims — verdicts from the real authenticity engine
# ══════════════════════════════════════════════════════════════════════════════

def _seed_hackathon_claims(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    from app.hackathon.engine import HackathonSignals, compute_authenticity
    from app.hackathon.models import HackathonClaim, HackathonClaimStatus, HackathonPlatform
    from app.projects.models import ProjectVerification

    EVENTS = [
        ("HackIndia 2026", HackathonPlatform.DEVFOLIO),
        ("Smart India Hackathon", HackathonPlatform.UNSTOP),
        ("MLH Local Hack Day", HackathonPlatform.MLH),
        ("ETHIndia 2025", HackathonPlatform.DEVFOLIO),
        ("Inter-IIT Tech Meet", HackathonPlatform.OTHER),
    ]

    # Claims come from two populations so the verdict mix is honest:
    #   * `hackathon` projects, whose history really does cluster in a 48h window
    #   * fraud archetypes and prebuilt repos, which should fail
    # Positioning a 3-day window over a repo with a year of commits would score
    # every claim as inauthentic — that isn't fraud detection, it's a bug.
    genuine = [c for c in catalogue if c.get("hackathon_window")]
    suspect = [
        c for c in catalogue
        if c["signals"] is not None and c["archetype"] in {"fraud_burst", "fraud_fork", "mid"}
    ]
    rng.shuffle(suspect)

    claim_targets: list[tuple[dict, str]] = (
        [(c, "genuine") for c in genuine]
        + [(c, "prebuilt") for c in suspect[:3]]
        + [(c, "unrelated") for c in suspect[3:6]]
    )

    verdicts: dict[str, int] = {}
    made = 0

    for i, (entry, kind) in enumerate(claim_targets):
        signals_src = entry["signals"]
        commits = signals_src.commit_dates
        if not commits:
            continue
        event_name, platform = EVENTS[i % len(EVENTS)]

        if kind == "genuine":
            event_start, event_end = entry["hackathon_window"]
        elif kind == "prebuilt":
            # The work predates the event: the engine should apply the
            # prebuilt-before-event penalty.
            event_start = max(commits) + timedelta(days=1)
            event_end = event_start + timedelta(days=2)
        else:
            # A window with almost no commits in it at all.
            event_start = min(commits) - timedelta(days=45)
            event_end = event_start + timedelta(days=2)

        result = compute_authenticity(HackathonSignals(
            event_start=event_start, event_end=event_end,
            commit_dates=commits, repo_created_at=signals_src.repo_created_at,
            is_fork=signals_src.is_fork, signals_available=True,
        ))
        verdicts[result.verdict] = verdicts.get(result.verdict, 0) + 1

        status = (
            HackathonClaimStatus.VERIFIED if result.verdict == "likely_authentic" and i % 3 != 0
            else HackathonClaimStatus.FLAGGED if result.verdict == "likely_inauthentic"
            else HackathonClaimStatus.ANALYZED
        )
        created = NOW - timedelta(days=rng.randint(2, 60))
        db.add(HackathonClaim(
            project_id=entry["project"].id,
            claimed_by_id=entry["owner"].id,
            event_name=event_name, platform=platform,
            event_start=event_start, event_end=event_end,
            status=status,
            authenticity_score=result.authenticity_score,
            verdict=result.verdict,
            signals={
                "commits_in_window": result.commits_in_window,
                "commits_before_event": result.commits_before_event,
                "commits_after_event": result.commits_after_event,
                "total_commits": result.total_commits,
                "confidence": result.confidence,
                "flags": result.flags,
            },
            reasoning=result.reasoning,
            created_at=created, updated_at=created,
        ))
        if status == HackathonClaimStatus.VERIFIED:
            verification = (
                db.query(ProjectVerification)
                .filter(ProjectVerification.project_id == entry["project"].id)
                .first()
            )
            if verification:
                verification.hackathon_verified = True
        made += 1

    db.commit()
    return {"claims": made, "verdicts": verdicts}


# ══════════════════════════════════════════════════════════════════════════════
# Reputation — computed by the production engine, never written by hand
# ══════════════════════════════════════════════════════════════════════════════

def _recompute_reputations(db, cast: dict) -> dict:
    """Run the real ReputationService for every builder.

    Tier and trust score are therefore consequences of the seeded projects,
    verifications and escrow history rather than assigned labels. A judge can
    pick any builder and the arithmetic will hold.
    """
    from app.users.reputation import ReputationService

    svc = ReputationService(db)
    tiers: dict[str, int] = {}
    for user in cast["builders"]:
        rep = svc.recompute(user.id, commit=False)
        tiers[rep.tier] = tiers.get(rep.tier, 0) + 1
    db.commit()
    return tiers


def _collab_scores(db, cast: dict, rng: random.Random) -> None:
    """Seed collaboration scores, the one reputation input with no other source.

    `collab_score` is normally raised by peer signals the platform doesn't
    generate yet, so it stays 0 for everyone and the "great_collaborator" badge
    would be unreachable. Seeding a spread makes the badge demonstrable.
    """
    from app.users.models import BuilderReputation

    reps = db.query(BuilderReputation).all()
    for rep in reps:
        rep.collab_score = rng.choices([0, 15, 30, 45, 60], weights=[3, 4, 5, 4, 2])[0]
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# Reporting
# ══════════════════════════════════════════════════════════════════════════════

def print_report(db) -> None:
    """Summarise what's in the database. Used to sanity-check a seeded demo."""
    from app.escrow.models import EscrowContract, EscrowEntryType, EscrowLedgerEntry
    from app.incubation.models import IncubationOffer
    from app.moderation.models import Report
    from app.payments.models import Payment, PaymentStatus, PaymentType
    from app.projects.models import Project, ProjectVerification
    from app.users.models import BuilderReputation, User

    def count(model, *filters):
        q = db.query(func.count(model.id))
        for f in filters:
            q = q.filter(f)
        return q.scalar() or 0

    print("\n" + "═" * 66)
    print("  CodeBazaar demo dataset")
    print("═" * 66)

    print(f"\n  Users                     {count(User)}")
    print(f"  Projects                  {count(Project, Project.is_deleted == False)}")
    print(f"    verified                {count(Project, Project.is_verified == True)}")
    print(f"    for sale                {count(Project, Project.is_for_sale == True)}")
    print(f"    seeking contributors    {count(Project, Project.is_seeking_contributors == True)}")
    print(f"    open for adoption       {count(Project, Project.is_open_for_adoption == True)}")

    # Score distribution — the number a judge is most likely to interrogate.
    print("\n  Verified Build Score distribution")
    bands = [(80, 101, "80-100  strong"), (70, 80, "70-79   verified floor"),
             (40, 70, "40-69   mid"), (1, 40, "1-39    weak / flagged")]
    for lo, hi, label in bands:
        n = count(ProjectVerification,
                  ProjectVerification.verified_build_score >= lo,
                  ProjectVerification.verified_build_score < hi)
        print(f"    {label:<24} {n}")
    unscored = count(ProjectVerification, ProjectVerification.verified_build_score.is_(None))
    print(f"    {'unscored':<24} {unscored}")

    flagged = db.query(ProjectVerification).filter(
        ProjectVerification.fraud_flags.isnot(None)
    ).all()
    with_flags = [v for v in flagged if v.fraud_flags]
    print(f"\n  Projects carrying fraud flags   {len(with_flags)}")
    tally: dict[str, int] = {}
    for v in with_flags:
        for f in v.fraud_flags:
            tally[f] = tally.get(f, 0) + 1
    for flag, n in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"    {flag:<26} {n}")

    print("\n  Reputation tiers")
    for tier in ("elite", "trusted", "rising", "newcomer"):
        print(f"    {tier:<26} {count(BuilderReputation, BuilderReputation.tier == tier)}")

    paid = db.query(func.coalesce(func.sum(Payment.amount_paise), 0)).filter(
        Payment.status == PaymentStatus.PAID
    ).scalar() or 0
    sales = db.query(func.coalesce(func.sum(Payment.amount_paise), 0)).filter(
        Payment.status == PaymentStatus.PAID,
        Payment.payment_type == PaymentType.PROJECT_ACCESS,
    ).scalar() or 0
    fees = db.query(func.coalesce(func.sum(Payment.platform_fee_paise), 0)).filter(
        Payment.status == PaymentStatus.PAID
    ).scalar() or 0

    print("\n  Money")
    print(f"    payments (all states)     {count(Payment)}")
    print(f"    gross paid                {rupees(paid)}")
    print(f"    project sales             {rupees(sales)}")
    print(f"    platform fees             {rupees(fees)}")

    released = db.query(func.coalesce(func.sum(EscrowLedgerEntry.amount_paise), 0)).filter(
        EscrowLedgerEntry.entry_type == EscrowEntryType.RELEASE
    ).scalar() or 0
    funded = db.query(func.coalesce(func.sum(EscrowLedgerEntry.amount_paise), 0)).filter(
        EscrowLedgerEntry.entry_type == EscrowEntryType.FUND
    ).scalar() or 0
    print(f"    escrow contracts          {count(EscrowContract)}")
    print(f"    escrow funded             {rupees(funded)}")
    print(f"    escrow released (owed)    {rupees(released)}")

    from app.growth.models import MentorProfile, MentorSession

    print(f"\n  Incubation offers           {count(IncubationOffer)}")
    print(f"  Open moderation reports     {count(Report, Report.status == 'open')}")
    print(f"  Mentors listed              {count(MentorProfile)}")
    print(f"  Mentor session requests     {count(MentorSession)}")

    from app.projects.models import ProjectPitchDeck
    print(f"  Pitch decks generated       {count(ProjectPitchDeck)}")

    print("\n  Logins (all use password: " + DEMO_PASSWORD + ")")
    print(f"    admin       {SEED_MARKER_EMAIL}")
    print("    builder     aarav@codebazaar.dev")
    print("    incubator   incubator@codebazaar.dev")
    print("    recruiter   recruiter@codebazaar.dev")
    print("═" * 66 + "\n")


# ══════════════════════════════════════════════════════════════════════════════
# Entrypoint
# ══════════════════════════════════════════════════════════════════════════════

def _load_all_models() -> None:
    """Import every model module so the SQLAlchemy registry is complete.

    Mappers resolve relationship targets by class *name* at configure time, and
    configuration is triggered by the first instantiation of any mapped class. If
    only some modules have been imported by then, a relationship like
    `ProjectSkill.project -> "Project"` cannot resolve and raises.

    The seed imports its models lazily inside each section (which keeps the
    sections independent), so nothing guaranteed the registry was populated before
    the first `Skill(...)` call. Under the test harness this was masked because
    `import app.main` pulls in every router and therefore every model; running
    `python -m app.seed_demo` directly did not, so the seed failed only on the
    path a real operator uses.
    """
    from importlib import import_module

    for module in (
        "app.users.models",
        "app.projects.models",
        "app.skills.models",
        "app.payments.models",
        "app.escrow.models",
        "app.messaging.models",
        "app.notifications.models",
        "app.reviews.models",
        "app.moderation.models",
        "app.subscriptions.models",
        "app.incubation.models",
        "app.adoption.models",
        "app.build_requests.models",
        "app.hackathon.models",
        "app.growth.models",
        "app.trust.models",
        "app.deals.models",
        "app.teams.models",
        "app.institutions.models",
    ):
        import_module(module)


def _already_seeded(db) -> bool:
    from app.users.models import AuditLog
    return db.query(AuditLog.id).filter(
        AuditLog.action == "demo_seed_completed",
        AuditLog.target_type == "demo_seed",
        AuditLog.target_id == "full-demo-v1",
    ).first() is not None


# Tables the reset must never touch. `alembic_version` is schema state, not data —
# clearing it would make Alembic think the database is unmigrated and try to
# re-run every migration against a schema that already has the tables.
RESET_PROTECTED_TABLES = frozenset({"alembic_version"})


def reset_database(db) -> dict:
    """Delete every row from every application table, keeping the schema.

    Truncate rather than drop/recreate so the migration state stays intact and
    the schema remains exactly what Alembic produced — a reset should not be a
    second, divergent way of defining the database.

    On PostgreSQL this is one `TRUNCATE ... CASCADE` across all tables, which
    lets the server resolve foreign-key order instead of us guessing it. SQLite
    has no TRUNCATE, so it falls back to `DELETE FROM` with FK enforcement
    disabled for the duration.
    """
    from sqlalchemy import inspect, text

    bind = db.get_bind()
    inspector = inspect(bind)
    tables = [
        name for name in inspector.get_table_names()
        if name not in RESET_PROTECTED_TABLES
    ]
    if not tables:
        return {"tables": 0, "rows_before": 0}

    rows_before = 0
    for name in tables:
        try:
            rows_before += int(
                db.execute(text(f'SELECT COUNT(*) FROM "{name}"')).scalar() or 0
            )
        except Exception:
            pass

    if bind.dialect.name == "postgresql":
        quoted = ", ".join(f'"{name}"' for name in tables)
        # RESTART IDENTITY resets sequences so a fresh seed doesn't inherit
        # counters from the data it replaced.
        db.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
    else:
        db.execute(text("PRAGMA foreign_keys = OFF"))
        for name in tables:
            db.execute(text(f'DELETE FROM "{name}"'))
        db.execute(text("PRAGMA foreign_keys = ON"))

    db.commit()
    logger.info("database_reset", extra={"tables": len(tables), "rows": rows_before})
    return {"tables": len(tables), "rows_before": rows_before}


def run(force: bool = False, reset: bool = False) -> None:
    if force and not reset:
        raise SystemExit(
            "--force cannot safely repeat inserts. Use --reset only on a disposable demo database."
        )

    # ── Environment gate ──────────────────────────────────────────────────────
    # Demo accounts share one published password. Creating them in production
    # would hand anyone an admin login, so refuse unless explicitly overridden.
    if settings.is_production and os.getenv("ALLOW_DEMO_SEED") != "1":
        print(
            "Refusing to seed: APP_ENV=production.\n"
            "This script creates accounts with a well-known shared password, "
            "including an admin.\n"
            "Set ALLOW_DEMO_SEED=1 only if you genuinely intend that."
        )
        sys.exit(1)

    # Must happen before the first mapped class is instantiated.
    _load_all_models()

    db = SessionLocal()
    try:
        if reset:
            stats = reset_database(db)
            print(
                f"  wiped {stats['rows_before']} rows across "
                f"{stats['tables']} tables"
            )
            force = True  # nothing is left to collide with

        if _already_seeded(db) and not force:
            print("Already seeded — nothing to do. Use --reset only on a disposable demo database, or --report.")
            print_report(db)
            return

        if not reset:
            from app.users.models import User
            existing_users = db.query(func.count(User.id)).scalar() or 0
            if existing_users:
                raise SystemExit(
                    "The database contains users but has no completed full-demo seed marker. "
                    "Use an empty demo database, or run --reset only if all data is disposable."
                )

        rng = random.Random(RNG_SEED)
        print("Seeding CodeBazaar demo data (deterministic, engines run for real)…")

        print("  users…")
        cast = _seed_users(db, rng)
        print(f"    {len(cast['builders'])} builders + 5 staff/buyer accounts")

        print("  skills…")
        skills = _seed_skills(db, cast, rng)

        print("  projects (running the scoring engine on each)…")
        catalogue_result = _seed_projects(db, cast, skills, rng)
        catalogue = catalogue_result["projects"]
        print(f"    {len(catalogue)} projects scored")

        print("  hackathon claims (running the authenticity engine)…")
        hack = _seed_hackathon_claims(db, cast, catalogue, rng)
        print(f"    {hack['claims']} claims: {hack['verdicts']}")

        print("  marketplace payments…")
        market = _seed_marketplace(db, cast, catalogue, rng)
        print(f"    {market['payments']} payments, {market['sales']} sales, "
              f"{rupees(market['gross_paise'])} gross")

        print("  escrow contracts (real ledger maths)…")
        escrow = _seed_escrow(db, cast, catalogue, rng)
        print(f"    {escrow['contracts']} contracts: {escrow['outcomes']}")

        print("  revival, incubation, build requests…")
        revival = _seed_revival_and_incubation(db, cast, catalogue, rng)
        print(f"    {revival}")

        print("  reviews, messages, notifications, reports…")
        social = _seed_social(db, cast, catalogue, rng)
        print(f"    {social}")

        print("  pitch decks (real computed score + traction slides)…")
        decks = _seed_pitch_decks(db, catalogue, rng)
        print(f"    {decks}")

        print("  mentors + session requests…")
        mentors = _seed_mentors(db, cast, catalogue, rng)
        print(f"    {mentors}")

        # ── Advanced features ────────────────────────────────────────────────
        # Ordering matters here. Dependency audits must land before duplicate
        # screening (the screen reads the dependency fingerprint), and trust
        # receipts must land before team splits (both key off the same sales).
        print("  dependency + licence audits (real parser)…")
        audits = _seed_dependency_audits(db, catalogue, rng)
        print(f"    {audits}")

        print("  trust receipts + post-purchase health trend (engine re-run)…")
        trust = _seed_trust_and_health(db, cast, catalogue, rng)
        print(f"    {trust}")

        print("  near-duplicate projects (real similarity engine)…")
        dupes = _seed_duplicates(db, cast, catalogue, rng)
        print(f"    {dupes}")

        print("  purchase offers (negotiated through the real service)…")
        offers = _seed_purchase_offers(db, cast, catalogue, rng)
        print(f"    {offers}")

        print("  bundles + revenue-share deals…")
        deals = _seed_bundles_and_deals(db, cast, catalogue, rng)
        print(f"    {deals}")

        print("  team projects + sale splits…")
        teams = _seed_teams(db, cast, catalogue, rng)
        print(f"    {teams}")

        print("  commit streaks (derived from real commit history)…")
        streaks = _seed_streaks(db, cast, catalogue, rng)
        print(f"    {streaks}")

        print("  college partners + employer verification requests…")
        institutions = _seed_institutions(db, cast, catalogue, rng)
        print(f"    {institutions}")

        print("  collaboration scores…")
        _collab_scores(db, cast, rng)

        print("  recomputing reputation with the real engine…")
        tiers = _recompute_reputations(db, cast)
        print(f"    tiers: {tiers}")

        # Persist completion only after every demo section succeeds. This avoids
        # mistaking the smaller legacy app.seed dataset for the full demo.
        from app.users.models import AuditLog
        db.add(AuditLog(
            actor_id=None,
            action="demo_seed_completed",
            target_type="demo_seed",
            target_id="full-demo-v1",
            details="Full synthetic demo dataset seeded successfully.",
        ))
        db.commit()

        if catalogue_result["band_violations"]:
            print(f"\n  WARNING: {len(catalogue_result['band_violations'])} projects scored "
                  "outside their archetype's expected band. The scoring engine may have "
                  "been retuned — check before demoing.")

        logger.info("demo_seed_complete")
        print_report(db)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _force_utf8_stdout() -> None:
    """Make ₹ printable on a Windows console.

    The default Windows code page is cp1252, which has no rupee sign, so every
    amount this script prints would raise UnicodeEncodeError. Reconfiguring is
    preferable to writing "Rs" — the currency is part of the story here.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):  # pragma: no cover - non-standard stream
            pass


def main() -> None:
    _force_utf8_stdout()
    parser = argparse.ArgumentParser(description="Seed CodeBazaar demo data.")
    parser.add_argument("--report", action="store_true",
                        help="Only print what is already in the database.")
    parser.add_argument("--force", action="store_true",
                        help="Deprecated; combine with --reset for a disposable demo database.")
    parser.add_argument(
        "--reset", action="store_true",
        help="DESTRUCTIVE: delete every row in every table first, then seed. "
             "Use this to get a clean, reproducible demo database.",
    )
    parser.add_argument(
        "--yes", action="store_true",
        help="Skip the confirmation prompt for --reset.",
    )
    args = parser.parse_args()

    if args.force and not args.reset:
        parser.error("--force alone is unsafe; use --reset only for a disposable demo database")

    if args.report:
        db = SessionLocal()
        try:
            print_report(db)
        finally:
            db.close()
        return

    if args.reset and not args.yes:
        # Deleting someone's data because they typed one flag with no warning is
        # not acceptable, so the destructive path asks unless told not to.
        db = SessionLocal()
        try:
            from sqlalchemy import text
            target = str(db.get_bind().url).split("@")[-1]
            users = int(db.execute(text("SELECT COUNT(*) FROM users")).scalar() or 0)
        except Exception:
            target, users = "the configured database", 0
        finally:
            db.close()
        print(f"About to DELETE ALL DATA in: {target}")
        print(f"That currently holds {users} user account(s).")
        answer = input("Type 'reset' to confirm: ").strip().lower()
        if answer != "reset":
            print("Aborted — nothing was changed.")
            return

    run(force=args.force, reset=args.reset)


# NOTE: the `if __name__ == "__main__"` entry point lives at the very BOTTOM of
# this file, not here. It used to sit above the section functions below, which
# meant running `python -m app.seed_demo` executed `main()` before those
# definitions had been evaluated — the seed died with `NameError:
# _seed_pitch_decks is not defined` partway through. Importing the module and
# calling `run()` (as the tests do) completes the module body first, so the bug
# was invisible except on the path an operator actually uses. Keep it last.


# ══════════════════════════════════════════════════════════════════════════════
# Mentors
# ══════════════════════════════════════════════════════════════════════════════

# Representative mentor profiles. Names are generated like every other seeded
# account — these are demo personas, not real people endorsing the product.
MENTOR_PROFILES = [
    {
        "name": "Kabir Bose",
        "email": "mentor@codebazaar.dev",   # already created as the MENTOR account
        "headline": "Backend infrastructure — I review student architectures for free",
        "bio": (
            "Fifteen years building payment and messaging infrastructure. I'm most "
            "useful on data modelling and the boring reliability work that decides "
            "whether a project survives its first real users."
        ),
        "focus_areas": ["architecture", "databases", "reliability", "code review"],
        "years": 15,
        "company": "Independent",
        "rate": None,
    },
    {
        "name": "Ananya Krishnan",
        "email": "mentor.ananya@codebazaar.dev",
        "headline": "Went from campus project to seed round — happy to talk fundraising",
        "bio": (
            "Built and sold a scheduling tool that started as a hostel side project. "
            "I can help with framing a pitch, what investors actually check, and "
            "deciding whether to sell or keep building."
        ),
        "focus_areas": ["fundraising", "pitching", "product strategy"],
        "years": 7,
        "company": "Ex-founder",
        "rate": None,
    },
    {
        "name": "Vikram Iyer",
        "email": "mentor.vikram@codebazaar.dev",
        "headline": "Hiring manager — I'll tell you what your repo says about you",
        "bio": (
            "I screen engineering candidates and read a lot of repositories. I can "
            "tell you what a recruiter notices in the first two minutes, and what "
            "makes me close the tab."
        ),
        "focus_areas": ["hiring", "code review", "documentation", "careers"],
        "years": 11,
        "company": "Series B fintech",
        "rate": None,
    },
    {
        "name": "Meera Raghavan",
        "email": "mentor.meera@codebazaar.dev",
        "headline": "ML engineer — model work that survives contact with production",
        "bio": (
            "I work on applied ML and see a lot of notebooks that never became "
            "software. Useful for evaluation, data pipelines, and knowing when a "
            "model is good enough to ship."
        ),
        "focus_areas": ["machine learning", "data pipelines", "evaluation"],
        "years": 9,
        "company": "Healthtech",
        "rate": 150_000,   # ₹1,500/hour — one paid mentor so the field is exercised
    },
    {
        "name": "Arjun Pillai",
        "email": "mentor.arjun@codebazaar.dev",
        "headline": "Design and frontend — making a student project look trustworthy",
        "bio": (
            "Product designer turned frontend engineer. Most student projects lose "
            "buyers on the first screen, and that's usually fixable in a weekend."
        ),
        "focus_areas": ["design", "frontend", "accessibility"],
        "years": 8,
        "company": "Design studio",
        "rate": None,
    },
]


def _seed_mentors(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Mentor profiles plus a few session requests across the lifecycle."""
    from app.growth.models import MentorProfile, MentorSession
    from app.users.models import UserRole
    from app.users.repository import UserRepository

    repo = UserRepository(db)
    pw = hash_password(DEMO_PASSWORD)
    mentors = []

    for spec in MENTOR_PROFILES:
        user = repo.get_by_email(spec["email"])
        if not user:
            user = repo.create(
                email=spec["email"], hashed_password=pw,
                display_name=spec["name"], role=UserRole.MENTOR, is_verified=True,
            )
            repo.update_profile(
                user.id,
                bio=spec["bio"],
                college=None,
                location=rng.choice(CITIES),
                github_username=spec["email"].split("@")[0].replace(".", ""),
            )
        db.add(MentorProfile(
            user_id=user.id,
            headline=spec["headline"],
            bio=spec["bio"],
            focus_areas=spec["focus_areas"],
            years_experience=spec["years"],
            company=spec["company"],
            rate_paise_per_hour=spec["rate"],
            is_accepting=True,
            # A directory where everyone has zero sessions looks unused.
            sessions_completed=rng.randint(2, 14),
        ))
        mentors.append(user)

    db.commit()

    # ── Session requests, weighted toward builders who actually need help ─────
    # Below-threshold projects are the ones the product should be nudging toward
    # a mentor, so those are the requests that exist.
    needs_help = [
        c for c in catalogue
        if c["score"] is not None and c["score"] < 70 and c["archetype"] in {"mid", "early"}
    ]
    rng.shuffle(needs_help)

    TOPICS = [
        ("Improving contributor authenticity", "accepted",
         "My score is stuck in the 50s and contributor authenticity is my weakest component. "
         "I've been building solo — is there a legitimate way to improve this, or is it just "
         "something I have to live with as a solo builder?"),
        ("Is my documentation good enough to sell?", "accepted",
         "Documentation is scoring 51 on my project. I've written a README but clearly it's "
         "not enough. What would you actually want to see before buying this?"),
        ("Pricing a project with no traction", "pending",
         "I have a working MVP with a decent build score but no users. I have no idea whether "
         "to ask 5,000 or 50,000. How do people price this honestly?"),
        ("Should I keep building or sell?", "pending",
         "This started as a course project and I'm graduating. Torn between pushing it further "
         "over the summer or listing it and moving on. How do you decide?"),
        ("Architecture review before I add payments", "completed",
         "About to add a payment flow and I'd rather not discover my data model is wrong "
         "afterwards. Would you look at how I've structured the order handling?"),
        ("What does a recruiter see in my repo?", "declined",
         "Applying for internships and using this project as my main portfolio piece. "
         "What stands out, and what would make you close the tab?"),
    ]

    made = 0
    for i, (topic, status, message) in enumerate(TOPICS):
        if i >= len(needs_help):
            break
        entry = needs_help[i]
        mentor = mentors[i % len(mentors)]
        builder = entry["owner"]
        if builder.id == mentor.id:
            continue
        created = NOW - timedelta(days=rng.randint(1, 25))
        db.add(MentorSession(
            mentor_id=mentor.id,
            builder_id=builder.id,
            project_id=entry["project"].id,
            topic=topic,
            message=message,
            status=status,
            mentor_reply=(
                "Happy to help — let's do 30 minutes this week. Send me a link to the "
                "repo and I'll read it beforehand so we don't spend the call on context."
                if status == "accepted"
                else "Went through this and left detailed notes on the PR. The short version: "
                     "your module boundaries are fine, the data model needs one change before "
                     "you add payments. Good luck with it."
                if status == "completed"
                else "I'm at capacity on mentoring this month — try Ananya, she's closer to "
                     "this problem than I am."
                if status == "declined"
                else None
            ),
            responded_at=(created + timedelta(days=rng.randint(1, 4)))
            if status != "pending" else None,
            created_at=created, updated_at=created,
        ))
        made += 1

    db.commit()
    return {"mentors": len(mentors), "sessions": made}


# ══════════════════════════════════════════════════════════════════════════════
# Pitch decks
# ══════════════════════════════════════════════════════════════════════════════

# Narrative slides for seeded decks. The cover, Verified Build Score, traction and
# ask slides are NOT written here — they're built by deck_builder from real rows,
# exactly as they are in production. Only the framing prose is canned, and
# `model_used` records that so nothing pretends an LLM wrote it.
_SEEDED_NARRATIVE = [
    {
        "title": "Problem",
        "headline": "Teams rebuild the same internal tool every year because they can't trust anyone else's.",
        "bullets": [
            "Buying code from a stranger means trusting a demo video",
            "No way to tell who actually wrote a repository",
            "So working software gets rebuilt instead of reused",
        ],
        "speaker_note": (
            "Start with the buyer's problem, not the builder's. The buyer is the one "
            "with money and the one whose pain is easiest to state in a sentence."
        ),
    },
    {
        "title": "Solution",
        "headline": "A score computed from the repository's real development history, published in full.",
        "bullets": [
            "Six weighted components, every one auditable",
            "GitHub ownership proved before anything is marked verified",
            "Public report anyone can open without an account",
        ],
        "speaker_note": (
            "Emphasise 'published in full'. Plenty of things claim to score code; "
            "the difference here is that the derivation is visible."
        ),
    },
    {
        "title": "How It Works",
        "headline": "Import a repository, and the evidence assembles itself.",
        "bullets": [
            "We read commit cadence, contributors, docs and structure",
            "Fraud signals like single-burst history are penalised",
            "A badge in the README links back to the live report",
        ],
        "speaker_note": "Keep this short — the score slide does the real work.",
    },
    {
        "title": "Market Opportunity",
        "headline": "Every graduating cohort produces working software that currently goes nowhere.",
        "bullets": [
            "Hundreds of engineering colleges, thousands of final-year builds",
            "Buyers already pay for templates with no provenance at all",
            "Recruiters pay for signal on candidates they can't verify",
        ],
        "speaker_note": (
            "Deliberately qualitative. We don't have a defensible TAM figure and "
            "inventing one is the fastest way to lose a technical investor."
        ),
    },
    {
        "title": "Business Model",
        "headline": "Free to list. We take a cut when value actually changes hands.",
        "bullets": [
            "10% commission on a completed sale",
            "Recruiter and incubator subscriptions for direct access",
            "Per-project add-ons: audits, reports, pitch decks",
        ],
        "speaker_note": (
            "The point is that builders take no risk to list. Revenue only exists "
            "when someone got something they wanted."
        ),
    },
    {
        "title": "Roadmap",
        "headline": "Close the loop from proof to payment.",
        "bullets": [
            "Automated escrow payouts to replace manual settlement",
            "Code-similarity scanning for genuine originality checks",
            "Campus partnerships to reach cohorts at graduation",
        ],
        "speaker_note": (
            "Naming automated payouts as not-yet-built is deliberate. Investors "
            "check, and admitting it first is cheaper than being caught."
        ),
    },
]


def _seed_pitch_decks(db, catalogue: list[dict], rng: random.Random) -> dict:
    """Build complete, viewable decks for a handful of strong projects.

    Uses the production `assemble_deck` path so the score and traction slides are
    genuinely computed — a seeded deck and a real one are the same artefact.
    """
    from app.projects.deck_builder import assemble_deck
    from app.projects.models import AnalysisStatus, ProjectPitchDeck
    from app.projects.repository import ProjectRepository
    from app.users.models import Profile

    repo = ProjectRepository(db)

    # Strongest verified projects — a deck is only persuasive with a score behind it.
    candidates = [
        c for c in catalogue
        if c["score"] is not None and c["score"] >= 78 and c["project"].is_verified
    ]
    candidates.sort(key=lambda c: -(c["score"] or 0))

    made = 0
    for entry in candidates[:6]:
        project = entry["project"]
        verification = repo.get_verification(project.id)
        owner_profile = (
            db.query(Profile).filter(Profile.user_id == project.owner_id).first()
        )

        tagline = f"{project.title} — {(project.description or '').rstrip('.')}."
        ai_shaped = {
            "tagline": tagline[:280],
            "slides": [dict(s) for s in _SEEDED_NARRATIVE],
        }

        slides = assemble_deck(db, project, verification, owner_profile, ai_shaped)

        # Purchasing the deck is what unlocks generation, so a project with a
        # seeded deck must look like it paid for one.
        project.pitch_deck_unlocked = True

        db.add(ProjectPitchDeck(
            project_id=project.id,
            status=AnalysisStatus.COMPLETED,
            slides={"slides": slides},
            tagline=ai_shaped["tagline"],
            model_used="seed:deterministic-v1",
            generated_at=_iso(NOW - timedelta(days=rng.randint(1, 20))),
        ))
        made += 1

    db.commit()
    return {"decks": made}


# ══════════════════════════════════════════════════════════════════════════════
# Trust receipts + post-purchase health trend
# ══════════════════════════════════════════════════════════════════════════════

def _seed_trust_and_health(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Issue a real trust receipt for every completed sale, then build a health trend.

    Both halves run the real code paths:

    * Receipts come from `TrustReceiptService.issue`, the same method payment
      fulfilment calls, so the frozen snapshot is produced by production logic.

    * The trend is generated by **re-running the scoring engine** on the project's
      own signals, aged forward week by week. Nothing writes a score directly. A
      repo that goes quiet loses recency and cadence credit because the engine
      says so, not because the seed decided it should look like a decline.
    """
    from app.growth.models import ScoreSnapshot
    from app.payments.models import Payment, PaymentStatus, PaymentType
    from app.projects.models import Project
    from app.projects.repository import ProjectRepository
    from app.trust.service import HealthMonitorService, TrustReceiptService
    from app.verification.scoring import compute_build_score

    receipts = 0
    monitored = 0
    readings = 0
    declining = 0

    receipt_svc = TrustReceiptService(db)
    monitor = HealthMonitorService(db)
    repo = ProjectRepository(db)

    sales = (
        db.query(Payment)
        .filter(
            Payment.payment_type == PaymentType.PROJECT_ACCESS,
            Payment.status == PaymentStatus.PAID,
            Payment.project_id.isnot(None),
        )
        .order_by(Payment.created_at.asc())
        .all()
    )

    by_project = {c["project"].id: c for c in catalogue}

    for index, payment in enumerate(sales):
        project = db.get(Project, payment.project_id)
        if not project:
            continue

        sold_at = _aware(payment.created_at)

        receipt = receipt_svc.issue(payment, project)
        if receipt is None:
            continue
        # Backdate the receipt to the sale so the trend starts where it should.
        receipt.issued_at = sold_at
        receipts += 1

        # Align the monitor row with the purchase date so the trend window
        # starts at the sale rather than at seed time.
        from app.trust.models import MonitoredProject

        watch = (
            db.query(MonitoredProject)
            .filter(
                MonitoredProject.project_id == project.id,
                MonitoredProject.watcher_id == payment.user_id,
            )
            .first()
        )
        if watch:
            monitored += 1
            watch.created_at = sold_at

        entry = by_project.get(project.id)
        signals = entry.get("signals") if entry else None
        verification = repo.get_verification(project.id)
        if signals is None or verification is None:
            continue

        # ── Build the trend ──────────────────────────────────────────────────
        # Three quarters of purchased projects keep being maintained; the rest go
        # quiet. Both cases have to be visible, because a monitor that only ever
        # shows healthy projects proves nothing.
        weeks_since_sale = max(
            1, min(10, int((NOW - sold_at).days / 7) or 1)
        )
        goes_quiet = (index % 4 == 0)
        if goes_quiet:
            declining += 1

        last_push = _aware(signals.repo_pushed_at)
        for week in range(1, weeks_since_sale + 1):
            reading_at = sold_at + timedelta(days=7 * week)
            if reading_at > NOW:
                break

            # Age the signals to what they would have been at that reading.
            aged = copy_signals(signals)
            if goes_quiet:
                # No new commits: pushed_at stays put while the clock advances,
                # so repo_maturity's recency term decays on its own.
                aged.repo_pushed_at = last_push
            else:
                # Continued work: a few more commit days, and a fresher push.
                extra_days = rng.randint(2, 5)
                base = _aware(max(aged.commit_dates)) if aged.commit_dates else sold_at
                for offset in range(extra_days):
                    aged.commit_dates.append(
                        base + timedelta(days=7 * week + offset)
                    )
                aged.repo_pushed_at = reading_at - timedelta(days=rng.randint(0, 3))

            result = compute_build_score(aged)
            db.add(ScoreSnapshot(
                project_id=project.id,
                owner_id=project.owner_id,
                verified_build_score=result.verified_build_score,
                confidence=result.confidence,
                is_verified=(
                    result.verified_build_score >= 70
                    and verification.ownership_verified
                ),
                components={
                    "repo_maturity": result.repo_maturity_score,
                    "commit_cadence": result.commit_cadence_score,
                    "contributor_authenticity": result.contributor_authenticity_score,
                    "documentation": result.documentation_score,
                    "activity_consistency": result.activity_consistency_score,
                    "originality": result.originality_score,
                },
                fraud_flags=list(result.fraud_flags),
                recorded_at=reading_at,
                created_at=reading_at,
                updated_at=reading_at,
            ))
            readings += 1

            if watch:
                watch.last_checked_at = reading_at

        if index % 8 == 0:
            db.commit()

    db.commit()
    return {
        "receipts": receipts, "monitored": monitored,
        "readings": readings, "declining": declining,
    }


def _aware(dt: datetime | None) -> datetime:
    """Force a datetime to UTC-aware.

    SQLite (used by the test/scratch database) drops timezone information on the
    way back out, so a value written as aware reads as naive. Arithmetic against
    `NOW` then raises. Postgres keeps the offset, so this is a no-op there.
    """
    if dt is None:
        return NOW
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def copy_signals(signals):
    """Shallow copy of a BuildSignals with an independent commit_dates list.

    Needed because the trend ages the same base signals repeatedly; mutating the
    shared list would compound every week's additions into the next.
    """
    from dataclasses import replace

    return replace(signals, commit_dates=list(signals.commit_dates))


# ══════════════════════════════════════════════════════════════════════════════
# Dependency + licence audits
# ══════════════════════════════════════════════════════════════════════════════

# Real manifest text per stack. These are parsed by the real audit engine, so the
# findings a judge sees were derived from this text rather than typed in.
_MANIFEST_CLEAN_TS = """{
  "name": "%(slug)s",
  "version": "1.4.0",
  "license": "MIT",
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8",
    "@tanstack/react-query": "5.51.1",
    "tailwindcss": "3.4.6",
    "axios": "1.7.2"
  },
  "devDependencies": {
    "typescript": "5.5.3",
    "vitest": "2.0.3",
    "eslint": "9.7.0"
  }
}"""

_MANIFEST_GPL_TS = """{
  "name": "%(slug)s",
  "version": "0.9.2",
  "license": "GPL-3.0",
  "dependencies": {
    "express": "4.19.2",
    "lodash": "4.17.15",
    "request": "2.88.2",
    "moment": "2.29.4",
    "socket.io": "4.7.5",
    "minimist": "1.2.0"
  },
  "devDependencies": {
    "tslint": "6.1.3",
    "node-sass": "7.0.3"
  }
}"""

_MANIFEST_UNLICENSED_PY = """fastapi==0.111.0
uvicorn==0.30.1
sqlalchemy==2.0.31
pydantic==2.8.2
requests==2.28.0
pyyaml==5.3.1
pillow==9.5.0
pycrypto==2.6.1
"""

_MANIFEST_CLEAN_PY = """[project]
name = "%(slug)s"
license = {text = "Apache-2.0"}
dependencies = [
  "fastapi>=0.111.0",
  "uvicorn>=0.30.1",
  "sqlalchemy>=2.0.31",
  "pydantic>=2.8.2",
  "requests>=2.32.0",
  "cryptography>=42.0.0",
]
"""

_MANIFEST_NONCOMMERCIAL = """{
  "name": "%(slug)s",
  "version": "1.0.0",
  "license": "CC-BY-NC-4.0",
  "dependencies": {
    "vue": "3.4.31",
    "chart.js": "4.4.3",
    "date-fns": "3.6.0"
  }
}"""


def _seed_dependency_audits(db, catalogue: list[dict], rng: random.Random) -> dict:
    """Run the real licence/dependency audit against real manifest text.

    Deliberate spread so the risk report has something honest to say across the
    catalogue: most projects clean, a handful carrying genuine copyleft or
    abandoned-package problems, one unlicensed, one non-commercial.
    """
    from app.projects.repository import ProjectRepository
    from app.trust.dependency_audit import audit_dependencies, parse_manifest

    repo = ProjectRepository(db)
    scored = [c for c in catalogue if c["score"] is not None]
    scored.sort(key=lambda c: str(c["project"].id))  # deterministic ordering

    # Pick specific projects for the problem cases so the demo script can name
    # them, rather than hoping a random draw lands somewhere interesting.
    gpl_targets = scored[3:6]
    unlicensed_targets = scored[9:12]
    noncommercial_targets = scored[15:16]
    problem_ids = {
        c["project"].id
        for c in [*gpl_targets, *unlicensed_targets, *noncommercial_targets]
    }

    counts = {"clean": 0, "copyleft": 0, "unlicensed": 0, "noncommercial": 0}
    findings_total = 0
    audited = 0

    for entry in scored:
        project = entry["project"]
        analysis = repo.get_analysis(project.id)
        if not analysis:
            continue

        slug = (project.repo_full_name or "project").split("/")[-1]
        is_python = (project.primary_language or "").lower() == "python"

        if project.id in {c["project"].id for c in gpl_targets}:
            manifests = {"package.json": _MANIFEST_GPL_TS % {"slug": slug}}
            has_lock = False
            counts["copyleft"] += 1
        elif project.id in {c["project"].id for c in unlicensed_targets}:
            manifests = {"requirements.txt": _MANIFEST_UNLICENSED_PY}
            has_lock = False
            counts["unlicensed"] += 1
        elif project.id in {c["project"].id for c in noncommercial_targets}:
            manifests = {"package.json": _MANIFEST_NONCOMMERCIAL % {"slug": slug}}
            has_lock = True
            counts["noncommercial"] += 1
        else:
            manifests = (
                {"pyproject.toml": _MANIFEST_CLEAN_PY % {"slug": slug}}
                if is_python else
                {"package.json": _MANIFEST_CLEAN_TS % {"slug": slug}}
            )
            has_lock = (analysis.repo_signals or {}).get("has_lockfile", True)
            counts["clean"] += 1

        # Per-package licences: a registry lookup would supply these. Seeding a
        # partial map is honest — the audit only reports licence findings for
        # packages it actually knows about.
        dependency_licences = {
            "express": "MIT", "lodash": "MIT", "react": "MIT", "next": "MIT",
            "vue": "MIT", "axios": "MIT", "zod": "MIT", "tailwindcss": "MIT",
            "fastapi": "MIT", "pydantic": "MIT", "sqlalchemy": "MIT",
            "requests": "Apache-2.0", "cryptography": "Apache-2.0",
            "typescript": "Apache-2.0", "uvicorn": "BSD-3-Clause",
            "pyyaml": "MIT", "pillow": "HPND", "date-fns": "MIT",
            # The genuinely awkward ones.
            "socket.io": "MIT", "moment": "MIT",
            "chart.js": "MIT", "node-sass": "MIT",
            "pycrypto": "Public Domain",
            "request": "Apache-2.0",
        }
        if project.id in {c["project"].id for c in gpl_targets}:
            # A copyleft transitive dependency, which is the case that actually
            # bites a buyer: the project's own licence looks fine until you read
            # what it links against.
            dependency_licences = {**dependency_licences, "socket.io": "GPL-3.0"}

        audit = audit_dependencies(
            manifests,
            dependency_licences=dependency_licences,
            has_lockfile=bool(has_lock),
        )
        if not audit.scanned:
            continue

        payload = audit.as_dict()
        names: set[str] = set()
        for path, content in manifests.items():
            deps, _ = parse_manifest(path, content)
            names.update(deps.keys())
        payload["dependency_names"] = sorted(names)

        repo.update_analysis(
            analysis,
            dependency_audit=payload,
            repo_signals={
                **(analysis.repo_signals or {}),
                "has_license": project.id not in problem_ids,
                "manifests": [p.split("/")[-1] for p in manifests],
            },
        )
        findings_total += len(audit.findings)
        audited += 1

        if audited % 30 == 0:
            db.commit()

    db.commit()
    return {"audited": audited, "findings": findings_total, **counts}


# ══════════════════════════════════════════════════════════════════════════════
# Near-duplicate projects
# ══════════════════════════════════════════════════════════════════════════════

# Two honest scenarios:
#   1. A relisted clone — same work, new owner, version-suffixed repo name.
#   2. A tutorial template several students submitted as original work.
_DUPLICATE_SCENARIOS = [
    {
        "kind": "relisted_clone",
        "title": "TiffinTrail — hostel meal subscription tracker",
        "description": (
            "A subscription tracker for hostel tiffin services that reconciles "
            "weekly meal counts against vendor invoices and flags discrepancies "
            "before the month closes."
        ),
        "topics": ["food-tech", "subscriptions", "invoicing"],
        "language": "TypeScript",
        "repos": ["ananya/tiffintrail", "harsh/tiffintrail-v2"],
        "dirs": ["src", "tests", "prisma"],
        "deps": ["next", "react", "prisma", "zod", "tailwindcss", "vitest", "date-fns"],
    },
    {
        "kind": "template_clone",
        "title": "Realtime Chat Application with Socket.IO",
        "description": (
            "A realtime chat application built with React, Node and Socket.IO "
            "featuring private rooms, typing indicators and message persistence "
            "in MongoDB."
        ),
        "topics": ["chat", "socketio", "realtime"],
        "language": "JavaScript",
        "repos": [
            "rahulverma44/realtime-chat-app",
            "snehap21/realtime-chat-application",
            "aditya-m/realtime-chat-app-final",
        ],
        "dirs": ["client", "server", "models"],
        "deps": [
            "react", "express", "socket.io", "mongoose", "jsonwebtoken",
            "bcryptjs", "cors",
        ],
    },
]


def _seed_duplicates(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Create genuine near-duplicates and screen them with the real engine.

    Nothing here writes a similarity score. Each cluster is imported as ordinary
    projects, then `DuplicateService.screen` compares them and decides the verdict.
    If the detector were broken, this seed would produce no flags — which is
    exactly the property that makes the demo honest.
    """
    from app.projects.models import (
        AnalysisStatus, Project, ProjectStage, ProjectStatus,
    )
    from app.projects.repository import ProjectRepository
    from app.trust.models import DuplicateFlag
    from app.trust.service import DuplicateService
    from app.verification.scoring import BuildSignals, compute_build_score

    repo = ProjectRepository(db)
    dup_svc = DuplicateService(db)
    builders = cast["builders"]
    created_projects = []
    next_repo_id = 900_000_000

    for scenario_index, scenario in enumerate(_DUPLICATE_SCENARIOS):
        for clone_index, repo_full_name in enumerate(scenario["repos"]):
            owner = builders[(scenario_index * 7 + clone_index * 11) % len(builders)]
            created_at = NOW - timedelta(days=40 - clone_index * 9)

            # Later clones get a version-ish title, which is what actually happens.
            title = scenario["title"]
            if clone_index > 0 and scenario["kind"] == "relisted_clone":
                title = f"{scenario['title']} (v2)"

            project = repo.create(
                owner_id=owner.id,
                github_repo_id=next_repo_id,
                repo_full_name=repo_full_name,
                title=title,
                description=scenario["description"],
                stage=ProjectStage.MVP,
                status=ProjectStatus.ACTIVE,
                primary_language=scenario["language"],
                topics=list(scenario["topics"]),
                stars=rng.randint(2, 40),
                forks=rng.randint(0, 8),
                open_issues=rng.randint(0, 6),
                watchers=rng.randint(1, 12),
                default_branch="main",
                github_created_at=_iso(created_at - timedelta(days=rng.randint(60, 200))),
                github_pushed_at=_iso(created_at - timedelta(days=rng.randint(1, 30))),
                is_for_sale=(clone_index == 0 and scenario["kind"] == "relisted_clone"),
                price_paise=_paise(7999) if clone_index == 0 else None,
                price_label="Source code + handover" if clone_index == 0 else None,
                sale_type="source_code" if clone_index == 0 else None,
            )
            next_repo_id += 1

            # Score them for real so they look like ordinary listings.
            commit_dates = _commit_dates(
                rng, count=rng.randint(18, 45),
                span_days=rng.randint(30, 90),
                end_days_ago=rng.randint(2, 30),
            )
            signals = BuildSignals(
                repo_created_at=created_at - timedelta(days=rng.randint(60, 200)),
                repo_pushed_at=created_at - timedelta(days=rng.randint(1, 30)),
                is_fork=False,
                has_license=True,
                has_description=True,
                topics_count=len(scenario["topics"]),
                stars=project.stars,
                forks=project.forks,
                open_issues=project.open_issues,
                readme_length=rng.randint(600, 1800),
                commit_dates=commit_dates,
                commit_history_complete=True,
                contributors_count=rng.randint(1, 3),
                top_contributor_share=rng.uniform(0.7, 1.0),
                ownership_verified=True,
                hackathon_verified=False,
            )
            result = compute_build_score(signals)
            verification = repo.get_verification(project.id)
            repo.update_verification(
                verification,
                ownership_verified=True,
                verified_at=_iso(created_at),
                notes=result.reasoning,
                **result.as_verification_fields(),
            )
            repo.update(project, is_verified=result.verified_build_score >= 70)

            # Give them a dependency fingerprint so the accurate screen (the one
            # that runs after analysis) has something to compare.
            analysis = repo.get_analysis(project.id)
            repo.update_analysis(
                analysis,
                status=AnalysisStatus.COMPLETED,
                health_score=rng.randint(52, 74),
                completion_score=rng.randint(48, 72),
                startup_potential=rng.randint(40, 68),
                impact_potential=rng.randint(40, 70),
                model_used="seed:deterministic-v1",
                code_reviewed=True,
                repo_signals={
                    "file_count": rng.randint(40, 120),
                    "source_file_count": rng.randint(25, 80),
                    "test_file_count": rng.randint(0, 6),
                    "has_tests": rng.random() < 0.5,
                    "has_ci": rng.random() < 0.4,
                    "has_docker": rng.random() < 0.3,
                    "has_lockfile": True,
                    "has_readme": True,
                    "has_license": True,
                    "top_level_dirs": list(scenario["dirs"]),
                    "dependency_count": len(scenario["deps"]),
                },
                dependency_audit={
                    "scanned": True,
                    "dependencies_scanned": len(scenario["deps"]),
                    "manifests_read": ["package.json"],
                    "findings": [],
                    "licence_summary": {"permissive": len(scenario["deps"])},
                    "project_licence": "MIT",
                    "project_licence_class": "permissive",
                    "advisory_source": "curated-static-set",
                    "is_complete_scan": False,
                    "counts": {"licence": 0, "abandoned": 0, "vulnerability": 0, "blocking": 0},
                    "dependency_names": list(scenario["deps"]),
                },
            )

            created_projects.append(project)
            db.commit()

    # Now screen each one with the real detector.
    for project in created_projects:
        dup_svc.screen(project, commit=True)

    flags = db.query(DuplicateFlag).all()
    withheld = (
        db.query(func.count(Project.id))
        .filter(Project.duplicate_status == "withheld")
        .scalar() or 0
    )
    under_review = (
        db.query(func.count(Project.id))
        .filter(Project.duplicate_status == "review")
        .scalar() or 0
    )

    # Resolve one flag each way so the admin queue shows a real history rather
    # than only an untouched backlog.
    confirmed = dismissed = 0
    pending = [f for f in flags if f.status == "pending"]
    pending.sort(key=lambda f: -f.similarity)
    if pending:
        dup_svc.review(
            pending[0].id, cast["admin"], confirm=True,
            note=(
                "Confirmed: same codebase as the earlier listing, re-uploaded "
                "under a new repository name. Original listing stays live."
            ),
        )
        confirmed = 1
    if len(pending) > 2:
        dup_svc.review(
            pending[-1].id, cast["admin"], confirm=False,
            note=(
                "Reviewed and cleared. Both projects follow the same widely-used "
                "tutorial structure, but the implementations diverge and neither "
                "is a copy of the other."
            ),
        )
        dismissed = 1

    db.commit()
    return {
        "clone_projects": len(created_projects),
        "flags": len(flags),
        "withheld": int(withheld),
        "under_review": int(under_review),
        "confirmed": confirmed,
        "dismissed": dismissed,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Purchase offers — negotiation in every state
# ══════════════════════════════════════════════════════════════════════════════

_OFFER_MESSAGES = [
    "Score and test coverage look solid. Budget's tighter than the ask — would this work?",
    "I'd take it at this number and keep you on for a two-week handover.",
    "Comparable listings in this band are going for less. Meeting you partway.",
    "Genuinely interested. This is what I can approve without going up a level.",
    "Happy to close this week at this price if delivery includes the deploy config.",
]
_SELLER_COUNTERS = [
    "Can't go that low — there's eight months of work here. Here's my number.",
    "Meeting you in the middle. Includes the handover call and the env setup notes.",
    "Slightly above your offer, but I'll throw in the Docker config and CI setup.",
]
_SELLER_DECLINES = [
    "Appreciate the interest, but that's well below what the work is worth.",
    "Passing on this one — I've had a stronger offer I'm working through.",
]


def _seed_purchase_offers(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Drive real negotiations through OfferService into every terminal state.

    Uses the actual service so all its rules apply — the 30%-of-asking floor, the
    turn-taking check, the requirement that a seller's counter sits above the
    buyer's number. If a state below is reachable in the seed, it is reachable in
    the product.
    """
    from app.deals.models import PurchaseOffer
    from app.deals.service import OfferService
    from app.payments.models import ProjectAccess

    service = OfferService(db)
    buyers = [cast["recruiter"], cast["founder2"], cast["incubator"]]
    # Builders buy from each other too, which is true of a real marketplace.
    buyers += [cast["builders"][i] for i in (5, 11, 19, 27, 33)]

    for_sale = [
        c for c in catalogue
        if c["for_sale"] and c["price_paise"] and c["score"] and c["score"] >= 55
    ]
    for_sale.sort(key=lambda c: str(c["project"].id))

    owned_pairs = {
        (a.project_id, a.user_id) for a in db.query(ProjectAccess).all()
    }

    def eligible(entry, buyer):
        project = entry["project"]
        if project.owner_id == buyer.id:
            return False
        if (project.id, buyer.id) in owned_pairs:
            return False
        return True

    states = {
        "pending": 0, "countered": 0, "accepted": 0,
        "declined": 0, "withdrawn": 0, "expired": 0,
    }
    used: set[tuple] = set()

    def next_pair(start_index: int):
        """Find an unused (listing, buyer) pair the service will accept."""
        for offset in range(len(for_sale)):
            entry = for_sale[(start_index + offset) % len(for_sale)]
            for buyer in buyers:
                key = (entry["project"].id, buyer.id)
                if key in used or not eligible(entry, buyer):
                    continue
                used.add(key)
                return entry, buyer
        return None, None

    cursor = 0

    def make(fraction: float):
        nonlocal cursor
        entry, buyer = next_pair(cursor)
        cursor += 3
        if entry is None:
            return None, None, None
        amount = max(
            int(entry["price_paise"] * 0.32),
            int(entry["price_paise"] * fraction),
        )
        try:
            offer = service.create(
                entry["project"].id, buyer, amount,
                rng.choice(_OFFER_MESSAGES),
            )
        except Exception:
            return None, None, None
        return offer, entry, buyer

    # ── Pending: buyer has offered, seller hasn't moved ──────────────────────
    for _ in range(4):
        offer, entry, _ = make(rng.uniform(0.62, 0.85))
        if offer:
            states["pending"] += 1

    # ── Countered: seller came back with a number ───────────────────────────
    for _ in range(3):
        offer, entry, _ = make(rng.uniform(0.55, 0.70))
        if not offer:
            continue
        seller = db.get(type(cast["admin"]), entry["project"].owner_id)
        midpoint = int(
            (offer.current_offer_paise + entry["price_paise"]) / 2
        )
        try:
            service.counter(
                offer.id, seller, min(midpoint, entry["price_paise"]),
                rng.choice(_SELLER_COUNTERS),
            )
            states["countered"] += 1
        except Exception:
            pass

    # ── Accepted: terms agreed, awaiting payment ────────────────────────────
    for _ in range(3):
        offer, entry, _ = make(rng.uniform(0.72, 0.90))
        if not offer:
            continue
        seller = db.get(type(cast["admin"]), entry["project"].owner_id)
        try:
            service.accept(offer.id, seller)
            states["accepted"] += 1
        except Exception:
            pass

    # ── Accepted then countered-then-accepted: a full three-round thread ────
    offer, entry, buyer = make(0.50)
    rounds_demo = None
    if offer:
        seller = db.get(type(cast["admin"]), entry["project"].owner_id)
        try:
            service.counter(
                offer.id, seller, int(entry["price_paise"] * 0.85),
                "Can't go that low. This includes the handover and deploy scripts.",
            )
            service.counter(
                offer.id, buyer, int(entry["price_paise"] * 0.72),
                "Splitting the difference — final number from my side.",
            )
            service.accept(offer.id, seller)
            states["accepted"] += 1
            rounds_demo = offer.id
        except Exception:
            pass

    # ── Declined ────────────────────────────────────────────────────────────
    for _ in range(2):
        offer, entry, _ = make(rng.uniform(0.33, 0.45))
        if not offer:
            continue
        seller = db.get(type(cast["admin"]), entry["project"].owner_id)
        try:
            service.decline(offer.id, seller, rng.choice(_SELLER_DECLINES))
            states["declined"] += 1
        except Exception:
            pass

    # ── Withdrawn by the buyer ──────────────────────────────────────────────
    for _ in range(2):
        offer, entry, buyer = make(rng.uniform(0.60, 0.75))
        if not offer:
            continue
        try:
            service.withdraw(offer.id, buyer)
            states["withdrawn"] += 1
        except Exception:
            pass

    # ── Expired: backdate past the TTL, then run the real expiry sweep ───────
    for _ in range(2):
        offer, entry, _ = make(rng.uniform(0.55, 0.70))
        if not offer:
            continue
        offer.expires_at = NOW - timedelta(days=rng.randint(1, 12))
        offer.created_at = NOW - timedelta(days=rng.randint(16, 40))
        db.commit()
    states["expired"] = service.expire_stale()

    # Backdate the rest so the offer list isn't all timestamped "just now".
    for offer in db.query(PurchaseOffer).all():
        if _aware(offer.created_at) > NOW - timedelta(hours=2):
            offer.created_at = NOW - timedelta(days=rng.randint(1, 21))
    db.commit()

    total = db.query(func.count(PurchaseOffer.id)).scalar() or 0
    return {"offers": int(total), "states": states, "thread_demo": str(rounds_demo)[:8]}


# ══════════════════════════════════════════════════════════════════════════════
# Bundles + revenue-share deals
# ══════════════════════════════════════════════════════════════════════════════

def _seed_bundles_and_deals(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Portfolio bundles and an equity/revenue-share offer.

    Bundles are created through the real `BundleService`, so the "cheaper than
    buying the parts" rule and the average-score computation are the product's,
    not the seed's.
    """
    from app.deals.models import ProjectBundle
    from app.deals.service import BundleService
    from app.incubation.models import (
        IncubationOffer, OfferStatus, OfferType,
    )

    bundles = BundleService(db)
    made = 0

    # Group by owner and find builders with 2+ sellable projects.
    by_owner: dict[uuid.UUID, list[dict]] = {}
    for entry in catalogue:
        if entry["score"] is None or entry["score"] < 55:
            continue
        by_owner.setdefault(entry["project"].owner_id, []).append(entry)

    candidates = [
        (owner_id, entries) for owner_id, entries in by_owner.items()
        if len(entries) >= 2
    ]
    candidates.sort(key=lambda pair: (-len(pair[1]), str(pair[0])))

    bundle_specs = [
        (
            "Full-stack fintech portfolio",
            "Three shipped products covering ledgering, payments reconciliation "
            "and reporting. Bought together, this is a complete picture of how I "
            "design and finish backend-heavy work — not three unrelated demos.",
        ),
        (
            "Campus operations suite",
            "Two production-grade tools already in use on campus. Both are "
            "verified, documented and handed over with deployment notes.",
        ),
    ]

    for spec_index, (title, description) in enumerate(bundle_specs):
        if spec_index >= len(candidates):
            break
        owner_id, entries = candidates[spec_index]
        owner = db.get(type(cast["admin"]), owner_id)
        picked = entries[: 3 if spec_index == 0 else 2]

        combined = sum(e["price_paise"] or _paise(4999) for e in picked)
        # Ensure each member has a price so the saving is verifiable.
        for entry in picked:
            project = entry["project"]
            if not project.price_paise:
                project.is_for_sale = True
                project.price_paise = _paise(4999)
                project.price_label = "Source code access"
                project.sale_type = "source_code"
        db.commit()

        combined = sum(e["project"].price_paise or 0 for e in picked)
        try:
            bundle = bundles.create(
                owner,
                title=title,
                description=description,
                project_ids=[e["project"].id for e in picked],
                price_paise=int(combined * 0.78),  # a real 22% saving
                publish=True,
            )
            # Give the items their "why this is here" notes.
            for item in bundles.get(bundle.id).items:
                entry = next(
                    (e for e in picked if e["project"].id == item.project_id), None
                )
                if entry:
                    item.note = (
                        f"Verified Build Score {entry['score']}/100 · "
                        f"{entry['project'].primary_language or 'mixed stack'}"
                    )
            db.commit()
            made += 1
        except Exception as exc:  # pragma: no cover - seed resilience
            logger.warning("seed_bundle_failed", extra={"error": str(exc)})

    # ── Revenue-share and equity deals on the same rail ─────────────────────
    strong = [
        c for c in catalogue
        if c["score"] is not None and c["score"] >= 72 and c["project"].is_verified
    ]
    strong.sort(key=lambda c: -(c["score"] or 0))

    deals = 0
    deal_specs = [
        {
            "type": OfferType.REVENUE_SHARE,
            "title": "₹4L for 6% of revenue, capped at 2.5x",
            "message": (
                "We back verified student products with revenue-based financing "
                "instead of equity — you keep the company. ₹4,00,000 up front "
                "against 6% of monthly gross revenue for 36 months, and the "
                "obligation ends the moment we've been repaid 2.5x. No board "
                "seat, no liquidation preference, no dilution."
            ),
            "amount": _paise(400_000),
            "bps": 600,
            "months": 36,
            "cap": 250,
            "status": OfferStatus.PENDING,
        },
        {
            "type": OfferType.REVENUE_SHARE,
            "title": "₹1.5L for 4% of revenue, capped at 2x",
            "message": (
                "Smaller cheque to get you to your first paying cohort. 4% of "
                "gross for 24 months, hard cap at 2x. We'll also introduce you "
                "to three campuses running procurement this quarter."
            ),
            "amount": _paise(150_000),
            "bps": 400,
            "months": 24,
            "cap": 200,
            "status": OfferStatus.ACCEPTED,
        },
        {
            "type": OfferType.FUNDING,
            "title": "₹12L for 8% equity, pre-seed",
            "message": (
                "Standard pre-seed on a SAFE. ₹12,00,000 at an ₹1.5Cr post-money "
                "cap for roughly 8%. Included so you can compare a conventional "
                "equity round against the revenue-share terms side by side."
            ),
            "amount": _paise(1_200_000),
            "equity": 8,
            "status": OfferStatus.PENDING,
        },
    ]

    for index, spec in enumerate(deal_specs):
        if index >= len(strong):
            break
        entry = strong[index]
        created = NOW - timedelta(days=rng.randint(3, 24))
        offer = IncubationOffer(
            incubator_id=cast["incubator"].id,
            project_id=entry["project"].id,
            offer_type=spec["type"],
            title=spec["title"],
            message=spec["message"],
            amount_paise=spec["amount"],
            equity_percent=spec.get("equity"),
            revenue_share_bps=spec.get("bps"),
            revenue_share_months=spec.get("months"),
            revenue_share_cap_bps=spec.get("cap"),
            status=spec["status"],
            response_note=(
                "Terms work for us — no dilution was the deciding factor. "
                "Countersigned."
                if spec["status"] == OfferStatus.ACCEPTED else None
            ),
            responded_at=(
                created + timedelta(days=2)
                if spec["status"] == OfferStatus.ACCEPTED else None
            ),
            created_at=created,
            updated_at=created,
        )
        db.add(offer)
        deals += 1

    db.commit()
    total_bundles = db.query(func.count(ProjectBundle.id)).scalar() or 0
    return {"bundles": int(total_bundles), "deals": deals}


# ══════════════════════════════════════════════════════════════════════════════
# Team / squad projects with revenue splits
# ══════════════════════════════════════════════════════════════════════════════

_TEAM_SHAPES = [
    # (lead bps, [(member bps, contribution), ...])
    (5000, [(3000, "Backend, payments and escrow integration"),
            (2000, "Design system and frontend")]),
    (4000, [(4000, "ML pipeline and model serving"),
            (2000, "Data collection and labelling")]),
    (6000, [(2500, "Mobile client"), (1500, "QA and release engineering")]),
    (3400, [(3300, "Realtime sync engine"), (3300, "Infrastructure and CI")]),
]


def _seed_teams(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Co-owned projects with agreed splits, and real split ledgers on past sales.

    Splits are set through `TeamService.set_team`, which enforces the
    sum-to-exactly-100% rule, so a demo team's numbers always add up. Sale splits
    for projects already sold are written by `record_sale_splits` — the same
    method payment fulfilment calls.
    """
    from app.payments.models import Payment, PaymentStatus, PaymentType
    from app.projects.models import Project
    from app.teams.models import ProjectMember, SaleSplit
    from app.teams.service import TeamService

    service = TeamService(db)
    builders = cast["builders"]

    # Prefer projects that already sold, so the split ledger has real money in it.
    sold_project_ids = {
        pid for (pid,) in db.query(Payment.project_id).filter(
            Payment.payment_type == PaymentType.PROJECT_ACCESS,
            Payment.status == PaymentStatus.PAID,
            Payment.project_id.isnot(None),
        ).all()
    }

    strong = [
        c for c in catalogue
        if c["score"] is not None and c["score"] >= 60
    ]
    strong.sort(
        key=lambda c: (c["project"].id not in sold_project_ids, -(c["score"] or 0))
    )

    teams_made = 0
    pending_invites = 0

    for index, shape in enumerate(_TEAM_SHAPES):
        if index >= len(strong):
            break
        entry = strong[index]
        project = entry["project"]
        lead_bps, member_specs = shape

        # Pick co-owners who aren't the lead.
        pool = [b for b in builders if b.id != project.owner_id]
        chosen = [pool[(index * 13 + i * 7) % len(pool)] for i in range(len(member_specs))]
        # Guard against picking the same person twice.
        seen = {project.owner_id}
        unique_chosen = []
        for candidate in chosen:
            if candidate.id in seen:
                candidate = next(
                    (b for b in pool if b.id not in seen), None
                )
            if candidate is None:
                continue
            seen.add(candidate.id)
            unique_chosen.append(candidate)
        if len(unique_chosen) != len(member_specs):
            continue

        members = [{
            "user_id": project.owner_id,
            "revenue_share_bps": lead_bps,
            "contribution": "Product lead, architecture and original build",
            "role": "lead",
        }]
        for candidate, (bps, contribution) in zip(unique_chosen, member_specs):
            members.append({
                "user_id": candidate.id,
                "revenue_share_bps": bps,
                "contribution": contribution,
                "role": "co-owner",
            })

        try:
            service.set_team(project, project.owner_id, members)
        except Exception as exc:  # pragma: no cover - seed resilience
            logger.warning("seed_team_failed", extra={"error": str(exc)})
            continue

        # Most invites are accepted; leave one outstanding so the pending state
        # is visible and the "not everyone has confirmed" banner has a subject.
        rows = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project.id,
                ProjectMember.is_lead == False,
            )
            .all()
        )
        for row_index, row in enumerate(rows):
            if index == len(_TEAM_SHAPES) - 1 and row_index == 0:
                pending_invites += 1
                continue  # left pending on purpose
            try:
                service.respond(project.id, row.user_id, accept=True)
            except Exception:
                pass

        teams_made += 1

    db.commit()

    # ── Backfill split ledgers for sales that predate the team agreement ─────
    splits_written = 0
    team_project_ids = [
        pid for (pid,) in db.query(ProjectMember.project_id)
        .filter(ProjectMember.status == "accepted")
        .distinct()
        .all()
    ]
    for pid in team_project_ids:
        project = db.get(Project, pid)
        if not project:
            continue
        sales = (
            db.query(Payment)
            .filter(
                Payment.project_id == pid,
                Payment.payment_type == PaymentType.PROJECT_ACCESS,
                Payment.status == PaymentStatus.PAID,
            )
            .all()
        )
        for payment in sales:
            net = payment.seller_net_paise or payment.amount_paise or 0
            written = service.record_sale_splits(payment, project, net)
            if written:
                # Match the split rows to the sale date so earnings history lines up.
                for row in written:
                    row.created_at = payment.created_at
                    row.updated_at = payment.created_at
                splits_written += len(written)
    db.commit()

    total_splits = db.query(func.count(SaleSplit.id)).scalar() or 0
    return {
        "teams": teams_made,
        "pending_invites": pending_invites,
        "split_rows": int(total_splits),
        "splits_written": splits_written,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Commit streaks — derived from the commit history already generated
# ══════════════════════════════════════════════════════════════════════════════

def _seed_streaks(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Build streaks from the same commit dates the scoring engine consumed.

    This is the honest construction: the seed does not invent streak numbers. It
    collects each builder's real commit days across all their projects — the exact
    dates `compute_build_score` was given — and lets `compute_streak` derive the
    counters. A builder's streak therefore agrees with their activity-consistency
    component, because both read the same history.

    A subset of active builders gets their most recent stretch extended to today
    so the demo has live streaks at several lengths. That extension is added to
    the underlying day list, not to the counter, so it stays verifiable.
    """
    from app.growth.models import BuilderActivity
    from app.growth.streaks import StreakService, compute_streak

    service = StreakService(db)

    # Gather real commit days per owner.
    by_owner: dict[uuid.UUID, set[str]] = {}
    for entry in catalogue:
        signals = entry.get("signals")
        if signals is None or not getattr(signals, "commit_dates", None):
            continue
        owner_id = entry["project"].owner_id
        bucket = by_owner.setdefault(owner_id, set())
        for dt in signals.commit_dates:
            bucket.add(dt.date().isoformat())

    # Deterministic ordering so the same builders get the same treatment each run.
    owners = sorted(by_owner.keys(), key=str)
    today = NOW.date()

    # Target lengths, chosen so every milestone band is represented on screen.
    live_targets = [97, 63, 41, 34, 22, 15, 11, 9, 7, 5, 4, 3, 2, 1]

    made = 0
    live = 0
    milestone_counts: dict[int, int] = {}

    for index, owner_id in enumerate(owners):
        days = set(by_owner[owner_id])

        if index < len(live_targets):
            # Extend the chain up to today so this builder has a live streak.
            target = live_targets[index]
            for offset in range(target):
                days.add((today - timedelta(days=offset)).isoformat())
            live += 1
        elif index % 3 == 0:
            # A recently-lapsed streak: active until a few days ago, then stopped.
            gap = rng.randint(3, 21)
            for offset in range(gap, gap + rng.randint(4, 16)):
                days.add((today - timedelta(days=offset)).isoformat())

        service.record_days(owner_id, sorted(days), commit=False)
        made += 1

        stats = compute_streak(sorted(days), today=today)
        for milestone in stats["milestones"]:
            milestone_counts[milestone] = milestone_counts.get(milestone, 0) + 1

        if made % 20 == 0:
            db.commit()

    db.commit()

    total = db.query(func.count(BuilderActivity.id)).scalar() or 0
    return {
        "builders": int(total),
        "live_streaks": live,
        "milestones": dict(sorted(milestone_counts.items())),
    }


# ══════════════════════════════════════════════════════════════════════════════
# College partners + employer verification requests
# ══════════════════════════════════════════════════════════════════════════════

def _seed_institutions(db, cast: dict, catalogue: list[dict], rng: random.Random) -> dict:
    """Faculty accounts for institutions that actually have students in the seed.

    The college names are read back out of the seeded profiles rather than chosen
    from a list, so every partner dashboard has real students behind it. A partner
    account pointing at an institution with nobody enrolled would show an empty
    dashboard and look broken.
    """
    from app.institutions.models import CollegePartner, EmployerVerificationRequest
    from app.institutions.service import (
        CollegePartnerService, EmployerVerificationService, college_key,
    )
    from app.projects.models import Project
    from app.users.models import Profile, User, UserRole
    from app.users.repository import UserRepository

    repo = UserRepository(db)
    partner_svc = CollegePartnerService(db)

    # Rank colleges by verified project count — the same ordering the leaderboard
    # uses — so the partners we create are ones with something to show.
    rows = (
        db.query(
            Profile.college,
            func.count(Project.id).label("verified"),
        )
        .join(Project, Project.owner_id == Profile.user_id)
        .filter(
            Profile.college.isnot(None),
            Profile.college != "",
            Project.is_verified == True,
            Project.is_deleted == False,
        )
        .group_by(Profile.college)
        .order_by(func.count(Project.id).desc())
        .limit(3)
        .all()
    )

    pw = hash_password(DEMO_PASSWORD)
    partner_specs = [
        ("Placement Cell", "Dr. Meera Iyer", "Head, Training & Placement"),
        ("Department of Computer Science", "Prof. Arvind Kulkarni", "Associate Professor"),
        ("Innovation Cell", "Dr. Fatima Sheikh", "Faculty Coordinator"),
    ]

    made = 0
    verified = 0
    for index, (row, spec) in enumerate(zip(rows, partner_specs)):
        college_name = row.college
        department, contact_name, contact_title = spec
        slug = college_key(college_name).replace(" ", "")[:18]
        email = f"faculty.{slug}@codebazaar.dev"

        if repo.get_by_email(email):
            continue

        user = repo.create(
            email=email,
            hashed_password=pw,
            display_name=f"{college_name} — {department}",
            role=UserRole.COLLEGE_PARTNER,
            is_verified=True,
        )
        repo.update_profile(
            user.id,
            bio=(
                f"Official {department.lower()} account for {college_name}. "
                "Tracks verified student output on CodeBazaar."
            ),
            college=college_name,
            location=rng.choice(CITIES),
        )

        created = NOW - timedelta(days=rng.randint(10, 60))
        partner = CollegePartner(
            user_id=user.id,
            college_name=college_name,
            college_key=college_key(college_name),
            department=department,
            contact_name=contact_name,
            contact_title=contact_title,
            website_url=f"https://{slug}.ac.in",
            # Two approved, one left pending so the admin queue isn't empty and
            # the "awaiting verification" state is demonstrable.
            is_verified=(index < 2),
            verified_at=created + timedelta(days=1) if index < 2 else None,
            verified_by_id=cast["admin"].id if index < 2 else None,
            notes=(
                "Affiliation confirmed against the institution's published "
                "placement-cell contact."
                if index < 2 else None
            ),
            created_at=created,
            updated_at=created,
        )
        db.add(partner)
        made += 1
        if index < 2:
            verified += 1

    db.commit()

    # ── Employer verification requests on private repos ─────────────────────
    from app.verification import scoring
    from app.verification.scoring import BuildSignals, compute_build_score

    ev_svc = EmployerVerificationService(db)
    builders = cast["builders"]
    requesters = [cast["recruiter"], cast["founder2"], cast["incubator"]]

    request_specs = [
        {
            "role": "Backend Engineering Intern",
            "company": "Fold Systems",
            "message": (
                "We're hiring two backend interns for a payments team. Your public "
                "listing is strong, but the role is API-heavy — if you have a private "
                "repo that shows service design and testing under load, a verified "
                "report on it would carry real weight with our panel."
            ),
            "looking_for": "Something with real backend and test coverage",
            "outcome": "fulfilled",
            "repo": "private-api-gateway",
            "quality": "strong",
        },
        {
            "role": "Full-stack Developer (New Grad)",
            "company": "Meridian Labs",
            "message": (
                "Saw your campus leaderboard placement. We don't need the code — "
                "just an independent read on a project you're proud of that isn't "
                "public. Verified score is enough for us to move you to the final round."
            ),
            "looking_for": "Anything production-facing",
            "outcome": "fulfilled",
            "quality": "mid",
            "repo": "internal-dashboard",
        },
        {
            "role": "ML Engineering Intern",
            "company": "Fold Systems",
            "message": (
                "Following up on your profile. If you have private research code "
                "you'd be willing to have scored, it would help us assess depth."
            ),
            "looking_for": "Model training or data pipeline work",
            "outcome": "pending",
        },
        {
            "role": "Platform Engineer",
            "company": "Meridian Labs",
            "message": (
                "We'd like a verified read on private infrastructure work if you "
                "have any. Entirely optional — happy to proceed on your public work."
            ),
            "looking_for": "Infra, CI or deployment tooling",
            "outcome": "declined",
        },
    ]

    requests_made = 0
    fulfilled = 0
    for index, spec in enumerate(request_specs):
        builder = builders[index]
        requester = requesters[index % len(requesters)]
        created = NOW - timedelta(days=rng.randint(4, 30))

        try:
            row = ev_svc.request(
                requester,
                builder_id=builder.id,
                role_title=spec["role"],
                message=spec["message"],
                company=spec["company"],
                looking_for=spec.get("looking_for"),
            )
        except Exception:
            continue
        row.created_at = created
        row.updated_at = created
        requests_made += 1

        if spec["outcome"] == "fulfilled":
            # Score a synthetic private repo with the REAL engine. The service's
            # own `fulfil` needs a live GitHub token, which a seed cannot have, so
            # the report is produced by the same `compute_build_score` call the
            # service makes and stored in the identical shape.
            is_strong = spec["quality"] == "strong"
            signals = BuildSignals(
                repo_created_at=NOW - timedelta(days=520 if is_strong else 240),
                repo_pushed_at=NOW - timedelta(days=6 if is_strong else 48),
                is_fork=False,
                has_license=is_strong,
                has_description=True,
                topics_count=4 if is_strong else 1,
                stars=0, forks=0, open_issues=3 if is_strong else 1,
                readme_length=2400 if is_strong else 320,
                commit_dates=_commit_dates(
                    rng,
                    count=180 if is_strong else 44,
                    span_days=430 if is_strong else 150,
                    end_days_ago=6 if is_strong else 48,
                    regular=is_strong,
                ),
                commit_history_complete=False if is_strong else True,
                contributors_count=3 if is_strong else 1,
                top_contributor_share=0.62 if is_strong else 0.97,
                ownership_verified=True,
                hackathon_verified=False,
            )
            result = compute_build_score(signals)

            profile = db.query(Profile).filter(Profile.user_id == builder.id).first()
            handle = getattr(profile, "github_username", None) or "builder"
            row.repo_full_name = f"{handle}/{spec['repo']}"
            row.verified_build_score = result.verified_build_score
            row.builder_note = (
                "This is the private repo behind the internal tool I mentioned. "
                "Happy to walk through the architecture on a call."
            )
            row.report = {
                "verified_build_score": result.verified_build_score,
                "confidence": result.confidence,
                "reasoning": result.reasoning,
                "repo_age_days": result.repo_age_days,
                "commits_analyzed": result.commits_analyzed,
                "contributors_count": result.contributors_count,
                "fraud_flags": list(result.fraud_flags),
                "components": [
                    {
                        "key": s["key"],
                        "label": s["label"],
                        "weight": s["weight"],
                        "score": getattr(
                            result,
                            s["field"] if s["field"].endswith("_score")
                            else f"{s['key']}_score",
                            None,
                        ),
                        "explains": s["explains"],
                    }
                    for s in scoring.COMPONENT_SPEC
                ],
                "flags": [
                    {"key": f, **scoring.FLAG_SPEC.get(f, {})}
                    for f in result.fraud_flags
                ],
                "threshold": scoring.VERIFIED_THRESHOLD,
                "meets_threshold": (
                    result.verified_build_score >= scoring.VERIFIED_THRESHOLD
                    and not (scoring.DISQUALIFYING_FLAGS & set(result.fraud_flags))
                ),
                "repo_is_private": True,
                "generated_at": _iso(created + timedelta(days=2)),
            }
            row.status = "fulfilled"
            row.fulfilled_at = created + timedelta(days=2)
            row.report_code = f"VR-{uuid.uuid4().hex[:8].upper()}"
            fulfilled += 1
        elif spec["outcome"] == "declined":
            row.status = "declined"
            row.builder_note = (
                "Thanks — my private repos are client work under NDA, so I can't "
                "have them scored. Happy to talk through my public projects instead."
            )

    db.commit()

    total_partners = db.query(func.count(CollegePartner.id)).scalar() or 0
    total_requests = db.query(func.count(EmployerVerificationRequest.id)).scalar() or 0
    return {
        "partners": int(total_partners),
        "verified_partners": verified,
        "requests": int(total_requests),
        "fulfilled": fulfilled,
    }


# ══════════════════════════════════════════════════════════════════════════════
# Entry point — must be the LAST thing in this file
# ══════════════════════════════════════════════════════════════════════════════
# Every section function has to be defined before `main()` runs. Python evaluates
# a module top to bottom, so an entry point placed mid-file calls into names that
# do not exist yet.

if __name__ == "__main__":
    main()
