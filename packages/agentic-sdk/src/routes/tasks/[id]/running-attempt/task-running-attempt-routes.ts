/**
 * Task running attempt routes - GET /api/tasks/:id/running-attempt
 * Delegates to taskService.getRunningAttempt() for all DB logic
 */
import { FastifyInstance } from 'fastify';

export default async function taskRunningAttemptRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/running-attempt', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;
      const result = await fastify.services.task.getRunningAttempt(taskId);
      return result;
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fetch running attempt');
      return reply.code(500).send({ error: 'Failed to fetch running attempt' });
    }
  });
}
