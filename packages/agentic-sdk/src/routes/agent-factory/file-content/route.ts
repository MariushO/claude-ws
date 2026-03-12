/**
 * Agent factory file content route — POST /api/agent-factory/file-content
 * Thin transport adapter — all logic in agent-factory filesystem service.
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryReadFileContentRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/file-content', async (request, reply) => {
    const { basePath, filePath } = request.body as any;
    if (!basePath || !filePath) return reply.code(400).send({ error: 'Missing basePath or filePath' });

    const result = await fastify.services.agentFactoryFs.readSourceFileContent(basePath, filePath);
    if ('error' in result) return reply.code(result.status).send({ error: result.error });
    return result;
  });
}
