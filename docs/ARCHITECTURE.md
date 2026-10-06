# Architecture

## Application structure and layering

```text
frontend (Next.js App Router, strict TypeScript)
  └── typed fetch /api/* ── Next.js rewrite ──► backend /api/v1/*
                                                   │
backend (Express, JavaScript ES modules)            │
  routes → controllers → services → repositories ──┼──► Prisma 7 → PostgreSQL
                                                   │
                                         AI provider│
                                (OpenAI-compatible or heuristic)
```

The frontend keeps API response types in `frontend/src/lib/types.ts`, uses React Query for server state, and provides authentication, assessment creation/listing, documents/version history, checklist review, questions, claims, supporting-document metadata, and summary/export views.

The backend follows routes → controllers → services → repositories. Routes apply authentication/path validation; controllers parse and serialize HTTP input/output; services coordinate workflows and enforce domain rules; repositories are the only code that imports Prisma. Domain functions are pure where practical. Request-body, provider-output, and review-input contracts are validated with zod. `asyncHandler` forwards rejected controller promises to one error middleware, which returns `{ error: { code, message, details?, requestId } }` without production stack traces.

The backend is JavaScript ESM with JSDoc types; the frontend is Next.js App Router with strict TypeScript. The Prisma schema uses PostgreSQL. Runtime connections use pooled `DATABASE_URL` via Prisma's PostgreSQL driver adapter; Prisma migration commands use `DIRECT_URL` from `prisma.config.js`. Prisma is version 7.10.0. The `prisma-client-js` generator is used to keep generated client code consumable by the no-TypeScript ESM backend; it is deprecated in Prisma 7 but retained for that constraint. Client generation and ESM configuration follow the official [Prisma 7 generator documentation](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators), [Prisma Client setup](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction), [Prisma config reference](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [PostgreSQL driver adapter guide](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql), and [Supabase connection guidance](https://www.prisma.io/docs/orm/overview/databases/supabase).

`GET /health` and `GET /api/v1/health` check the database with `SELECT 1`. The Express app trusts one reverse-proxy hop for the client IP and applies an exact-origin credentialed CORS allowlist from `CORS_ORIGINS`; the frontend's same-origin Next.js rewrite does not require browser CORS. Pino logs request IDs and safe request metadata; document content, passwords, tokens, and provider keys are not logged. Audit events record selected authentication, document, analysis, review, and summary actions. See [docs/API.md](./API.md) for route details.

## Authentication and ownership

Registration and login use bcrypt password hashes and a signed one-hour JWT. The JWT is set as an HTTP-only, `SameSite=Lax` cookie; `COOKIE_SECURE=true` enables `Secure` for HTTPS. Protected endpoints also accept a bearer token. Login is limited to five requests per 15-minute client-IP window. Success/failure events are audited without storing credentials or submitted email addresses. Both unknown users and incorrect passwords receive `Invalid credentials`.

`requireAuth` attaches only public user fields (`id`, `email`, `name`) to `req.user`. Assessment, document-version, supporting-document, analysis, review, and summary accesses are scoped to the authenticated owner in repository/service queries. Missing and non-owned resources return 404 rather than disclosing ownership.

## Document segmentation, versioning, and citations

Each assessment has one current guideline and one current application, while retaining any older versions. `splitDocument(text)` splits blank-line-delimited paragraphs, Markdown headings, and list items into stable per-version segment IDs (`S1`, `S2`, …). Each segment has trimmed text and half-open `start`/`end` offsets into the original text. Empty segments are ignored. Content is capped at 200,000 characters.

Document content hashes use SHA-256 after removing a leading BOM, normalizing line endings, Unicode NFC normalization, and trimming. Uploading content whose normalized hash equals the current version's hash reuses that immutable version; changed content creates a new `DocumentVersion`, advances the current pointer, and records an audit event. There is no individual document-version update/delete API.

AI and reviewer citations refer to segment IDs within the exact immutable document version used by the run. `normalise()` lowercases, collapses whitespace, and maps typographic quotes/dashes to their plain equivalents. `verifyQuote()` succeeds only when the cited segment exists, its normalized text contains the normalized quote, and the quote has at least 12 characters. There is no fuzzy matching. Evidence records per-item verification; AI evidence is counted as satisfied only if it is non-empty and every citation verifies. Requirement source quotes and unsupported-claim quotes are independently checked. Reviewer evidence is verified against the run's application version.

## AI workflow and persistence

An analysis has three structured-output steps:

1. **Extract requirements:** identify guideline requirements with text, category, mandatory/recommended level, document requirement metadata, and source segment/quote.
2. **Map application content:** map each requirement to application evidence, with support status, rationale, and up to three evidence citations.
3. **Find unsupported claims and questions:** flag candidate numerical/outcome claims and create clarification questions for gaps or ambiguity.

Prompt constants are versioned. Prompts mark source documents as untrusted `<document kind="...">` blocks and show segment IDs. AI output must be JSON matching a zod schema before it is used. AI does not trigger actions, determine completion, or make eligibility decisions. AI-generated fields and human review fields are stored separately; review mutations change decision/status/evidence/note fields, not the original AI status, rationale, or evidence.

The provider contract is `completeJson({ system, user })`, returning response text, token usage, provider name, and model. The OpenAI-compatible provider uses the `openai` package and requests JSON mode. Structured parsing accepts plain JSON or fenced JSON, validates with zod, and retries once with validation feedback. Invalid output after that retry raises `AI_OUTPUT_INVALID`. A live-provider transport failure is retried once; if the second transport attempt fails, the three-step run is repeated using the deterministic heuristic provider and is recorded as `heuristic-fallback`. Explicit `LLM_PROVIDER=heuristic` selects the offline provider directly.

