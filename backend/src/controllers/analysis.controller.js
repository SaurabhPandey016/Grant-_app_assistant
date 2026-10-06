import {
  serializeAnalysisRun,
  serializeLatestAnalysis,
} from '../serializers/analysis.serializer.js';

/**
 * @param {import('../services/analysis.service.js').AnalysisService} service
 */
export function createAnalysisController(service) {
  return {
    async run(request, response) {
      const run = await service.startAnalysis(request.params.id, request.user.id);
      response.status(202).json({ run: serializeAnalysisRun(run) });
    },

    async runStatus(request, response) {
      const run = await service.getAnalysisRun(
        request.params.id,
        request.params.runId,
        request.user.id,
      );
      response.status(200).json({
        run: serializeAnalysisRun(run),
        ...(run.status === 'COMPLETED'
          ? { analysis: serializeLatestAnalysis(run) }
          : {}),
      });
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
