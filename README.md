# Grant Application Completeness Assistant

A web application for checking a draft funding application against one supplied grant guideline. It produces a traceable checklist, supports human review, tracks supporting-document metadata, and generates a reproducible completeness summary.

**Principle:** AI suggests and cites; code verifies and scores; a human decides; everything is tied to document versions.

The tool is a workflow aid only. It does not provide legal advice or make a funding-eligibility decision.

## Architecture

```text
Browser
  │
  ▼
Next.js App Router (frontend, TypeScript)
  │ /api/* rewrite; HTTP-only auth cookie
  ▼
Express API (backend, JavaScript ES modules)
  ├── Routes → Controllers → Services → Repositories → Prisma
  ├── Auth, immutable document versions, reviews, deterministic scoring
  └── AI provider → zod-validated structured outputs
                         │
                         ▼
                 PostgreSQL (Supabase)
```

The backend is plain JavaScript ES modules with JSDoc and zod validation. This keeps the required Node/Prisma ESM runtime straightforward while making request and AI-output contracts explicit; TypeScript for the backend is a possible future improvement. The frontend is Next.js App Router with strict TypeScript and API response types. Other frontend libraries include TanStack Query, React Hook Form, zod, Tailwind CSS, lucide-react, and sonner.

For request layering, versioning, citation verification, AI steps, scoring, staleness, and persistence relationships, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). The API reference is [docs/API.md](./docs/API.md).

## Completed scope

- Registration and login using bcrypt and a signed JWT in an HTTP-only cookie; bearer tokens are also accepted by the API.
- Owner-scoped assessment workspaces, with inaccessible assessment data concealed as 404.
- Immutable, numbered guideline and application document versions, segmentation with source offsets, normalized SHA-256 hashes, and stale-run detection.
- Supporting-document metadata management and requirement linking.
- A three-step AI workflow with zod-validated outputs, exact citation verification, retry behavior, and a disclosed deterministic heuristic fallback.
- Human review of mappings, requirement levels, questions, and flagged claims.
- Deterministic mandatory/recommended completion counts and a stored, exportable Markdown/JSON completeness summary.
- Responsive frontend flows for authentication, documents, checklist, questions, claims, supporting documents, and summary.
- Structured request and application logs, audit events, health check, and focused backend tests.

## Intentionally excluded scope

- OCR or conversion of scanned documents.
- Automatic application writing or submission.
- External grant search or grant-database lookup.
- Financial forecasting.
- Legal advice or authoritative funding-eligibility decisions.
- Multiple guidelines or applications in one assessment (each assessment currently has one current guideline and one current application; older versions are retained).
- Asynchronous/background analysis jobs; analysis currently runs synchronously in the request.

## Requirements

- Node.js 20.19 or later.
- npm.
- A PostgreSQL database. The intended hosted setup is a Supabase project.
- For live model calls, an OpenAI-compatible API endpoint, API key, and model. The default heuristic provider works offline without an AI key.

## Local setup

1. **Create a Supabase project.** In its database connection settings, obtain a pooled connection string for runtime (`DATABASE_URL`) and a direct connection string for migrations (`DIRECT_URL`). Use the exact connection strings and SSL parameters supplied by Supabase; do not commit them.

2. **Create environment files from the names-only examples.**

   ```powershell
   Copy-Item .env.example .env
   Copy-Item frontend/.env.example frontend/.env.local
   ```

   Fill in the values locally. Required backend values are `DATABASE_URL` and `JWT_SECRET` (at least 32 characters). Set `DIRECT_URL` for Prisma migration commands and `SEED_DEMO_PASSWORD` before seeding. `COOKIE_SECURE=true` is appropriate when the backend is served over HTTPS. For local HTTP development it can remain false.

   The AI configuration is optional when using the offline default `LLM_PROVIDER=heuristic`. To use the configured live provider, set `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`; `LLM_TIMEOUT_MS` sets the request timeout. The backend retries a live provider once and then reports heuristic fallback if the transport still fails. It does not silently fall back when structured model output remains invalid.

   `frontend/.env.local` needs `BACKEND_URL`, normally `http://localhost:3001`. Next.js rewrites frontend `/api/*` requests to the backend's `/api/v1/*` routes.

3. **Install dependencies, generate Prisma Client, and apply migrations.**

   ```powershell
   npm --prefix backend install
   npm --prefix backend run db:generate
   npm --prefix backend run db:deploy
   ```

   `db:deploy` applies the checked-in migrations using `DIRECT_URL`. For local schema development, `npm --prefix backend run db:migrate` creates and applies a migration.

4. **Seed a demo user.** Set `SEED_DEMO_PASSWORD` in the repository-root `.env`, then run:

   ```powershell
   npm --prefix backend run db:seed
   ```

   The account email is `demo@grants.test`; its password is the local value you set in `SEED_DEMO_PASSWORD`. The seed is idempotent and stores a bcrypt hash.

5. **Install frontend dependencies.**

   ```powershell
   npm --prefix frontend install
   ```

