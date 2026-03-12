/**
 * Task running attempt routes - GET /api/tasks/:id/running-attempt
 * Finds active attempt, cleans stale entries, parses live logs
 */
import { FastifyInstance } from 'fastify';
import { eq, and, asc, lt, desc } from 'drizzle-orm';
import * as schema from '../../../../db/database-schema.ts';

export default async function taskRunningAttemptRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/running-attempt', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;
      const db = (fastify as any).db;

      // Find the most recent running attempt for this task
      const runningAttempts = await db.select().from(schema.attempts)
        .where(and(
          eq(schema.attempts.taskId, taskId),
          eq(schema.attempts.status, 'running')
        ))
        .orderBy(desc(schema.attempts.createdAt))
        .limit(1)
        .all();

      const runningAttempt = runningAttempts[0] || null;

      // Clean up ALL stale 'running' attempts older than 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      await db.update(schema.attempts)
        .set({ status: 'failed', completedAt: Date.now() })
        .where(and(
          eq(schema.attempts.taskId, taskId),
          eq(schema.attempts.status, 'running'),
          lt(schema.attempts.createdAt, oneDayAgo)
        ));

      // If found attempt was stale, return null
      if (runningAttempt && runningAttempt.createdAt < oneDayAgo) {
        return { attempt: null, messages: [] };
      }

      if (!runningAttempt) {
        return { attempt: null, messages: [] };
      }

      // Get all JSON logs for this attempt
      const logs = await db.select().from(schema.attemptLogs)
        .where(eq(schema.attemptLogs.attemptId, runningAttempt.id))
        .orderBy(asc(schema.attemptLogs.createdAt))
        .all();

      // Parse logs into messages, skipping 'system' type
      const messages: any[] = [];
      for (const log of logs) {
        if (log.type === 'json') {
          try {
            const parsed = JSON.parse(log.content);
            if (parsed.type !== 'system') {
              messages.push(parsed);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      return {
        attempt: {
          id: runningAttempt.id,
          prompt: runningAttempt.displayPrompt || runningAttempt.prompt,
          status: runningAttempt.status,
        },
        messages,
      };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fetch running attempt');
      return reply.code(500).send({ error: 'Failed to fetch running attempt' });
    }
  });
}
