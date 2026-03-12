/**
 * GET /api/checkpoints?taskId=xxx — list checkpoints with attempt prompt info
 * Thin transport adapter — delegates to checkpoint service.
 */
import { FastifyInstance } from 'fastify';

export default async function checkpointListRoute(fastify: FastifyInstance) {
  fastify.get('/api/checkpoints', async (request, reply) => {
    try {
      const { taskId } = request.query as any;
      if (!taskId) return reply.code(400).send({ error: 'taskId required' });

      const checkpoints = await fastify.services.checkpoint.listWithAttemptInfo(taskId);
      return checkpoints;
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fetch checkpoints');
      return reply.code(500).send({ error: 'Failed to fetch checkpoints' });
    }
  });
}
