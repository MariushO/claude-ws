/**
 * POST /api/checkpoints/rewind — rewind task to a checkpoint
 * Deletes all attempts/logs/files/checkpoints after this point,
 * sets rewind state on task for session resumption
 */
import { FastifyInstance } from 'fastify';
import { eq, and, gte } from 'drizzle-orm';
import * as schema from '../../../db/database-schema.ts';

export default async function checkpointRewindRoute(fastify: FastifyInstance) {
  fastify.post('/api/checkpoints/rewind', async (request, reply) => {
    try {
      const { checkpointId, rewindFiles = true } = (request.body as any) || {};
      if (!checkpointId) return reply.code(400).send({ error: 'checkpointId required' });

      const db = (fastify as any).db;

      // Get the checkpoint
      const checkpoint = await db.select().from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, checkpointId)).get();
      if (!checkpoint) return reply.code(404).send({ error: 'Checkpoint not found' });

      // Get task
      const task = await db.select().from(schema.tasks)
        .where(eq(schema.tasks.id, checkpoint.taskId)).get();

      // Get the attempt to retrieve its prompt for pre-filling input after rewind
      const attempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.id, checkpoint.attemptId)).get();

      // SDK file rewind placeholder — not available in agentic-sdk
      let sdkRewindResult: { success: boolean; error?: string } | null = null;
      if (rewindFiles && checkpoint.gitCommitHash && checkpoint.sessionId && task) {
        // agentManager.rewindFiles not available yet in SDK
        sdkRewindResult = { success: false, error: 'SDK file rewind not available in agentic-sdk' };
      }

      // Get checkpoint's own attempt + all attempts created after this checkpoint
      const laterAttempts = await db.select().from(schema.attempts)
        .where(and(
          eq(schema.attempts.taskId, checkpoint.taskId),
          gte(schema.attempts.createdAt, checkpoint.createdAt)
        )).all();

      // Also ensure we include the checkpoint's own attempt
      const attemptIdsToDelete = new Set<string>(laterAttempts.map((a: any) => a.id));
      attemptIdsToDelete.add(checkpoint.attemptId);

      request.log.info({ count: attemptIdsToDelete.size }, 'Deleting attempts (checkpoint + later)');

      // Delete attempts and their related data
      for (const attemptId of attemptIdsToDelete) {
        await db.delete(schema.attemptLogs).where(eq(schema.attemptLogs.attemptId, attemptId));
        await db.delete(schema.attemptFiles).where(eq(schema.attemptFiles.attemptId, attemptId));
        await db.delete(schema.attempts).where(eq(schema.attempts.id, attemptId));
      }

      // Delete this checkpoint and all after it (same task)
      await db.delete(schema.checkpoints).where(and(
        eq(schema.checkpoints.taskId, checkpoint.taskId),
        gte(schema.checkpoints.createdAt, checkpoint.createdAt)
      ));

      // Set rewind state on task for session resumption
      if (checkpoint.gitCommitHash) {
        await db.update(schema.tasks).set({
          rewindSessionId: checkpoint.sessionId,
          rewindMessageUuid: checkpoint.gitCommitHash,
          updatedAt: Date.now(),
        }).where(eq(schema.tasks.id, checkpoint.taskId));
      }

      return {
        success: true,
        sessionId: checkpoint.sessionId,
        messageUuid: checkpoint.gitCommitHash,
        taskId: checkpoint.taskId,
        attemptId: checkpoint.attemptId,
        attemptPrompt: attempt?.prompt || null,
        sdkRewind: sdkRewindResult,
        conversationRewound: !!checkpoint.gitCommitHash,
      };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to rewind checkpoint');
      return reply.code(500).send({ error: 'Failed to rewind checkpoint' });
    }
  });
}