The heuristic provider extracts sentences containing modal language, infers categories/document types with keyword rules, maps by keyword overlap (supported at 0.5 or above, partial at 0.25 or above, otherwise missing), excludes clearly negated sentences as positive evidence, asks about unsupported mandatory requirements, and flags numeric/outcome statements. It is a deliberately limited fallback, not equivalent to an LLM.

Starting a run records the current guideline/application version IDs and provider/model/prompt metadata, then returns the run ID with HTTP 202. The analysis executes asynchronously in the same Node process; clients poll `GET /assessments/:id/analysis/runs/:runId`. An assessment-scoped database lock prevents concurrent running jobs. Requirements, mappings, questions, and claims are saved transactionally before the run becomes `COMPLETED`. On failure the run becomes `FAILED` with a user-safe message; technical errors are logged without document text. Run start, completion, and failure create audit events.

This is an in-process worker, not a durable queue. A stopped/restarted process cannot resume an interrupted run. Before listening, the single-instance Render deployment marks previously `RUNNING` records as failed with a safe message and audit event. Keep the backend at one instance unless this recovery and worker coordination are replaced with a multi-instance-safe job system. The frontend polls every two seconds while the run is `RUNNING`.

## Scoring and human review

The effective status of a mapping is:

- `REJECTED` → `MISSING`
- `CORRECTED` → `reviewerStatus` (or `MISSING` if absent)
- `CONFIRMED` or `PENDING` → `aiStatus`

A mapping is satisfied only when its effective status is `SUPPORTED` and either the review decision is `CORRECTED` or all AI evidence is verified. Thus a confirmed mapping still requires verified AI citations; a correction uses the reviewer's status and evidence. Confirmed completion counts mappings in `CONFIRMED` or `CORRECTED` state that satisfy this rule. AI-suggested completion counts only `PENDING` mappings with verified `SUPPORTED` AI evidence.

Requirement level is `levelOverride ?? aiLevel`. Mandatory and recommended totals, confirmed counts, and AI-suggested counts are separate; percentage is zero when the level has no requirements. The completion result also reports outstanding mandatory requirements, pending mapping count, disputed-level count, unverified-citation count, and missing supporting documents. Document types are compared case-insensitively after punctuation/separators are removed. Labels use neutral confirmed-count wording.

Review endpoints allow owners to confirm/correct/reject mappings, override requirement level, answer/dismiss questions, and confirm/dismiss claims. Corrected mappings require `reviewerStatus`; reviewer evidence is checked against the application's immutable run version. Review on stale runs is allowed and the mapping response includes stale state/reasons. Review writes are audited with before/after decision state.

## Reviewed summary

`POST /assessments/:id/summary` builds a stored `ReviewSummary` from database records and deterministic scoring; it never calls an AI provider. It includes assessment and document-version details, run metadata, mandatory/recommended confirmed and suggested counts, requirement review states and verified quotes, outstanding/recommended items, missing documents, open questions, confirmed/pending claims, unreviewed and unverified counts, staleness, and the disclaimer. Pending items are allowed and produce an `N items not yet reviewed` warning. It stores the run's guideline/application version IDs. The content is reproducible from the same persisted state, apart from its generation timestamp. Latest-summary and export responses calculate current staleness against those version IDs.

## Staleness

`isStale({ currentGuidelineVersionId, currentApplicationVersionId }, run)` compares the latest run's version IDs to the assessment's current version IDs. A mismatch yields `GUIDELINE_CHANGED` and/or `APPLICATION_CHANGED`; no run yields `NO_RUN`. Uploading an identical normalized document does not make the assessment stale; creating a changed version does.

## Data model

- **User:** unique email, name, bcrypt password hash, timestamps; owns assessments and may review mappings or generate summaries.
- **Assessment:** owner, name, nullable current guideline/application version pointers, timestamps.
- **DocumentVersion:** assessment, kind, version number, title, immutable content, normalized content hash, JSON segments, creation time; unique per assessment/kind/version number.
- **SupportingDocument:** assessment, name, type, status, optional notes, optional requirement link, timestamps.
- **AnalysisRun:** assessment, exact guideline/application version IDs, status, provider, model, prompt version, safe error text, start/finish times.
- **Requirement:** run, code/text/category, AI level and optional reviewer override, disputed-level marker, source segment/quote/verification, optional required-document metadata.
- **Mapping:** one per requirement; AI status/rationale/evidence and verification separate from review decision, reviewer status/evidence/note, reviewer identity/time.
- **ClarificationQuestion:** run, optional related requirement, question/reason, status and optional answer.
- **UnsupportedClaim:** run, application segment/quote/verification, reason and claim review decision.
- **ReviewSummary:** run, JSON content, exact guideline/application version IDs, generator, creation time.
- **AuditEvent:** optional assessment and actor, action/entity identity, JSON metadata, creation time.

Foreign keys cascade most assessment-owned records. Analysis runs and summaries restrict deletion of the document versions they reference; validate assessment deletion against a real PostgreSQL database before relying on it in production. The test suite uses mocked repositories for this operation and does not prove the database's cascade/restrict behavior.

## Configuration

The backend loads the repository-root `.env`; Prisma CLI configuration loads that same file. Runtime variables are defined in `.env.example`, and frontend `BACKEND_URL` is in `frontend/.env.example`. Examples contain names only. `DATABASE_URL` is required at runtime; `DIRECT_URL` is required for Prisma migrate/deploy. `JWT_SECRET` must be at least 32 characters. Set `LLM_PROVIDER=openai-compatible` only when the base URL, API key, and model are configured. See the root [README](../README.md) for the local setup.

For the Render/Vercel/Supabase deployment checklist, environment variables, seed operation, health verification, and smoke-test script, see [README.md](../README.md#deployment-render-vercel-and-supabase).
