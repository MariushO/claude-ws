/**
 * Project sync route — POST /api/agent-factory/projects/:projectId/sync
 * Syncs and installs agent factory components to a project directory
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryProjectSyncRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/projects/:projectId/sync', async (request, reply) => {
    const { projectId } = request.params as any;
    const project = await fastify.services.project.getById(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const result = await fastify.services.agentFactory.syncProject?.(projectId, project.path);
    if (!result) return reply.code(501).send({ error: 'Sync not implemented in SDK' });
    return result;
  });
}
