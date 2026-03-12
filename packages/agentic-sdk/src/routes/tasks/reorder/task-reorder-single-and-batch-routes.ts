/**
 * Task reorder routes - PUT /api/tasks/reorder (single task) and POST /api/tasks/reorder (batch update)
 */
import { FastifyInstance } from 'fastify';

const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'];

export default async function taskReorderSingleAndBatchRoutes(fastify: FastifyInstance) {
  // PUT /api/tasks/reorder - reorder a single task (taskId, status, position)
  fastify.put('/api/tasks/reorder', async (request, reply) => {
    const { taskId, status, position } = request.body as any;

    if (!taskId || !status || position === undefined) {
      return reply.code(400).send({ error: 'taskId, status, and position are required' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return reply.code(400).send({ error: `Invalid status value: ${status}` });
    }

    const task = await fastify.services.task.reorder(taskId, position, status);
    if (!task) return reply.code(404).send({ error: 'Task not found' });
    return task;
  });

  // POST /api/tasks/reorder - batch reorder (tasks array with id, status, position)
  fastify.post('/api/tasks/reorder', async (request, reply) => {
    const { tasks } = request.body as any;

    if (!tasks || !Array.isArray(tasks)) {
      return reply.code(400).send({ error: 'tasks array is required' });
    }

    // Validate all items before updating
    for (const task of tasks) {
      if (!task.id || !task.status || task.position === undefined) {
        return reply.code(400).send({ error: 'Each task must have id, status, and position' });
      }
      if (!VALID_STATUSES.includes(task.status)) {
        return reply.code(400).send({ error: `Invalid status value: ${task.status}` });
      }
    }

    const errors: string[] = [];

    for (const task of tasks) {
      try {
        const result = await fastify.services.task.reorder(task.id, task.position, task.status);
        if (!result) errors.push(`Task ${task.id} not found`);
      } catch {
        errors.push(`Failed to update task ${task.id}`);
      }
    }

    if (errors.length > 0) {
      return reply.code(207).send({ error: 'Some tasks failed to update', details: errors });
    }

    return { success: true, updated: tasks.length };
  });
}
