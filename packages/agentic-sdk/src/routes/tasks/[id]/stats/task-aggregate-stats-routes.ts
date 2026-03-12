/**
 * Task stats routes - GET /api/tasks/:id/stats
 * Delegates to taskService.getStats() for all aggregation and context health logic
 */
import { FastifyInstance } from 'fastify';

export default async function taskAggregateStatsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/stats', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;
      const stats = await fastify.services.task.getStats(taskId);
      return stats;
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to get task stats');
      return reply.code(500).send({ error: 'Failed to get task stats' });
    }
  });
}
