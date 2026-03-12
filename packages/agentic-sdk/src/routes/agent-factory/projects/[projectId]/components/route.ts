/**
 * Project components association routes — GET, POST, DELETE /api/agent-factory/projects/:projectId/components
 * Thin transport adapter — all logic in agent-factory plugin registry service.
 */
import { FastifyInstance } from 'fastify';
import { PluginAlreadyAssignedError } from '../../../../../services/agent-factory/agent-factory-plugin-registry';

export default async function agentFactoryProjectComponentsRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/projects/:projectId/components', async (request, reply) => {
    const { projectId } = request.params as any;
    const components = await fastify.services.agentFactory.listProjectPlugins(projectId);
    return { components };
  });

  fastify.post('/api/agent-factory/projects/:projectId/components', async (request, reply) => {
    const { projectId } = request.params as any;
    const { componentId } = request.body as any;
    if (!componentId) return reply.code(400).send({ error: 'Missing componentId' });

    try {
      const result = await fastify.services.agentFactory.associatePlugin(projectId, componentId);
      return reply.code(201).send(result);
    } catch (err: any) {
      if (err instanceof PluginAlreadyAssignedError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete('/api/agent-factory/projects/:projectId/components', async (request, reply) => {
    const { projectId } = request.params as any;
    const { componentId } = request.query as any;
    if (!componentId) return reply.code(400).send({ error: 'Missing componentId parameter' });
    await fastify.services.agentFactory.disassociatePlugin(projectId, componentId);
    return { success: true };
  });
}
