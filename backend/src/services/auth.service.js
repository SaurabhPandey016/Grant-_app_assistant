import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import {
  createUser,
  findPublicUserById,
  findUserForAuthentication,
} from '../repositories/user.repository.js';
import { recordLoginEvent } from '../repositories/auth-audit.repository.js';
import { AppError } from '../middleware/error-handler.js';

const tokenLifetimeSeconds = 60 * 60;
const tokenIssuer = 'grant-completeness-assistant';

/**
 * @typedef {{ id: string, email: string, name: string }} PublicUser
 * @typedef {{ id: string, email: string, name: string, passwordHash: string }} AuthUser
 * @typedef {{
 *   createUser: (input: { email: string, name: string, passwordHash: string }) => Promise<AuthUser>,
 *   findUserForAuthentication: (email: string) => Promise<AuthUser | null>,
 *   findPublicUserById: (id: string) => Promise<PublicUser | null>
 * }} UserRepository
 * @typedef {{ recordLoginEvent: (input: { actorId: string | null, successful: boolean }) => Promise<unknown> }} AuditRepository
 */

/**
 * @param {{
 *   userRepository?: UserRepository,
 *   auditRepository?: AuditRepository,
 *   passwordHasher?: typeof bcrypt,
 *   secret?: string
 * }} [dependencies]
 */
export function createAuthService({
  userRepository = { createUser, findUserForAuthentication, findPublicUserById },
  auditRepository = { recordLoginEvent },
  passwordHasher = bcrypt,
  secret = env.JWT_SECRET,
} = {}) {
  function signToken(user) {
    return jwt.sign({}, secret, {
      subject: user.id,
      issuer: tokenIssuer,
      expiresIn: tokenLifetimeSeconds,
    });
  }

  async function register({ name, email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await passwordHasher.hash(password, 12);

    let user;
    try {
      user = await userRepository.createUser({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
      });
    } catch (error) {
      if (error?.code === 'EMAIL_ALREADY_EXISTS') {
        throw new AppError({
          code: 'EMAIL_ALREADY_EXISTS',
          message: error.message,
          httpStatus: 409,
        });
      }
      throw error;
    }

    return { user: toPublicUser(user), token: signToken(user) };
  }

  async function login({ email, password }) {
    const user = await userRepository.findUserForAuthentication(email.trim().toLowerCase());
    const passwordMatches = user
      ? await passwordHasher.compare(password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      await auditRepository.recordLoginEvent({ actorId: null, successful: false });
      throw invalidCredentialsError();
    }

    await auditRepository.recordLoginEvent({ actorId: user.id, successful: true });
    return { user: toPublicUser(user), token: signToken(user) };
  }

  async function authenticate(token) {
    let claims;
    try {
      claims = jwt.verify(token, secret, { issuer: tokenIssuer });
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        return null;
      }
      throw error;
    }

    if (typeof claims === 'string' || typeof claims.sub !== 'string') {
      return null;
    }

    const user = await userRepository.findPublicUserById(claims.sub);
    return user ? toPublicUser(user) : null;
  }

  return { register, login, authenticate };
}

function invalidCredentialsError() {
  return new AppError({
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid credentials',
    httpStatus: 401,
  });
}

/**
 * @param {PublicUser} user
 * @returns {PublicUser}
 */
function toPublicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

export const authService = createAuthService();
