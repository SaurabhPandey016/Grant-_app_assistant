import assert from 'node:assert/strict';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MAX_DOCUMENT_CHARS } from '../src/domain/segmenter.js';
import { createAssessmentService } from '../src/services/assessment.service.js';

function createTestContext() {
  const assessments = new Map();
  const versions = new Map();
  const auditEvents = [];
  let nextAssessmentId = 1;
  let nextVersionId = 1;

  const repository = {
    async createAssessmentForUser(userId, name) {
      const assessment = {
        id: `assessment-${nextAssessmentId++}`,
        userId,
        name,
        currentGuidelineVersionId: null,
        currentApplicationVersionId: null,
        currentGuidelineVersion: null,
        currentApplicationVersion: null,
        analysisRuns: [],
      };
      assessments.set(assessment.id, assessment);
      return assessment;
    },
    async listAssessmentsForUser(userId) {
      return [...assessments.values()]
        .filter((assessment) => assessment.userId === userId)
        .map((assessment) => ({ ...assessment }));
    },
    async findAssessmentForUser(id, userId) {
      const assessment = assessments.get(id);
      return assessment?.userId === userId ? { ...assessment } : null;
    },
    async deleteAssessmentForUser(id, userId) {
      const assessment = assessments.get(id);
      return assessment?.userId === userId ? assessments.delete(id) : false;
    },
    async createDocumentVersionForUser(input) {
      const assessment = assessments.get(input.assessmentId);
      if (assessment?.userId !== input.userId) return null;

      const currentKey = input.kind === 'GUIDELINE'
        ? 'currentGuidelineVersion'
        : 'currentApplicationVersion';
      const current = assessment[currentKey];
      if (current?.contentHash === input.contentHash) {
        return { version: current, unchanged: true };
      }

      const previousVersions = [...versions.values()].filter(
        (version) => version.assessmentId === input.assessmentId && version.kind === input.kind,
      );
      const version = {
        id: `version-${nextVersionId++}`,
        ...input,
        versionNo: previousVersions.length + 1,
        createdAt: new Date(),
      };
      versions.set(version.id, version);
      assessment[currentKey] = version;
      const currentIdKey = input.kind === 'GUIDELINE'
        ? 'currentGuidelineVersionId'
        : 'currentApplicationVersionId';
      assessment[currentIdKey] = version.id;
      auditEvents.push({ action: 'document.version.created', entityId: version.id });
      return { version, unchanged: false };
    },
    async listDocumentVersionsForUser(assessmentId, userId, kind) {
      if (assessments.get(assessmentId)?.userId !== userId) return [];
      return [...versions.values()]
        .filter((version) => version.assessmentId === assessmentId && (!kind || version.kind === kind))
        .map(({ content, segments, ...version }) => version)
        .reverse();
    },
    async findDocumentVersionForUser(versionId, userId) {
      const version = versions.get(versionId);
      return version && assessments.get(version.assessmentId)?.userId === userId ? version : null;
    },
    async createSupportingDocumentForUser(input) {
      if (assessments.get(input.assessmentId)?.userId !== input.userId) return null;
      const document = {
        id: `supporting-${auditEvents.length + 1}`,
        assessmentId: input.assessmentId,
        name: input.name,
        docType: input.docType,
        status: input.status,
        notes: input.notes ?? null,
        requirementId: input.requirementId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      auditEvents.push({
        action: 'supporting_document.created',
        entityId: document.id,
        document,
      });
      return document;
    },
    async listSupportingDocumentsForUser(assessmentId, userId) {
      if (assessments.get(assessmentId)?.userId !== userId) return [];
      return auditEvents
        .filter(({ action }) => action.startsWith('supporting_document.'))
        .map(({ document }) => document)
        .filter((document) => document?.assessmentId === assessmentId);
    },
    async updateSupportingDocumentForUser(assessmentId, documentId, userId, changes) {
      const event = auditEvents.find(({ document }) => document?.id === documentId);
      if (
        assessments.get(assessmentId)?.userId !== userId
        || event?.document?.assessmentId !== assessmentId
      ) return null;
      Object.assign(event.document, changes, { updatedAt: new Date() });
      auditEvents.push({ action: 'supporting_document.updated', entityId: documentId });
      return event.document;
    },
    async deleteSupportingDocumentForUser(assessmentId, documentId, userId) {
      const eventIndex = auditEvents.findIndex(({ document }) => document?.id === documentId);
      if (
        assessments.get(assessmentId)?.userId !== userId
        || eventIndex < 0
        || auditEvents[eventIndex].document.assessmentId !== assessmentId
      ) return false;
      auditEvents.splice(eventIndex, 1);
      auditEvents.push({ action: 'supporting_document.deleted', entityId: documentId });
      return true;
    },
  };

  const service = createAssessmentService({ repository });
  const authenticationService = {
    async authenticate(token) {
      return token === 'user-1-token'
        ? { id: 'user-1', email: 'one@example.test', name: 'User One' }
        : token === 'user-2-token'
          ? { id: 'user-2', email: 'two@example.test', name: 'User Two' }
          : null;
    },
  };
  const app = createApp({ authenticationService, assessments: service });

  return { app, repository, assessments, versions, auditEvents };
}

describe('assessment and document APIs', () => {
  let context;
  const userOne = { Authorization: 'Bearer user-1-token' };

  beforeEach(() => {
    context = createTestContext();
  });

  afterEach(() => {
    context = undefined;
  });

  async function createAssessment() {
    const response = await request(context.app)
      .post('/assessments')
      .set(userOne)
      .send({ name: 'Community garden' });
    assert.equal(response.status, 201);
    return response.body.assessment.id;
  }

  it('creates a new immutable version when content changes', async () => {
    const assessmentId = await createAssessment();
    const first = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .send({ kind: 'GUIDELINE', title: 'Fund rules', content: 'The first rules.' });
    const second = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .send({ kind: 'GUIDELINE', title: 'Fund rules', content: 'The updated rules.' });

    assert.equal(first.status, 201);
    assert.equal(first.body.version.versionNo, 1);
    assert.equal(second.status, 201);
    assert.equal(second.body.version.versionNo, 2);
    assert.notEqual(first.body.version.id, second.body.version.id);
    assert.equal(context.auditEvents.length, 2);
  });

  it('does not create another version when normalized content is identical', async () => {
    const assessmentId = await createAssessment();
    const first = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .send({ kind: 'APPLICATION', title: 'Draft', content: 'Draft text\r\n' });
    const same = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .send({ kind: 'APPLICATION', title: 'Changed title', content: 'Draft text\n' });

    assert.equal(first.status, 201);
    assert.equal(same.status, 200);
    assert.equal(same.body.unchanged, true);
    assert.equal(same.body.version.id, first.body.version.id);
    assert.equal(context.versions.size, 1);
    assert.equal(context.auditEvents.length, 1);
  });

  it('returns 404 when an authenticated user accesses another user’s assessment', async () => {
    const assessmentId = await createAssessment();
    const response = await request(context.app)
      .get(`/assessments/${assessmentId}`)
      .set('Authorization', 'Bearer user-2-token');

    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'ASSESSMENT_NOT_FOUND');
  });

  it('rejects unsupported, empty, and oversized documents', async () => {
    const assessmentId = await createAssessment();
    const unsupported = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .field('kind', 'GUIDELINE')
      .attach('file', Buffer.from('rules'), 'rules.pdf');
    const empty = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .send({ kind: 'GUIDELINE', title: 'Empty', content: '  ' });
    const oversized = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .send({
        kind: 'GUIDELINE',
        title: 'Too large',
        content: 'x'.repeat(MAX_DOCUMENT_CHARS + 1),
      });

    assert.equal(unsupported.status, 415);
    assert.equal(empty.status, 400);
    assert.equal(oversized.status, 413);
  });

  it('lists document metadata without content and returns scoped full versions', async () => {
    const assessmentId = await createAssessment();
    const created = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .send({ kind: 'GUIDELINE', title: 'Fund rules', content: '# Rules\n\nA paragraph.' });
    const list = await request(context.app)
      .get(`/assessments/${assessmentId}/documents?kind=GUIDELINE`)
      .set(userOne);
    const detail = await request(context.app)
      .get(`/documents/${created.body.version.id}`)
      .set(userOne);
    const otherUser = await request(context.app)
      .get(`/documents/${created.body.version.id}`)
      .set('Authorization', 'Bearer user-2-token');

    assert.equal(list.status, 200);
    assert.equal('content' in list.body.versions[0], false);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.version.content, '# Rules\n\nA paragraph.');
    assert.equal(detail.body.version.segments[0].id, 'S1');
    assert.equal(otherUser.status, 404);
  });

  it('supports metadata-only multipart uploads', async () => {
    const assessmentId = await createAssessment();
    const response = await request(context.app)
      .post(`/assessments/${assessmentId}/documents`)
      .set(userOne)
      .field('kind', 'APPLICATION')
      .attach('file', Buffer.from('# Application\n\nDraft text.'), 'application.md');

    assert.equal(response.status, 201);
    assert.equal(response.body.version.title, 'application');
    const detail = await request(context.app)
      .get(`/documents/${response.body.version.id}`)
      .set(userOne);
    assert.equal(detail.body.version.content, '# Application\n\nDraft text.');
  });

  it('returns latest-run staleness on assessment status and list', async () => {
    const assessmentId = await createAssessment();
    const status = await request(context.app)
      .get(`/assessments/${assessmentId}/status`)
      .set(userOne);
    const list = await request(context.app)
      .get('/assessments')
      .set(userOne);

    assert.equal(status.status, 200);
    assert.equal(status.body.stale, true);
    assert.deepEqual(status.body.reasons, ['NO_RUN']);
    assert.equal(list.body.assessments.length, 1);
    assert.equal(list.body.assessments[0].latestRun, null);
    assert.deepEqual(list.body.assessments[0].reasons, ['NO_RUN']);
  });

  it('creates, lists, updates, and deletes supporting-document metadata', async () => {
    const assessmentId = await createAssessment();
    const created = await request(context.app)
      .post(`/assessments/${assessmentId}/supporting-documents`)
      .set(userOne)
      .send({
        name: 'Registration certificate',
        docType: 'REGISTRATION_CERTIFICATE',
        status: 'PROVIDED',
        requirementId: 'requirement-registration-certificate',
      });
    const listed = await request(context.app)
      .get(`/assessments/${assessmentId}/supporting-documents`)
      .set(userOne);
    const updated = await request(context.app)
      .patch(`/assessments/${assessmentId}/supporting-documents/${created.body.supportingDocument.id}`)
      .set(userOne)
      .send({
        status: 'MISSING',
        notes: 'Please upload an updated copy.',
        requirementId: 'requirement-registration-certificate',
      });
    const deleted = await request(context.app)
      .delete(`/assessments/${assessmentId}/supporting-documents/${created.body.supportingDocument.id}`)
      .set(userOne);

    assert.equal(created.status, 201);
    assert.equal(created.body.supportingDocument.requirementId, 'requirement-registration-certificate');
    assert.equal(listed.body.supportingDocuments.length, 1);
    assert.equal(updated.body.supportingDocument.status, 'MISSING');
    assert.equal(updated.body.supportingDocument.requirementId, 'requirement-registration-certificate');
    assert.equal(deleted.status, 204);
  });

  it('deletes assessments only for their owner', async () => {
    const assessmentId = await createAssessment();
    const forbiddenByConcealment = await request(context.app)
      .delete(`/assessments/${assessmentId}`)
      .set('Authorization', 'Bearer user-2-token');
    const deleted = await request(context.app)
      .delete(`/assessments/${assessmentId}`)
      .set(userOne);
    const missing = await request(context.app)
      .get(`/assessments/${assessmentId}`)
      .set(userOne);

    assert.equal(forbiddenByConcealment.status, 404);
    assert.equal(deleted.status, 204);
    assert.equal(missing.status, 404);
  });
});
