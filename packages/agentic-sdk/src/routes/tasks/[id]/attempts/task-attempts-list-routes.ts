/**
 * Task attempts routes - GET /api/tasks/:id/attempts (list all attempts for a task)
 */
import { FastifyInstance } from 'fastify';

export default async function taskAttemptsListRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/attempts', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;

      const task = await fastify.services.task.getById(taskId);
      if (!task) return reply.code(404).send({ error: 'Task not found' });

      const attempts = await fastify.services.task.getAttempts(taskId);
      return { attempts };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fetch attempts');
      return reply.code(500).send({ error: 'Failed to fetch attempts' });
    }
  });
}
