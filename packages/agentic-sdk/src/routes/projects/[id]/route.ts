/**
 * Project by ID route - get, update, delete.
 * Thin transport adapter — all logic in project-crud service.
 */
import { FastifyInstance } from 'fastify';
import { ProjectValidationError } from '../../../services/project/project-crud';

export default async function projectByIdRoute(fastify: FastifyInstance) {
  fastify.get('/api/projects/:id', async (request, reply) => {
    const project = await fastify.services.project.getById((request.params as any).id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return project;
  });

  fastify.put('/api/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const { name, path } = request.body as any;
      const project = await fastify.services.project.updateProject(id, { name, path });
      return project;
    } catch (error: any) {
      if (error instanceof ProjectValidationError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Failed to update project');
      return reply.code(500).send({ error: 'Failed to update project' });
    }
  });

  fastify.delete('/api/projects/:id', async (request, reply) => {
    try {
      await fastify.services.project.deleteProject((request.params as any).id);
      return reply.code(200).send({ success: true });
    } catch (error: any) {
      if (error instanceof ProjectValidationError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Failed to delete project');
      return reply.code(500).send({ error: 'Failed to delete project' });
    }
  });
}
