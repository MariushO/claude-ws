/**
 * Task stats routes - GET /api/tasks/:id/stats
 * Aggregates token/cost/diff stats across all attempts with context health
 */
import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import * as schema from '../../../../db/database-schema.ts';

function calculateContextHealth(inputTokens: number, outputTokens: number, contextLimit: number) {
  const totalTokens = inputTokens + outputTokens;
  const utilization = totalTokens / contextLimit;
  const utilizationPercent = utilization * 100;

  let status: string;
  let score: number;
  if (utilization < 0.60) { status = 'HEALTHY'; score = 1.0; }
  else if (utilization < 0.75) { status = 'WARNING'; score = 0.8; }
  else if (utilization < 0.90) { status = 'CRITICAL'; score = 0.5; }
  else { status = 'EMERGENCY'; score = 0.2; }

  const compactThreshold = contextLimit >= 1_000_000
    ? Math.floor(contextLimit * 0.33)
    : Math.floor(contextLimit * 0.75);
  const shouldCompact = totalTokens >= compactThreshold;

  return { status, score, utilizationPercent, shouldCompact, compactThreshold };
}

export default async function taskAggregateStatsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/stats', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;
      const db = (fastify as any).db;

      const attempts = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(desc(schema.attempts.createdAt))
        .all();

      let totalTokens = 0;
      let totalCostUSD = 0;
      let totalTurns = 0;
      let totalDurationMs = 0;
      let totalAdditions = 0;
      let totalDeletions = 0;
      let filesChanged = 0;

      const latestAttempt = attempts[0];
      let contextUsed = latestAttempt?.contextUsed || 0;
      let contextLimit = latestAttempt?.contextLimit || 200000;
      let contextPercentage = latestAttempt?.contextPercentage || 0;

      // Fallback to previous attempt if current is running with no context data
      if (latestAttempt?.status === 'running' && contextPercentage === 0 && attempts.length > 1) {
        const previousAttempt = attempts[1];
        if (previousAttempt?.contextPercentage && previousAttempt.contextPercentage > 0) {
          contextUsed = previousAttempt.contextUsed || 0;
          contextLimit = previousAttempt.contextLimit || 200000;
          contextPercentage = previousAttempt.contextPercentage;
        }
      }

      const contextHealth = calculateContextHealth(contextUsed, 0, contextLimit);

      for (const attempt of attempts) {
        totalTokens += attempt.totalTokens || 0;
        totalCostUSD += parseFloat(attempt.totalCostUSD || '0');
        totalTurns += attempt.numTurns || 0;
        totalDurationMs += attempt.durationMs || 0;
        totalAdditions += attempt.diffAdditions || 0;
        totalDeletions += attempt.diffDeletions || 0;
        if ((attempt.diffAdditions || 0) > 0 || (attempt.diffDeletions || 0) > 0) {
          filesChanged++;
        }
      }

      return {
        totalTokens,
        totalCostUSD,
        totalTurns,
        totalDurationMs,
        totalAdditions,
        totalDeletions,
        filesChanged,
        contextUsed,
        contextLimit,
        contextPercentage,
        contextHealth: {
          status: contextHealth.status,
          score: contextHealth.score,
          utilizationPercent: contextHealth.utilizationPercent,
          shouldCompact: contextHealth.shouldCompact,
          compactThreshold: contextHealth.compactThreshold,
        },
        attemptCount: attempts.length,
        lastUpdatedAt: attempts[0]?.completedAt || Date.now(),
      };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to get task stats');
      return reply.code(500).send({ error: 'Failed to get task stats' });
    }
  });
}
