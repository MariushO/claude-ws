/**
 * Project plugins association routes — GET list, POST associate, DELETE disassociate plugin from project
 * Thin transport adapter — all logic in agent-factory plugin registry service.
 */
import { FastifyInstance } from 'fastify';
import { PluginAlreadyAssignedError } from '../../../../../services/agent-factory/agent-factory-plugin-registry';

export default async function agentFactoryProjectPluginsRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/projects/:projectId/plugins', async (request, _reply) => {
    const plugins = await fastify.services.agentFactory.listProjectPluginsWithOrphanCleanup((request.params as any).projectId);
    return { plugins };
  });

  fastify.post('/api/agent-factory/projects/:projectId/plugins/:pluginId', async (request, reply) => {
    const { projectId, pluginId } = request.params as any;
    try {
      const result = await fastify.services.agentFactory.associatePlugin(projectId, pluginId);
      return reply.code(201).send(result);
    } catch (err: any) {
      if (err instanceof PluginAlreadyAssignedError) {
        return reply.code(409).send({ error: err.message });
      }
      throw err;
    }
  });

  fastify.delete('/api/agent-factory/projects/:projectId/plugins/:pluginId', async (request, reply) => {
    const { projectId, pluginId } = request.params as any;
    await fastify.services.agentFactory.disassociatePlugin(projectId, pluginId);
    return reply.code(204).send();
  });
}
