from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from app.core.dependencies import get_current_verified_user
from app.core.exceptions import ValidationError
from app.github.service import GitHubClient
from app.users.models import User

router = APIRouter(prefix="/github", tags=["github"])


@router.get("/repos")
async def list_importable_repos(
    page: int = Query(1, ge=1),
    x_github_token: Annotated[str | None, Header()] = None,
    current_user: User = Depends(get_current_verified_user),
):
    """List repositories the authenticated user can import."""
    if not x_github_token:
        raise ValidationError("X-GitHub-Token header required")

    gh = GitHubClient(x_github_token)
    repos = await gh.list_repos(page=page)

    return [
        {
            "id": r["id"],
            "full_name": r["full_name"],
            "name": r["name"],
            "description": r.get("description"),
            "language": r.get("language"),
            "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0),
            "private": r.get("private", False),
            "pushed_at": r.get("pushed_at"),
            "topics": r.get("topics", []),
            "html_url": r.get("html_url"),
        }
        for r in repos
    ]
