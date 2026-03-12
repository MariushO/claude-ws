/**
 * Agent factory upload session cancel route — POST /api/agent-factory/upload/cancel
 * Cancels an active upload session and cleans up temporary extracted files
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryCancelUploadSessionRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/upload/cancel', async (request, reply) => {
    const { sessionId } = request.body as any;
    if (!sessionId) return reply.code(400).send({ error: 'sessionId is required' });
    await fastify.services.agentFactory.cancelUploadSession?.(sessionId);
    return { success: true };
  });
}
