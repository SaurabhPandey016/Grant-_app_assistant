import { prisma } from './prisma.js';

/**
 * @typedef {{ result: number }} DatabaseHealthRow
 */

/**
 * Executes a minimal query to verify the PostgreSQL connection.
 * @returns {Promise<DatabaseHealthRow[]>}
 */
export function checkDatabaseConnection() {
  return prisma.$queryRaw`SELECT 1 AS result`;
}
