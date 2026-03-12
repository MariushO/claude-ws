/**
 * Agent factory upload session update route — POST /api/agent-factory/upload/update
 * Updates an active upload session with user-selected items to import
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryUpdateUploadSessionRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/upload/update', async (request, reply) => {
    const { sessionId, items } = request.body as any;
    if (!sessionId) return reply.code(400).send({ error: 'sessionId is required' });
    if (!Array.isArray(items)) return reply.code(400).send({ error: 'items must be an array' });
    const result = await fastify.services.agentFactory.updateUploadSession?.(sessionId, items);
    if (!result) return reply.code(501).send({ error: 'Not implemented in SDK' });
    return { success: true };
  });
}
