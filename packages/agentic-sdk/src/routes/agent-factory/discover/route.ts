/**
 * Agent factory discover route — POST /api/agent-factory/discover
 * Scans a directory path and discovers available agent factory plugins/components
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryDiscoverPluginsRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/discover', async (request, reply) => {
    const { path } = request.body as any;
    if (!path) return reply.code(400).send({ error: 'path is required' });
    const plugins = await fastify.services.agentFactory.discoverPlugins(path);
    return reply.code(200).send(plugins);
  });
}
