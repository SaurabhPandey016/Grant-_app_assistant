import bcrypt from 'bcrypt';
import { upsertDemoUser } from '../src/repositories/user.repository.js';
import { disconnectDatabase } from '../src/repositories/prisma.js';

const email = 'demo@grants.test';
const password = process.env.SEED_DEMO_PASSWORD;

if (!password) {
  throw new Error('SEED_DEMO_PASSWORD must be set before running the seed.');
}

const passwordHash = await bcrypt.hash(password, 12);

try {
  await upsertDemoUser({ email, name: 'Demo User', passwordHash });
} finally {
  await disconnectDatabase();
}
