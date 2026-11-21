"""
Dependency and licence risk scanning.

Pure functions over manifest text. No network, no DB, no clock — the same
manifest always produces the same findings, which is what lets the seed
demonstrate this against real parsed data and lets tests assert on it.

## Scope, stated honestly

Three checks run here, and they are not equally strong:

1. **Licence risk** — strongest. Copyleft obligations are a property of the
   licence identifier itself, so classifying `GPL-3.0` as strong copyleft is a
   fact, not a guess. The one inference is *which* licence a dependency carries,
   which we only know when the manifest declares it.

2. **Abandonment** — medium. Driven by a curated list of packages that are
   publicly deprecated or superseded, plus manifest-level staleness signals.
   A package missing from the list is not thereby healthy; it is unknown.

3. **Known vulnerabilities** — weakest, and labelled as such everywhere it
   surfaces. This is a small curated advisory set of widely-documented issues
   with checkable version ranges, NOT a live feed. Real coverage needs an
   advisory database (OSV, GitHub Advisories) queried at scan time. Claiming
   "no vulnerabilities found" from a curated list would be a lie, so the result
   carries `advisory_source` and `is_complete_scan=False` and the UI says so.

Getting this wrong in the confident direction is worse than not shipping it: a
buyer who trusts a clean bill of health that was never actually checked has been
actively misled.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

ADVISORY_SOURCE = "curated-static-set"

# ── Licence classification ────────────────────────────────────────────────────
# Grouped by the obligation they impose on someone who *sells* a derived work,
# because that is the decision a CodeBazaar buyer is actually making.

STRONG_COPYLEFT = {
    "gpl-2.0", "gpl-3.0", "gpl-2.0-only", "gpl-3.0-only", "gpl-2.0-or-later",
    "gpl-3.0-or-later", "agpl-3.0", "agpl-3.0-only", "agpl-3.0-or-later",
    "gpl", "agpl", "sspl-1.0",
}
WEAK_COPYLEFT = {
    "lgpl-2.1", "lgpl-3.0", "lgpl-2.1-only", "lgpl-3.0-only", "lgpl",
    "mpl-2.0", "mpl-1.1", "epl-1.0", "epl-2.0", "cddl-1.0", "cddl-1.1",
}
PERMISSIVE = {
    "mit", "apache-2.0", "bsd-2-clause", "bsd-3-clause", "isc", "0bsd",
    "unlicense", "cc0-1.0", "zlib", "wtfpl", "bsl-1.0", "python-2.0",
    "postgresql", "artistic-2.0",
}
NON_COMMERCIAL = {
    "cc-by-nc-4.0", "cc-by-nc-sa-4.0", "cc-by-nd-4.0", "jrl", "aladdin",
}

LICENCE_OBLIGATIONS = {
    "strong_copyleft": (
        "Distributing a product built on this requires releasing your own source "
        "under the same licence. For a project being sold as a commercial "
        "starting point, this is the single most expensive thing to discover late."
    ),
    "weak_copyleft": (
        "Modifications to the library itself must be published, but linking from "
        "closed source is generally permitted. Usually workable, worth knowing."
    ),
    "non_commercial": (
        "The licence forbids commercial use outright. A project that ships this "
        "cannot legally be resold or run as a paid product without replacing it."
    ),
    "unknown": (
        "No licence declared. Absence of a licence is not permission — by default "
        "the code is all-rights-reserved and cannot be safely redistributed."
    ),
}


def classify_licence(raw: str | None) -> str:
    """Map a licence string to an obligation class.

    Returns one of: permissive | weak_copyleft | strong_copyleft |
    non_commercial | unknown.
    """
    if not raw or not str(raw).strip():
        return "unknown"

    text = str(raw).strip().lower()
    # Strip common noise: "MIT License", "(MIT OR Apache-2.0)", "SEE LICENSE IN ..."
    text = text.replace("licence", "").replace("license", "").strip(" ()[]{}\"'")
    if text.startswith("see "):
        return "unknown"

    # An OR expression lets the consumer pick, so the most permissive arm wins.
    if " or " in text:
        arms = [classify_licence(a) for a in text.split(" or ")]
        for best in ("permissive", "weak_copyleft", "strong_copyleft", "non_commercial"):
            if best in arms:
                return best
        return "unknown"

    # An AND expression means every obligation applies, so the strictest wins.
    if " and " in text:
        arms = [classify_licence(a) for a in text.split(" and ")]
        for worst in ("non_commercial", "strong_copyleft", "weak_copyleft", "permissive"):
            if worst in arms:
                return worst
        return "unknown"

    normalised = re.sub(r"[\s_]+", "-", text).strip("-")
    # "gplv3" / "gpl3" → "gpl-3.0"
    normalised = re.sub(r"^(a?gpl|lgpl)v?(\d)(\.0)?$", r"\1-\2.0", normalised)

    for bucket, name in (
        (NON_COMMERCIAL, "non_commercial"),
        (STRONG_COPYLEFT, "strong_copyleft"),
        (WEAK_COPYLEFT, "weak_copyleft"),
        (PERMISSIVE, "permissive"),
    ):
        if normalised in bucket:
            return name

    # Prefix fallbacks catch versioned variants we didn't enumerate.
    if normalised.startswith("agpl") or normalised.startswith("sspl"):
        return "strong_copyleft"
    if normalised.startswith("gpl"):
        return "strong_copyleft"
    if normalised.startswith("lgpl") or normalised.startswith("mpl"):
        return "weak_copyleft"
    if normalised.startswith("apache") or normalised.startswith("bsd") or normalised.startswith("mit"):
        return "permissive"
    return "unknown"


# ── Curated package intelligence ──────────────────────────────────────────────
# Every entry below is a publicly documented deprecation or advisory. The list is
# small on purpose: an accurate short list beats a long invented one.

ABANDONED_PACKAGES: dict[str, dict] = {
    "request": {"reason": "Fully deprecated in 2020; no longer maintained.", "replacement": "axios / node-fetch / undici"},
    "left-pad": {"reason": "Trivial package, famously unpublished once; superseded by String.prototype.padStart.", "replacement": "native padStart"},
    "istanbul": {"reason": "Superseded by nyc; unmaintained.", "replacement": "nyc"},
    "node-sass": {"reason": "Deprecated in favour of the Dart implementation.", "replacement": "sass"},
    "tslint": {"reason": "Deprecated in 2019 in favour of ESLint.", "replacement": "eslint + typescript-eslint"},
    "bower": {"reason": "Deprecated package manager; recommends npm/yarn.", "replacement": "npm / yarn"},
    "gulp-util": {"reason": "Deprecated by the gulp team.", "replacement": "individual utility modules"},
    "moment": {"reason": "In maintenance mode; the maintainers recommend alternatives for new projects.", "replacement": "date-fns / Day.js / Temporal"},
    "nodemailer-smtp-transport": {"reason": "Folded into nodemailer core.", "replacement": "nodemailer"},
    "nose": {"reason": "Unmaintained Python test runner; does not support modern Python.", "replacement": "pytest"},
    "python-dateutil2": {"reason": "Abandoned fork.", "replacement": "python-dateutil"},
    "distribute": {"reason": "Merged back into setuptools in 2013.", "replacement": "setuptools"},
    "pycrypto": {"reason": "Unmaintained since 2013 with known unpatched issues.", "replacement": "pycryptodome / cryptography"},
    "flask-script": {"reason": "Deprecated; Flask ships its own CLI.", "replacement": "flask CLI"},
    "sklearn": {"reason": "Placeholder package; the real distribution is scikit-learn.", "replacement": "scikit-learn"},
}

# Advisories with checkable version ranges. `fixed_in` is the first safe version.
KNOWN_ADVISORIES: dict[str, list[dict]] = {
    "lodash": [{"id": "CVE-2021-23337", "fixed_in": "4.17.21", "severity": "high", "summary": "Command injection via template."}],
    "minimist": [{"id": "CVE-2021-44906", "fixed_in": "1.2.6", "severity": "critical", "summary": "Prototype pollution."}],
    "event-stream": [{"id": "GHSA-mh6f-8j2x-4483", "fixed_in": "4.0.0", "severity": "critical", "summary": "Malicious code injected in 3.3.6."}],
    "axios": [{"id": "CVE-2023-45857", "fixed_in": "1.6.0", "severity": "moderate", "summary": "Leaks XSRF token to third-party hosts."}],
    "node-fetch": [{"id": "CVE-2022-0235", "fixed_in": "2.6.7", "severity": "high", "summary": "Forwards secure headers across redirects."}],
    "jsonwebtoken": [{"id": "CVE-2022-23540", "fixed_in": "9.0.0", "severity": "high", "summary": "Weak verification allows signature bypass."}],
    "django": [{"id": "CVE-2023-31047", "fixed_in": "4.2.1", "severity": "high", "summary": "Bypass of validation on multi-file upload."}],
    "flask": [{"id": "CVE-2023-30861", "fixed_in": "2.3.2", "severity": "high", "summary": "Cookie may be cached and leaked across requests."}],
    "requests": [{"id": "CVE-2023-32681", "fixed_in": "2.31.0", "severity": "moderate", "summary": "Proxy-Authorization leaked over redirect."}],
    "pyyaml": [{"id": "CVE-2020-14343", "fixed_in": "5.4", "severity": "critical", "summary": "Arbitrary code execution via full_load."}],
    "pillow": [{"id": "CVE-2023-4863", "fixed_in": "10.0.1", "severity": "critical", "summary": "Heap overflow in WebP decoding."}],
    "cryptography": [{"id": "CVE-2023-49083", "fixed_in": "41.0.6", "severity": "moderate", "summary": "NULL dereference when loading PKCS7."}],
    "next": [{"id": "CVE-2024-34350", "fixed_in": "14.1.1", "severity": "moderate", "summary": "Response-splitting via inconsistent header parsing."}],
}


@dataclass
class DependencyFinding:
    """One actionable issue about one declared dependency."""
    package: str
    version: str | None
    kind: str            # "licence" | "abandoned" | "vulnerability"
    severity: str        # "low" | "moderate" | "high" | "critical"
    detail: str
    licence: str | None = None
    licence_class: str | None = None
    advisory_id: str | None = None
    fixed_in: str | None = None
    replacement: str | None = None

    def as_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class DependencyAudit:
    """Result of auditing a project's declared dependencies."""
    dependencies_scanned: int = 0
    manifests_read: list[str] = field(default_factory=list)
    findings: list[DependencyFinding] = field(default_factory=list)
    # Counts by licence obligation class across all declared deps.
    licence_summary: dict[str, int] = field(default_factory=dict)
    # The project's own declared licence, which governs what a buyer may do.
    project_licence: str | None = None
    project_licence_class: str = "unknown"
    # Honesty flags, carried all the way to the UI.
    advisory_source: str = ADVISORY_SOURCE
    is_complete_scan: bool = False
    scanned: bool = False

    def as_dict(self) -> dict:
        return {
            "dependencies_scanned": self.dependencies_scanned,
            "manifests_read": self.manifests_read,
            "findings": [f.as_dict() for f in self.findings],
            "licence_summary": self.licence_summary,
            "project_licence": self.project_licence,
            "project_licence_class": self.project_licence_class,
            "advisory_source": self.advisory_source,
            "is_complete_scan": self.is_complete_scan,
            "scanned": self.scanned,
            "counts": self.counts(),
        }

    def counts(self) -> dict[str, int]:
        out = {"licence": 0, "abandoned": 0, "vulnerability": 0, "blocking": 0}
        for f in self.findings:
            out[f.kind] = out.get(f.kind, 0) + 1
            if f.severity in ("high", "critical"):
                out["blocking"] += 1
        return out


