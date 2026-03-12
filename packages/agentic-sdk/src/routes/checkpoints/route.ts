/**
 * GET /api/checkpoints?taskId=xxx — list checkpoints with attempt prompt info
 */
import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import * as schema from '../../db/database-schema.ts';

export default async function checkpointListRoute(fastify: FastifyInstance) {
  fastify.get('/api/checkpoints', async (request, reply) => {
    try {
      const { taskId } = request.query as any;
      if (!taskId) return reply.code(400).send({ error: 'taskId required' });

      const db = (fastify as any).db;

      // JOIN with attempts to get prompt info
      const results = await db
        .select({
          id: schema.checkpoints.id,
          taskId: schema.checkpoints.taskId,
          attemptId: schema.checkpoints.attemptId,
          sessionId: schema.checkpoints.sessionId,
          gitCommitHash: schema.checkpoints.gitCommitHash,
          messageCount: schema.checkpoints.messageCount,
          summary: schema.checkpoints.summary,
          createdAt: schema.checkpoints.createdAt,
          attemptDisplayPrompt: schema.attempts.displayPrompt,
          attemptPrompt: schema.attempts.prompt,
        })
        .from(schema.checkpoints)
        .leftJoin(schema.attempts, eq(schema.checkpoints.attemptId, schema.attempts.id))
        .where(eq(schema.checkpoints.taskId, taskId))
        .orderBy(desc(schema.checkpoints.createdAt))
        .all();

      // Transform to include attempt sub-object
      const checkpoints = results.map((r: any) => ({
        id: r.id,
        taskId: r.taskId,
        attemptId: r.attemptId,
        sessionId: r.sessionId,
        gitCommitHash: r.gitCommitHash,
        messageCount: r.messageCount,
        summary: r.summary,
        createdAt: r.createdAt,
        attempt: {
          displayPrompt: r.attemptDisplayPrompt,
          prompt: r.attemptPrompt,
        },
      }));

      return checkpoints;
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fetch checkpoints');
      return reply.code(500).send({ error: 'Failed to fetch checkpoints' });
    }
  });
}
