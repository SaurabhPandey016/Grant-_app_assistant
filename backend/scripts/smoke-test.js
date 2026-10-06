import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const apiBaseUrl = requiredEnv('API_BASE_URL').replace(/\/+$/, '');
const email = requiredEnv('SMOKE_TEST_EMAIL');
const password = requiredEnv('SMOKE_TEST_PASSWORD');
const fixturePath = (name) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));

let cookie;
let assessmentId;

async function request(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`${init.method ?? 'GET'} ${path} failed: ${message}`);
  }
  return payload;
}

async function main() {
  const health = await request('/api/v1/health');
  if (health?.status !== 'ok' || health?.database !== 'ok') {
    throw new Error('Health check did not report an available database.');
  }
  console.log('PASS database health');

  const loginResponse = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const login = await loginResponse.json().catch(() => null);
  if (!loginResponse.ok) {
    throw new Error(`POST /api/v1/auth/login failed: ${login?.error?.message ?? `HTTP ${loginResponse.status}`}`);
  }
  const setCookie = loginResponse.headers.get('set-cookie');
  if (!setCookie) throw new Error('Login did not set the expected authentication cookie.');
  cookie = setCookie.split(';', 1)[0];
  console.log('PASS login');

  const created = await request('/api/v1/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Deployment smoke test ${new Date().toISOString()}` }),
  });
  assessmentId = created.assessment.id;
  console.log('PASS assessment creation');

  const [guideline, application, supportingDocuments] = await Promise.all([
    readFile(fixturePath('sample-guideline.md'), 'utf8'),
    readFile(fixturePath('sample-application.md'), 'utf8'),
    readFile(fixturePath('sample-supporting-docs.json'), 'utf8').then(JSON.parse),
  ]);
  await request(`/api/v1/assessments/${assessmentId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'GUIDELINE', title: 'Sample guideline', content: guideline }),
  });
  await request(`/api/v1/assessments/${assessmentId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'APPLICATION', title: 'Sample application', content: application }),
  });
  for (const document of supportingDocuments) {
    await request(`/api/v1/assessments/${assessmentId}/supporting-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document),
    });
  }
  console.log('PASS fixture uploads');

  const started = await request(`/api/v1/assessments/${assessmentId}/analysis`, {
    method: 'POST',
  });
  const runId = started.run?.id;
  if (!runId) throw new Error('Analysis start response did not include a run ID.');

  const timeoutAt = Date.now() + 180_000;
  let run;
  do {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const poll = await request(`/api/v1/assessments/${assessmentId}/analysis/runs/${runId}`);
    run = poll.run;
    if (run.status === 'FAILED') {
      throw new Error(run.error || 'Analysis failed.');
    }
  } while (run.status === 'RUNNING' && Date.now() < timeoutAt);
  if (run?.status !== 'COMPLETED') throw new Error('Analysis did not finish within three minutes.');
  console.log('PASS asynchronous analysis');

  const result = await request(`/api/v1/assessments/${assessmentId}/completion`);
  if (!result?.completion) throw new Error('Completion endpoint did not return completion data.');
  console.log('PASS completion fetch');
}

try {
  await main();
} finally {
  if (assessmentId && cookie) {
    await request(`/api/v1/assessments/${assessmentId}`, { method: 'DELETE' });
    console.log('PASS smoke-test assessment cleanup');
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set before running the deployment smoke test.`);
  return value;
}
