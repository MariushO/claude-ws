/**
 * Agent factory plugins root routes — GET list (existence-filtered) and POST create plugin with file
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryPluginsRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins', async (request, _reply) => {
    const { type } = request.query as any;
    const validType = type && ['skill', 'command', 'agent', 'agent_set'].includes(type) ? type : undefined;
    const plugins = await fastify.services.agentFactory.listPluginsWithExistenceFilter({ type: validType });
    return { plugins };
  });

  fastify.post('/api/agent-factory/plugins', async (request, reply) => {
    const { type, name, description, storageType, metadata } = request.body as any;
    if (!type || !name) return reply.code(400).send({ error: 'Missing required fields: type, name' });

    const result = await fastify.services.agentFactory.createPluginWithFile({ type, name, description, storageType, metadata });
    if ('error' in result) return reply.code(result.statusCode).send({ error: result.error });
    return reply.code(201).send({ plugin: result.plugin });
  });
}
