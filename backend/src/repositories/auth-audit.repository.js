import { prisma } from './prisma.js';

/**
 * @typedef {{ actorId: string | null, successful: boolean }} LoginAuditInput
 */

/**
 * Stores login outcomes without persisting submitted credentials or email addresses.
 * @param {LoginAuditInput} input
 * @returns {Promise<unknown>}
 */
export function recordLoginEvent({ actorId, successful }) {
  return prisma.auditEvent.create({
    data: {
      actorId,
      action: successful ? 'auth.login.succeeded' : 'auth.login.failed',
      entityType: 'Authentication',
      entityId: actorId ?? 'unidentified',
      metadata: { outcome: successful ? 'success' : 'failure' },
    },
  });
}
