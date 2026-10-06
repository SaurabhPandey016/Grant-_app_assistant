import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../src/middleware/error-handler.js';
import { createAiService } from '../src/ai/index.js';
import { createHeuristicProvider } from '../src/ai/heuristicProvider.js';
import { createOpenAiCompatibleProvider } from '../src/ai/openAiCompatibleProvider.js';
import { RequirementsOutput } from '../src/ai/schemas.js';
import { runStructured } from '../src/ai/runStructured.js';
import {
  buildClaimsAndQuestionsPrompt,
  buildMappingPrompt,
  buildRequirementsPrompt,
} from '../src/ai/prompts/index.js';

const validOutput = {
  requirements: [{
    text: 'Applicants must submit a registration certificate.',
    category: 'DOCUMENT',
    level: 'MANDATORY',
    sourceSegmentId: 'S1',
    sourceQuote: 'Applicants must submit a registration certificate.',
    needsDocument: true,
    documentType: 'Registration certificate',
  }],
};

function completion(text) {
  return {
    text,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    providerName: 'fake',
    model: 'fake-model',
  };
}

const quietLogger = {
  info() {},
  warn() {},
};

describe('runStructured', () => {
  it('returns provider JSON after schema validation', async () => {
    const result = await runStructured({
      provider: { async completeJson() { return completion(JSON.stringify(validOutput)); } },
      schema: RequirementsOutput,
      system: 'system',
      user: 'user',
      promptVersion: 'test-v1',
      logger: quietLogger,
    });

    assert.deepEqual(result.data, validOutput);
    assert.equal(result.providerName, 'fake');
    assert.equal(result.usage.totalTokens, 15);
  });

  it('retries invalid JSON once with validation guidance, then throws AI_OUTPUT_INVALID', async () => {
    const users = [];
    const provider = {
      async completeJson(input) {
        users.push(input.user);
        return completion('not JSON');
      },
    };

    await assert.rejects(
      runStructured({
        provider,
        schema: RequirementsOutput,
        system: 'system',
        user: 'original prompt',
        promptVersion: 'test-v1',
        logger: quietLogger,
      }),
      (error) => error instanceof AppError && error.code === 'AI_OUTPUT_INVALID',
    );
    assert.equal(users.length, 2);
    assert.equal(users[0], 'original prompt');
    assert.match(users[1], /validation errors/);
  });

  it('extracts and validates fenced JSON', async () => {
    const result = await runStructured({
      provider: {
        async completeJson() {
          return completion(`Here is the result:\n\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``);
        },
      },
      schema: RequirementsOutput,
      system: 'system',
      user: 'user',
      promptVersion: 'test-v1',
      logger: quietLogger,
    });

    assert.deepEqual(result.data, validOutput);
  });

  it('requests JSON mode from an OpenAI-compatible API', async () => {
    let requestOptions;
    const provider = createOpenAiCompatibleProvider({
      model: 'test-model',
      timeoutMs: 5000,
      client: {
        chat: {
          completions: {
            async create(options) {
              requestOptions = options;
              return {
                model: 'test-model',
                choices: [{ message: { content: '{"requirements":[]}' } }],
                usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
              };
            },
          },
        },
      },
    });

    const result = await provider.completeJson({ system: 'system', user: 'user' });
    assert.deepEqual(requestOptions.response_format, { type: 'json_object' });
    assert.equal(result.providerName, 'openai-compatible');
    assert.equal(result.usage.totalTokens, 7);
  });
});

describe('heuristic provider', () => {
  it('classifies mandatory must language and recommended should language', async () => {
    const provider = createHeuristicProvider();
    const prompt = buildRequirementsPrompt([
      {
        id: 'S1',
        text: 'Applicants must submit a registration certificate. Applicants should include partner letters.',
      },
    ]);
    const response = await provider.completeJson(prompt);
    const result = RequirementsOutput.parse(JSON.parse(response.text));

    assert.deepEqual(result.requirements.map(({ level }) => level), ['MANDATORY', 'RECOMMENDED']);
    assert.equal(result.requirements[0].sourceSegmentId, 'S1');
    assert.equal(
      result.requirements[0].sourceQuote,
      'Applicants must submit a registration certificate.',
    );
    assert.equal(result.requirements[0].category, 'DOCUMENT');
  });

  it('maps with deterministic overlap and asks about unsupported mandatory items', async () => {
    const heuristic = createHeuristicProvider();
    const guidelineSegments = [{
      id: 'S1',
      text: 'Applicants must provide an audited financial report.',
    }];
    const applicationSegments = [{
      id: 'S1',
      text: 'Our program will run in the neighborhood.',
    }];
    const requirementsPrompt = buildRequirementsPrompt(guidelineSegments);
    const requirementOutput = JSON.parse((await heuristic.completeJson(requirementsPrompt)).text);
    const requirements = requirementOutput.requirements.map((requirement, index) => ({
      code: `R${index + 1}`,
      ...requirement,
    }));
    const mappingPrompt = buildMappingPrompt(guidelineSegments, applicationSegments, requirements);
    const mappings = JSON.parse((await heuristic.completeJson(mappingPrompt)).text).mappings;
    const claimsPrompt = buildClaimsAndQuestionsPrompt(
      guidelineSegments,
      applicationSegments,
      requirements,
      mappings,
    );
    const claims = JSON.parse((await heuristic.completeJson(claimsPrompt)).text);

    assert.equal(mappings[0].status, 'MISSING');
    assert.deepEqual(mappings[0].evidence, []);
    assert.equal(claims.questions.length, 1);
    assert.equal(claims.questions[0].requirementCode, 'R1');
  });

  it('does not treat explicit statements of missing evidence as supporting evidence', async () => {
    const provider = createHeuristicProvider();
    const guideline = [{
      id: 'S1',
      text: 'Applicants must provide an itemized budget breakdown.',
    }];
    const application = [{
      id: 'S1',
      text: 'We have not completed an itemized budget breakdown yet.',
    }];
    const requirements = JSON.parse(
      (await provider.completeJson(buildRequirementsPrompt(guideline))).text,
    ).requirements.map((requirement, index) => ({ code: `R${index + 1}`, ...requirement }));
    const mappings = JSON.parse((
      await provider.completeJson(buildMappingPrompt(guideline, application, requirements))
    ).text).mappings;

    assert.equal(mappings[0].status, 'MISSING');
    assert.deepEqual(mappings[0].evidence, []);
  });

  it('uses heuristic fallback only after two live-provider transport failures', async () => {
    let liveCalls = 0;
    const liveProvider = {
      async completeJson() {
        liveCalls += 1;
        throw new Error('provider error includes sensitive details');
      },
    };
    let heuristicCalls = 0;
    const heuristic = createHeuristicProvider({ providerName: 'heuristic-fallback' });
    const heuristicProvider = {
      async completeJson(input) {
        heuristicCalls += 1;
        return heuristic.completeJson(input);
      },
    };
    const service = createAiService({
      configuredProvider: liveProvider,
      heuristicProvider,
      logger: quietLogger,
    });
    const result = await service.runAnalysis({
      guidelineSegments: [{
        id: 'S1',
        text: 'Applicants must submit a registration certificate.',
      }],
      applicationSegments: [{
        id: 'S1',
        text: 'The application has no supporting documents.',
      }],
    });

    assert.equal(liveCalls, 2);
    assert.equal(heuristicCalls, 3);
    assert.equal(result.provider, 'heuristic-fallback');
    assert.equal(result.aiUnavailable, true);
    assert.equal(result.requirements.length, 1);
  });
});
