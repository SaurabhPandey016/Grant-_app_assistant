import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/auth.service.js';
import { AppError } from '../src/middleware/error-handler.js';

const password = 'correct horse battery staple';

function createTestContext() {
  const users = new Map();
  const audits = [];
  let nextId = 1;
  const userRepository = {
    async createUser(user) {
      if ([...users.values()].some((existing) => existing.email === user.email)) {
        const error = new Error('duplicate');
        error.code = 'EMAIL_ALREADY_EXISTS';
        throw error;
      }
      const record = { id: `user-${nextId++}`, ...user };
      users.set(record.id, record);
      return record;
    },
    async findUserForAuthentication(email) {
      return [...users.values()].find((user) => user.email === email) ?? null;
    },
    async findPublicUserById(id) {
      const user = users.get(id);
      return user ? { id: user.id, email: user.email, name: user.name } : null;
    },
  };
  const auditRepository = {
    async recordLoginEvent(event) {
      audits.push(event);
    },
  };
  const authenticationService = createAuthService({ userRepository, auditRepository });
  const assessmentService = {
    async getAssessment(id, userId) {
      const assessment = { id: 'assessment-owned-by-user-2', name: 'Private assessment', userId: 'user-2' };
      if (id !== assessment.id || assessment.userId !== userId) {
        throw new AppError({
          code: 'ASSESSMENT_NOT_FOUND',
          message: 'Assessment not found.',
          httpStatus: 404,
        });
      }
      return { id: assessment.id, name: assessment.name };
    },
  };

  return {
    app: createApp({ authenticationService, assessmentService }),
    users,
    audits,
  };
}

describe('authentication API', () => {
  let context;

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    context = undefined;
  });

  it('registers users with a bcrypt hash and an httpOnly lax cookie', async () => {
    const response = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Grant Reviewer', email: 'Reviewer@Example.test', password });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body.user, {
      id: 'user-1',
      email: 'reviewer@example.test',
      name: 'Grant Reviewer',
    });
    assert.equal(await bcrypt.compare(password, context.users.get('user-1').passwordHash), true);
    assert.notEqual(context.users.get('user-1').passwordHash, password);

    const cookie = response.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.doesNotMatch(cookie, /;\s*Secure/i);
  });

  it('logs in and records a successful audit event', async () => {
    const registered = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Grant Reviewer', email: 'reviewer@example.test', password });

    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ email: 'REVIEWER@example.test', password });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.user, registered.body.user);
    assert.deepEqual(context.audits, [{ actorId: 'user-1', successful: true }]);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/i);
  });

  it('returns the same generic message for a wrong password and audits the failure', async () => {
    await request(context.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Grant Reviewer', email: 'reviewer@example.test', password });

    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ email: 'reviewer@example.test', password: 'incorrect password' });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.message, 'Invalid credentials');
    assert.deepEqual(context.audits, [{ actorId: null, successful: false }]);
    assert.equal(JSON.stringify(context.audits).includes(password), false);
  });

  it('audits an unknown email with the same generic credentials response', async () => {
    const response = await request(context.app)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.test', password });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.message, 'Invalid credentials');
    assert.deepEqual(context.audits, [{ actorId: null, successful: false }]);
  });

  it('rejects unauthenticated access to the current-user endpoint', async () => {
    const response = await request(context.app).get('/auth/me');

    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHENTICATED');
  });

  it('accepts bearer tokens and returns only public user fields', async () => {
    const registered = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Grant Reviewer', email: 'reviewer@example.test', password });
    const token = registered.headers['set-cookie'][0].match(/grant_auth=([^;]+)/)[1];

    const response = await request(context.app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${decodeURIComponent(token)}`);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.user, registered.body.user);
    assert.equal('passwordHash' in response.body.user, false);
  });

  it("returns 404 when a user requests another user's assessment", async () => {
    const registered = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Different User', email: 'different@example.test', password });
    const token = registered.headers['set-cookie'][0].match(/grant_auth=([^;]+)/)[1];

    const response = await request(context.app)
      .get('/api/v1/assessments/assessment-owned-by-user-2')
      .set('Cookie', `grant_auth=${token}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'ASSESSMENT_NOT_FOUND');
    assert.equal(response.body.error.message, 'Assessment not found.');
  });

  it('clears the auth cookie when logging out', async () => {
    const registered = await request(context.app)
      .post('/api/v1/auth/register')
      .send({ name: 'Grant Reviewer', email: 'reviewer@example.test', password });
    const token = registered.headers['set-cookie'][0].match(/grant_auth=([^;]+)/)[1];

    const response = await request(context.app)
      .post('/api/v1/auth/logout')
      .set('Cookie', `grant_auth=${token}`);

    assert.equal(response.status, 204);
    assert.match(response.headers['set-cookie'][0], /Expires=Thu, 01 Jan 1970/i);
  });

  it('limits repeated login attempts', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(await request(context.app)
        .post('/api/v1/auth/login')
        .send({ email: 'unknown@example.test', password }));
    }

    assert.equal(responses[4].status, 401);
    assert.equal(responses[5].status, 429);
    assert.equal(context.audits.length, 5);
  });
});
