import assert from 'node:assert/strict';
import request from 'supertest';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { createReviewService } from '../src/services/review.service.js';

const appSegments = [{
  id: 'S1',
  text: 'Our verified project plan includes monthly workshops and an assigned coordinator.',
  start: 0,
  end: 81,
}];

function createContext() {
  const auditEvents = [];
  const repository = {
    async findMappingReviewContextForUser(requirementId, userId) {
      if (requirementId !== 'requirement-1' || userId !== 'owner-1') return null;
      return {
        requirement: {
          run: {
            guidelineVersionId: 'guideline-old',
            applicationVersionId: 'application-old',
            applicationVersion: { segments: appSegments },
            assessment: {
              currentGuidelineVersionId: 'guideline-new',
              currentApplicationVersionId: 'application-old',
            },
          },
        },
      };
    },
    async reviewMappingForUser(requirementId, userId, input) {
      if (requirementId !== 'requirement-1' || userId !== 'owner-1') return null;
      const before = {
        reviewDecision: 'PENDING',
        reviewerStatus: null,
        reviewerEvidenceCount: 0,
      };
      const mapping = {
        id: 'mapping-1',
        requirementId,
        aiStatus: 'PARTIAL',
        allVerified: false,
        reviewDecision: input.decision,
        reviewerStatus: input.reviewerStatus ?? null,
        reviewerEvidence: input.evidence ?? null,
        reviewerNote: input.note ?? null,
        reviewedById: userId,
        reviewedAt: new Date(),
      };
      auditEvents.push({
        actorId: userId,
        action: 'mapping.reviewed',
        metadata: {
          before,
          after: {
            reviewDecision: mapping.reviewDecision,
            reviewerStatus: mapping.reviewerStatus,
            reviewerNote: mapping.reviewerNote,
            reviewerEvidenceCount: mapping.reviewerEvidence?.length ?? 0,
          },
        },
      });
      return { mapping };
    },
    async updateRequirementLevelForUser(id, userId, levelOverride) {
      if (id !== 'requirement-1' || userId !== 'owner-1') return null;
      return { id, aiLevel: 'RECOMMENDED', levelOverride };
    },
    async updateQuestionForUser(id, userId, changes) {
      if (id !== 'question-1' || userId !== 'owner-1') return null;
      return { id, ...changes };
    },
    async updateClaimForUser(id, userId, reviewDecision) {
      if (id !== 'claim-1' || userId !== 'owner-1') return null;
      return { id, reviewDecision };
    },
    async findCompletionDataForUser(id, userId) {
      if (id !== 'assessment-1' || userId !== 'owner-1') return null;
      return {
        id,
        currentGuidelineVersionId: 'guideline-new',
        currentApplicationVersionId: 'application-old',
        analysisRuns: [{
          id: 'run-1',
          status: 'COMPLETED',
          guidelineVersionId: 'guideline-old',
          applicationVersionId: 'application-old',
          requirements: [{
            code: 'R1',
            text: 'Describe a project plan.',
            aiLevel: 'MANDATORY',
            sourceVerified: true,
            mapping: {
              aiStatus: 'SUPPORTED',
              allVerified: true,
              reviewDecision: 'PENDING',
              evidence: [{ verified: true }],
            },
          }],
        }],
        supportingDocuments: [],
      };
    },
  };
  const service = createReviewService({ repository });
  const app = createApp({
    authenticationService: {
      async authenticate(token) {
        if (token === 'owner-token') return { id: 'owner-1', email: 'owner@test', name: 'Owner' };
        if (token === 'other-token') return { id: 'other-1', email: 'other@test', name: 'Other' };
        return null;
      },
    },
    review: service,
  });
  return { app, auditEvents };
}

describe('review API', () => {
  it('verifies reviewer citations, permits stale review, and audits before and after', async () => {
    const context = createContext();
    const response = await request(context.app)
      .patch('/requirements/requirement-1/mapping/review')
      .set('Authorization', 'Bearer owner-token')
      .send({
        decision: 'CORRECTED',
        reviewerStatus: 'SUPPORTED',
        evidence: [{
          segmentId: 'S1',
          quote: 'Our verified project plan includes monthly workshops',
        }, {
          segmentId: 'S1',
          quote: 'Fabricated reviewer evidence not present anywhere',
        }],
        note: 'Reviewer found explicit project details.',
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.mapping.reviewerEvidence[0].verified, true);
    assert.equal(response.body.mapping.reviewerEvidence[1].verified, false);
    assert.equal(response.body.stale, true);
    assert.deepEqual(response.body.reasons, ['GUIDELINE_CHANGED']);
    assert.equal(context.auditEvents.length, 1);
    assert.equal(context.auditEvents[0].action, 'mapping.reviewed');
    assert.equal(context.auditEvents[0].metadata.before.reviewDecision, 'PENDING');
    assert.equal(context.auditEvents[0].metadata.after.reviewDecision, 'CORRECTED');
  });

  it('returns 404 when someone else tries to review a mapping', async () => {
    const response = await request(createContext().app)
      .patch('/requirements/requirement-1/mapping/review')
      .set('Authorization', 'Bearer other-token')
      .send({ decision: 'CONFIRMED' });
    assert.equal(response.status, 404);
  });

  it('requires a status for corrected mappings', async () => {
    const response = await request(createContext().app)
      .patch('/requirements/requirement-1/mapping/review')
      .set('Authorization', 'Bearer owner-token')
      .send({ decision: 'CORRECTED' });
    assert.equal(response.status, 400);
  });

  it('allows the owner to update a level, question, and claim', async () => {
    const app = createContext().app;
    const level = await request(app)
      .patch('/requirements/requirement-1/level')
      .set('Authorization', 'Bearer owner-token')
      .send({ levelOverride: 'MANDATORY' });
    const question = await request(app)
      .patch('/questions/question-1')
      .set('Authorization', 'Bearer owner-token')
      .send({ status: 'ANSWERED', answer: 'The project plan is in section two.' });
    const claim = await request(app)
      .patch('/claims/claim-1')
      .set('Authorization', 'Bearer owner-token')
      .send({ reviewDecision: 'CONFIRMED_ISSUE' });
    assert.equal(level.status, 200);
    assert.equal(level.body.requirement.levelOverride, 'MANDATORY');
    assert.equal(question.status, 200);
    assert.equal(question.body.question.status, 'ANSWERED');
    assert.equal(claim.status, 200);
    assert.equal(claim.body.claim.reviewDecision, 'CONFIRMED_ISSUE');
  });

  it('returns deterministic completion and staleness for the owner', async () => {
    const response = await request(createContext().app)
      .get('/assessments/assessment-1/completion')
      .set('Authorization', 'Bearer owner-token');
    assert.equal(response.status, 200);
    assert.equal(response.body.completion.mandatory.total, 1);
    assert.equal(response.body.completion.mandatory.aiSuggestedMet, 1);
    assert.equal(response.body.completion.stale, true);
    assert.deepEqual(response.body.completion.reasons, ['GUIDELINE_CHANGED']);
    assert.match(response.body.completion.disclaimer, /not an authoritative/);
  });
});
