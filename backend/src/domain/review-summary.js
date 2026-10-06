import {
  computeCompletion,
  confirmedSatisfied,
  effectiveLevel,
  effectiveStatus,
} from './scoring.js';
import { isStale } from './staleness.js';

export const REVIEW_SUMMARY_DISCLAIMER =
  'This summary is a workflow aid. It does not provide legal advice and is not a funding-eligibility decision.';

/**
 * Creates a reproducible summary from persisted analysis and review records.
 * @param {{
 *  assessment: { id: string, name: string, currentGuidelineVersionId: string | null, currentApplicationVersionId: string | null },
 *  run: object,
 *  guidelineVersion: { id: string, title: string, versionNo: number },
 *  applicationVersion: { id: string, title: string, versionNo: number },
 *  requirements: object[],
 *  supportingDocuments: object[],
 *  questions: object[],
 *  claims: object[],
 *  generatedAt: Date
 * }} source
 */
export function buildReviewSummary(source) {
  const completion = computeCompletion(source.requirements, source.supportingDocuments);
  const staleness = isStale(source.assessment, source.run);
  const requirements = source.requirements.map((requirement) => {
    const mapping = requirement.mapping;
    const aiEvidence = verifiedQuotes(mapping?.evidence, 'AI');
    const reviewerEvidence = verifiedQuotes(mapping?.reviewerEvidence, 'REVIEWER');
    return {
      code: requirement.code,
      text: requirement.text,
      level: effectiveLevel(requirement),
      aiLevel: requirement.aiLevel,
      levelOverride: requirement.levelOverride ?? null,
      levelDisputed: requirement.levelDisputed,
      effectiveStatus: mapping ? effectiveStatus(mapping) : 'MISSING',
      reviewDecision: mapping?.reviewDecision ?? 'PENDING',
      reviewerNote: mapping?.reviewerNote ?? null,
      verifiedEvidenceQuotes: [...aiEvidence, ...reviewerEvidence],
      sourceVerified: requirement.sourceVerified,
    };
  });

  const pendingMappingCount = source.requirements.filter(
    (requirement) => !requirement.mapping || requirement.mapping.reviewDecision === 'PENDING',
  ).length;
  const openQuestionCount = source.questions.filter((question) => question.status === 'OPEN').length;
  const pendingClaimCount = source.claims.filter((claim) => claim.reviewDecision === 'PENDING').length;
  const unreviewed = {
    mappings: pendingMappingCount,
    questions: openQuestionCount,
    unsupportedClaims: pendingClaimCount,
    total: pendingMappingCount + openQuestionCount + pendingClaimCount,
  };
  const unverifiedCitationCount = source.requirements.reduce((count, requirement) => {
    const mapping = requirement.mapping;
    const aiEvidence = Array.isArray(mapping?.evidence) ? mapping.evidence : [];
    const reviewerEvidenceList = Array.isArray(mapping?.reviewerEvidence)
      ? mapping.reviewerEvidence
      : [];
    return count
      + Number(requirement.sourceVerified !== true)
      + aiEvidence.filter((evidence) => evidence?.verified !== true).length
      + reviewerEvidenceList.filter((evidence) => evidence?.verified !== true).length;
  }, source.claims.filter((claim) => claim.quoteVerified !== true).length);
  const notConfirmed = (requirement) => (
    !requirement.mapping || !confirmedSatisfied(requirement.mapping)
  );

  return {
    assessment: { id: source.assessment.id, name: source.assessment.name },
    documents: {
      guideline: {
        id: source.guidelineVersion.id,
        title: source.guidelineVersion.title,
        versionNo: source.guidelineVersion.versionNo,
      },
      application: {
        id: source.applicationVersion.id,
        title: source.applicationVersion.title,
        versionNo: source.applicationVersion.versionNo,
      },
    },
    run: {
      id: source.run.id,
      provider: source.run.provider,
      model: source.run.model,
      promptVersion: source.run.promptVersion,
      date: (source.run.finishedAt ?? source.run.startedAt).toISOString(),
      heuristicFallback: source.run.provider === 'heuristic-fallback',
    },
    completion: {
      mandatory: completion.mandatory,
      recommended: completion.recommended,
      label: completion.label,
    },
    requirements,
    outstandingMandatory: source.requirements
      .filter((requirement) => (
        effectiveLevel(requirement) === 'MANDATORY' && notConfirmed(requirement)
      ))
      .map(({ code, text }) => ({ code, text })),
    recommendedNotMet: source.requirements
      .filter((requirement) => (
        effectiveLevel(requirement) === 'RECOMMENDED' && notConfirmed(requirement)
      ))
      .map(({ code, text }) => ({ code, text })),
    missingSupportingDocuments: completion.missingDocuments,
    openClarificationQuestions: source.questions
      .filter((question) => question.status === 'OPEN')
      .map((question) => ({
        id: question.id,
        requirementCode: question.requirement?.code ?? null,
        question: question.question,
        reason: question.reason,
      })),
    unsupportedClaims: {
      confirmedIssues: source.claims
        .filter((claim) => claim.reviewDecision === 'CONFIRMED_ISSUE')
        .map(serializeClaim),
      pending: source.claims
        .filter((claim) => claim.reviewDecision === 'PENDING')
        .map(serializeClaim),
    },
    unreviewed,
    unreviewedWarning: unreviewed.total > 0
      ? `${unreviewed.total} items not yet reviewed`
      : null,
    unverifiedCitationCount,
    stale: staleness.stale,
    staleReasons: staleness.reasons,
    disclaimer: REVIEW_SUMMARY_DISCLAIMER,
    generatedAt: source.generatedAt.toISOString(),
  };
}

