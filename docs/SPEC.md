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
- AI results will be treated as validated suggestions. Human review decisions will be stored separately, and deterministic application logic will calculate completion.
- Guideline and application documents will be versioned immutably. Any assessment whose latest analysis run references different current document versions will be marked stale.
- The application will present a clear disclaimer and will not make authoritative legal or funding-eligibility decisions.
- This repository is a documentation and folder scaffold only at this stage; implementation, dependencies, persistence technology, and deployment target have not yet been selected.
