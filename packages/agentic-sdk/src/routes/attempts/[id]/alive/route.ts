/**
 * GET /api/attempts/:id/alive — check if attempt has an active agent or pending question
 */
import { FastifyInstance } from 'fastify';

export default async function attemptAlive(fastify: FastifyInstance) {
  fastify.get('/api/attempts/:id/alive', async (request, reply) => {
    const { id } = request.params as any;
    const hasAgent = fastify.agentManager.isRunning(id);
    const hasPendingQuestion = fastify.agentManager.hasPendingQuestion(id);
    return { attemptId: id, alive: hasAgent || hasPendingQuestion, hasAgent, hasPendingQuestion };
  });
}
