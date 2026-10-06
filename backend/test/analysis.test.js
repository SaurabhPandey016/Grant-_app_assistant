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
      events.push({ type: 'completed', input, run });
      return run;
    },
    async failAnalysisRun(input) {
      isRunning = false;
      events.push({ type: 'failed', input });
    },
    async findLatestAnalysisForUser() {
      return null;
    },
    async listAnalysisRunsForUser() {
      return [];
    },
  };
  const analysis = createAnalysisService({
    repository,
    ai,
    logger: { info() {}, warn() {}, error() {} },
    provider: 'heuristic',
    model: 'deterministic-rules-v1',
  });
  const app = createApp({
    authenticationService: {
      async authenticate(token) {
        return token === 'user-1-token'
          ? { id: 'user-1', email: 'user@example.test', name: 'Test User' }
          : null;
      },
    },
    analysis,
  });
  return { app, events };
}

const auth = { Authorization: 'Bearer user-1-token' };

describe('analysis API', () => {
  it('saves requirements and mappings, rejects fabricated evidence, fills skipped mappings and ignores unknown codes', async () => {
    const context = createContext();
    const response = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);

    assert.equal(response.status, 201);
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
    assert.equal(response.body.analysis.requirements.length, 2);
  });

  it('marks a run failed and returns a user-safe error when processing fails', async () => {
    const context = createContext({
      ai: { async runAnalysis() { throw new Error('private provider detail'); } },
    });
    const response = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);

    assert.equal(response.status, 502);
    assert.equal(response.body.error.message, 'Analysis failed. Please try again.');
    assert.equal(context.events.at(-1).type, 'failed');
    assert.equal(context.events.at(-1).input.message, 'Analysis failed. Please try again.');
    assert.doesNotMatch(JSON.stringify(response.body), /private provider detail/);
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
    const firstRequest = request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth)
      .then((response) => response);
    await aiStarted;
    const concurrent = await request(context.app)
      .post('/assessments/assessment-1/analysis')
      .set(auth);
    assert.equal(concurrent.status, 409);
    assert.equal(concurrent.body.error.code, 'ANALYSIS_ALREADY_RUNNING');
    releaseAi();
    assert.equal((await firstRequest).status, 201);
  });

  it('wraps prompt documents in untrusted delimiters with segment labels', () => {
    const prompt = buildRequirementsPrompt(guidelineSegments);
    assert.match(prompt.system, /UNTRUSTED DATA/);
    assert.match(prompt.user, /<document kind="GUIDELINE">/);
    assert.match(prompt.user, /\[S1\] Applicants must provide audited accounts/);
    assert.match(prompt.user, /<\/document>/);
  });
});
