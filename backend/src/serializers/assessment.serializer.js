/**
 * @param {object} assessment
 */
export function serializeAssessment(assessment) {
  const {
    id,
    name,
    currentGuidelineVersionId,
    currentApplicationVersionId,
    currentGuidelineVersion,
    currentApplicationVersion,
    createdAt,
    updatedAt,
    latestRun,
    stale,
    reasons,
  } = assessment;
  return {
    id,
    name,
    currentGuidelineVersionId: currentGuidelineVersionId ?? null,
    currentApplicationVersionId: currentApplicationVersionId ?? null,
    ...(currentGuidelineVersion === undefined ? {} : { currentGuidelineVersion }),
    ...(currentApplicationVersion === undefined ? {} : { currentApplicationVersion }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(latestRun === undefined ? {} : { latestRun }),
    ...(stale === undefined ? {} : { stale }),
    ...(reasons === undefined ? {} : { reasons }),
  };
}

/**
 * @param {object} version
 * @param {boolean} [includeContent]
 */
export function serializeDocumentVersion(version, includeContent = false) {
  const {
    id,
    assessmentId,
    kind,
    versionNo,
    title,
    contentHash,
    segments,
    createdAt,
  } = version;
  return {
    id,
    assessmentId,
    kind,
    versionNo,
    title,
    contentHash,
    createdAt,
    ...(includeContent ? { content: version.content, segments } : {}),
  };
}

/**
 * @param {object} document
 */
export function serializeSupportingDocument(document) {
  return {
    id: document.id,
    assessmentId: document.assessmentId,
    name: document.name,
    docType: document.docType,
    status: document.status,
    notes: document.notes,
    requirementId: document.requirementId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
