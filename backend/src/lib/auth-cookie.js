import { env } from '../config/env.js';

export const authCookieName = 'grant_auth';
export const authTokenLifetimeMs = 60 * 60 * 1000;

export const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/',
};
