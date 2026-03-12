/**
 * Project installed components route — GET /api/agent-factory/projects/:projectId/installed
 * Returns all agent factory components currently installed in the project directory
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryProjectInstalledComponentsRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/projects/:projectId/installed', async (request, reply) => {
    const { projectId } = request.params as any;
    const project = await fastify.services.project.getById(projectId);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const result = await fastify.services.agentFactory.getInstalledComponents?.(projectId, project.path);
    return result || { installed: [] };
  });
}