# ── Manifest parsing ──────────────────────────────────────────────────────────

_VERSION_PREFIX = re.compile(r"^[\^~>=<!\s v]*")


def _clean_version(raw: str | None) -> str | None:
    if not raw:
        return None
    text = _VERSION_PREFIX.sub("", str(raw).strip())
    text = text.split(",")[0].split(" ")[0].strip()
    return text or None


def _version_tuple(version: str | None) -> tuple[int, ...] | None:
    """Parse a dotted version into comparable ints, ignoring pre-release tags."""
    if not version:
        return None
    core = re.split(r"[-+]", version, 1)[0]
    parts: list[int] = []
    for chunk in core.split("."):
        digits = re.match(r"^(\d+)", chunk.strip())
        if not digits:
            break
        parts.append(int(digits.group(1)))
    return tuple(parts) if parts else None


def is_version_below(version: str | None, fixed_in: str) -> bool | None:
    """True when `version` is older than `fixed_in`.

    Returns None when the comparison can't be made — an unparseable or absent
    version means "unknown", never "safe". Callers must treat None as
    inconclusive rather than falsy, which is why this is tri-state.
    """
    have = _version_tuple(version)
    want = _version_tuple(fixed_in)
    if have is None or want is None:
        return None
    length = max(len(have), len(want))
    have += (0,) * (length - len(have))
    want += (0,) * (length - len(want))
    return have < want


