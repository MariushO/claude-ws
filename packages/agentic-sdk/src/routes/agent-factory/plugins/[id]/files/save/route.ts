/**
 * Plugin file save route — PUT /api/agent-factory/plugins/:id/files/save
 * Thin transport adapter — all logic in agent-factory filesystem service.
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryPluginFileSaveRoute(fastify: FastifyInstance) {
  fastify.put('/api/agent-factory/plugins/:id/files/save', async (request, reply) => {
    const { id } = request.params as any;
    const { filePath, content } = request.body as any;

    const plugin = await fastify.services.agentFactory.getPlugin(id);
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });

    const result = await fastify.services.agentFactoryFs.savePluginFile(plugin, filePath, content);
    if ('error' in result) return reply.code(result.status).send({ error: result.error });
    return result;
  });
}
