/**
 * Agent factory files listing route — POST /api/agent-factory/files
 * Thin transport adapter — all logic in agent-factory filesystem service.
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryListSourceFilesRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/files', async (request, reply) => {
    const { sourcePath, type } = request.body as any;
    if (!sourcePath || !type) return reply.code(400).send({ error: 'Missing sourcePath or type' });

    const result = await fastify.services.agentFactoryFs.listSourcePathFiles(sourcePath, type);
    if ('error' in result) return reply.code(result.status).send({ error: result.error });
    return result;
  });
}
