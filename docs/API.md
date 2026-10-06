# API reference

The frontend calls the `/api/v1` routes through the Next.js rewrite. Routes below are shown with that prefix where applicable. The Express backend also mounts some routers without the prefix for direct local use. Authentication uses an HTTP-only JWT cookie; protected routes also accept `Authorization: Bearer <token>`.

All JSON request bodies are validated with zod. Responses use JSON unless noted. Invalid input returns the central error shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body.",
    "details": [],
    "requestId": "..."
  }
}
```

An absent or non-owned resource is returned as 404. Assessment and review routes require owner-scoped access.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/health` | Database health check (`SELECT 1`). | No |
| GET | `/api/v1/health` | Prefixed database health check (`SELECT 1`), suitable for deployment health checks. | No |
| POST | `/api/v1/auth/register` | Register; validates name, email, and password; sets auth cookie. | No |
| POST | `/api/v1/auth/login` | Login; validates credentials, rate-limited, audits success/failure; sets auth cookie. | No |
| POST | `/api/v1/auth/logout` | Clear the auth cookie. | Yes |
| GET | `/api/v1/auth/me` | Return the authenticated user's public profile. | Yes |
| GET | `/auth/me` | Alias for the current-user endpoint when using the unprefixed backend route. | Yes |
| POST | `/api/v1/assessments` | Create an assessment; body `{ "name": "..." }`. | Yes; owner |
| GET | `/api/v1/assessments` | List the user's assessments with latest-run status and staleness. | Yes; owner |
| GET | `/api/v1/assessments/:id` | Get an owned assessment. | Yes; owner |
| DELETE | `/api/v1/assessments/:id` | Delete an owned assessment and its dependent records. | Yes; owner |
| GET | `/api/v1/assessments/:id/status` | Get current document versions, latest run, and stale reasons. | Yes; owner |
| POST | `/api/v1/assessments/:id/documents` | Create or reuse a guideline/application version. JSON body has `kind`, `title`, `content`; multipart uses `kind` and one `file` (`.txt`/`.md`). | Yes; owner |
| GET | `/api/v1/assessments/:id/documents?kind=GUIDELINE\|APPLICATION` | List version metadata without document content. `kind` is optional. | Yes; owner |
| GET | `/api/v1/documents/:versionId` | Read an owned document version, content, and segments. | Yes; owner |
| POST | `/api/v1/assessments/:id/supporting-documents` | Create metadata: `name`, `docType`, `status`; optional `notes`, `requirementId`. | Yes; owner |
| GET | `/api/v1/assessments/:id/supporting-documents` | List supporting-document metadata. | Yes; owner |
| PATCH | `/api/v1/assessments/:id/supporting-documents/:documentId` | Update metadata and/or link to a same-assessment requirement; validates link/type. | Yes; owner |
| DELETE | `/api/v1/assessments/:id/supporting-documents/:documentId` | Delete a supporting-document metadata record. | Yes; owner |
| POST | `/api/v1/assessments/:id/analysis` | Start an asynchronous in-process analysis against current versions; returns `202` and a `RUNNING` run record. | Yes; owner |
| GET | `/api/v1/assessments/:id/analysis/latest` | Get the latest completed analysis and human review fields. | Yes; owner |
| GET | `/api/v1/assessments/:id/analysis/runs` | List analysis runs. | Yes; owner |
| GET | `/api/v1/assessments/:id/analysis/runs/:runId` | Poll an owned run; returns status/error, and includes `analysis` when completed. | Yes; owner |
| PATCH | `/api/v1/requirements/:id/mapping/review` | Confirm, correct, or reject a mapping; a correction requires `reviewerStatus`. Optional reviewer evidence is verified against the run's application version. | Yes; owner |
| PATCH | `/api/v1/requirements/:id/level` | Set `levelOverride` to `MANDATORY`, `RECOMMENDED`, or `null`. | Yes; owner |
| PATCH | `/api/v1/questions/:id` | Update a question's `status` and optional `answer`. | Yes; owner |
| PATCH | `/api/v1/claims/:id` | Set claim review decision to `PENDING`, `CONFIRMED_ISSUE`, or `DISMISSED`. | Yes; owner |
| GET | `/api/v1/assessments/:id/completion` | Get deterministic completion, missing-document, review, citation, and stale metrics. | Yes; owner |
| POST | `/api/v1/assessments/:id/summary` | Build and save a deterministic summary of the latest completed run. | Yes; owner |
| GET | `/api/v1/assessments/:id/summary/latest` | Get latest summary with current `isStale` and reasons. | Yes; owner |
| GET | `/api/v1/summary/:id/export?format=md\|json` | Download stored summary as Markdown (default) or JSON. | Yes; owner |

### Input and behavior notes

- IDs are validated as path parameters before controller dispatch. Request bodies are strict zod objects; unknown fields are rejected.
- Document content is limited to 200,000 characters. Empty documents are rejected. File uploads accept UTF-8 `.txt` and `.md` only.
- A content hash matching the current version returns that version with `unchanged: true` instead of inserting another version.
- Login rate limit is five attempts per 15-minute window per client IP.
- Analysis start returns immediately. Poll its run ID until status is `COMPLETED` or `FAILED`; the worker runs inside the same backend process and is not backed by a durable queue.
- Review mutations are allowed on stale runs; mapping review responses include staleness.
- There is no endpoint to update or delete an individual `DocumentVersion`.
