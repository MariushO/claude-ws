/**
 * Project by ID route - get, update, and delete a project by ID
 * with input validation and UNIQUE constraint handling matching legacy API
 */
import { FastifyInstance } from 'fastify';

export default async function projectByIdRoute(fastify: FastifyInstance) {
  // GET /api/projects/:id
  fastify.get('/api/projects/:id', async (request, reply) => {
    const project = await fastify.services.project.getById((request.params as any).id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return project;
  });

  // PUT /api/projects/:id
  fastify.put('/api/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const { name, path } = request.body as any;

      // Validate at least one field is provided
      if (!name && !path) {
        return reply.code(400).send({ error: 'At least one field (name or path) is required' });
      }

      const project = await fastify.services.project.update(id, { name, path });
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      return project;
    } catch (error: any) {
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return reply.code(409).send({ error: 'A project with this path already exists' });
      }
      request.log.error({ err: error }, 'Failed to update project');
      return reply.code(500).send({ error: 'Failed to update project' });
    }
  });

  // DELETE /api/projects/:id — returns 200 with { success: true } matching legacy API
  fastify.delete('/api/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const removed = await fastify.services.project.remove(id);
      if (!removed) return reply.code(404).send({ error: 'Project not found' });
      return reply.code(200).send({ success: true });
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to delete project');
      return reply.code(500).send({ error: 'Failed to delete project' });
    }
  });
}
