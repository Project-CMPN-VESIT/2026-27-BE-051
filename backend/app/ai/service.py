import json
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger("ai")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


class AIUnavailableError(RuntimeError):
    """No AI provider is configured.

    Distinct from a provider *failure* so callers can tell "the operator hasn't
    set a key" apart from "the model returned nonsense" and say something useful
    to the user instead of showing the same generic error for both.
    """


class AIAnalysisService:
    """Generates project analysis via OpenRouter or the Gemini API.

    Both transports take the same prompts and are asked for raw JSON. Which one
    is used is decided by configuration, not by the caller, so nothing upstream
    has to know or care.
    """

    def __init__(self):
        self._provider = settings.resolved_ai_provider
        self._model = (
            settings.openrouter_model
            if self._provider == "openrouter"
            else settings.gemini_model
        )

    @property
    def available(self) -> bool:
        return bool(self._provider)

    @property
    def model_label(self) -> str:
        return settings.ai_model_label

    async def analyze_project(
        self,
        repo_full_name: str,
        description: str | None,
        readme: str | None,
        languages: list[str],
        stars: int,
        forks: int,
        contributors_count: int,
        topics: list[str],
        github_created_at: str | None,
        github_pushed_at: str | None,
        code_digest: str | None = None,
        commit_summary: str | None = None,
    ) -> dict[str, Any]:
        """
        Returns a dict with all analysis fields.
        Never invents scores without reasoning — all scores include explanations.

        When `code_digest` is supplied the model is grounded in the repository's
        real structure and source excerpts rather than the README alone.
        """
        context = self._build_context(
            repo_full_name=repo_full_name,
            description=description,
            readme=readme,
            languages=languages,
            stars=stars,
            forks=forks,
            contributors_count=contributors_count,
            topics=topics,
            github_created_at=github_created_at,
            github_pushed_at=github_pushed_at,
        )

        if commit_summary:
            context += f"\n\nRECENT COMMITS:\n{commit_summary}"
        if code_digest:
            context += f"\n\n{code_digest}"

        prompt = self._build_prompt(context, has_code=bool(code_digest))

        try:
            raw = await self._call_llm(prompt)
            return self._parse_response(raw)
        except Exception as exc:
            logger.error(
                "AI analysis failed",
                repo=repo_full_name,
                provider=self._provider or "none",
                error=str(exc),
            )
            raise

    async def generate_pitch_deck(
        self,
        title: str,
        repo_full_name: str,
        description: str | None,
        readme: str | None,
        languages: list[str],
        topics: list[str],
        stars: int,
        contributors_count: int,
        analysis_summary: str | None = None,
    ) -> dict[str, Any]:
        """Generate an investor-style pitch deck outline for a project.

        Returns {"tagline": str, "slides": [{title, headline, bullets, speaker_note}]}
        """
        readme_excerpt = (readme or "")[:3000]
        context = f"""
Project: {title} ({repo_full_name})
Description: {description or 'None provided'}
Tech: {', '.join(languages or ['Unknown'])}
Topics: {', '.join(topics or [])}
Stars: {stars} | Contributors: {contributors_count}
Prior analysis: {analysis_summary or 'None'}

README (excerpt):
{readme_excerpt or 'No README found.'}
""".strip()

        prompt = f"""You are a startup pitch coach helping a student founder turn their project into an investor-ready pitch.

Produce a JSON object with EXACTLY this shape:

{{
  "tagline": "<one punchy sentence describing the product>",
  "slides": [
    {{
      "title": "<slide name>",
      "headline": "<the single key message of this slide>",
      "bullets": ["<short point>", "..."],
      "speaker_note": "<what the founder should say out loud>"
    }}
  ]
}}

Produce EXACTLY these 8 slides in this order:
1. Problem
2. Solution
3. How It Works
4. Market Opportunity
5. Traction & Proof
6. Business Model
7. Roadmap
8. The Ask

RULES:
- Ground every claim in the actual project data below. Do NOT invent traction, users, revenue, or funding.
- If real traction data is absent, the Traction slide must describe what HAS been built and what evidence exists (repo activity, contributors, features shipped) — never fabricate metrics.
- Market Opportunity should be reasoned and qualitative unless the data supports numbers. Never invent a specific market size figure.
- Keep bullets under 15 words each. 3-4 bullets per slide.
- Be concrete and honest. An investor will check.

PROJECT DATA:
{context}

Return ONLY valid JSON. No markdown, no preamble."""

        raw = await self._call_llm(prompt)
        clean = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            parsed = json.loads(clean)
        except json.JSONDecodeError as exc:
            logger.error("Pitch deck JSON parse failed", raw=raw[:500], error=str(exc))
            raise ValueError(f"AI returned invalid JSON: {exc}") from exc

        slides = []
        for s in (parsed.get("slides") or [])[:10]:
            if not isinstance(s, dict):
                continue
            bullets = [str(b)[:200] for b in (s.get("bullets") or [])][:6]
            slides.append({
                "title": str(s.get("title", ""))[:120],
                "headline": str(s.get("headline", ""))[:300],
                "bullets": bullets,
                "speaker_note": str(s.get("speaker_note", ""))[:800],
            })

        if not slides:
            raise ValueError("AI returned no usable slides")

        return {
            "tagline": str(parsed.get("tagline", ""))[:300],
            "slides": slides,
            "model_used": self.model_label,
        }

    async def why_buy_summary(
        self,
        *,
        title: str,
        repo_full_name: str,
        description: str | None,
        readme: str | None,
        languages: list[str],
        topics: list[str],
        verified_build_score: int | None,
        is_verified: bool,
        confidence: str | None,
        fraud_flags: list[str],
        commits_analyzed: int | None,
        contributors_count: int | None,
        repo_age_days: int | None,
        price_paise: int | None,
        analysis_summary: str | None = None,
    ) -> dict[str, Any]:
        """A plain-English "why buy this" brief for a listing.

        Grounded in the verification result, not just the README, so the summary
        cannot contradict the score displayed next to it. It is explicitly asked
        to state who should NOT buy — a listing summary that only sells is
        marketing, and a buyer can tell.
        """
        price_line = (
            f"Asking price: Rs {price_paise / 100:,.0f}" if price_paise else "Not priced yet"
        )
        flags_line = ", ".join(fraud_flags) if fraud_flags else "none detected"

        context = f"""
Project: {title} ({repo_full_name})
Description: {description or 'None provided'}
Tech: {', '.join(languages or ['Unknown'])}
Topics: {', '.join(topics or [])}
{price_line}

VERIFICATION RESULT (computed from the repository's real git history):
Verified Build Score: {verified_build_score if verified_build_score is not None else 'not scored'} / 100
Verified status: {'yes' if is_verified else 'no'}
Confidence in the score: {confidence or 'unknown'}
Trust flags: {flags_line}
Commits analysed: {commits_analyzed if commits_analyzed is not None else 'unknown'}
Contributors: {contributors_count if contributors_count is not None else 'unknown'}
Repository age (days): {repo_age_days if repo_age_days is not None else 'unknown'}

Prior technical analysis: {analysis_summary or 'None'}

README (excerpt):
{(readme or '')[:2500] or 'No README found.'}
""".strip()

        prompt = f"""You are writing a short, honest buyer's brief for a listing on a marketplace for verified student-built software. Your reader is a founder, recruiter or small business considering buying this codebase.

Return a JSON object with EXACTLY this shape:

{{
  "summary": "<2-3 sentences on what this is and what a buyer actually gets>",
  "good_for": ["<a concrete use case this suits>", "..."],
  "watch_outs": ["<an honest caveat a buyer should weigh>", "..."],
  "verdict": "<one sentence: who should buy this and who shouldn't>"
}}

RULES:
- Ground everything in the data below. Do NOT invent users, revenue, traction, or features that aren't evidenced.
- The verification result is authoritative. Never contradict it. If the score is low or flags are present, say so plainly in watch_outs — do not soften it.
- If the project is unverified or the score confidence is low, the verdict must reflect that uncertainty.
- "watch_outs" must contain at least one genuine caveat. Every codebase has one. If you cannot find a specific one, say what a buyer cannot tell from the available evidence.
- 2-4 items in each list. Keep each item under 20 words.
- Plain English. No marketing adjectives, no "cutting-edge", no "robust".

PROJECT DATA:
{context}

Return ONLY valid JSON. No markdown, no preamble."""

        raw = await self._call_llm(prompt)
        clean = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            parsed = json.loads(clean)
        except json.JSONDecodeError as exc:
            logger.error("Why-buy JSON parse failed", raw=raw[:400], error=str(exc))
            raise ValueError(f"AI returned invalid JSON: {exc}") from exc

        def _items(key: str) -> list[str]:
            return [str(x)[:200] for x in (parsed.get(key) or []) if str(x).strip()][:4]

        watch_outs = _items("watch_outs")
        if not watch_outs:
            # The model was asked for at least one caveat. A brief with none reads
            # as an advertisement, so state the limitation rather than omitting it.
            watch_outs = [
                "No specific caveat was identified from the available evidence — "
                "review the code before purchase."
            ]

        return {
            "summary": str(parsed.get("summary", ""))[:1200],
            "good_for": _items("good_for"),
            "watch_outs": watch_outs,
            "verdict": str(parsed.get("verdict", ""))[:400],
            "model_used": self.model_label,
        }

    async def refine_slide(
        self,
        *,
        project_title: str,
        project_description: str | None,
        slide: dict,
        instruction: str,
    ) -> dict[str, Any]:
        """Rewrite one slide's prose from a plain-English instruction.

        Returns only headline/bullets/speaker_note. The caller preserves the
        slide's kind and its computed `data`, so an instruction like "make this
        more impressive" can never reach a figure that came from the database.
        """
        current_bullets = "\n".join(f"- {b}" for b in (slide.get("bullets") or []))

        prompt = f"""You are editing one slide of a pitch deck for a software project.

PROJECT: {project_title}
DESCRIPTION: {project_description or 'none provided'}

THE SLIDE AS IT STANDS:
Section: {slide.get('title', '')}
Headline: {slide.get('headline', '')}
Bullets:
{current_bullets or '(none)'}
Speaker note: {slide.get('speaker_note', '')}

THE BUILDER'S INSTRUCTION: {instruction}

Rewrite the slide following that instruction. Return a JSON object with exactly:

{{
  "headline": "<the single key message of this slide>",
  "bullets": ["<short point>", "..."],
  "speaker_note": "<what the founder should say out loud>"
}}

RULES:
- Follow the instruction, but never invent facts. Do not add users, revenue,
  funding, customers, partnerships or metrics that are not already on the slide.
- If the instruction asks you to make claims the data doesn't support, make the
  language sharper instead of making the claims bigger.
- Keep the same section topic. Don't turn a Problem slide into a Solution slide.
- 3-4 bullets, each under 15 words.
- Plain English. No "cutting-edge", "robust", "revolutionary" or similar filler.

Return ONLY valid JSON. No markdown, no preamble."""

        raw = await self._call_llm(prompt)
        clean = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            parsed = json.loads(clean)
        except json.JSONDecodeError as exc:
            logger.error("Slide refine JSON parse failed", raw=raw[:400], error=str(exc))
            raise ValueError(f"AI returned invalid JSON: {exc}") from exc

        return {
            "headline": str(parsed.get("headline", ""))[:300],
            "bullets": [str(b)[:200] for b in (parsed.get("bullets") or [])][:6],
            "speaker_note": str(parsed.get("speaker_note", ""))[:800],
        }

    async def mentor_reply(
        self,
        *,
        question: str,
        history: list[dict],
        project_facts: str,
    ) -> str:
        """Answer a builder's question about their own project.

        Returns prose, not JSON — this is a conversation. The prompt hard-binds
        the model to `project_facts` (the real verification numbers) and forbids
        inventing figures, because the whole value over a generic chatbot is that
        the advice is about *this* repository.
        """
        turns = "\n".join(
            f"{'Builder' if m['role'] == 'user' else 'Mentor'}: {m['content']}"
            for m in history[-8:]
        )

        prompt = f"""You are a senior engineer mentoring a student builder about their own project on CodeBazaar, a marketplace where projects carry a Verified Build Score computed from real git history.

THE PROJECT'S ACTUAL DATA — this is ground truth, use it:
{project_facts}

HOW THE SCORE WORKS (so your advice is actionable):
The composite is a weighted sum of six components: repo maturity 15%, commit
cadence 20%, contributor authenticity 15%, documentation 15%, activity
consistency 20%, originality 15%. Penalties are then subtracted for fraud
signals. Verified status needs a score of 70+, proved GitHub ownership, and no
disqualifying flag (forked_repo, no_commit_history, single_burst_commits).

RULES:
- Ground every answer in the data above. Quote the actual numbers.
- NEVER invent metrics, revenue, users, or scores that aren't given to you.
- When asked how to improve the score, name the specific lowest-scoring
  components and give concrete actions for those, weighted by how much each is
  worth. Don't give a generic checklist.
- Be direct about what can't be fixed quickly: repo maturity depends on age and
  cannot be gamed, so say so rather than implying a shortcut.
- If asked about pricing, reason from the score, the evidence and comparable
  effort. Give a range with reasoning, and say plainly that it's an estimate.
- If the question can't be answered from the data, say what's missing.
- Never suggest fabricating commits, backdating history, or anything that would
  game the score. If asked, say clearly that it's detected and penalised.
- 2-4 short paragraphs. Plain English. No bullet-point walls, no marketing tone.

{f'CONVERSATION SO FAR:{chr(10)}{turns}{chr(10)}' if turns else ''}
Builder's question: {question}

Reply as the mentor, in prose."""

        raw = await self._call_llm_text(prompt)
        return raw.strip()

    async def _call_llm_text(self, prompt: str) -> str:
        """Like _call_llm but without forcing a JSON response format.

        The JSON mode used everywhere else would make a conversational reply come
        back wrapped in a quoted string.
        """
        if not self._provider:
            raise AIUnavailableError(
                "No AI provider configured. Set OPENROUTER_API_KEY (any model, "
                "including google/gemini-3.6-flash) or GEMINI_API_KEY."
            )
        timeout = settings.ai_request_timeout_seconds
        if self._provider == "openrouter":
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    OPENROUTER_URL,
                    headers={
                        "Authorization": f"Bearer {settings.openrouter_api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": settings.frontend_url,
                        "X-Title": "CodeBazaar",
                    },
                    json={
                        "model": self._model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.4,
                        "max_tokens": 900,
                    },
                )
                self._raise_for_provider_error(resp, "OpenRouter")
                data = resp.json()
                try:
                    return data["choices"][0]["message"]["content"]
                except (KeyError, IndexError) as exc:
                    raise ValueError("OpenRouter returned an unexpected response") from exc

        url = GEMINI_URL_TEMPLATE.format(model=self._model)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": settings.gemini_api_key,
                },
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.4, "maxOutputTokens": 900},
                },
            )
            self._raise_for_provider_error(resp, "Gemini")
            data = resp.json()
            try:
                parts = data["candidates"][0]["content"]["parts"]
                return "".join(p.get("text", "") for p in parts)
            except (KeyError, IndexError) as exc:
                raise ValueError("Gemini returned no usable content") from exc

    def _build_context(self, **kwargs) -> str:
        readme_excerpt = (kwargs.get("readme") or "")[:3000]  # Token-safe excerpt
        return f"""
Repository: {kwargs['repo_full_name']}
Description: {kwargs.get('description') or 'None provided'}
Stars: {kwargs['stars']} | Forks: {kwargs['forks']} | Contributors: {kwargs['contributors_count']}
Languages: {', '.join(kwargs.get('languages') or ['Unknown'])}
Topics: {', '.join(kwargs.get('topics') or [])}
Created: {kwargs.get('github_created_at', 'Unknown')}
Last pushed: {kwargs.get('github_pushed_at', 'Unknown')}

README (excerpt):
{readme_excerpt or 'No README found.'}
""".strip()

    def _build_prompt(self, context: str, has_code: bool = False) -> str:
        return f"""You are a senior software architect and startup advisor reviewing a student/developer GitHub project.

Analyze the following project and return a JSON object with EXACTLY these fields:

{{
  "health_score": <integer 0-100>,
  "completion_score": <integer 0-100>,
  "startup_potential": <integer 0-100>,
  "impact_potential": <integer 0-100>,
  "missing_features": [<string>, ...],
  "technical_debt_summary": "<string>",
  "potential_bugs": [
    {{"area": "<component or concern>", "severity": "high|medium|low", "reason": "<why this is likely to break>"}},
    ...
  ],
  "roadmap_steps": [
    {{"step": 1, "title": "<string>", "description": "<string>", "priority": "high|medium|low"}},
    ...
  ],
  "contributor_recommendations": [<skill string>, ...],
  "reasoning": "<string explaining all scores with specific evidence from the project>"
}}

""" + (
    """CODE ACCESS: You have the repository's file tree, dependency manifests and
excerpts from real source files below. Base your scores on the actual code and
structure, not just the README. Cite concrete evidence (file names, missing
tooling, patterns you observe) in the reasoning field.

""" if has_code else ""
) + """SCORING RULES:
- health_score: Based on README quality, last commit date, open issues, test presence, CI/CD signs
- completion_score: Based on README, described features, apparent MVP completeness
- startup_potential: Market size, uniqueness, technical feasibility, user demand signals
- impact_potential: Who benefits and how broadly
- NEVER assign a score without mentioning specific evidence in the reasoning field
- Be honest — a low score with good reasoning is more valuable than a high score with no basis

POTENTIAL BUGS RULES:
""" + (
    """- You HAVE been given the repository structure and excerpts from real source
  files below. Ground your findings in what you actually see: name the file or
  module when you can (e.g. "app/payments/service.py — webhook lacks idempotency").
- You are seeing EXCERPTS, not the whole codebase. Do not cite line numbers and
  do not assert a bug exists in code you were not shown — say what is likely and why.
- Weigh missing safeguards you can verify from the structure: no tests, no CI,
  no input validation in the excerpts, secrets handling, error handling gaps."""
    if has_code else
    """- You are given repo metadata and the README, NOT the source code. Do NOT claim
  to have found specific bugs or cite line numbers or file names.
- Instead, identify areas most LIKELY to contain defects based on the described
  feature set, stack and maturity (e.g. "payment webhook handling — no idempotency mentioned")."""
) + """
- Return 2-5 items. Each reason must be grounded in something observable above.
- If there is too little information, return an empty list rather than guessing.

PROJECT DATA:
{context}

Return ONLY valid JSON. No markdown, no preamble, no explanation outside the JSON."""

    async def _call_llm(self, prompt: str) -> str:
        """Send a prompt to the configured provider and return raw text.

        Both branches request JSON explicitly. Every prompt here ends with
        "Return ONLY valid JSON", but asking at the API level as well is what
        actually stops models wrapping the payload in prose or markdown fences —
        which was the most common cause of a failed analysis.
        """
        if not self._provider:
            raise AIUnavailableError(
                "No AI provider configured. Set OPENROUTER_API_KEY (any model, "
                "including google/gemini-3.6-flash) or GEMINI_API_KEY."
            )

        timeout = settings.ai_request_timeout_seconds
        if self._provider == "openrouter":
            return await self._call_openrouter(prompt, timeout)
        return await self._call_gemini(prompt, timeout)

    async def _call_openrouter(self, prompt: str, timeout: float) -> str:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                OPENROUTER_URL,
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    # OpenRouter attributes usage to these; they are not auth.
                    "HTTP-Referer": settings.frontend_url,
                    "X-Title": "CodeBazaar",
                },
                json={
                    "model": self._model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": 2000,
                    "response_format": {"type": "json_object"},
                },
            )
            self._raise_for_provider_error(resp, "OpenRouter")
            data = resp.json()
            try:
                return data["choices"][0]["message"]["content"]
            except (KeyError, IndexError) as exc:
                raise ValueError(
                    f"OpenRouter returned an unexpected response shape: {str(data)[:300]}"
                ) from exc

    async def _call_gemini(self, prompt: str, timeout: float) -> str:
        """Google's Generative Language API.

        Note the different envelope: no chat "messages", and the key travels in a
        header rather than a bearer token.
        """
        url = GEMINI_URL_TEMPLATE.format(model=self._model)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": settings.gemini_api_key,
                },
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json",
                    },
                },
            )
            self._raise_for_provider_error(resp, "Gemini")
            data = resp.json()
            try:
                parts = data["candidates"][0]["content"]["parts"]
                return "".join(p.get("text", "") for p in parts)
            except (KeyError, IndexError) as exc:
                # A safety block returns candidates without content.
                reason = (
                    data.get("promptFeedback", {}).get("blockReason")
                    or (data.get("candidates") or [{}])[0].get("finishReason")
                    or "unknown"
                )
                raise ValueError(
                    f"Gemini returned no usable content (reason: {reason})"
                ) from exc

    @staticmethod
    def _raise_for_provider_error(resp: httpx.Response, provider: str) -> None:
        """Turn an HTTP failure into something an operator can act on.

        `raise_for_status` alone gives "Client error '401'", which does not say
        whether the key is wrong, the model slug is wrong, or the account is out
        of credit — all of which look identical in the logs otherwise.
        """
        if resp.is_success:
            return

        detail = ""
        try:
            body = resp.json()
            detail = str(body.get("error") or body)[:300]
        except Exception:
            detail = resp.text[:300]

        hint = ""
        if resp.status_code in (401, 403):
            hint = f" Check the {provider} API key."
        elif resp.status_code == 404:
            hint = (
                f" The model may not exist on {provider}. "
                "Verify the model identifier."
            )
        elif resp.status_code == 402:
            hint = f" The {provider} account appears to be out of credit."
        elif resp.status_code == 429:
            hint = f" {provider} rate limit hit; retry shortly."

        raise RuntimeError(
            f"{provider} request failed ({resp.status_code}): {detail}.{hint}"
        )

    @staticmethod
    def _clean_bugs(raw: Any) -> list[dict[str, str]]:
        """Normalise the AI's risk-area list; drop anything malformed."""
        out: list[dict[str, str]] = []
        for item in (raw or [])[:6]:
            if not isinstance(item, dict):
                continue
            area = str(item.get("area", "")).strip()[:120]
            if not area:
                continue
            severity = str(item.get("severity", "medium")).strip().lower()
            if severity not in ("high", "medium", "low"):
                severity = "medium"
            out.append({
                "area": area,
                "severity": severity,
                "reason": str(item.get("reason", "")).strip()[:400],
            })
        return out

    def _parse_response(self, raw: str) -> dict[str, Any]:
        # Strip markdown fences if present
        clean = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            parsed = json.loads(clean)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse AI JSON response", raw=raw[:500], error=str(exc))
            raise ValueError(f"AI returned invalid JSON: {exc}") from exc

        # Validate and clamp scores
        score_fields = ["health_score", "completion_score", "startup_potential", "impact_potential"]
        for field in score_fields:
            val = parsed.get(field)
            if val is not None:
                parsed[field] = max(0, min(100, int(val)))

        return {
            "health_score": parsed.get("health_score"),
            "completion_score": parsed.get("completion_score"),
            "startup_potential": parsed.get("startup_potential"),
            "impact_potential": parsed.get("impact_potential"),
            "missing_features": parsed.get("missing_features", [])[:10],
            "technical_debt_summary": str(parsed.get("technical_debt_summary", ""))[:2000],
            "potential_bugs": {"items": self._clean_bugs(parsed.get("potential_bugs"))},
            "roadmap_steps": {"steps": parsed.get("roadmap_steps", [])[:8]},
            "contributor_recommendations": parsed.get("contributor_recommendations", [])[:8],
            "reasoning": str(parsed.get("reasoning", ""))[:3000],
            "model_used": self.model_label,
        }
