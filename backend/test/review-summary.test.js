import assert from 'node:assert/strict';
import request from 'supertest';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { createReviewSummaryService } from '../src/services/review-summary.service.js';

function createContext() {
  let currentApplicationVersionId = 'application-version-2';
  const source = {
    id: 'assessment-1',
    name: 'Community Green Innovation',
    currentGuidelineVersionId: 'guideline-version-1',
    get currentApplicationVersionId() { return currentApplicationVersionId; },
    supportingDocuments: [{
      id: 'support-1',
      name: 'Audited accounts',
      docType: 'AUDITED_ACCOUNTS',
      status: 'MISSING',
      requirementId: null,
    }],
    analysisRuns: [{
      id: 'run-1',
      status: 'COMPLETED',
      provider: 'heuristic-fallback',
      model: 'deterministic-rules-v1',
      promptVersion: 'grant-review-v1',
      startedAt: new Date('2026-10-06T10:00:00.000Z'),
      finishedAt: new Date('2026-10-06T10:01:00.000Z'),
      guidelineVersionId: 'guideline-version-1',
      applicationVersionId: 'application-version-1',
      guidelineVersion: {
        id: 'guideline-version-1',
        title: 'Fund Guidelines',
        versionNo: 3,
      },
      applicationVersion: {
        id: 'application-version-1',
        title: 'Draft Application',
        versionNo: 7,
      },
      requirements: [{
        id: 'requirement-1',
        code: 'R1',
        text: 'Applicants must provide audited accounts.',
        aiLevel: 'MANDATORY',
        levelOverride: null,
        levelDisputed: false,
        sourceSegmentId: 'S1',
        sourceQuote: 'Applicants must provide audited accounts.',
        sourceVerified: true,
        needsDocument: true,
        documentType: 'Audited accounts',
        mapping: {
          id: 'mapping-1',
          aiStatus: 'MISSING',
          rationale: 'No accounts were found.',
          evidence: [],
          allVerified: false,
          reviewDecision: 'PENDING',
          reviewerStatus: null,
          reviewerEvidence: null,
          reviewerNote: null,
        },
      }],
      clarificationQuestions: [{
        id: 'question-1',
        question: 'Can you upload the accounts?',
        reason: 'The document is missing.',
        status: 'OPEN',
        requirement: { code: 'R1' },
      }],
      unsupportedClaims: [{
        id: 'claim-1',
        segmentId: 'S2',
        quote: 'We reached 10,000 people.',
        quoteVerified: false,
        reason: 'No evidence was supplied.',
        reviewDecision: 'PENDING',
      }],
    }],
  };
  let latestSummary = null;
  const repository = {
    async findReviewSummarySourceForUser(id, userId) {
      return id === 'assessment-1' && userId === 'owner-1' ? source : null;
    },
    async createReviewSummaryForUser(input) {
      latestSummary = {
        id: 'summary-1',
        createdAt: new Date('2026-10-06T10:02:00.000Z'),
        guidelineVersionId: input.guidelineVersionId,
        applicationVersionId: input.applicationVersionId,
        content: input.content,
        run: {
          id: input.runId,
          assessment: {
            get currentGuidelineVersionId() { return source.currentGuidelineVersionId; },
            get currentApplicationVersionId() { return source.currentApplicationVersionId; },
          },
        },
      };
      return latestSummary;
    },
    async findLatestReviewSummaryForUser(id, userId) {
      return id === 'assessment-1' && userId === 'owner-1' ? latestSummary : null;
    },
    async findReviewSummaryForUser(id, userId) {
      return id === 'summary-1' && userId === 'owner-1' ? latestSummary : null;
    },
  };
  const service = createReviewSummaryService({
    repository,
    now: () => new Date('2026-10-06T10:02:00.000Z'),
  });
  const app = createApp({
    authenticationService: {
      async authenticate(token) {
        return token === 'owner-token'
          ? { id: 'owner-1', email: 'owner@example.test', name: 'Owner' }
          : null;
      },
    },
    reviewSummary: service,
  });

  return {
    app,
    uploadApplicationVersion() {
      currentApplicationVersionId = 'application-version-3';
    },
  };
}

const ownerAuth = { Authorization: 'Bearer owner-token' };

describe('reviewed completeness summary API', () => {
  it('creates a deterministic summary with stored version numbers and pending warning', async () => {
    const context = createContext();
    const response = await request(context.app)
      .post('/assessments/assessment-1/summary')
      .set(ownerAuth);
    assert.equal(response.status, 201);
    const content = response.body.summary.content;
    assert.equal(content.documents.guideline.versionNo, 3);
    assert.equal(content.documents.application.versionNo, 7);
    assert.equal(content.run.heuristicFallback, true);
    assert.equal(content.completion.mandatory.total, 1);
    assert.equal(content.requirements[0].effectiveStatus, 'MISSING');
    assert.equal(content.unreviewed.total, 3);
    assert.equal(content.unreviewedWarning, '3 items not yet reviewed');
    assert.equal(content.openClarificationQuestions.length, 1);
    assert.equal(content.unsupportedClaims.pending.length, 1);
  });

  it('detects staleness after a newer application version is uploaded', async () => {
    const context = createContext();
    await request(context.app)
      .post('/assessments/assessment-1/summary')
      .set(ownerAuth)
      .expect(201);
    context.uploadApplicationVersion();
    const latest = await request(context.app)
      .get('/assessments/assessment-1/summary/latest')
      .set(ownerAuth);
    assert.equal(latest.status, 200);
    assert.equal(latest.body.summary.isStale, true);
    assert.deepEqual(latest.body.summary.currentStaleReasons, ['APPLICATION_CHANGED']);
  });

  it('exports Markdown containing the required disclaimer and review warning', async () => {
    const context = createContext();
    await request(context.app)
      .post('/assessments/assessment-1/summary')
      .set(ownerAuth)
      .expect(201);
    const exported = await request(context.app)
      .get('/summary/summary-1/export?format=md')
      .set(ownerAuth);
    assert.equal(exported.status, 200);
    assert.match(exported.headers['content-type'], /text\/markdown/);
    assert.match(exported.text, /This summary is a workflow aid\. It does not provide legal advice and is not a funding-eligibility decision\./);
    assert.match(exported.text, /3 items not yet reviewed/);
  });

  it('exports the same deterministic summary as JSON', async () => {
    const context = createContext();
    await request(context.app)
      .post('/assessments/assessment-1/summary')
      .set(ownerAuth)
      .expect(201);
    const exported = await request(context.app)
      .get('/summary/summary-1/export?format=json')
      .set(ownerAuth);
    assert.equal(exported.status, 200);
    assert.match(exported.headers['content-type'], /application\/json/);
    const content = JSON.parse(exported.text);
    assert.equal(content.documents.guideline.versionNo, 3);
    assert.match(content.disclaimer, /This summary is a workflow aid/);
    assert.equal(content.unreviewedWarning, '3 items not yet reviewed');
  });

  it('validates route identifiers and export format with Zod', async () => {
    const app = createContext().app;
    const invalidIdentifier = await request(app)
      .get(`/assessments/${'x'.repeat(129)}/summary/latest`)
      .set(ownerAuth);
    const invalidFormat = await request(app)
      .get('/summary/summary-1/export?format=pdf')
      .set(ownerAuth);
    assert.equal(invalidIdentifier.status, 400);
    assert.equal(invalidFormat.status, 400);
  });
});
