/**
 * Plugin file content by path route — GET /api/agent-factory/plugins/:id/files/*
 * Thin transport adapter — all logic in agent-factory filesystem service.
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryPluginFileContentByPathRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins/:id/files/*', async (request, reply) => {
    const { id } = request.params as any;
    const filePath = (request.params as any)['*'];
    if (!filePath) return reply.code(400).send({ error: 'File path required' });

    const plugin = await fastify.services.agentFactory.getPlugin(id);
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });

    const result = await fastify.services.agentFactoryFs.readPluginFile(plugin, filePath.split('/'));
    if ('error' in result) return reply.code(result.status).send({ error: result.error });
    return result;
  });
}
