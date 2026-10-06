# Grant Application Completeness Assistant

Backend persistence and a database health endpoint are scaffolded. The application UI and AI assessment workflow have not yet been implemented.

## Backend setup

Requirements: Node.js 20.19+ and a Supabase PostgreSQL project.

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to the Supabase transaction-pooler URL and `DIRECT_URL` to the direct database connection URL (or the Supabase session-pooler URL on port 5432). Set `SEED_DEMO_PASSWORD` to a local demo password, `JWT_SECRET` to a random secret of at least 32 characters, and `COOKIE_SECURE=true` when serving over HTTPS.
3. Install and generate the Prisma Client:

   ```powershell
   npm --prefix backend install
   npm --prefix backend run db:generate
   ```

4. Apply the generated initial migration to Supabase:

   ```powershell
   npm --prefix backend run db:deploy
   ```

5. Seed the demo account and start the API:

   ```powershell
   npm --prefix backend run db:seed
   npm --prefix backend run dev
   ```

Use `npm --prefix backend run db:migrate` to create and apply later development migrations. The database-backed endpoint is `GET http://localhost:3001/health`; it executes `SELECT 1` and responds with an error envelope if PostgreSQL is unavailable.

## Architecture

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for layering, citation verification, scoring, staleness, and the data model. The initial Prisma schema is in `backend/prisma/schema.prisma`; repositories are the only layer that imports Prisma.

## AI provider setup

The app defaults to `LLM_PROVIDER=heuristic`, which runs offline without an API key. For higher-quality live analysis during development, the OpenAI-compatible provider can connect to Google's Gemini API free tier:

1. Sign in to [Google AI Studio](https://aistudio.google.com/).
2. Open [API Keys](https://aistudio.google.com/apikey), create a key for a Google AI Studio project, and copy it.
3. Open the repository-root `.env` file (next to this README) and set:

   ```dotenv
   LLM_PROVIDER=openai-compatible
   LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
   LLM_API_KEY=your-key-here
   LLM_MODEL=gemini-3.8-flash
   LLM_TIMEOUT_MS=30000
   ```

4. Restart the backend. Do not paste API keys into chat, source code, screenshots, or committed files. `.env` is git-ignored; keep the variable names in `.env.example` and leave its values blank.

Google's current [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) describes a free tier with limited model access and quotas, not unlimited or guaranteed-free production capacity. Google also states free-tier content may be used to improve its products. Do not submit confidential applicant, financial, or personal data through that tier unless its current data-use terms are acceptable for those documents. Paid usage, quota limits, model availability, regional availability, and terms can change; check the provider's pricing and policy pages before use. The backend retries the live provider once and then falls back to deterministic heuristic output, reported as `heuristic-fallback`; fallback is not equivalent to an LLM.

## Authentication

Authentication endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /auth/me` (`GET /api/v1/auth/me` is also available). Login accepts either the HTTP-only cookie or a Bearer token. Login success and failure are audited; passwords and email addresses are not written to audit metadata. Login requests are rate-limited.

`GET /api/v1/assessments/:id` demonstrates owner-scoped access: records are queried using both the assessment ID and authenticated user ID, and inaccessible IDs return 404.

Assessment APIs are available at `/assessments` (also `/api/v1/assessments`): create/list assessments, get/delete by ID, retrieve status, add/list immutable guideline and application versions, and manage supporting-document metadata. Document versions are retrievable at `/documents/:versionId` (also `/api/v1/documents/:versionId`). Uploads accept JSON content or multipart `.txt`/`.md` files and are limited to 200,000 characters. Identical normalized content reuses the current version instead of creating another one.

## Scope and limitations

The current implementation includes the Prisma schema and migration, the idempotent demo-user seed, the database health route, registration/login/logout, cookie and Bearer authentication, owner-scoped assessments, immutable document versions, staleness status, and supporting-document metadata. The assessment UI and AI pipeline are not implemented. The tool is not an authoritative legal or funding-eligibility decision.

No real Supabase credentials are committed. Hosting and deployment have not been configured.

## Tests

Run the backend test suite with `npm --prefix backend test`. Node tests cover auth flows, assessment/document API behavior, version immutability, input rejection, and owner isolation. Vitest tests cover segmentation and source offsets, normalized hashing, and each staleness reason. Focused scoring and citation-verification tests will be added with those implementations.

## Deployment

Deployment instructions will be added after a hosting target is selected and configured.
