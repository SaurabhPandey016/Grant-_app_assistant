import assert from 'node:assert/strict';
import request from 'supertest';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { buildRequirementsPrompt } from '../src/ai/prompts/index.js';
import { createAnalysisService } from '../src/services/analysis.service.js';

const guidelineSegments = [{
  id: 'S1',
  text: 'Applicants must provide audited accounts before applying.',
  start: 0,
  end: 60,
}];
const applicationSegments = [{
  id: 'S1',
  text: 'We have operated a neighborhood garden for several years.',
  start: 0,
  end: 58,
}];

function output() {
  return {
    requirements: [
      {
        code: 'R1',
        text: 'Applicants must provide audited accounts before applying.',
        category: 'DOCUMENT',
        level: 'MANDATORY',
        sourceSegmentId: 'S1',
        sourceQuote: 'Applicants must provide audited accounts before applying.',
        needsDocument: true,
        documentType: 'Audited accounts',
      },
      {
        code: 'R2',
        text: 'Applicants should describe their evaluation plan.',
        category: 'CONTENT',
        level: 'RECOMMENDED',
        sourceSegmentId: 'S1',
        sourceQuote: 'Applicants should describe their evaluation plan.',
        needsDocument: false,
        documentType: null,
      },
    ],
    mappings: [
      {
        requirementCode: 'R1',
        status: 'SUPPORTED',
        rationale: 'AI suggestion.',
        evidence: [{ segmentId: 'S1', quote: 'Invented support not present in document.' }],
      },
      {
        requirementCode: 'R999',
        status: 'SUPPORTED',
        rationale: 'Unknown requirement.',
        evidence: [{ segmentId: 'S1', quote: 'Invented support not present in document.' }],
      },
    ],
    questions: [{
      requirementCode: 'R1',
      question: 'Can you provide the audited accounts?',
      reason: 'The application does not identify them.',
    }],
    unsupportedClaims: [{
      segmentId: 'S1',
      quote: 'We have operated a neighborhood garden for several years.',
      reason: 'The claim needs evidence.',
    }],
    provider: 'heuristic',
    model: 'test-model',
    promptVersion: 'test-v1',
    aiUnavailable: false,
  };
}

function createContext({ ai = { async runAnalysis() { return output(); } } } = {}) {
  const events = [];
  const scheduled = [];
  const runs = new Map();
  let isRunning = false;
  let nextRunId = 1;
  const repository = {
    async startAnalysisRunForUser(input) {
      if (input.userId !== 'user-1') return { notFound: true };
      if (isRunning) return { alreadyRunning: true };
      isRunning = true;
      const run = {
        id: `run-${nextRunId++}`,
        assessmentId: 'assessment-1',
        guidelineVersionId: 'guideline-version-1',
        applicationVersionId: 'application-version-1',
        status: 'RUNNING',
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        startedAt: new Date(),
      };
      runs.set(run.id, run);
      events.push({ type: 'started', run });
      return {
        run,
        guidelineVersion: { id: 'guideline-version-1', segments: guidelineSegments },
        applicationVersion: { id: 'application-version-1', segments: applicationSegments },
      };
    },
    async completeAnalysisRun(input) {
      isRunning = false;
      const run = { id: input.runId, assessmentId: 'assessment-1', status: 'COMPLETED', ...input };
      runs.set(run.id, run);
      events.push({ type: 'completed', input, run });
      return run;
    },
    async failAnalysisRun(input) {
      isRunning = false;
      const run = runs.get(input.runId);
      runs.set(input.runId, { ...run, status: 'FAILED', error: input.message });
      events.push({ type: 'failed', input });
    },
    async findLatestAnalysisForUser() {
      return null;
    },
    async listAnalysisRunsForUser() {
      return [];
    },
    async findAnalysisRunForUser(assessmentId, runId, userId) {
      if (assessmentId !== 'assessment-1' || userId !== 'user-1') return null;
      const run = runs.get(runId);
      if (!run) return null;
      return { ...run, requirements: [], clarificationQuestions: [], unsupportedClaims: [] };
    },
    async failInterruptedAnalysisRuns() {
      return 0;
    },
  };
  const analysis = createAnalysisService({
    repository,
    ai,
    schedule(task) {
      scheduled.push(task);
    },
    logger: { info() {}, warn() {}, error() {} },
    provider: 'heuristic',
    model: 'deterministic-rules-v1',
  });
  const app = createApp({
    authenticationService: {
      async authenticate(token) {
        return token === 'user-1-token'
          ? { id: 'user-1', email: 'user@example.test', name: 'Test User' }
          : token === 'user-2-token'
            ? { id: 'user-2', email: 'other@example.test', name: 'Other User' }
            : null;
      },
    },
    analysis,
  });
  return {
    app,
    events,
    async runNextTask() {
      const task = scheduled.shift();
      assert.ok(task, 'Expected a scheduled analysis task.');
      await task();
    },
  };
}

