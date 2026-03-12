/**
 * Agent factory upload route — POST /api/agent-factory/upload
 * Handles multipart archive uploads or JSON confirm payloads for component import sessions
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryUploadComponentArchiveRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/upload', async (request, reply) => {
    const contentType = request.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const body = request.body as any;
      const result = await fastify.services.agentFactory.confirmUpload?.(body);
      if (!result) return reply.code(501).send({ error: 'Upload confirm not implemented in SDK' });
      return result;
    }
    // Multipart upload
    const data = await (request as any).file?.();
    if (!data) return reply.code(400).send({ error: 'No file provided' });
    const result = await fastify.services.agentFactory.handleUpload?.(data);
    if (!result) return reply.code(501).send({ error: 'Upload not implemented in SDK' });
    return result;
  });
}
