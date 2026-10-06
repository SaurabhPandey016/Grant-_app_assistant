# Project instructions

## Backend

- BACKEND IS PLAIN JAVASCRIPT WITH ES MODULES. `backend/package.json` has `"type": "module"`. Use `import`/`export` only. NEVER use `require()`, `module.exports` or CommonJS. NEVER write TypeScript in `backend/` (no `.ts` files, no type annotations, no `tsconfig`). Relative imports MUST include the `.js` extension (example: `import { env } from './config/env.js'`). There is no `__dirname` in ESM; use `import.meta.url` with `fileURLToPath` when a path is needed. Use default imports for CommonJS packages (`import jwt from 'jsonwebtoken'`). Target Node 20+.
- Document important data shapes with JSDoc `@typedef` comments. Use zod as the runtime contract for all request bodies and ALL AI output.
- Backend uses MVC layering: routes -> controllers -> services -> repositories (only repositories import Prisma). Controllers contain no business logic. Responses go through serializer functions.
- Central error handling: an `AppError` class (`code`, `httpStatus`, `details`), an `asyncHandler` wrapper, and one error middleware returning `{ error: { code, message, details?, requestId } }`. No stack traces in production responses.
- Structured logging with pino including a `requestId`. Never log secrets or full document contents.
- Config from env only, validated at startup with zod. Keep `.env.example` updated (names only).

## Frontend

- FRONTEND is Next.js (App Router) with TypeScript strict mode. Avoid `any`. Keep types in `frontend/src/lib/types.ts` mirroring API responses.

## Design invariants

- AI only returns JSON that code validates; it never triggers actions.
- Every AI citation is verified in code against the cited document segment; unverified evidence never counts as satisfied.
- Completion scores come from pure deterministic functions, never the AI.
- AI output and human review decisions are stored separately; AI output is never overwritten.
- Document versions are immutable.
- The tool never states legal or funding eligibility; always show the disclaimer.

## Quality

- Small functions, descriptive names, and short comments explaining WHY.
- Add unit tests (vitest) for scoring, staleness, citation verification, and segmentation.
- Do not add dependencies without saying why.
