/**
 * @typedef {{ id: string, email: string, name: string }} UserResponse
 */

/**
 * @param {UserResponse} user
 * @returns {UserResponse}
 */
export function serializeUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}
