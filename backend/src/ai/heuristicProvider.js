const REQUIREMENT_VERBS = /\b(?:must|shall|required|mandatory)\b/i;
const RECOMMENDATION_VERBS = /\b(?:should|encouraged|recommended|may|optional)\b/i;
const DOCUMENT_KEYWORDS = /\b(?:document|certificate|accounts|letter|letters|attachment|attach|supporting|audited)\b/i;
const NEGATED_EVIDENCE = /\b(?:(?:have|has|had|do|does|did|is|are|was|were|will)\s+not|haven't|hasn't|hadn't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|cannot|can't)\b|\bnot\s+(?:yet\s+)?(?:provided|included|attached|submitted|collected|available|completed)\b|\bno\s+(?:\w+\s+){0,3}(?:available|provided|attached|included|submitted|collected|evidence|records|report)\b|\bwithout\b/i;
const STOP_WORDS = new Set([
  'about', 'after', 'against', 'also', 'among', 'and', 'any', 'are', 'because',
  'been', 'before', 'being', 'but', 'can', 'could', 'does', 'each', 'for',
  'from', 'had', 'has', 'have', 'into', 'its', 'may', 'must', 'not', 'our',
  'shall', 'should', 'such', 'than', 'that', 'the', 'their', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'under', 'upon', 'was', 'were',
  'will', 'with', 'would', 'you', 'your',
]);

/**
 * @param {{ providerName?: string }} [options]
 * @returns {import('./openAiCompatibleProvider.js').JsonCompletionProvider}
 */
export function createHeuristicProvider({ providerName = 'heuristic' } = {}) {
  return {
    async completeJson({ system, user }) {
      let output;
      if (system.includes('Task: Extract explicit')) {
        output = extractRequirements(user);
      } else if (system.includes('Task: For every supplied requirement')) {
        output = mapRequirements(user);
      } else if (system.includes('Task: Identify specific application claims')) {
        output = identifyClaimsAndQuestions(user);
      } else {
        throw new Error('The heuristic provider received an unknown analysis task.');
      }

      return {
        text: JSON.stringify(output),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        providerName,
        model: 'deterministic-rules-v1',
      };
    },
  };
}

function readDocumentSegments(user, kind) {
  const openingTag = `<document kind="${kind}">`;
  const openingIndex = user.indexOf(openingTag);
  if (openingIndex === -1) {
    throw new Error(`The ${kind} document was not supplied.`);
  }
  const contentStart = openingIndex + openingTag.length;
  const closingIndex = user.indexOf('</document>', contentStart);
  if (closingIndex === -1) {
    throw new Error(`The ${kind} document block is incomplete.`);
  }
  const block = user.slice(contentStart, closingIndex).replace(/^\r?\n|\r?\n$/g, '');
  const markers = [...block.matchAll(/^\[(S\d+)\]\s?/gm)];
  return markers.map((marker, index) => {
    const textStart = marker.index + marker[0].length;
    const textEnd = markers[index + 1]?.index ?? block.length;
    return {
      id: marker[1],
      text: block.slice(textStart, textEnd).replace(/\r?\n$/, '').trim(),
    };
  });
}

function readJsonSection(user, label, followingLabel) {
  const startLabel = `${label} (untrusted JSON):\n`;
  const start = user.indexOf(startLabel);
  if (start === -1) {
    throw new Error(`The ${label} data was not supplied.`);
  }
  const contentStart = start + startLabel.length;
  const end = user.indexOf(`\n\n${followingLabel}`, contentStart);
  if (end === -1) {
    throw new Error(`The ${label} data is incomplete.`);
  }
  return JSON.parse(user.slice(contentStart, end));
}