6. **Start the backend and frontend in separate terminals.**

   ```powershell
   npm --prefix backend run dev
   ```

   ```powershell
   npm --prefix frontend run dev
   ```

   Open `http://localhost:3000`. Register a user or sign in with the demo account. Backend health is available at `http://localhost:3001/health`; it executes a database `SELECT 1`, so it reports an error if PostgreSQL is unavailable.

## Example documents

The `fixtures/` directory contains a fictional grant guideline, a deliberately imperfect application draft, and supporting-document metadata:

- [sample-guideline.md](./fixtures/sample-guideline.md)
- [sample-application.md](./fixtures/sample-application.md)
- [sample-supporting-docs.json](./fixtures/sample-supporting-docs.json)

Upload the guideline and application separately in an assessment's Documents tab. The supporting-docs JSON is example metadata to enter in the Supporting docs tab; it is not an automatic import feature.

## Analysis, verification, and scoring

An analysis run is pinned to the current immutable guideline and application version IDs. It asks the configured provider to:

1. Extract requirements from guideline segments, including level/category and source quote.
2. Map each requirement to application evidence, assigning an evidence status and citations.
3. Identify possible unsupported application claims and produce clarification questions.

Every output must parse as JSON and pass zod schemas before the workflow stores it. Documents are treated as untrusted input in prompts; instructions inside them are not followed. Live-provider transport errors are retried once; if both attempts fail, a deterministic heuristic provider runs and the result is marked `heuristic-fallback`. The fallback uses modal-language detection and keyword overlap and should not be treated as equivalent to an LLM.

Citation verification is deterministic and exact: the cited segment ID must exist in the relevant immutable version, the normalized quote must occur in that segment, and the quote must contain at least 12 characters. There is no fuzzy match. Unverified AI evidence cannot satisfy a requirement. Reviewers may correct a mapping and attach evidence, which is checked against the application version used by that run.

The effective status is `REJECTED` → `MISSING`, `CORRECTED` → reviewer status, otherwise AI status. A requirement is satisfied when its effective status is `SUPPORTED` and either a reviewer corrected it or all AI evidence is verified. Confirmed numbers include confirmed/corrected mappings; AI-suggested numbers count only pending mappings with verified `SUPPORTED` evidence. Levels use `levelOverride ?? aiLevel`; mandatory and recommended totals are reported separately. These are workflow metrics, not eligibility determinations.

An assessment is stale when the latest run's guideline or application version ID differs from the respective current version ID. No analysis run is reported as `NO_RUN`. Uploading identical normalized content reuses the current version; changed content creates a new immutable version and causes an older run to be stale.

## Tests and checks

Run backend tests and lint:

```powershell
npm --prefix backend test
npm --prefix backend run lint
```

The Node test suite covers authentication, authorization/ownership, assessment and document version APIs, analysis persistence and failure/fallback behavior, review rules, and deterministic summary/export behavior. Vitest domain tests cover segmentation and offsets, normalized hashing, staleness, citation verification and level signals, and scoring branches.

Run frontend checks:

```powershell
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Known limitations

- Each guideline and application is limited to 200,000 characters. There is no OCR, scanned-PDF ingestion, or general file-format support; uploads accept `.txt` and `.md`.
- Analysis is synchronous and may take up to a minute. Large documents and slow provider responses can exceed hosting request timeouts.
- LLM outputs and classifications can vary. Schema validation and citation checks constrain the outputs but do not make the model's interpretation authoritative.
- The heuristic fallback is intentionally crude: it uses sentence/keyword rules and may miss nuance or misclassify requirements and evidence.
- Assessment deletion has not been validated against a live PostgreSQL database; run/document-version foreign keys include both cascade and restrict actions.
- The sample data is fictional. The application does not establish legal compliance or funding eligibility.

## Deployment

No production deployment target, hosted URL, or deployment pipeline is configured in this repository. A reasonable deployment topology is a Next.js host such as Vercel for the frontend, a Node.js web-service host for the Express backend, and Supabase PostgreSQL. These are deployment options, not a claim that the app is currently deployed or verified on those platforms.

Configure the following environment variables in the appropriate service settings (use the root `.env.example` and `frontend/.env.example` as the authoritative name lists):

- Backend runtime: `NODE_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE`, `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT_MS`.
- Migration job: `DIRECT_URL`.
- One-time seed: `SEED_DEMO_PASSWORD`.
- Frontend build/runtime: `BACKEND_URL`.

Run `npm run db:deploy` as a release/migration step with `DIRECT_URL`; run the backend with `npm start`, and the frontend with `npm run build` then `npm start`. The unauthenticated health endpoint is `GET /health`. Set cookies Secure when the public app uses HTTPS and configure the frontend's `BACKEND_URL` to the reachable backend origin. If a chosen free-tier host suspends idle services, its first request after idle time may have a cold-start delay; check the provider's current plan and limits.

## Secrets

Never commit `.env`, `.env.local`, real API keys, database connection strings, JWT secrets, or demo passwords. The examples contain variable names only. Keep real credentials in local ignored environment files or the deployment provider's secret settings. Do not submit confidential personal, financial, or applicant data to a free model tier unless its current data-use terms are acceptable.

## Disclaimer

**Workflow aid only. Not legal advice and not a funding-eligibility decision.**