/**
 * @param {unknown} list
 * @param {'AI' | 'REVIEWER'} source
 */
function verifiedQuotes(list, source) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item?.verified === true)
    .map((item) => ({
      source,
      segmentId: item.segmentId,
      quote: item.quote,
    }));
}

function serializeClaim(claim) {
  return {
    id: claim.id,
    segmentId: claim.segmentId,
    quote: claim.quote,
    quoteVerified: claim.quoteVerified,
    reason: claim.reason,
    reviewDecision: claim.reviewDecision,
  };
}

/**
 * Renders the JSON summary deterministically without invoking an AI provider.
 * @param {object} content
 */
export function renderReviewSummaryMarkdown(content) {
  const lines = [
    `# Completeness summary: ${content.assessment.name}`,
    '',
    content.unreviewedWarning ? `> **Warning:** ${content.unreviewedWarning}.` : '> All reviewable items have been reviewed.',
    '',
    `**Disclaimer:** ${content.disclaimer}`,
    '',
    '## Documents',
    `- Guideline: ${content.documents.guideline.title} (version ${content.documents.guideline.versionNo})`,
    `- Application: ${content.documents.application.title} (version ${content.documents.application.versionNo})`,
    '',
    '## Analysis run',
    `- Provider: ${content.run.provider}`,
    `- Model: ${content.run.model}`,
    `- Prompt version: ${content.run.promptVersion}`,
    `- Date: ${content.run.date}`,
    `- Heuristic fallback: ${content.run.heuristicFallback ? 'Yes' : 'No'}`,
    `- Stale at generation: ${content.stale ? 'Yes' : 'No'} (${content.staleReasons.join(', ') || 'none'})`,
    '',
    '## Completion',
    `- Mandatory: ${content.completion.mandatory.confirmedMet}/${content.completion.mandatory.total} confirmed (${content.completion.mandatory.percentConfirmed}%); ${content.completion.mandatory.aiSuggestedMet} AI-suggested (${content.completion.mandatory.percentWithSuggestions}%)`,
    `- Recommended: ${content.completion.recommended.confirmedMet}/${content.completion.recommended.total} confirmed (${content.completion.recommended.percentConfirmed}%); ${content.completion.recommended.aiSuggestedMet} AI-suggested (${content.completion.recommended.percentWithSuggestions}%)`,
    `- ${content.completion.label}`,
    '',
    '## Requirements',
    '| Code | Level | Effective status | Review decision | Requirement | Reviewer note | Verified evidence |',
    '|---|---|---|---|---|---|---|',
    ...content.requirements.map((requirement) => (
      `| ${escapeCell(requirement.code)} | ${escapeCell(requirement.level)} | ${escapeCell(requirement.effectiveStatus)} | ${escapeCell(requirement.reviewDecision)} | ${escapeCell(requirement.text)} | ${escapeCell(requirement.reviewerNote ?? '')} | ${escapeCell(requirement.verifiedEvidenceQuotes.map((item) => item.quote).join('; '))} |`
    )),
    '',
    '## Outstanding mandatory requirements',
    ...markdownList(content.outstandingMandatory.map(({ code, text }) => `${code}: ${text}`)),
    '',
    '## Recommended items not met',
    ...markdownList(content.recommendedNotMet.map(({ code, text }) => `${code}: ${text}`)),
    '',
    '## Missing supporting documents',
    ...markdownList(content.missingSupportingDocuments.map((item) => (
      `${item.name} (${item.docType}${item.requirementCode ? `; ${item.requirementCode}` : ''})`
    ))),
    '',
    '## Open clarification questions',
    ...markdownList(content.openClarificationQuestions.map((item) => (
      `${item.requirementCode ? `${item.requirementCode}: ` : ''}${item.question} — ${item.reason}`
    ))),
    '',
    '## Unsupported claims',
    '### Confirmed issues',
    ...markdownList(content.unsupportedClaims.confirmedIssues.map((item) => (
      `${item.quote} — ${item.reason} (quote verified: ${item.quoteVerified ? 'yes' : 'no'})`
    ))),
    '### Pending review',
    ...markdownList(content.unsupportedClaims.pending.map((item) => (
      `${item.quote} — ${item.reason} (quote verified: ${item.quoteVerified ? 'yes' : 'no'})`
    ))),
    '',
    '## Review checks',
    `- Items not yet reviewed: ${content.unreviewed.total}`,
    `- Pending mapping reviews: ${content.unreviewed.mappings}`,
    `- Open clarification questions: ${content.unreviewed.questions}`,
    `- Pending unsupported-claim reviews: ${content.unreviewed.unsupportedClaims}`,
    `- Unverified citations: ${content.unverifiedCitationCount}`,
  ];
  return `${lines.join('\n')}\n`;
}

function markdownList(values) {
  return values.length ? values.map((value) => `- ${escapeCell(value)}`) : ['- None'];
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}