function splitSentences(text) {
  return text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

function classifyCategory(text) {
  if (/\b(?:eligib|registered|non.?profit|at least \d+ years|three years)\b/i.test(text)) {
    return 'ELIGIBILITY';
  }
  if (DOCUMENT_KEYWORDS.test(text)) {
    return 'DOCUMENT';
  }
  if (/\b(?:submit|submission|deadline|application form|due date)\b/i.test(text)) {
    return 'SUBMISSION';
  }
  if (/\b(?:project|activity|outcome|plan|benefit|budget|amount|cost|service area|community)\b/i.test(text)) {
    return 'CONTENT';
  }
  return 'OTHER';
}

function inferDocumentType(text) {
  const types = [
    [/\bregistration certificate\b/i, 'Registration certificate'],
    [/\baudited accounts\b/i, 'Audited accounts'],
    [/\bbudget(?: breakdown| detail| plan)?\b/i, 'Budget breakdown'],
    [/\bletters? of support\b/i, 'Letters of support'],
  ];
  return types.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function extractRequirements(user) {
  const guidelineSegments = readDocumentSegments(user, 'GUIDELINE');
  const requirements = [];

  for (const segment of guidelineSegments) {
    for (const sentence of splitSentences(segment.text)) {
      const level = REQUIREMENT_VERBS.test(sentence)
        ? 'MANDATORY'
        : RECOMMENDATION_VERBS.test(sentence)
          ? 'RECOMMENDED'
          : null;
      if (!level) continue;

      const documentType = inferDocumentType(sentence);
      requirements.push({
        text: sentence,
        category: classifyCategory(sentence),
        level,
        sourceSegmentId: segment.id,
        sourceQuote: sentence,
        needsDocument: documentType !== null || DOCUMENT_KEYWORDS.test(sentence),
        documentType,
      });
    }
  }

  return { requirements };
}

function requirementTokens(text) {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function overlapScore(requirement, sentence) {
  const requiredTokens = requirementTokens(requirement);
  if (requiredTokens.size === 0) return 0;
  const evidenceTokens = requirementTokens(sentence);
  let overlap = 0;
  for (const token of requiredTokens) {
    if (evidenceTokens.has(token)) overlap += 1;
  }
  return overlap / requiredTokens.size;
}

function bestEvidence(requirement, applicationSegments) {
  let best = { score: 0, segmentId: null, quote: null };
  for (const segment of applicationSegments) {
    for (const sentence of splitSentences(segment.text)) {
      if (NEGATED_EVIDENCE.test(sentence)) continue;
      const score = overlapScore(requirement.text, sentence);
      if (score > best.score) {
        best = { score, segmentId: segment.id, quote: sentence };
      }
    }
  }
  return best;
}

function mapRequirements(user) {
  const requirements = readJsonSection(user, 'Requirements', '<document kind="GUIDELINE">');
  const applicationSegments = readDocumentSegments(user, 'APPLICATION');

  return {
    mappings: requirements.map((requirement) => {
      const match = bestEvidence(requirement, applicationSegments);
      const status = match.score >= 0.5
        ? 'SUPPORTED'
        : match.score >= 0.25
          ? 'PARTIAL'
          : 'MISSING';

      return {
        requirementCode: requirement.code,
        status,
        rationale: match.score === 0
          ? 'No application sentence has meaningful keyword overlap with this requirement.'
          : `Deterministic keyword overlap score: ${match.score.toFixed(2)}.`,
        evidence: status === 'MISSING'
          ? []
          : [{ segmentId: match.segmentId, quote: match.quote }],
      };
    }),
  };
}

function identifyClaimsAndQuestions(user) {
  const requirements = readJsonSection(user, 'Requirements', 'Mappings (untrusted JSON):');
  const mappings = readJsonSection(user, 'Mappings', '<document kind="GUIDELINE">');
  const applicationSegments = readDocumentSegments(user, 'APPLICATION');
  const mappingByCode = new Map(mappings.map((mapping) => [mapping.requirementCode, mapping]));
  const unsupportedClaims = [];

  for (const segment of applicationSegments) {
    for (const sentence of splitSentences(segment.text)) {
      if (/\d|\b(?:reached|achieved|increased by)\b/i.test(sentence)) {
        unsupportedClaims.push({
          segmentId: segment.id,
          quote: sentence,
          reason: 'This claim includes a numerical or outcome assertion that should be checked against supplied evidence.',
        });
      }
    }
  }

  const questions = requirements
    .filter((requirement) => (
      requirement.level === 'MANDATORY'
      && mappingByCode.get(requirement.code)?.status !== 'SUPPORTED'
    ))
    .map((requirement) => ({
      requirementCode: requirement.code,
      question: `Can you provide clear evidence for this requirement: ${requirement.text}`,
      reason: 'The application does not contain clearly supported evidence for this mandatory requirement.',
    }));

  return { unsupportedClaims, questions };
}