const auth = { Authorization: 'Bearer user-1-token' };

describe('analysis API', () => {
  it('saves requirements and mappings, rejects fabricated evidence, fills skipped mappings and ignores unknown codes', async () => {
    const context = createContext();
    const response = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);

    assert.equal(response.status, 202, `${response.text} ${JSON.stringify(response.body)}`);
    assert.equal(response.body.run.status, 'RUNNING');
    await context.runNextTask();
    const saved = context.events.find(({ type }) => type === 'completed').input;
    assert.equal(saved.requirements.length, 2);
    assert.equal(saved.requirements[0].sourceVerified, true);
    assert.equal(saved.requirements[1].levelDisputed, false);
    assert.equal(saved.mappings.length, 2);
    assert.equal(saved.mappings[0].allVerified, false);
    assert.equal(saved.mappings[0].evidence[0].verified, false);
    assert.deepEqual(saved.mappings[1], {
      requirementCode: 'R2',
      status: 'MISSING',
      rationale: 'The AI did not return a mapping for this requirement.',
      evidence: [],
      allVerified: false,
    });
    assert.equal(saved.unsupportedClaims[0].quoteVerified, true);
    const polled = await request(context.app)
      .get(`/assessments/assessment-1/analysis/runs/${response.body.run.id}`)
      .set(auth);
    assert.equal(polled.status, 200);
    assert.equal(polled.body.run.status, 'COMPLETED');
    assert.ok(polled.body.analysis);
  });

  it('marks a run failed and exposes only a user-safe polling error when processing fails', async () => {
    const context = createContext({
      ai: { async runAnalysis() { throw new Error('private provider detail'); } },
    });
    const response = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);

    assert.equal(response.status, 202);
    await context.runNextTask();
    assert.equal(context.events.at(-1).type, 'failed');
    assert.equal(context.events.at(-1).input.message, 'Analysis failed. Please try again.');
    const polled = await request(context.app)
      .get(`/assessments/assessment-1/analysis/runs/${response.body.run.id}`)
      .set(auth);
    assert.equal(polled.status, 200);
    assert.equal(polled.body.run.status, 'FAILED');
    assert.equal(polled.body.run.error, 'Analysis failed. Please try again.');
    assert.doesNotMatch(JSON.stringify(polled.body), /private provider detail/);
  });

  it('conceals an analysis run from a different user while allowing the owner to poll', async () => {
    const context = createContext();
    const started = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);
    const otherUser = await request(context.app)
      .get(`/assessments/assessment-1/analysis/runs/${started.body.run.id}`)
      .set('Authorization', 'Bearer user-2-token');

    assert.equal(otherUser.status, 404);
    await context.runNextTask();
  });

  it('blocks a concurrent analysis run for the same assessment', async () => {
    let beginAi;
    let releaseAi;
    const aiStarted = new Promise((resolve) => { beginAi = resolve; });
    const release = new Promise((resolve) => { releaseAi = resolve; });
    const context = createContext({
      ai: {
        async runAnalysis() {
          beginAi();
          await release;
          return output();
        },
      },
    });
    const firstResponse = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);
    assert.equal(firstResponse.status, 202);
    const firstWork = context.runNextTask();
    await aiStarted;
    const concurrent = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);
    assert.equal(concurrent.status, 409);
    assert.equal(concurrent.body.error.code, 'ANALYSIS_ALREADY_RUNNING');
    releaseAi();
    await firstWork;
    const polled = await request(context.app)
      .get(`/assessments/assessment-1/analysis/runs/${firstResponse.body.run.id}`)
      .set(auth);
    assert.equal(polled.body.run.status, 'COMPLETED');
  });

  it('wraps prompt documents in untrusted delimiters with segment labels', () => {
    const prompt = buildRequirementsPrompt(guidelineSegments);
    assert.match(prompt.system, /UNTRUSTED DATA/);
    assert.match(prompt.user, /<document kind="GUIDELINE">/);
    assert.match(prompt.user, /\[S1\] Applicants must provide audited accounts/);
    assert.match(prompt.user, /<\/document>/);
  });
});
