/**
 * Task compact routes - POST /api/tasks/:id/compact
 * Triggers conversation compaction with summary from latest attempt
 */
import { FastifyInstance } from 'fastify';
import { eq, desc, asc } from 'drizzle-orm';
import * as schema from '../../../../db/database-schema.ts';

export default async function taskCompactConversationRoutes(fastify: FastifyInstance) {
  fastify.post('/api/tasks/:id/compact', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;
      const db = (fastify as any).db;

      const task = await fastify.services.task.getById(taskId);
      if (!task) return reply.code(404).send({ error: 'Task not found' });

      const project = await fastify.services.project.getById(task.projectId);
      if (!project) return reply.code(404).send({ error: 'Project not found' });

      // Fetch latest attempt's conversation text for summary
      let conversationSummary = '';
      const latestAttempts = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(desc(schema.attempts.createdAt))
        .limit(1)
        .all();

      if (latestAttempts.length > 0) {
        const logs = await db.select().from(schema.attemptLogs)
          .where(eq(schema.attemptLogs.attemptId, latestAttempts[0].id))
          .orderBy(asc(schema.attemptLogs.createdAt))
          .all();

        const textParts: string[] = [];
        for (const log of logs) {
          if (log.type === 'json') {
            try {
              const parsed = JSON.parse(log.content);
              if (parsed.type === 'assistant' && parsed.message?.content) {
                for (const block of parsed.message.content) {
                  if (block.type === 'text' && block.text) {
                    textParts.push(block.text);
                  }
                }
              }
            } catch { /* skip */ }
          }
        }
        conversationSummary = textParts.join('\n').substring(0, 5000);
      }

      const attempt = await fastify.services.attempt.create({
        taskId,
        prompt: 'Compact: summarize conversation context',
      });

      try {
        (fastify.agentManager as any).compact?.({
          attemptId: attempt.id,
          projectPath: project.path,
          conversationSummary,
        });
      } catch { /* compact not available */ }

      return { success: true, attemptId: attempt.id };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to compact conversation');
      return reply.code(500).send({ error: 'Failed to compact conversation' });
    }
  });
}
