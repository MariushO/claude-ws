/**
 * Task compact routes - POST /api/tasks/:id/compact
 * Triggers conversation compaction. Delegates conversation summary retrieval
 * and attempt creation to SDK services; agentManager.compact() is injected runtime dep.
 */
import { FastifyInstance } from 'fastify';

export default async function taskCompactConversationRoutes(fastify: FastifyInstance) {
  fastify.post('/api/tasks/:id/compact', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;

      const task = await fastify.services.task.getById(taskId);
      if (!task) return reply.code(404).send({ error: 'Task not found' });

      const project = await fastify.services.project.getById(task.projectId);
      if (!project) return reply.code(404).send({ error: 'Project not found' });

      // Build conversation summary via service (mirrors sessionManager.getConversationSummary logic)
      const conversationSummary = await fastify.services.task.getConversationSummaryForCompact(taskId);

      const attempt = await fastify.services.attempt.create({
        taskId,
        prompt: 'Compact: summarize conversation context',
        displayPrompt: 'Compacting conversation...',
      });

      try {
        (fastify.agentManager as any).compact?.({
          attemptId: attempt.id,
          projectPath: project.path,
          conversationSummary,
        });
      } catch { /* compact not available in all environments */ }

      return { success: true, attemptId: attempt.id };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to compact conversation');
      return reply.code(500).send({ error: 'Failed to compact conversation' });
    }
  });
}
