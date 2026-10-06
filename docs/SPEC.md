# Grant Application Completeness Assistant

## Problem statement

Grant Application Completeness Assistant (Medium, 4-7 hours). Build an application that reviews a draft funding application against a supplied grant guideline.
Inputs: one grant or funding guideline document; one draft application; optional supporting-document metadata.
AI workflow: extract eligibility and submission requirements from the guideline; map application content to each requirement; cite the source supporting every mapping; identify missing, weak, or ambiguous evidence; generate clarification questions; identify claims in the application that are not supported by supplied evidence; distinguish mandatory requirements from recommendations.
Application requirements: calculate checklist completion using deterministic logic; allow the user to confirm, correct, or reject mappings; track missing supporting documents; preserve application and guideline versions; mark the assessment as stale when either document changes; generate a reviewed completeness summary.
The tool must not make an authoritative legal or funding-eligibility decision.
Not required: external grant-database search, application submission, financial forecasting, OCR, or automatic document writing.
General expectations: usable frontend, working backend, basic persistence, functional AI workflow with human review, clear loading/empty/validation/success/failure states, structured logs, focused tests, deployed app, README.md (setup, architecture, completed and excluded scope, tests, limitations, deployment), AGENT_USAGE.md (tools, representative prompts, delegated work, important agent mistakes or rejected suggestions, how output was verified), .env.example (names only, never real secrets). Hosting must stay up until review with AI functionality working.

## Project decisions

- The backend will follow the plain-JavaScript ES module and MVC requirements in `.github/copilot-instructions.md`; the frontend will use Next.js App Router with strict TypeScript.
- Backend request and AI-output contracts use zod; important JavaScript data shapes use JSDoc. Prisma 7.10.0 with PostgreSQL is used for persistence; repositories are the only layer that imports Prisma.
- AI results are validated suggestions. Human review decisions are stored separately, and deterministic domain code calculates completion.
- Guideline and application documents are versioned immutably. An assessment is marked stale when its latest run references different current document versions.
- The application presents a clear disclaimer and does not make authoritative legal or funding-eligibility decisions.
- The implemented AI providers are an OpenAI-compatible provider and a deterministic offline heuristic provider. Live AI configuration is optional.
- Hosting has not been selected or configured in this repository; deployment platforms described in the README are options, not a deployed environment.
