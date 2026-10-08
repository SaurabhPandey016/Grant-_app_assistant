/**
 * @typedef {'SUPPORTED' | 'PARTIAL' | 'AMBIGUOUS' | 'MISSING'} EvidenceStatus
 * @typedef {{
 *   aiStatus: EvidenceStatus,
 *   allVerified: boolean,
 *   reviewDecision: 'PENDING' | 'CONFIRMED' | 'CORRECTED' | 'REJECTED',
 *   reviewerStatus?: EvidenceStatus | null
 * }} ScorableMapping
 * @typedef {{
 *   code: string,
 *   text: string,
 *   aiLevel: 'MANDATORY' | 'RECOMMENDED',
 *   levelOverride?: 'MANDATORY' | 'RECOMMENDED' | null,
 *   needsDocument?: boolean,
 *   documentType?: string | null,
 *   sourceVerified?: boolean,
 *   mapping?: ScorableMapping | null
 * }} ScorableRequirement
 */

/**
 * @param {ScorableMapping} mapping
 * @returns {EvidenceStatus}
 */
export function effectiveStatus(mapping) {
  if (mapping.reviewDecision === 'REJECTED') return 'MISSING';
  if (mapping.reviewDecision === 'CORRECTED') return mapping.reviewerStatus ?? 'MISSING';
  return mapping.aiStatus;
}

/**
 * @param {ScorableMapping} mapping
 * @param {boolean} [sourceVerified]
 * @returns {boolean}
 */
export function isSatisfied(mapping, sourceVerified = true) {
  return sourceVerified !== false
    && effectiveStatus(mapping) === 'SUPPORTED'
    && (mapping.reviewDecision === 'CORRECTED' || mapping.allVerified === true);
}

/**
 * @param {ScorableMapping} mapping
 * @param {boolean} [sourceVerified]
 * @returns {boolean}
 */
export function confirmedSatisfied(mapping, sourceVerified = true) {
  return (mapping.reviewDecision === 'CONFIRMED' || mapping.reviewDecision === 'CORRECTED')
    && isSatisfied(mapping, sourceVerified);
}

/**
 * @param {ScorableMapping} mapping
 * @param {boolean} [sourceVerified]
 * @returns {boolean}
 */
export function aiSuggestedSatisfied(mapping, sourceVerified = true) {
  return sourceVerified !== false
    && mapping.reviewDecision === 'PENDING'
    && mapping.aiStatus === 'SUPPORTED'
    && mapping.allVerified === true;
}

/**
 * @param {ScorableRequirement} requirement
 * @returns {'MANDATORY' | 'RECOMMENDED'}
 */
export function effectiveLevel(requirement) {
  return requirement.levelOverride ?? requirement.aiLevel;
}

/**
 * @param {ScorableRequirement[]} requirements
 * @param {Array<{ id?: string, name: string, docType: string, status: string, requirementId?: string | null }>} supportingDocs
 */
export function computeCompletion(requirements, supportingDocs) {
  const mandatoryRequirements = requirements.filter(
    (requirement) => effectiveLevel(requirement) === 'MANDATORY',
  );
  const recommendedRequirements = requirements.filter(
    (requirement) => effectiveLevel(requirement) === 'RECOMMENDED',
  );
  const mandatory = summarizeLevel(mandatoryRequirements);
  const recommended = summarizeLevel(recommendedRequirements);
  const missingDocuments = supportingDocs
    .filter((document) => document.status === 'MISSING')
    .map((document) => ({
      name: document.name,
      docType: document.docType,
      requirementCode: null,
    }));

  for (const requirement of requirements) {
    if (!requirement.needsDocument || !requirement.documentType) continue;
    const provided = supportingDocs.some((document) => (
      document.status === 'PROVIDED'
      && normalizeDocumentType(document.docType) === normalizeDocumentType(requirement.documentType)
    ));
    if (!provided) {
      const existingMissing = missingDocuments.find((document) => (
        normalizeDocumentType(document.docType) === normalizeDocumentType(requirement.documentType)
      ));
      if (existingMissing) {
        existingMissing.requirementCode ??= requirement.code;
        continue;
      }
      missingDocuments.push({
        name: requirement.documentType,
        docType: requirement.documentType,
        requirementCode: requirement.code,
      });
    }
  }

  const unverifiedCitationCount = requirements.reduce((count, requirement) => {
    const evidence = Array.isArray(requirement.mapping?.evidence)
      ? requirement.mapping.evidence
      : [];
    const reviewerEvidence = Array.isArray(requirement.mapping?.reviewerEvidence)
      ? requirement.mapping.reviewerEvidence
      : [];
    const sourceCitationCount = requirement.sourceVerified === false ? 1 : 0;
    return count
      + sourceCitationCount
      + evidence.filter((item) => item?.verified !== true).length
      + reviewerEvidence.filter((item) => item?.verified !== true).length;
  }, 0);
  const totalMandatory = mandatory.total;

  return {
    mandatory,
    recommended,
    outstandingMandatory: mandatoryRequirements
      .filter((requirement) => (
        !requirement.mapping
        || !confirmedSatisfied(requirement.mapping, requirement.sourceVerified !== false)
      ))
      .map(({ code, text }) => ({ code, text })),
    pendingReviewCount: requirements.filter(
      (requirement) => requirement.mapping?.reviewDecision === 'PENDING',
    ).length,
    disputedLevelCount: requirements.filter((requirement) => requirement.levelDisputed).length,
    unverifiedCitationCount,
    missingDocuments,
    label: `${mandatory.confirmedMet} of ${totalMandatory} mandatory requirements confirmed`,
  };
}

function normalizeDocumentType(value) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function summarizeLevel(requirements) {
  const confirmedMet = requirements.filter(
    (requirement) => requirement.mapping
      && confirmedSatisfied(requirement.mapping, requirement.sourceVerified !== false),
  ).length;
  const aiSuggestedMet = requirements.filter(
    (requirement) => requirement.mapping
      && aiSuggestedSatisfied(requirement.mapping, requirement.sourceVerified !== false),
  ).length;
  const total = requirements.length;
  return {
    total,
    confirmedMet,
    aiSuggestedMet,
    percentConfirmed: total === 0 ? 0 : Math.round((confirmedMet / total) * 100),
    percentWithSuggestions: total === 0 ? 0 : Math.round((aiSuggestedMet / total) * 100),
  };
}
