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
  └── In-process analysis worker → AI provider → zod-validated structured outputs
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
- A durable external job queue; analyses run asynchronously in the backend process and are polled by run ID.

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

   Fill in the values locally. Required backend values are `DATABASE_URL` and `JWT_SECRET` (at least 32 characters). Set `DIRECT_URL` for Prisma migration commands and `SEED_DEMO_PASSWORD` before seeding. `COOKIE_SECURE=true` is appropriate when the backend is served over HTTPS. For local HTTP development it can remain false. `CORS_ORIGINS` is a comma-separated list of exact origins (scheme and hostname, no path); it can be empty for local Next.js rewrite development.

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

   Open `http://localhost:3000`. Register a user or sign in with the demo account. Backend health is available at `http://localhost:3001/health` and `http://localhost:3001/api/v1/health`; it executes a database `SELECT 1`, so it reports an error if PostgreSQL is unavailable.

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

## Deployment: Render, Vercel, and Supabase

Deployment files are provided, but no production project/domain has been configured or deployed from this repository.

### 1. Supabase PostgreSQL

1. Create a Supabase project and wait for the database to be ready.
2. Copy the **transaction pooler** connection string into Render `DATABASE_URL` for API runtime connections.
3. Copy the direct database connection string into Render `DIRECT_URL` for Prisma schema migration commands. Use the connection mode and SSL parameters recommended in the Supabase dashboard.
4. Do not add credentials to this repository or to a frontend environment variable.

### 2. Render backend

1. Create a Render Blueprint from the repository root, using [render.yaml](./render.yaml), or create a Node web service manually with `backend/` as its root directory.
2. The Blueprint build command is `npm ci && npm run db:generate`. Its start command runs `prisma generate`, `prisma migrate deploy`, then `node src/server.js`. Migrations therefore run at service startup and require `DIRECT_URL` to be set in the Render service environment.
3. Configure these backend variables in Render:
   - `NODE_ENV=production`
   - `DATABASE_URL` = Supabase pooled connection URL
   - `DIRECT_URL` = Supabase direct connection URL for migrations
   - `JWT_SECRET` = a randomly generated secret of at least 32 characters (the Blueprint requests a generated value)
   - `COOKIE_SECURE=true`
   - `CORS_ORIGINS=https://<your-vercel-domain>` (comma-separate any additional exact origins; do not include paths or a trailing slash)
   - `LOG_LEVEL=info`
   - `LLM_PROVIDER=heuristic` to start without a paid provider key, or `LLM_PROVIDER=openai-compatible` plus `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` for a live provider. `LLM_TIMEOUT_MS` defaults to 30000 and may be set up to 120000.
   - Render supplies `PORT`. Do not hard-code it.
4. Set the Render health check path to `/api/v1/health`. The app also responds at `/health`; both routes perform a database `SELECT 1`.
5. Use a single Render web-service instance with the current in-process analysis worker. On startup, `RUNNING` runs left by a stopped process are marked failed with a safe message. This is not a durable queue; do not scale the service to multiple instances without replacing/reworking that startup recovery and worker coordination.

The existing idempotent seed is `backend/prisma/seed.js`, run as `npm run db:seed` (or `npm run db:seed:deployed`) from the backend service shell. To seed a demo user safely, provide `SEED_DEMO_PASSWORD` only for the one-off seed execution, then remove it from persistent service environment settings. The seed creates `demo@grants.test`; it does not reset the password of an existing demo account. Do not paste the password into source, logs, or this repository.

### 3. Vercel frontend

1. Import the repository into Vercel and set the project Root Directory to `frontend/`.
2. Set `BACKEND_URL` in Vercel's Environment Variables for each environment that should access the backend. Use the Render service's base HTTPS origin only, for example `https://<render-service>.onrender.com`; omit `/api/v1` and omit the trailing slash.
3. Redeploy after setting or changing `BACKEND_URL`. [next.config.ts](./frontend/next.config.ts) rewrites `/api/:path*` to `${BACKEND_URL}/api/v1/:path*`, so the browser uses same-origin `/api/...` paths and the rewrite forwards requests and auth cookies to Render.
4. Set the Vercel site's exact origin in Render `CORS_ORIGINS` for any direct browser-to-API calls or preflight requests. The current frontend uses the same-origin rewrite. `SameSite=Lax`, `HttpOnly`, and `Secure` cookies are enabled in production; cookie `Path=/` keeps them available to rewritten API requests.

### 4. Verify and smoke-test

1. After Render reports the service healthy, open `https://<render-service>.onrender.com/api/v1/health`; expect JSON with `status: "ok"` and `database: "ok"`.
2. For a seeded test account, set `API_BASE_URL` to the Render base URL, `SMOKE_TEST_EMAIL` to `demo@grants.test`, and `SMOKE_TEST_PASSWORD` to the one-time seed password in a local ignored `.env` file. Alternatively use any account created through the UI.
3. From the repository root, run:

   ```powershell
   npm --prefix backend run smoke:deployment
   ```

   The script checks health, logs in, creates a temporary assessment, uploads the three sample fixture records (guideline, application, and supporting-document metadata), starts analysis and polls its run ID, fetches completion, and deletes the temporary assessment. It prints pass/fail step names, not credentials. If a step fails, it attempts cleanup and reports the API's safe error message.

### Free-tier sleep and uptime

Render Free web services may spin down after a period without inbound requests (historically around 15 minutes) and the first request after sleep can take about a minute to wake the service. Check Render's current free-plan limits before relying on this behavior. An uptime monitor can ping `https://<render-service>.onrender.com/api/v1/health` every 10–14 minutes to reduce idle sleep, subject to Render's current terms and availability; this is not a guaranteed availability mechanism. Health pings also require the database to be reachable. Long-running jobs may be interrupted by service restarts; they are surfaced as failed after the next process starts, not resumed.

## Secrets

Never commit `.env`, `.env.local`, real API keys, database connection strings, JWT secrets, smoke-test passwords, or demo passwords. The examples contain variable names only. Keep real credentials in local ignored environment files or the deployment provider's secret settings. Do not submit confidential personal, financial, or applicant data to a free model tier unless its current data-use terms are acceptable.

## Disclaimer

**Workflow aid only. Not legal advice and not a funding-eligibility decision.**
