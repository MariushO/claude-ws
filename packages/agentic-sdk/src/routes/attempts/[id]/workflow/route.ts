/**
 * GET /api/attempts/:id/workflow — return workflow tree for an attempt
 * Thin transport adapter — all logic in attempt workflow service.
 */
import { FastifyInstance } from 'fastify';

export default async function attemptWorkflow(fastify: FastifyInstance) {
  fastify.get('/api/attempts/:id/workflow', async (request) => {
    const { id: attemptId } = request.params as any;
    return fastify.services.attemptWorkflow.getWorkflowFromDb(attemptId);
  });
}
