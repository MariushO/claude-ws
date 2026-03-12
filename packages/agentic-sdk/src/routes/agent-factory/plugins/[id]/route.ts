/**
 * Agent factory plugin by ID routes — GET, PUT, DELETE /api/agent-factory/plugins/:id
 * DELETE also removes plugin files from disk for local/imported agent-factory plugins
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryPluginByIdRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins/:id', async (request, reply) => {
    const plugin = await fastify.services.agentFactory.getPlugin((request.params as any).id);
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });
    return { plugin };
  });

  fastify.put('/api/agent-factory/plugins/:id', async (request, reply) => {
    const plugin = await fastify.services.agentFactory.updatePlugin(
      (request.params as any).id,
      request.body as any,
    );
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });
    return { plugin };
  });

  fastify.delete('/api/agent-factory/plugins/:id', async (request, reply) => {
    const existing = await fastify.services.agentFactory.getPlugin((request.params as any).id);
    if (!existing) return reply.code(404).send({ error: 'Plugin not found' });
    await fastify.services.agentFactory.deletePluginWithFiles((request.params as any).id);
    return reply.code(204).send();
  });
}
