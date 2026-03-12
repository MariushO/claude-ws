/**
 * Task conversation routes - GET /api/tasks/:id/conversation
 * Delegates to taskService.getConversationHistory() for all DB and message-building logic.
 */
import { FastifyInstance } from 'fastify';

export default async function taskConversationHistoryRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/conversation', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;
      const turns = await fastify.services.task.getConversationHistory(taskId);
      return { turns };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fetch conversation');
      return reply.code(500).send({ error: 'Failed to fetch conversation' });
    }
  });
}
