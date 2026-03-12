/**
 * POST /api/checkpoints/fork — create a new task branch from a checkpoint
 * Copies attempts/logs/checkpoints before the fork point to a new task
 */
import { FastifyInstance } from 'fastify';
import { eq, and, lt, asc, desc } from 'drizzle-orm';
import * as schema from '../../../db/database-schema.ts';
import { generateId } from '../../../lib/nanoid-id-generator.ts';

export default async function checkpointForkRoute(fastify: FastifyInstance) {
  fastify.post('/api/checkpoints/fork', async (request, reply) => {
    try {
      const { checkpointId } = (request.body as any) || {};
      if (!checkpointId) return reply.code(400).send({ error: 'checkpointId required' });

      const db = (fastify as any).db;

      // Get checkpoint
      const checkpoint = await db.select().from(schema.checkpoints)
        .where(eq(schema.checkpoints.id, checkpointId)).get();
      if (!checkpoint) return reply.code(404).send({ error: 'Checkpoint not found' });

      // Get original task
      const originalTask = await db.select().from(schema.tasks)
        .where(eq(schema.tasks.id, checkpoint.taskId)).get();
      if (!originalTask) return reply.code(404).send({ error: 'Original task not found' });

      // Get attempt prompt for pre-filling input
      const attempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.id, checkpoint.attemptId)).get();

      // SDK file rewind placeholder — not available in agentic-sdk
      let sdkRewindResult: { success: boolean; error?: string } | null = null;
      if (checkpoint.gitCommitHash && checkpoint.sessionId) {
        sdkRewindResult = { success: false, error: 'SDK file rewind not available in agentic-sdk' };
      }

      // Determine next position in todo column
      const tasksInTodo = await db.select().from(schema.tasks)
        .where(and(
          eq(schema.tasks.projectId, originalTask.projectId),
          eq(schema.tasks.status, 'todo')
        ))
        .orderBy(desc(schema.tasks.position))
        .limit(1)
        .all();

      const position = tasksInTodo.length > 0 ? tasksInTodo[0].position + 1 : 0;
      const newTaskId = generateId('task');
      const truncatedTitle = originalTask.title.length > 74
        ? originalTask.title.slice(0, 74) + '...'
        : originalTask.title;

      const newTask = {
        id: newTaskId,
        projectId: originalTask.projectId,
        title: `Fork: ${truncatedTitle}`,
        description: originalTask.description,
        status: 'todo' as const,
        position,
        chatInit: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.insert(schema.tasks).values(newTask);
      request.log.info({ newTaskId, originalTaskId: originalTask.id, checkpointId }, 'Created forked task');

      // Use checkpoint attempt's createdAt as copy boundary
      const checkpointAttempt = attempt;
      const cutoffTime = checkpointAttempt?.createdAt ?? checkpoint.createdAt;

      // Copy attempts created before the checkpoint attempt to the new task
      const originalAttempts = await db.select().from(schema.attempts)
        .where(and(
          eq(schema.attempts.taskId, originalTask.id),
          lt(schema.attempts.createdAt, cutoffTime)
        ))
        .orderBy(asc(schema.attempts.createdAt))
        .all();

      const attemptIdMap = new Map<string, string>();
      for (const orig of originalAttempts) {
        const newAttemptId = generateId('att');
        attemptIdMap.set(orig.id, newAttemptId);

        await db.insert(schema.attempts).values({
          id: newAttemptId,
          taskId: newTaskId,
          prompt: orig.prompt,
          displayPrompt: orig.displayPrompt,
          status: orig.status,
          sessionId: orig.sessionId,
          branch: orig.branch,
          diffAdditions: orig.diffAdditions,
          diffDeletions: orig.diffDeletions,
          totalTokens: orig.totalTokens,
          inputTokens: orig.inputTokens,
          outputTokens: orig.outputTokens,
          cacheCreationTokens: orig.cacheCreationTokens,
          cacheReadTokens: orig.cacheReadTokens,
          totalCostUSD: orig.totalCostUSD,
          numTurns: orig.numTurns,
          durationMs: orig.durationMs,
          contextUsed: orig.contextUsed,
          contextLimit: orig.contextLimit,
          contextPercentage: orig.contextPercentage,
          baselineContext: orig.baselineContext,
          createdAt: orig.createdAt,
          completedAt: orig.completedAt,
          outputFormat: orig.outputFormat,
          outputSchema: orig.outputSchema,
        });

        // Copy attempt logs for this attempt
        const logs = await db.select().from(schema.attemptLogs)
          .where(eq(schema.attemptLogs.attemptId, orig.id))
          .orderBy(asc(schema.attemptLogs.createdAt))
          .all();

        for (const logEntry of logs) {
          await db.insert(schema.attemptLogs).values({
            attemptId: newAttemptId,
            type: logEntry.type,
            content: logEntry.content,
            createdAt: logEntry.createdAt,
          });
        }
      }

      // Copy checkpoints created before the fork checkpoint (remapping attempt IDs)
      const originalCheckpoints = await db.select().from(schema.checkpoints)
        .where(and(
          eq(schema.checkpoints.taskId, originalTask.id),
          lt(schema.checkpoints.createdAt, checkpoint.createdAt)
        ))
        .orderBy(asc(schema.checkpoints.createdAt))
        .all();

      for (const origCp of originalCheckpoints) {
        const newAttemptId = attemptIdMap.get(origCp.attemptId);
        if (!newAttemptId) continue;

        await db.insert(schema.checkpoints).values({
          id: generateId('chkpt'),
          taskId: newTaskId,
          attemptId: newAttemptId,
          sessionId: origCp.sessionId,
          gitCommitHash: origCp.gitCommitHash,
          messageCount: origCp.messageCount,
          summary: origCp.summary,
          createdAt: origCp.createdAt,
        });
      }

      // Set rewind state on new task so agent resumes from checkpoint
      if (checkpoint.gitCommitHash) {
        await db.update(schema.tasks).set({
          rewindSessionId: checkpoint.sessionId,
          rewindMessageUuid: checkpoint.gitCommitHash,
          updatedAt: Date.now(),
        }).where(eq(schema.tasks.id, newTaskId));
      }

      return {
        success: true,
        task: newTask,
        taskId: newTaskId,
        originalTaskId: originalTask.id,
        sessionId: checkpoint.sessionId,
        messageUuid: checkpoint.gitCommitHash,
        attemptId: checkpoint.attemptId,
        attemptPrompt: attempt?.prompt || null,
        sdkRewind: sdkRewindResult,
        conversationForked: !!checkpoint.gitCommitHash,
      };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fork from checkpoint');
      return reply.code(500).send({ error: 'Failed to fork from checkpoint' });
    }
  });
}
