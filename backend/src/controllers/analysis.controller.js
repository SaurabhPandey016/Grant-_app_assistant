import {
  serializeAnalysisResult,
  serializeAnalysisRun,
  serializeLatestAnalysis,
} from '../serializers/analysis.serializer.js';

/**
 * @param {import('../services/analysis.service.js').AnalysisService} service
 */
export function createAnalysisController(service) {
  return {
    async run(request, response) {
      const result = await service.runAnalysis(request.params.id, request.user.id);
      response.status(201).json({ analysis: serializeAnalysisResult(result) });
    },

    async latest(request, response) {
      const result = await service.getLatestAnalysis(request.params.id, request.user.id);
      response.status(200).json({ analysis: serializeLatestAnalysis(result) });
    },

    async listRuns(request, response) {
      const runs = await service.listAnalysisRuns(request.params.id, request.user.id);
      response.status(200).json({ runs: runs.map(serializeAnalysisRun) });
    },
  };
}
