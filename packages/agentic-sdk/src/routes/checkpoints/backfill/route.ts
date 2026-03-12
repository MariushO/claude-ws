/**
 * POST /api/checkpoints/backfill — bulk-create checkpoints
 * Supports both targeted (taskId + checkpoints array) and auto-backfill (no params)
 */
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../../../db/database-schema.ts';
import { generateId } from '../../../lib/nanoid-id-generator.ts';

export default async function checkpointBackfillRoute(fastify: FastifyInstance) {
  fastify.post('/api/checkpoints/backfill', async (request, reply) => {
    try {
      const body = (request.body as any) || {};

      // Targeted backfill: taskId + checkpoints array
      if (body.taskId && body.checkpoints) {
        if (!Array.isArray(body.checkpoints)) {
          return reply.code(400).send({ error: 'checkpoints must be an array' });
        }
        const result = await fastify.services.checkpoint.backfill(body.taskId, body.checkpoints);
        return reply.code(201).send(result);
      }

      // Auto-backfill: create checkpoints for completed attempts without one
      const db = (fastify as any).db;

      const completedAttempts = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.status, 'completed'))
        .all();

      let created = 0;
      let skipped = 0;

      for (const attempt of completedAttempts) {
        if (!attempt.sessionId) {
          skipped++;
          continue;
        }

        // Check if checkpoint already exists for this attempt
        const existing = await db.select().from(schema.checkpoints)
          .where(eq(schema.checkpoints.attemptId, attempt.id))
          .get();

        if (existing) {
          skipped++;
          continue;
        }

        // Get logs for this attempt
        const logs = await db.select().from(schema.attemptLogs)
          .where(eq(schema.attemptLogs.attemptId, attempt.id))
          .all();

        // Extract summary from last assistant message
        let summary = '';
        for (let i = logs.length - 1; i >= 0; i--) {
          if (logs[i].type === 'json') {
            try {
              const data = JSON.parse(logs[i].content);
              if (data.type === 'assistant' && data.message?.content) {
                const text = data.message.content
                  .filter((b: any) => b.type === 'text')
                  .map((b: any) => b.text)
                  .join(' ');
                summary = text.substring(0, 100) + (text.length > 100 ? '...' : '');
                break;
              }
            } catch {
              // Skip parse errors
            }
          }
        }

        // Create checkpoint
        await db.insert(schema.checkpoints).values({
          id: generateId('chkpt'),
          taskId: attempt.taskId,
          attemptId: attempt.id,
          sessionId: attempt.sessionId,
          messageCount: logs.filter((l: any) => l.type === 'json').length,
          summary,
          createdAt: attempt.completedAt || attempt.createdAt,
        });

        created++;
      }

      return { success: true, created, skipped, total: completedAttempts.length };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to backfill checkpoints');
      return reply.code(500).send({ error: 'Failed to backfill checkpoints' });
    }
  });
}
