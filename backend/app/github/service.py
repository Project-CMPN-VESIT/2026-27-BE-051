import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError, UnauthorizedError
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger("github")

GITHUB_API = "https://api.github.com"


class GitHubClient:
    """Thin async wrapper around the GitHub REST API."""

    def __init__(self, access_token: str):
        self._token = access_token
        self._headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def _get(self, path: str, params: dict | None = None) -> Any:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{GITHUB_API}{path}",
                headers=self._headers,
                params=params,
            )
            if resp.status_code == 401:
                raise UnauthorizedError("GitHub token invalid or expired")
            if resp.status_code == 403:
                raise ForbiddenError("GitHub API rate limit exceeded or insufficient scope")
            if resp.status_code == 404:
                raise NotFoundError("GitHub repository")
            resp.raise_for_status()
            return resp.json()

    async def get_authenticated_user(self) -> dict:
        return await self._get("/user")

    async def list_repos(self, page: int = 1, per_page: int = 100) -> list[dict]:
        return await self._get(
            "/user/repos",
            params={
                "sort": "updated",
                "direction": "desc",
                "per_page": per_page,
                "page": page,
                "affiliation": "owner,collaborator",
            },
        )

    async def get_repo(self, full_name: str) -> dict:
        return await self._get(f"/repos/{full_name}")

    async def get_languages(self, full_name: str) -> dict:
        """Returns {language: bytes_count}."""
        return await self._get(f"/repos/{full_name}/languages")

    async def get_contributors(self, full_name: str) -> list[dict]:
        try:
            return await self._get(
                f"/repos/{full_name}/contributors",
                params={"per_page": 30, "anon": "false"},
            )
        except Exception:
            return []

    async def get_commits(self, full_name: str, per_page: int = 30) -> list[dict]:
        try:
            return await self._get(
                f"/repos/{full_name}/commits",
                params={"per_page": per_page},
            )
        except Exception:
            return []

    async def get_readme(self, full_name: str) -> str | None:
        """Fetch raw README content for AI analysis."""
        try:
            import base64
            data = await self._get(f"/repos/{full_name}/readme")
            if data.get("encoding") == "base64":
                return base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            return data.get("content")
        except Exception:
            return None

    async def get_tree(self, full_name: str, branch: str = "HEAD") -> list[dict]:
        """Recursive file tree of a branch.

        Returns a list of {path, type, size}. GitHub truncates very large trees;
        callers should treat the result as a best-effort sample.
        """
        try:
            data = await self._get(
                f"/repos/{full_name}/git/trees/{branch}",
                params={"recursive": "1"},
            )
            return data.get("tree", []) or []
        except Exception:
            return []

    async def get_file_content(self, full_name: str, path: str, max_bytes: int = 20_000) -> str | None:
        """Fetch a single file's text content, skipping anything oversized."""
        try:
            import base64
            data = await self._get(f"/repos/{full_name}/contents/{path}")
            if isinstance(data, list):  # a directory, not a file
                return None
            if (data.get("size") or 0) > max_bytes:
                return None
            if data.get("encoding") == "base64" and data.get("content"):
                raw = base64.b64decode(data["content"])
                return raw.decode("utf-8", errors="replace")
            return data.get("content")
        except Exception:
            return None

    async def verify_ownership(self, full_name: str, github_user_id: int) -> bool:
        """Check that the authenticated user owns the repo."""
        try:
            repo = await self.get_repo(full_name)
            return repo["owner"]["id"] == github_user_id
        except Exception:
            return False

    async def invite_collaborator(self, full_name: str, username: str) -> bool:
        """Invite a user as a collaborator on the repo."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.put(
                f"{GITHUB_API}/repos/{full_name}/collaborators/{username}",
                headers=self._headers,
                json={"permission": "push"},
            )
            return resp.status_code in (201, 204)


def build_project_metadata_from_repo(repo: dict) -> dict:
    """Map GitHub repo dict to our project fields."""
    return {
        "github_repo_id": repo["id"],
        "repo_full_name": repo["full_name"],
        "title": repo.get("name", repo["full_name"].split("/")[-1]),
        "description": repo.get("description"),
        "homepage_url": repo.get("homepage") or None,
        "stars": repo.get("stargazers_count", 0),
        "forks": repo.get("forks_count", 0),
        "open_issues": repo.get("open_issues_count", 0),
        "watchers": repo.get("watchers_count", 0),
        "primary_language": repo.get("language"),
        "topics": repo.get("topics", []),
        "default_branch": repo.get("default_branch", "main"),
        "is_private": repo.get("private", False),
        "github_created_at": repo.get("created_at"),
        "github_pushed_at": repo.get("pushed_at"),
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
    }


def compute_language_distribution(languages: dict) -> list[dict]:
    """Convert GitHub languages dict to our ProjectLanguage list."""
    total = sum(languages.values()) or 1
    return [
        {
            "language": lang,
            "bytes_count": count,
            "percentage": round((count / total) * 100),
        }
        for lang, count in languages.items()
    ]
