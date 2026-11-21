"""Build a code digest for AI analysis.

We read the repository's actual file tree and a bounded sample of source and
config files, then produce:

  * `signals`  — hard, deterministic booleans/counts (tests present, CI present,
                 Docker, lockfile, dependency count, file count). These feed the
                 bug-risk engine, so they must be facts, not guesses.
  * `digest`   — a token-bounded text summary handed to the model, so its
                 analysis is grounded in the real codebase rather than the README.

Everything is best-effort: a private repo, a missing token, or a rate limit
degrades gracefully to an empty digest.
"""
import asyncio
from typing import Any

from app.core.logging import get_logger
from app.github.service import GitHubClient

logger = get_logger("github.digest")

# Files worth reading in full (bounded) because they describe the project's shape.
MANIFEST_FILES = (
    "package.json", "requirements.txt", "pyproject.toml", "Pipfile", "go.mod",
    "Cargo.toml", "pom.xml", "build.gradle", "composer.json", "Gemfile",
)
LOCKFILES = (
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
    "Pipfile.lock", "go.sum", "Cargo.lock", "composer.lock", "Gemfile.lock",
)
CI_MARKERS = (".github/workflows/", ".gitlab-ci.yml", ".circleci/", "azure-pipelines.yml", "Jenkinsfile")
DOCKER_MARKERS = ("dockerfile", "docker-compose.yml", "docker-compose.yaml")
TEST_MARKERS = ("test", "spec", "__tests__")
SOURCE_EXTENSIONS = (
    ".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".rb", ".php",
    ".kt", ".swift", ".c", ".cpp", ".cs", ".vue", ".svelte",
)
# Entry points we prefer to show the model.
ENTRY_HINTS = (
    "main.py", "app.py", "server.py", "index.js", "index.ts", "main.go",
    "main.rs", "app.ts", "main.ts", "src/main", "src/index", "src/app",
)
SKIP_DIRS = (
    "node_modules/", "venv/", ".venv/", "dist/", "build/", "vendor/",
    "site-packages/", ".next/", "target/", "__pycache__/", ".git/",
)

MAX_SOURCE_FILES = 6
MAX_FILE_CHARS = 2_500
MAX_DIGEST_CHARS = 14_000


def _is_skipped(path: str) -> bool:
    lowered = path.lower()
    return any(skip in lowered for skip in SKIP_DIRS)


def _is_test_path(path: str) -> bool:
    lowered = path.lower()
    return any(marker in lowered for marker in TEST_MARKERS)


def analyse_tree(tree: list[dict]) -> dict[str, Any]:
    """Derive hard signals from the file tree alone (no file reads)."""
    files = [
        t for t in tree
        if t.get("type") == "blob" and t.get("path") and not _is_skipped(t["path"])
    ]
    paths = [f["path"] for f in files]
    lowered = [p.lower() for p in paths]

    source_files = [p for p in paths if p.lower().endswith(SOURCE_EXTENSIONS)]
    test_files = [p for p in source_files if _is_test_path(p)]

    has_ci = any(any(m.lower() in p for m in CI_MARKERS) for p in lowered)
    has_docker = any(p.split("/")[-1] in DOCKER_MARKERS for p in lowered)
    has_lockfile = any(p.split("/")[-1] in [l.lower() for l in LOCKFILES] for p in lowered)
    has_readme = any(p.split("/")[-1].startswith("readme") for p in lowered)
    has_env_example = any(".env.example" in p or ".env.sample" in p for p in lowered)
    has_license = any(p.split("/")[-1].startswith("license") for p in lowered)

    top_dirs = sorted({p.split("/")[0] for p in paths if "/" in p})

    return {
        "file_count": len(files),
        "source_file_count": len(source_files),
        "test_file_count": len(test_files),
        "has_tests": len(test_files) > 0,
        "has_ci": has_ci,
        "has_docker": has_docker,
        "has_lockfile": has_lockfile,
        "has_readme": has_readme,
        "has_env_example": has_env_example,
        "has_license": has_license,
        "top_level_dirs": top_dirs[:15],
        "tree_truncated": False,
        "_paths": paths,
        "_source_files": source_files,
    }


def _pick_source_files(source_files: list[str]) -> list[str]:
    """Prefer likely entry points, then shallow files, capped for token budget."""
    scored: list[tuple[int, str]] = []
    for path in source_files:
        if _is_test_path(path):
            continue
        lowered = path.lower()
        score = 0
        if any(hint in lowered for hint in ENTRY_HINTS):
            score -= 100
        score += lowered.count("/") * 2  # shallower files first
        scored.append((score, path))
    scored.sort()
    return [p for _, p in scored[:MAX_SOURCE_FILES]]


