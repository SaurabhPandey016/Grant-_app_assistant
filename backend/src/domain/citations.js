const QUOTE_TRANSLATIONS = new Map([
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201c', '"'],
  ['\u201d', '"'],
  ['\u2010', '-'],
  ['\u2011', '-'],
  ['\u2012', '-'],
  ['\u2013', '-'],
  ['\u2014', '-'],
  ['\u2212', '-'],
]);

/**
 * @param {string} text
 * @returns {string}
 */
export function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d\u2010-\u2014\u2212]/g, (character) => (
      QUOTE_TRANSLATIONS.get(character) ?? character
    ))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {Array<{ id: string, text: string }>} segments
 * @param {string} segmentId
 * @param {string} quote
 * @returns {boolean}
 */
export function verifyQuote(segments, segmentId, quote) {
  if (typeof quote !== 'string' || normalise(quote).length < 12) {
    return false;
  }
  const segment = segments.find((candidate) => candidate.id === segmentId);
  return Boolean(segment && normalise(segment.text).includes(normalise(quote)));
}

/**
 * @typedef {{ segmentId: string, quote: string, verified?: boolean }} EvidenceItem
 */

/**
 * @param {Array<{ id: string, text: string }>} segments
 * @param {EvidenceItem[]} evidenceList
 * @returns {{ evidence: Array<EvidenceItem & { verified: boolean }>, allVerified: boolean }}
 */
export function verifyEvidence(segments, evidenceList) {
  const evidence = evidenceList.map((item) => ({
    ...item,
    verified: verifyQuote(segments, item.segmentId, item.quote),
  }));
  return {
    evidence,
    allVerified: evidence.length > 0 && evidence.every((item) => item.verified),
  };
}

/**
 * @param {string} quote
 * @returns {'MANDATORY' | 'RECOMMENDED' | 'NEUTRAL'}
 */
export function levelSignal(quote) {
  const text = normalise(quote);
  if (/\b(?:ineligible|will not be considered|must|shall|required|mandatory)\b/.test(text)) {
    return 'MANDATORY';
  }
  if (/\b(?:should|encouraged|recommended|may|optional|preferred)\b/.test(text)) {
    return 'RECOMMENDED';
  }
  return 'NEUTRAL';
}
