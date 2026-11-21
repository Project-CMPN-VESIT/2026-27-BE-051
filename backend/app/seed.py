"""
Idempotent demo seed for CodeBazaar.

    python -m app.seed

Creates a small, realistic dataset so a fresh deploy has something to show:
admin + incubator + two builders, verified projects with build scores, a
completed escrow contract, recomputed reputation, a hackathon claim, referral
attribution + a campus ambassador, and an incubation offer.

Safe to run multiple times — it no-ops if the demo admin already exists.
"""
from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.core.security import hash_password
from app.users.models import User, UserRole
from app.users.repository import UserRepository

logger = get_logger("seed")

SEED_MARKER_EMAIL = "admin@codebazaar.dev"
DEMO_PASSWORD = "Password123!"


def _mk_user(repo: UserRepository, email: str, name: str, role: UserRole,
             college: str | None = None, referred_by=None, ambassador: bool = False) -> User:
    user = repo.create(
        email=email,
        hashed_password=hash_password(DEMO_PASSWORD),
        display_name=name,
        role=role,
        is_verified=True,
        referred_by_id=referred_by,
    )
    if college or ambassador:
        repo.update_profile(user.id, college=college)
    if ambassador:
        repo.update(user, is_campus_ambassador=True)
    return user


def _seed_project(db, repo: "ProjectRepository", owner_id, repo_id: int, full_name: str,
                  title: str, build_score: int, startup_potential: int,
                  for_sale: bool = False, price_paise: int | None = None,
                  sale_type: str | None = None, price_label: str | None = None):
    from app.projects.models import AnalysisStatus, ProjectStage, ProjectStatus
    project = repo.create(
        owner_id=owner_id,
        github_repo_id=repo_id,
        repo_full_name=full_name,
        title=title,
        description=f"{title} — a student-built project on CodeBazaar.",
        stage=ProjectStage.MVP,
        status=ProjectStatus.ACTIVE,
        stars=42,
        primary_language="Python",
        is_verified=True,
        is_for_sale=for_sale,
        price_paise=price_paise,
        sale_type=sale_type,
        price_label=price_label,
    )
    verification = repo.get_verification(project.id)
    repo.update_verification(
        verification,
        verified_build_score=build_score,
        ownership_verified=True,
        originality_score=80,
        activity_consistency=75,
        repo_age_days=210,
        verified_at=datetime.now(timezone.utc).isoformat(),
        notes=f"Seeded verification. Verified Build Score {build_score}/100.",
    )
    analysis = repo.get_analysis(project.id)
    repo.update_analysis(
        analysis,
        status=AnalysisStatus.COMPLETED,
        health_score=80,
        completion_score=70,
        startup_potential=startup_potential,
        impact_potential=72,
        reasoning="Seeded analysis for demo purposes.",
    )
    return project


def run() -> None:
    db = SessionLocal()
    try:
        users = UserRepository(db)
        if users.get_by_email(SEED_MARKER_EMAIL):
            logger.info("Seed skipped — demo data already present")
            print("Already seeded. Nothing to do.")
            return

        # ── Users ─────────────────────────────────────────────────────────────
        _mk_user(users, SEED_MARKER_EMAIL, "Platform Admin", UserRole.ADMIN)
        incubator = _mk_user(users, "incubator@codebazaar.dev", "Acme Incubator", UserRole.INCUBATOR)
        builder1 = _mk_user(users, "aarav@codebazaar.dev", "Aarav Sharma", UserRole.BUILDER,
                            college="IIT Bombay", ambassador=True)
        builder2 = _mk_user(users, "diya@codebazaar.dev", "Diya Patel", UserRole.BUILDER,
                            college="IIT Bombay", referred_by=builder1.id)
        db.commit()

        # ── Projects with verification + analysis ─────────────────────────────
        from app.projects.repository import ProjectRepository
        projects = ProjectRepository(db)
        p1 = _seed_project(db, projects, builder1.id, 900001, "aarav/studybuddy",
                           "StudyBuddy AI", build_score=88, startup_potential=82,
                           for_sale=True, price_paise=1500000, sale_type="source_code",
                           price_label="Full source code + docs")
        _seed_project(db, projects, builder2.id, 900002, "diya/campuseats",
                      "CampusEats", build_score=74, startup_potential=68,
                      for_sale=True, price_paise=800000, sale_type="source_code",
                      price_label="Source code license")
        db.commit()

        # ── Completed escrow contract (client=incubator, builder=builder1) ────
        from app.escrow.service import EscrowService
        from app.escrow.schemas import ContractCreate, MilestoneCreate, MilestoneSubmit
        escrow = EscrowService(db)
        contract = escrow.create_contract(incubator, ContractCreate(
            builder_id=builder1.id, project_id=p1.id, title="Build StudyBuddy v2",
            commission_bps=1000,
            milestones=[
                MilestoneCreate(title="Backend API", amount_paise=1500000),
                MilestoneCreate(title="Frontend", amount_paise=1000000),
            ],
        ))
        escrow._mark_funded(contract)   # simulate funding (no network) for the demo
        db.commit()
        contract = escrow.get_contract(contract.id, incubator)
        for m in contract.milestones:
            escrow.submit_milestone(builder1, m.id, MilestoneSubmit(proof_note="Delivered."))
            escrow.approve_milestone(incubator, m.id)
        db.commit()

        # ── Reputation recompute (now that projects + escrow exist) ───────────
        from app.users.reputation import ReputationService
        ReputationService(db).recompute(builder1.id)
        ReputationService(db).recompute(builder2.id)

        # ── Hackathon claim (analyzed, awaiting admin review) ─────────────────
        from app.hackathon.models import HackathonClaim, HackathonClaimStatus, HackathonPlatform
        claim = HackathonClaim(
            project_id=p1.id, claimed_by_id=builder1.id,
            event_name="HackIndia 2026", platform=HackathonPlatform.DEVFOLIO,
            event_start=datetime(2026, 2, 1, tzinfo=timezone.utc),
            event_end=datetime(2026, 2, 3, tzinfo=timezone.utc),
            status=HackathonClaimStatus.ANALYZED, authenticity_score=86, verdict="likely_authentic",
            signals={"commits_in_window": 14, "commits_before_event": 1, "commits_after_event": 2,
                     "total_commits": 17, "confidence": "high", "flags": []},
            reasoning="14/17 commits fall within the event window — consistent with a genuine build.",
        )
        db.add(claim)
        db.commit()

        # ── Incubation offer (incubator -> builder1's project) ────────────────
        from app.incubation.service import IncubationService
        from app.incubation.schemas import OfferCreate
        from app.incubation.models import OfferType
        IncubationService(db).create_offer(incubator, OfferCreate(
            project_id=p1.id, offer_type=OfferType.FUNDING,
            title="Seed investment", message="₹10L for 10% to scale StudyBuddy.",
            amount_paise=100000000, equity_percent=10,
        ))

        logger.info("Seed complete")
        print("Seed complete. Demo login:")
        print(f"  admin:     {SEED_MARKER_EMAIL} / {DEMO_PASSWORD}")
        print(f"  incubator: incubator@codebazaar.dev / {DEMO_PASSWORD}")
        print(f"  builder:   aarav@codebazaar.dev / {DEMO_PASSWORD}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