def parse_manifest(name: str, content: str) -> tuple[dict[str, str | None], str | None]:
    """Extract {package: version} plus the project's own licence from a manifest.

    Unparseable manifests return empty rather than raising: a malformed
    package.json should degrade the audit, not fail the whole analysis run.
    """
    base = name.split("/")[-1]
    deps: dict[str, str | None] = {}
    own_licence: str | None = None

    try:
        if base == "package.json":
            data = json.loads(content)
            for section in ("dependencies", "devDependencies", "peerDependencies"):
                for pkg, ver in (data.get(section) or {}).items():
                    deps[str(pkg).lower()] = _clean_version(ver)
            lic = data.get("license") or data.get("licence")
            if isinstance(lic, dict):
                lic = lic.get("type")
            own_licence = lic if isinstance(lic, str) else None

        elif base in ("requirements.txt", "constraints.txt"):
            for line in content.splitlines():
                line = line.strip()
                if not line or line.startswith(("#", "-", "git+", "http")):
                    continue
                match = re.match(r"^([A-Za-z0-9._\-\[\]]+)\s*([=<>!~]+.*)?$", line)
                if match:
                    pkg = match.group(1).split("[")[0].lower()
                    deps[pkg] = _clean_version(match.group(2))

        elif base == "pyproject.toml":
            own = re.search(r'^\s*license\s*=\s*[\{"]?\s*(?:text\s*=\s*)?"([^"]+)"',
                            content, re.MULTILINE)
            own_licence = own.group(1) if own else None
            # PEP 621 `dependencies = ["fastapi>=0.110", ...]`
            block = re.search(r"dependencies\s*=\s*\[(.*?)\]", content, re.DOTALL)
            if block:
                for entry in re.findall(r'"([^"]+)"', block.group(1)):
                    match = re.match(r"^([A-Za-z0-9._\-\[\]]+)\s*([=<>!~]+.*)?$", entry.strip())
                    if match:
                        deps[match.group(1).split("[")[0].lower()] = _clean_version(match.group(2))
            # Poetry `[tool.poetry.dependencies]` table
            poetry = re.search(
                r"\[tool\.poetry\.dependencies\](.*?)(?:\n\[|\Z)", content, re.DOTALL
            )
            if poetry:
                for line in poetry.group(1).splitlines():
                    match = re.match(r'^\s*([A-Za-z0-9._\-]+)\s*=\s*"?([^"\n]+)"?', line)
                    if match and match.group(1).lower() != "python":
                        deps[match.group(1).lower()] = _clean_version(match.group(2))

        elif base == "Cargo.toml":
            own = re.search(r'^\s*license\s*=\s*"([^"]+)"', content, re.MULTILINE)
            own_licence = own.group(1) if own else None
            block = re.search(r"\[dependencies\](.*?)(?:\n\[|\Z)", content, re.DOTALL)
            if block:
                for line in block.group(1).splitlines():
                    match = re.match(r'^\s*([A-Za-z0-9._\-]+)\s*=\s*"?([^"\n,\}]+)"?', line)
                    if match:
                        deps[match.group(1).lower()] = _clean_version(match.group(2))

        elif base == "go.mod":
            for match in re.finditer(r"^\s+([\w\.\-/]+)\s+v([\w\.\-]+)", content, re.MULTILINE):
                deps[match.group(1).split("/")[-1].lower()] = _clean_version(match.group(2))

        elif base == "Gemfile":
            for match in re.finditer(r"^\s*gem\s+['\"]([^'\"]+)['\"](?:\s*,\s*['\"]([^'\"]+)['\"])?",
                                     content, re.MULTILINE):
                deps[match.group(1).lower()] = _clean_version(match.group(2))

        elif base == "composer.json":
            data = json.loads(content)
            for section in ("require", "require-dev"):
                for pkg, ver in (data.get(section) or {}).items():
                    deps[str(pkg).split("/")[-1].lower()] = _clean_version(ver)
            lic = data.get("license")
            if isinstance(lic, list):
                lic = " OR ".join(str(x) for x in lic)
            own_licence = lic if isinstance(lic, str) else None

        elif base == "pom.xml":
            for match in re.finditer(
                r"<artifactId>([^<]+)</artifactId>\s*<version>([^<]+)</version>", content
            ):
                deps[match.group(1).strip().lower()] = _clean_version(match.group(2))

    except Exception:
        # A manifest we cannot read contributes nothing, which the caller
        # reflects by never claiming a complete scan.
        return {}, None

    deps.pop("", None)
    return deps, own_licence


