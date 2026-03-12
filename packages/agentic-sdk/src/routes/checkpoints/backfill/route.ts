/**
 * POST /api/checkpoints/backfill — bulk-create checkpoints
 * Supports targeted (taskId + checkpoints array) and auto-backfill (no params).
 * Thin transport adapter — delegates to checkpoint service.
 */
import { FastifyInstance } from 'fastify';

export default async function checkpointBackfillRoute(fastify: FastifyInstance) {
  fastify.post('/api/checkpoints/backfill', async (request, reply) => {
    try {
      const body = (request.body as any) || {};

      // Targeted backfill: taskId + checkpoints array
      if (body.taskId && body.checkpoints) {
        if (!Array.isArray(body.checkpoints)) {
          return reply.code(400).send({ error: 'checkpoints must be an array' });
        }
        const result = await fastify.services.checkpoint.backfill(body.taskId, body.checkpoints);
        return reply.code(201).send(result);
      }

      // Auto-backfill: create checkpoints for completed attempts without one
      const result = await fastify.services.checkpoint.backfillFromCompleted();
      return { success: true, ...result };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to backfill checkpoints');
      return reply.code(500).send({ error: 'Failed to backfill checkpoints' });
    }
  });
}
