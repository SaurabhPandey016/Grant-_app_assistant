-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocKind" AS ENUM ('GUIDELINE', 'APPLICATION');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReqLevel" AS ENUM ('MANDATORY', 'RECOMMENDED');

-- CreateEnum
CREATE TYPE "ReqCategory" AS ENUM ('ELIGIBILITY', 'SUBMISSION', 'DOCUMENT', 'CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('SUPPORTED', 'PARTIAL', 'AMBIGUOUS', 'MISSING');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('PENDING', 'CONFIRMED', 'CORRECTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupportDocStatus" AS ENUM ('PROVIDED', 'MISSING', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('OPEN', 'ANSWERED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ClaimDecision" AS ENUM ('PENDING', 'CONFIRMED_ISSUE', 'DISMISSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currentGuidelineVersionId" TEXT,
    "currentApplicationVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "kind" "DocKind" NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportingDocument" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "status" "SupportDocStatus" NOT NULL,
    "notes" TEXT,
    "requirementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "guidelineVersionId" TEXT NOT NULL,
    "applicationVersionId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" "ReqCategory" NOT NULL,
    "aiLevel" "ReqLevel" NOT NULL,
    "levelOverride" "ReqLevel",
    "levelDisputed" BOOLEAN NOT NULL DEFAULT false,
    "sourceSegmentId" TEXT NOT NULL,
    "sourceQuote" TEXT NOT NULL,
    "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
    "needsDocument" BOOLEAN NOT NULL DEFAULT false,
    "documentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mapping" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "aiStatus" "EvidenceStatus" NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "allVerified" BOOLEAN NOT NULL DEFAULT false,
    "reviewDecision" "ReviewDecision" NOT NULL DEFAULT 'PENDING',
    "reviewerStatus" "EvidenceStatus",
    "reviewerEvidence" JSONB,
    "reviewerNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClarificationQuestion" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "requirementId" TEXT,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClarificationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnsupportedClaim" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "quoteVerified" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "reviewDecision" "ClaimDecision" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnsupportedClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSummary" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "guidelineVersionId" TEXT NOT NULL,
    "applicationVersionId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "Assessment_userId_updatedAt_idx" ON "Assessment"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Assessment_currentGuidelineVersionId_idx" ON "Assessment"("currentGuidelineVersionId");

-- CreateIndex
CREATE INDEX "Assessment_currentApplicationVersionId_idx" ON "Assessment"("currentApplicationVersionId");

-- CreateIndex
CREATE INDEX "DocumentVersion_assessmentId_kind_createdAt_idx" ON "DocumentVersion"("assessmentId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_contentHash_idx" ON "DocumentVersion"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_assessmentId_kind_versionNo_key" ON "DocumentVersion"("assessmentId", "kind", "versionNo");

-- CreateIndex
CREATE INDEX "SupportingDocument_assessmentId_status_idx" ON "SupportingDocument"("assessmentId", "status");

-- CreateIndex
CREATE INDEX "SupportingDocument_requirementId_idx" ON "SupportingDocument"("requirementId");

-- CreateIndex
CREATE INDEX "AnalysisRun_assessmentId_startedAt_idx" ON "AnalysisRun"("assessmentId", "startedAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_guidelineVersionId_idx" ON "AnalysisRun"("guidelineVersionId");

-- CreateIndex
CREATE INDEX "AnalysisRun_applicationVersionId_idx" ON "AnalysisRun"("applicationVersionId");

-- CreateIndex
CREATE INDEX "AnalysisRun_status_startedAt_idx" ON "AnalysisRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "Requirement_runId_aiLevel_idx" ON "Requirement"("runId", "aiLevel");

-- CreateIndex
CREATE INDEX "Requirement_runId_category_idx" ON "Requirement"("runId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_runId_code_key" ON "Requirement"("runId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Mapping_requirementId_key" ON "Mapping"("requirementId");

-- CreateIndex
CREATE INDEX "Mapping_reviewDecision_updatedAt_idx" ON "Mapping"("reviewDecision", "updatedAt");

-- CreateIndex
CREATE INDEX "Mapping_reviewedById_idx" ON "Mapping"("reviewedById");

-- CreateIndex
CREATE INDEX "ClarificationQuestion_runId_status_idx" ON "ClarificationQuestion"("runId", "status");

-- CreateIndex
CREATE INDEX "ClarificationQuestion_requirementId_idx" ON "ClarificationQuestion"("requirementId");

-- CreateIndex
CREATE INDEX "UnsupportedClaim_runId_reviewDecision_idx" ON "UnsupportedClaim"("runId", "reviewDecision");

-- CreateIndex
CREATE INDEX "ReviewSummary_runId_createdAt_idx" ON "ReviewSummary"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewSummary_guidelineVersionId_idx" ON "ReviewSummary"("guidelineVersionId");

-- CreateIndex
CREATE INDEX "ReviewSummary_applicationVersionId_idx" ON "ReviewSummary"("applicationVersionId");

-- CreateIndex
CREATE INDEX "ReviewSummary_generatedById_idx" ON "ReviewSummary"("generatedById");

-- CreateIndex
CREATE INDEX "AuditEvent_assessmentId_createdAt_idx" ON "AuditEvent"("assessmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_currentGuidelineVersionId_fkey" FOREIGN KEY ("currentGuidelineVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_currentApplicationVersionId_fkey" FOREIGN KEY ("currentApplicationVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportingDocument" ADD CONSTRAINT "SupportingDocument_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportingDocument" ADD CONSTRAINT "SupportingDocument_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_guidelineVersionId_fkey" FOREIGN KEY ("guidelineVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_applicationVersionId_fkey" FOREIGN KEY ("applicationVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnsupportedClaim" ADD CONSTRAINT "UnsupportedClaim_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSummary" ADD CONSTRAINT "ReviewSummary_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSummary" ADD CONSTRAINT "ReviewSummary_guidelineVersionId_fkey" FOREIGN KEY ("guidelineVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSummary" ADD CONSTRAINT "ReviewSummary_applicationVersionId_fkey" FOREIGN KEY ("applicationVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSummary" ADD CONSTRAINT "ReviewSummary_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