# ── The audit ─────────────────────────────────────────────────────────────────

def audit_dependencies(
    manifests: dict[str, str],
    *,
    declared_licence: str | None = None,
    dependency_licences: dict[str, str] | None = None,
    has_lockfile: bool = True,
) -> DependencyAudit:
    """Audit declared dependencies for licence, abandonment and advisory risk.

    `manifests` maps path → file content. `dependency_licences` is optional
    per-package licence data (a registry lookup would populate it); without it,
    licence findings are limited to the project's own declared licence, which we
    say explicitly rather than reporting a clean result.
    """
    audit = DependencyAudit()
    all_deps: dict[str, str | None] = {}
    own_licences: list[str] = []

    for path, content in (manifests or {}).items():
        if not content or not str(content).strip():
            continue
        deps, own = parse_manifest(path, content)
        if deps or own:
            audit.manifests_read.append(path.split("/")[-1])
        all_deps.update(deps)
        if own:
            own_licences.append(own)

    audit.scanned = bool(audit.manifests_read)
    audit.dependencies_scanned = len(all_deps)

    if not audit.scanned:
        return audit

    # ── Project's own licence ────────────────────────────────────────────────
    project_licence = declared_licence or (own_licences[0] if own_licences else None)
    audit.project_licence = project_licence
    audit.project_licence_class = classify_licence(project_licence)

    if audit.project_licence_class == "unknown":
        audit.findings.append(DependencyFinding(
            package="(this project)", version=None, kind="licence", severity="high",
            detail=(
                "This project declares no licence. Without one it is "
                "all-rights-reserved by default, which means a buyer has no "
                "written permission to modify or redistribute what they paid for."
            ),
            licence=project_licence, licence_class="unknown",
        ))
    elif audit.project_licence_class in ("strong_copyleft", "non_commercial"):
        audit.findings.append(DependencyFinding(
            package="(this project)", version=None, kind="licence",
            severity="high" if audit.project_licence_class == "non_commercial" else "moderate",
            detail=(
                f"Project is licensed {project_licence}. "
                + LICENCE_OBLIGATIONS[audit.project_licence_class]
            ),
            licence=project_licence, licence_class=audit.project_licence_class,
        ))

    # ── Per-dependency checks ────────────────────────────────────────────────
    licences = {k.lower(): v for k, v in (dependency_licences or {}).items()}
    summary: dict[str, int] = {}

    for pkg, version in sorted(all_deps.items()):
        # Licence obligation, only when we actually know the licence.
        declared = licences.get(pkg)
        if declared is not None:
            klass = classify_licence(declared)
            summary[klass] = summary.get(klass, 0) + 1
            if klass in ("strong_copyleft", "non_commercial"):
                audit.findings.append(DependencyFinding(
                    package=pkg, version=version, kind="licence",
                    severity="critical" if klass == "non_commercial" else "high",
                    detail=LICENCE_OBLIGATIONS[klass],
                    licence=declared, licence_class=klass,
                ))
            elif klass == "weak_copyleft":
                audit.findings.append(DependencyFinding(
                    package=pkg, version=version, kind="licence", severity="low",
                    detail=LICENCE_OBLIGATIONS[klass],
                    licence=declared, licence_class=klass,
                ))

        # Abandonment.
        if pkg in ABANDONED_PACKAGES:
            info = ABANDONED_PACKAGES[pkg]
            audit.findings.append(DependencyFinding(
                package=pkg, version=version, kind="abandoned", severity="moderate",
                detail=info["reason"], replacement=info.get("replacement"),
            ))

        # Advisories with a checkable range.
        for advisory in KNOWN_ADVISORIES.get(pkg, []):
            below = is_version_below(version, advisory["fixed_in"])
            if below is False:
                continue  # provably patched
            detail = advisory["summary"]
            if below is None:
                # Unpinned: we cannot prove it is affected OR safe. Say that.
                detail += (
                    f" The manifest does not pin a comparable version, so it is "
                    f"unclear whether this project resolves to a patched release "
                    f"(fixed in {advisory['fixed_in']})."
                )
            audit.findings.append(DependencyFinding(
                package=pkg, version=version, kind="vulnerability",
                severity=advisory["severity"] if below else "low",
                detail=detail,
                advisory_id=advisory["id"], fixed_in=advisory["fixed_in"],
            ))

    audit.licence_summary = summary

    # Without a lockfile the resolved tree is not what the manifest says, so no
    # version-based conclusion is reliable.
    if not has_lockfile and all_deps:
        audit.findings.append(DependencyFinding(
            package="(dependency tree)", version=None, kind="vulnerability",
            severity="moderate",
            detail=(
                "No lockfile is committed, so the versions actually installed are "
                "whatever the ranges resolve to on the day of install. Advisory "
                "checks against the manifest can only be indicative."
            ),
        ))

    severity_rank = {"critical": 0, "high": 1, "moderate": 2, "low": 3}
    audit.findings.sort(key=lambda f: (severity_rank.get(f.severity, 9), f.package))

    # A scan is only "complete" with a live advisory feed AND per-package
    # licence data. Neither is wired up, so this stays False and the UI says so.
    audit.is_complete_scan = False
    return audit


