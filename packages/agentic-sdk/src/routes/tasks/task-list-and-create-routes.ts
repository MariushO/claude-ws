/**
 * Task collection routes - GET /api/tasks (list with filters) and POST /api/tasks (create)
 */
import { FastifyInstance } from 'fastify';

const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'];

export default async function taskListAndCreateRoutes(fastify: FastifyInstance) {
  // GET /api/tasks - list tasks, filtered by projectId/projectIds and/or status
  fastify.get('/api/tasks', async (request, reply) => {
    try {
      const query = request.query as any;

      // Support comma-separated projectIds or single projectId (backward compat)
      const projectIds = query.projectIds
        ? String(query.projectIds).split(',').map((s: string) => s.trim()).filter(Boolean)
        : undefined;
      const projectId = query.projectId ? String(query.projectId) : undefined;

      // Support comma-separated status values, validated against valid statuses
      const statuses = query.status
        ? String(query.status).split(',').map((s: string) => s.trim()).filter((s: string) => VALID_STATUSES.includes(s))
        : undefined;

      return await fastify.services.task.list({ projectId, projectIds, statuses });
    } catch (error) {
      fastify.log.error(error, 'Failed to list tasks');
      return reply.code(500).send({ error: 'Failed to list tasks' });
    }
  });

  // POST /api/tasks - create a new task
  fastify.post('/api/tasks', async (request, reply) => {
    try {
      const { projectId, title, description, status } = request.body as any;
      if (!projectId || !title) return reply.code(400).send({ error: 'projectId and title are required' });

      // Validate status if provided
      if (status && !VALID_STATUSES.includes(status)) {
        return reply.code(400).send({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }

      const task = await fastify.services.task.create({ projectId, title, description, status });
      return reply.code(201).send(task);
    } catch (error: any) {
      // Foreign key constraint violation means the project does not exist
      if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || error?.message?.includes('FOREIGN KEY')) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      fastify.log.error(error, 'Failed to create task');
      return reply.code(500).send({ error: 'Failed to create task' });
    }
  });
}
