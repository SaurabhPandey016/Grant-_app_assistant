import { getHealth } from '../services/health.service.js';
import { serializeHealth } from '../serializers/health.serializer.js';

export async function healthController(request, response) {
  const health = await getHealth();
  response.status(200).json(serializeHealth(health));
}
