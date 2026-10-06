import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { describe, it } from 'node:test';
import { corsMiddleware } from '../src/middleware/cors.js';
import { errorHandler } from '../src/middleware/error-handler.js';

function createCorsTestApp() {
  const app = express();
  app.use(corsMiddleware(['https://grants.example']));
  app.get('/resource', (req, res) => res.json({ ok: true }));
  app.options('/resource', (req, res) => res.sendStatus(204));
  app.use(errorHandler);
  return app;
}

describe('CORS allowlist', () => {
  it('allows configured origins with credentialed cookies and preflight', async () => {
    const app = createCorsTestApp();
    const response = await request(app)
      .get('/resource')
      .set('Origin', 'https://grants.example');
    const preflight = await request(app)
      .options('/resource')
      .set('Origin', 'https://grants.example')
      .set('Access-Control-Request-Method', 'POST');

    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], 'https://grants.example');
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'https://grants.example');
  });

  it('rejects unconfigured browser origins', async () => {
    const response = await request(createCorsTestApp())
      .get('/resource')
      .set('Origin', 'https://untrusted.example');

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'CORS_ORIGIN_DENIED');
  });
});