def audit_to_risk_factors(audit: DependencyAudit) -> list[tuple[str, int, str]]:
    """Condense an audit into (label, points, detail) tuples for the risk report.

    Returns summary rows, not one row per finding: a risk report with forty
    entries is a list, not an assessment. The per-package detail stays available
    in the audit payload.
    """
    if not audit.scanned:
        return []

    rows: list[tuple[str, int, str]] = []
    counts = audit.counts()

    if audit.project_licence_class == "unknown":
        rows.append((
            "No licence declared", 12,
            "The project has no licence file or manifest licence field, so a buyer "
            "receives no explicit right to use or resell the code.",
        ))
    elif audit.project_licence_class == "non_commercial":
        rows.append((
            "Non-commercial licence", 22,
            f"Licensed {audit.project_licence} — commercial resale is prohibited.",
        ))
    elif audit.project_licence_class == "strong_copyleft":
        rows.append((
            "Copyleft licence obligations", 14,
            f"Licensed {audit.project_licence} — derived products must also be "
            "released under the same terms.",
        ))

    copyleft_deps = [
        f for f in audit.findings
        if f.kind == "licence" and f.licence_class in ("strong_copyleft", "non_commercial")
        and f.package != "(this project)"
    ]
    if copyleft_deps:
        names = ", ".join(f.package for f in copyleft_deps[:3])
        rows.append((
            "Copyleft dependencies", min(20, 6 * len(copyleft_deps)),
            f"{len(copyleft_deps)} dependency/dependencies impose copyleft or "
            f"non-commercial terms ({names}"
            + (", …" if len(copyleft_deps) > 3 else "") + ").",
        ))

    if counts.get("abandoned"):
        names = ", ".join(
            f.package for f in audit.findings if f.kind == "abandoned"
        )
        rows.append((
            "Abandoned dependencies", min(14, 4 * counts["abandoned"]),
            f"{counts['abandoned']} package(s) are deprecated or unmaintained "
            f"({names}) — future security fixes will not arrive.",
        ))

    confirmed_vulns = [
        f for f in audit.findings
        if f.kind == "vulnerability" and f.severity in ("high", "critical")
        and f.advisory_id
    ]
    if confirmed_vulns:
        rows.append((
            "Known vulnerable dependencies", min(24, 8 * len(confirmed_vulns)),
            f"{len(confirmed_vulns)} dependency version(s) match a documented "
            f"advisory ({', '.join(f.package for f in confirmed_vulns[:3])}).",
        ))

    return rows
