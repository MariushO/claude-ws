/**
 * Project component uninstall route — POST /api/agent-factory/projects/:projectId/uninstall
 * Removes an agent factory component from the project directory
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryProjectUninstallComponentRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/projects/:projectId/uninstall', async (request, reply) => {
    const { projectId } = request.params as any;
    const { componentId } = request.body as any;
    if (!componentId) return reply.code(400).send({ error: 'componentId is required' });
    const project = await fastify.services.project.getById(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const result = await fastify.services.agentFactory.uninstallComponent?.(projectId, componentId, project.path);
    if (!result) return reply.code(501).send({ error: 'Uninstall not implemented in SDK' });
    return result;
  });
}
