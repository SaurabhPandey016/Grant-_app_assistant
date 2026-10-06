import { env } from './config/env.js';
import { app } from './app.js';
import { logger } from './lib/logger.js';
import { disconnectDatabase } from './repositories/prisma.js';
import { analysisService } from './services/analysis.service.js';

const interruptedRunCount = await analysisService.failInterruptedRunsOnStartup();
if (interruptedRunCount > 0) {
  logger.warn({ interruptedRunCount }, 'Marked analysis runs interrupted by previous process');
}

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Backend server listening');
});

async function shutDown(signal) {
  logger.info({ signal }, 'Shutting down backend server');
  server.close(async (error) => {
    if (error) {
      logger.error({
        errorName: error.name,
        errorCode: error.code,
      }, 'Failed to close HTTP server');
      process.exitCode = 1;
    }
    await disconnectDatabase();
  });
}

process.on('SIGINT', () => void shutDown('SIGINT'));
process.on('SIGTERM', () => void shutDown('SIGTERM'));
