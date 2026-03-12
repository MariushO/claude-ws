/**
 * Project components association routes — GET, POST, DELETE /api/agent-factory/projects/:projectId/components
 * Manages plugin-to-project associations (assign, list, remove)
 */
import { FastifyInstance } from 'fastify';

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
    const result = await fastify.services.agentFactory.associatePlugin(projectId, componentId);
    if (!result) return reply.code(404).send({ error: 'Plugin not found' });
    return reply.code(201).send(result);
  });

  fastify.delete('/api/agent-factory/projects/:projectId/components', async (request, reply) => {
    const { projectId } = request.params as any;
    const { componentId } = request.query as any;
    if (!componentId) return reply.code(400).send({ error: 'Missing componentId parameter' });
    await fastify.services.agentFactory.disassociatePlugin(projectId, componentId);
    return { success: true };
  });
}
