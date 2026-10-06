import { createHash } from 'node:crypto';

/**
 * @param {string} content
 * @returns {string}
 */
export function normalizeDocumentContent(content) {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .trim();
}

/**
 * Hashes canonical document content so line-ending and Unicode normalization
 * differences do not create redundant immutable versions.
 * @param {string} content
 * @returns {string}
 */
export function hashDocumentContent(content) {
  return createHash('sha256')
    .update(normalizeDocumentContent(content), 'utf8')
    .digest('hex');
}
