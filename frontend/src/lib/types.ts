export interface User {
  id: string;
  email: string;
  name: string;
}

export type RunStatus = "RUNNING" | "COMPLETED" | "FAILED";

export interface LatestRun {
  id?: string;
  status: RunStatus;
  guidelineVersionId?: string;
  applicationVersionId?: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  startedAt?: string;
  finishedAt?: string | null;
}

export type EvidenceStatus = "SUPPORTED" | "PARTIAL" | "AMBIGUOUS" | "MISSING";

export interface EvidenceQuote {
  segmentId: string;
  quote: string;
  verified: boolean;
}

export interface Mapping {
  id: string;
  requirementCode: string;
  aiStatus: EvidenceStatus;
  rationale: string;
  evidence: EvidenceQuote[];
  allVerified: boolean;
  reviewDecision: "PENDING" | "CONFIRMED" | "CORRECTED" | "REJECTED";
  reviewerStatus: EvidenceStatus | null;
  reviewerEvidence: EvidenceQuote[] | null;
  reviewerNote: string | null;
  reviewedAt: string | null;
}

export interface Requirement {
  id: string;
  code: string;
  text: string;
  category: string;
  aiLevel: "MANDATORY" | "RECOMMENDED";
  levelOverride: "MANDATORY" | "RECOMMENDED" | null;
  levelDisputed: boolean;
  sourceSegmentId: string;
  sourceQuote: string;
  sourceVerified: boolean;
  needsDocument: boolean;
  documentType: string | null;
  mapping: Mapping | null;
}

export interface ClarificationQuestion {
  id: string;
  requirementId: string | null;
  question: string;
  reason: string;
  status: "OPEN" | "ANSWERED" | "DISMISSED";
  answer: string | null;
}

export interface UnsupportedClaim {
  id: string;
  segmentId: string;
  quote: string;
  quoteVerified: boolean;
  reason: string;
  reviewDecision: "PENDING" | "CONFIRMED_ISSUE" | "DISMISSED";
}

export interface AnalysisResult {
  run: LatestRun;
  provider?: string;
  aiUnavailable?: boolean;
  requirements: Requirement[];
  questions: ClarificationQuestion[];
  unsupportedClaims: UnsupportedClaim[];
}

export interface DocumentVersion {
  id: string;
  assessmentId: string;
  kind: "GUIDELINE" | "APPLICATION";
  versionNo: number;
  title: string;
  contentHash?: string;
  createdAt: string;
  content?: string;
  segments?: Array<{ id: string; text: string; start: number; end: number }>;
}

export interface AssessmentStatus {
  assessmentId: string;
  currentGuidelineVersion: DocumentVersion | null;
  currentApplicationVersion: DocumentVersion | null;
  latestRun: LatestRun | null;
  stale: boolean;
  reasons: Array<"GUIDELINE_CHANGED" | "APPLICATION_CHANGED" | "NO_RUN">;
}

export interface CompletionSummary {
  mandatory: {
    total: number;
    confirmedMet: number;
    aiSuggestedMet: number;
    percentConfirmed: number;
    percentWithSuggestions: number;
  };
  recommended: {
    total: number;
    confirmedMet: number;
    aiSuggestedMet: number;
    percentConfirmed: number;
    percentWithSuggestions: number;
  };
  outstandingMandatory: Array<{ code: string; text: string }>;
  pendingReviewCount: number;
  disputedLevelCount: number;
  unverifiedCitationCount: number;
  missingDocuments: Array<{ name: string; docType: string; requirementCode: string | null }>;
  label: string;
  stale: boolean;
  reasons: Array<"GUIDELINE_CHANGED" | "APPLICATION_CHANGED" | "NO_RUN">;
}

export interface SupportingDocument {
  id: string;
  assessmentId: string;
  name: string;
  docType: string;
  status: "PROVIDED" | "MISSING" | "NOT_APPLICABLE";
  notes: string | null;
  requirementId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Assessment {
  id: string;
  name: string;
  currentGuidelineVersionId: string | null;
  currentApplicationVersionId: string | null;
  currentGuidelineVersion?: {
    id: string;
    kind: "GUIDELINE";
    versionNo: number;
    title: string;
    contentHash?: string;
    createdAt?: string;
  } | null;
  currentApplicationVersion?: {
    id: string;
    kind: "APPLICATION";
    versionNo: number;
    title: string;
    contentHash?: string;
    createdAt?: string;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  latestRun?: LatestRun | null;
  stale?: boolean;
  reasons?: Array<"GUIDELINE_CHANGED" | "APPLICATION_CHANGED" | "NO_RUN">;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface ApiUserResponse {
  user: User;
}

export interface ApiAssessmentsResponse {
  assessments: Assessment[];
}

export interface ApiAssessmentResponse {
  assessment: Assessment;
}

export interface ApiAssessmentCreateResponse {
  assessment: Pick<Assessment, "id" | "name">;
}

export type ApiAssessmentStatusResponse = AssessmentStatus;
export interface ApiDocumentsResponse {
  versions: DocumentVersion[];
}
export interface ApiDocumentVersionResponse {
  version: DocumentVersion;
}
export interface ApiCompletionResponse {
  completion: CompletionSummary & {
    run: LatestRun | null;
    disclaimer: string;
  };
}
export interface ApiAnalysisResponse {
  analysis: AnalysisResult;
}
export interface ApiSupportingDocumentsResponse {
  supportingDocuments: SupportingDocument[];
}