def _count_dependencies(manifests: dict[str, str]) -> int:
    """Rough dependency count across whichever manifests exist."""
    import json
    import re

    total = 0
    for name, content in manifests.items():
        if not content:
            continue
        base = name.split("/")[-1]
        try:
            if base == "package.json":
                data = json.loads(content)
                total += len(data.get("dependencies") or {})
                total += len(data.get("devDependencies") or {})
            elif base == "requirements.txt":
                total += len([
                    l for l in content.splitlines()
                    if l.strip() and not l.strip().startswith("#")
                ])
            elif base in ("pyproject.toml", "Cargo.toml", "Pipfile"):
                total += len(re.findall(r"^\s*[\w\-\.]+\s*=", content, re.MULTILINE))
            elif base == "go.mod":
                total += len(re.findall(r"^\s+[\w\.\-/]+\s+v", content, re.MULTILINE))
        except Exception:
            continue
    return total


async def build_code_digest(
    gh: GitHubClient,
    full_name: str,
    branch: str = "HEAD",
) -> dict[str, Any]:
    """Fetch the repo's structure + key files and build signals and a digest."""
    tree = await gh.get_tree(full_name, branch)
    if not tree:
        return {"signals": {}, "digest": None}

    info = analyse_tree(tree)
    paths: list[str] = info.pop("_paths")
    source_files: list[str] = info.pop("_source_files")

    # Read manifests + a sample of source files concurrently.
    manifest_paths = [p for p in paths if p.split("/")[-1] in MANIFEST_FILES][:4]
    chosen_sources = _pick_source_files(source_files)

    fetch_paths = manifest_paths + chosen_sources
    contents: dict[str, str] = {}
    if fetch_paths:
        results = await asyncio.gather(
            *[gh.get_file_content(full_name, p) for p in fetch_paths],
            return_exceptions=True,
        )
        for path, content in zip(fetch_paths, results):
            if isinstance(content, str) and content.strip():
                contents[path] = content

    manifests = {p: contents.get(p, "") for p in manifest_paths}
    info["dependency_count"] = _count_dependencies(manifests)
    info["manifests"] = [p.split("/")[-1] for p in manifest_paths]

    # ── Build the text digest ────────────────────────────────────────────────
    lines: list[str] = []
    lines.append("REPOSITORY STRUCTURE")
    lines.append(
        f"{info['file_count']} files tracked · {info['source_file_count']} source files · "
        f"{info['test_file_count']} test files"
    )
    lines.append(f"Top-level directories: {', '.join(info['top_level_dirs']) or '(flat repo)'}")
    lines.append(
        "Tooling: "
        + ", ".join(filter(None, [
            "tests" if info["has_tests"] else None,
            "CI" if info["has_ci"] else None,
            "Docker" if info["has_docker"] else None,
            "dependency lockfile" if info["has_lockfile"] else None,
            "env example" if info["has_env_example"] else None,
            "license" if info["has_license"] else None,
        ])) or "none detected"
    )
    if info["dependency_count"]:
        lines.append(f"Declared dependencies: ~{info['dependency_count']}")

    sample = [p for p in paths if not _is_skipped(p)][:60]
    lines.append("")
    lines.append("FILE SAMPLE")
    lines.append("\n".join(f"- {p}" for p in sample))

    for path in manifest_paths:
        body = contents.get(path)
        if body:
            lines.append("")
            lines.append(f"--- {path} (manifest) ---")
            lines.append(body[:MAX_FILE_CHARS])

    for path in chosen_sources:
        body = contents.get(path)
        if body:
            lines.append("")
            lines.append(f"--- {path} ---")
            lines.append(body[:MAX_FILE_CHARS])

    digest = "\n".join(lines)[:MAX_DIGEST_CHARS]

    signals = {k: v for k, v in info.items() if not k.startswith("_")}
    logger.info(
        "Code digest built",
        repo=full_name,
        files=signals.get("file_count"),
        has_tests=signals.get("has_tests"),
        has_ci=signals.get("has_ci"),
        read=len(contents),
    )
    # Manifest bodies are returned so the dependency/licence audit can parse
    # package names and versions. They are deliberately NOT folded into
    # `signals`: that dict is persisted and whitelisted for display, and raw
    # file contents have no business in either.
    return {"signals": signals, "digest": digest, "manifests": manifests}


def summarise_commits(commits: list[dict], limit: int = 15) -> str | None:
    """Condense recent commit messages so the model can see how work progressed."""
    if not commits:
        return None
    out: list[str] = []
    for c in commits[:limit]:
        commit = (c or {}).get("commit") or {}
        lines = (commit.get("message") or "").splitlines()
        message = lines[0].strip() if lines else ""
        date = ((commit.get("author") or {}).get("date") or "")[:10]
        if message:
            out.append(f"- {date}: {message[:120]}")
    return "\n".join(out) if out else None
