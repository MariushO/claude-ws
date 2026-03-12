/**
 * Plugin dependencies routes — GET list, POST add, DELETE remove dependency
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryPluginDependenciesRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins/:id/dependencies', async (request, reply) => {
    const deps = await fastify.services.agentFactory.listDependencies((request.params as any).id);
    if (!deps) return reply.code(404).send({ error: 'Plugin not found' });
    return deps;
  });

  fastify.post('/api/agent-factory/plugins/:id/dependencies', async (request, reply) => {
    const dep = await fastify.services.agentFactory.addDependency(
      (request.params as any).id,
      request.body as any,
    );
    if (!dep) return reply.code(404).send({ error: 'Plugin not found' });
    return reply.code(201).send(dep);
  });

  fastify.delete('/api/agent-factory/plugins/:id/dependencies/:depId', async (request, reply) => {
    const { depId } = request.params as any;
    await fastify.services.agentFactory.removeDependency(depId);
    return reply.code(204).send();
  });
}
