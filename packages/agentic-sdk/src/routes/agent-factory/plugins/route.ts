/**
 * Agent factory plugins root routes — GET list and POST create plugin
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryPluginsRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins', async (request, _reply) => {
    const { type, projectId } = request.query as any;
    return fastify.services.agentFactory.listPlugins({ type, projectId });
  });

  fastify.post('/api/agent-factory/plugins', async (request, reply) => {
    const plugin = await fastify.services.agentFactory.createPlugin(request.body as any);
    return reply.code(201).send(plugin);
  });
}
