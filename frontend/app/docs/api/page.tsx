import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Braces, Clock, KeyRound, ShieldCheck } from "lucide-react";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = {
  title: "Public API",
  description:
    "Query verified build scores and builder reputation programmatically. No authentication required for public trust data.",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Public API documentation.
 *
 * Only documents endpoints that genuinely require no authentication — the trust
 * data. Documenting an endpoint that 401s for the reader would be worse than not
 * documenting it.
 */
export default function ApiDocsPage() {
  return (
    <Container className="py-12 sm:py-16 max-w-3xl">
      <div className="text-eyebrow mb-4 flex items-center gap-2">
        <Braces className="w-3.5 h-3.5 text-primary" /> Public API
      </div>
      <h1 className="text-display-xl">Query verified scores</h1>
      <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
        Trust data is public and unauthenticated. If you run a job board, an
        accelerator pipeline, or a hiring funnel, you can check whether a
        candidate&apos;s project holds up without asking us for a key.
      </p>

      <div className="flex flex-wrap gap-2 mt-6">
        <Badge variant="success">
          <KeyRound className="w-3 h-3" /> No API key needed
        </Badge>
        <Badge variant="ghost">
          <Clock className="w-3 h-3" /> 100 req/min per IP
        </Badge>
        <Badge variant="ghost">JSON + SVG</Badge>
      </div>

      <Alert
        variant="info"
        className="mt-8"
        title="Base URL"
        description={<code className="font-mono text-xs">{API_BASE}</code>}
      />

      {/* ── Endpoints ──────────────────────────────────────────────────── */}

      <Endpoint
        method="GET"
        path="/public/projects/{project_id}/report"
        title="Full trust report"
        description="Everything on the public verification page in one response: the composite score, all six weighted components with their individual contributions, any fraud flags with penalties, confidence level, and the owner's reputation tier."
      >
        <CodeBlock
          language="bash"
          code={`curl ${API_BASE}/public/projects/$PROJECT_ID/report`}
        />
        <CodeBlock
          language="json"
          label="Response (abridged)"
          code={`{
  "project_id": "db0e9c7e-501a-4aba-a08b-6bd5f7f25e97",
  "title": "SafeWalk",
  "repo_full_name": "rohan/safewalk",
  "is_verified": true,
  "verified_build_score": 90,
  "verified_threshold": 70,
  "confidence": "high",
  "ownership_verified": true,
  "commits_analyzed": 251,
  "contributors_count": 6,
  "components": [
    {
      "key": "commit_cadence",
      "label": "Commit cadence",
      "weight": 0.2,
      "score": 100,
      "contribution": 20.0,
      "explains": "Volume of commits and how many distinct days they land on…"
    }
  ],
  "flags": [],
  "total_penalty": 0,
  "owner": { "display_name": "Rohan Desai", "tier": "trusted" }
}`}
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          The components array always contains all six entries. A{" "}
          <code className="font-mono text-xs">null</code> score means that
          component was not recorded (an older verification run), not that it
          scored zero — treat the two differently.
        </p>
      </Endpoint>

      <Endpoint
        method="GET"
        path="/verification/methodology"
        title="The scoring rulebook"
        description="The weights, flag definitions, penalties and threshold the engine actually applies. Served from the engine itself, so it cannot drift from behaviour. Useful if you want to reimplement or audit the scoring."
      >
        <CodeBlock language="bash" code={`curl ${API_BASE}/verification/methodology`} />
        <CodeBlock
          language="json"
          label="Response (abridged)"
          code={`{
  "verified_threshold": 70,
  "components": [
    { "key": "repo_maturity", "weight": 0.15, "explains": "…" },
    { "key": "commit_cadence", "weight": 0.20, "explains": "…" }
  ],
  "flags": [
    { "key": "forked_repo", "severity": "critical", "penalty": 20, "explains": "…" }
  ],
  "disqualifying_flags": ["forked_repo", "no_commit_history", "single_burst_commits"]
}`}
        />
      </Endpoint>

      <Endpoint
        method="GET"
        path="/verification/projects/{project_id}/build-score"
        title="Score only"
        description="A lighter response than the full report when you only need the score and its breakdown, without project or owner metadata."
      >
        <CodeBlock
          language="bash"
          code={`curl ${API_BASE}/verification/projects/$PROJECT_ID/build-score`}
        />
      </Endpoint>

      <Endpoint
        method="GET"
        path="/badge/{project_id}/verified-build.svg"
        title="Badge image"
        description="An SVG badge, safe to hotlink from a README or dashboard. Returns 200 with an 'unscored' badge for unknown projects rather than a 404, so a stale link never renders as a broken image."
      >
        <CodeBlock
          language="markdown"
          label="Markdown"
          code={`[![Verified Build Score](${API_BASE}/badge/$PROJECT_ID/verified-build.svg)](https://codebazaar.dev/verify/$PROJECT_ID)`}
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Query parameters: <code className="font-mono text-xs">style</code>{" "}
          (<code className="font-mono text-xs">flat</code> or{" "}
          <code className="font-mono text-xs">rounded</code>) and{" "}
          <code className="font-mono text-xs">label</code> to override the left-hand
          text. Cached for 10 minutes.
        </p>
      </Endpoint>

      <Endpoint
        method="GET"
        path="/public/stats"
        title="Platform totals"
        description="Aggregate counts and transacted value. Powers the live figures on our own landing page."
      >
        <CodeBlock language="bash" code={`curl ${API_BASE}/public/stats`} />
      </Endpoint>

      <Endpoint
        method="GET"
        path="/users/{user_id}/reputation"
        title="Builder reputation"
        description="Tier, trust score, verified project count and delivery record for a single builder."
      >
        <CodeBlock language="bash" code={`curl ${API_BASE}/users/$USER_ID/reputation`} />
      </Endpoint>

      {/* ── Conventions ────────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-display-md">Conventions</h2>
        <div className="mt-5 space-y-3">
          <Convention title="Money is always paise">
            Every monetary field is an integer in paise, never a float in rupees.{" "}
            <code className="font-mono text-xs">250000</code> is ₹2,500. Currency is
            INR throughout.
          </Convention>
          <Convention title="Scores are integers 0–100">
            Component scores, the composite, and reputation trust scores are all
            integers. <code className="font-mono text-xs">null</code> means not
            recorded, which is distinct from zero.
          </Convention>
          <Convention title="Errors are JSON">
            Failures return{" "}
            <code className="font-mono text-xs">{`{"error": "...", "message": "..."}`}</code>{" "}
            with a human-readable message. Validation failures add a{" "}
            <code className="font-mono text-xs">fields</code> object keyed by field
            name.
          </Convention>
          <Convention title="Rate limits are headered">
            Responses carry{" "}
            <code className="font-mono text-xs">X-RateLimit-Limit</code> and{" "}
            <code className="font-mono text-xs">X-RateLimit-Remaining</code>. A 429
            includes <code className="font-mono text-xs">Retry-After</code> in
            seconds. Badge requests are not rate limited.
          </Convention>
        </div>
      </section>

      {/* ── Worked example ────────────────────────────────────────────── */}
      <section className="mt-14">
        <h2 className="text-display-md">Example: screening a candidate</h2>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Check whether a project a candidate listed on their CV actually holds up.
        </p>
        <CodeBlock
          language="python"
          className="mt-5"
          code={`import requests

BASE = "${API_BASE}"

def screen(project_id: str) -> dict:
    r = requests.get(f"{BASE}/public/projects/{project_id}/report", timeout=10)
    r.raise_for_status()
    report = r.json()

    critical = [f for f in report["flags"] if f["severity"] == "critical"]

    return {
        "project": report["title"],
        "score": report["verified_build_score"],
        "verified": report["is_verified"],
        # A high score with low confidence is weak evidence, not strong evidence.
        "confidence": report["confidence"],
        "ownership_proved": report["ownership_verified"],
        "blocking_issues": [f["label"] for f in critical],
        "weakest_component": min(
            (c for c in report["components"] if c["score"] is not None),
            key=lambda c: c["score"],
            default=None,
        ),
    }`}
        />
        <Alert
          variant="warning"
          className="mt-5"
          title="Read confidence, not just score"
          description="A score of 85 with low confidence was computed from very few signals. Treat confidence as a required field, not a nice-to-have — it's the difference between evidence and a guess."
        />
      </section>

      <section className="mt-14">
        <h2 className="text-display-md">Interactive reference</h2>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          The full OpenAPI schema, including authenticated endpoints, is served by
          the API in non-production environments.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <a href={`${API_BASE}/docs`} target="_blank" rel="noopener noreferrer">
              Swagger UI <ArrowRight className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noopener noreferrer">
              openapi.json
            </a>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/how-verification-works">
              <ShieldCheck className="w-4 h-4" /> Read the methodology
            </Link>
          </Button>
        </div>
      </section>
    </Container>
  );
}

function Endpoint({
  method, path, title, description, children,
}: {
  method: string;
  path: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge variant="brand" className="font-mono">{method}</Badge>
        <code className="font-mono text-sm break-all">{path}</code>
      </div>
      <h2 className="text-display-sm">{title}</h2>
      <p className="mt-2 text-muted-foreground leading-relaxed">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Convention({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="subtle">
      <CardContent className="pt-4">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{children}</p>
      </CardContent>
    </Card>
  );
}
