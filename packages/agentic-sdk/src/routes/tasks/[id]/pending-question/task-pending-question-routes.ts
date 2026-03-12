/**
 * Task pending question routes - GET /api/tasks/:id/pending-question (get persistent pending question for a task)
 */
import { FastifyInstance } from 'fastify';

export default async function taskPendingQuestionRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/pending-question', async (request, _reply) => {
    const { id: taskId } = request.params as any;

    const data = (fastify.agentManager as any).getPersistentQuestion?.(taskId);
    if (!data) return { question: null };

    return {
      question: {
        attemptId: data.attemptId,
        toolUseId: data.toolUseId,
        questions: data.questions,
      },
    };
  });
}
