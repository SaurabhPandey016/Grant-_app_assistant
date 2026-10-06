import { prisma } from './prisma.js';

/**
 * @typedef {{ id: string, email: string, name: string, passwordHash: string, createdAt: Date, updatedAt: Date }} UserRecord
 * @typedef {{ email: string, name: string, passwordHash: string }} DemoUserInput
 */

/**
 * Creates the demo user once and leaves its password unchanged on subsequent seeds.
 * @param {DemoUserInput} user
 * @returns {Promise<UserRecord>}
 */
export function upsertDemoUser(user) {
  return prisma.user.upsert({
    where: { email: user.email },
    update: { name: user.name },
    create: user,
  });
}

/**
 * @param {string} email
 * @returns {Promise<UserRecord | null>}
 */
export function findUserForAuthentication(email) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * @param {{ email: string, name: string, passwordHash: string }} user
 * @returns {Promise<UserRecord>}
 */
export async function createUser(user) {
  try {
    return await prisma.user.create({ data: user });
  } catch (error) {
    if (error?.code === 'P2002') {
      const conflict = new Error('An account with this email already exists.');
      conflict.code = 'EMAIL_ALREADY_EXISTS';
      throw conflict;
    }
    throw error;
  }
}

/**
 * @param {string} id
 * @returns {Promise<Pick<UserRecord, 'id' | 'email' | 'name'> | null>}
 */
export function findPublicUserById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true },
  });
}
