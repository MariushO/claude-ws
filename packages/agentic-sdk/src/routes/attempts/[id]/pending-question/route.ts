/**
 * GET /api/attempts/:id/pending-question — get the current pending question for an attempt
 */
import { FastifyInstance } from 'fastify';

export default async function attemptPendingQuestion(fastify: FastifyInstance) {
  fastify.get('/api/attempts/:id/pending-question', async (request, reply) => {
    const { id } = request.params as any;
    const data = fastify.agentManager.getPendingQuestionData(id);
    if (!data) return { question: null };
    return { question: { attemptId: id, toolUseId: data.toolUseId, questions: data.questions } };
  });
}
