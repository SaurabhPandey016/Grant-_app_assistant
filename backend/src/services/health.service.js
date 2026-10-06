import { checkDatabaseConnection } from '../repositories/health.repository.js';

export async function getHealth() {
  await checkDatabaseConnection();
  return { status: 'ok', database: 'ok' };
}
