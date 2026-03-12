/**
 * Plugin files listing route — GET /api/agent-factory/plugins/:id/files
 * Thin transport adapter — all logic in agent-factory filesystem service.
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryPluginFilesListRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins/:id/files', async (request, reply) => {
    const { id } = request.params as any;
    const plugin = await fastify.services.agentFactory.getPlugin(id);
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });

    const result = await fastify.services.agentFactoryFs.listPluginFiles(plugin);
    if (result.error) return reply.code(404).send({ error: result.error });
    return { files: result.files };
  });
}
