/**
 * Task read-only query methods for attempt lists, conversation history,
 * conversation summary for compact, running attempt state, and aggregate stats.
 * Consumed by task-crud-and-reorder.ts to keep that file focused on CRUD.
 * Conversation history building is in task-conversation-history-builder.ts.
 */
import { eq, and, desc, inArray, asc, lt } from 'drizzle-orm';
import * as schema from '../../db/database-schema';
import { buildConversationHistory } from './task-conversation-history-builder';

export function createTaskQueryMethods(db: any) {
  return {
    async getAttempts(taskId: string) {
      return db.select().from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(desc(schema.attempts.createdAt))
        .all();
    },

    async getAttemptsAsc(taskId: string) {
      return db.select().from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(schema.attempts.createdAt)
        .all();
    },

    async getConversation(taskId: string) {
      const attempts = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(desc(schema.attempts.createdAt))
        .limit(1);
      if (!attempts.length) return [];
      const attemptId = attempts[0].id;
      return db.select().from(schema.attemptLogs)
        .where(eq(schema.attemptLogs.attemptId, attemptId))
        .orderBy(schema.attemptLogs.createdAt)
        .all();
    },

    /** Delegates to task-conversation-history-builder.ts */
    async getConversationHistory(taskId: string) {
      return buildConversationHistory(db, taskId);
    },

    /**
     * Build a compact conversation summary string from a task's most recent completed/cancelled attempt.
     * Used by the compact endpoint to seed a fresh session with prior context.
     */
    async getConversationSummaryForCompact(taskId: string): Promise<string> {
      const lastAttempt = await db.select().from(schema.attempts)
        .where(and(
          eq(schema.attempts.taskId, taskId),
          inArray(schema.attempts.status as any, ['completed', 'cancelled'])
        ))
        .orderBy(desc(schema.attempts.createdAt))
        .limit(1)
        .get();

      if (!lastAttempt) return '';

      const firstAttempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(schema.attempts.createdAt)
        .limit(1)
        .get();
      const originalPrompt = (firstAttempt as any)?.displayPrompt || (firstAttempt as any)?.prompt || '';

      const logs = await db.select().from(schema.attemptLogs)
        .where(eq(schema.attemptLogs.attemptId, lastAttempt.id))
        .orderBy(asc(schema.attemptLogs.createdAt))
        .all();

      let lastAssistantText = '';
      for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].type !== 'json') continue;
        try {
          const data = JSON.parse(logs[i].content);
          if (data.type === 'assistant' && data.message?.content) {
            const text = data.message.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join(' ');
            if (text.trim()) { lastAssistantText = text.substring(0, 4000); break; }
          }
        } catch { /* skip */ }
      }

      let summary = '';
      if (originalPrompt) summary += `Original task: ${originalPrompt.substring(0, 500)}\n\n`;
      if (lastAssistantText) summary += `Most recent assistant response:\n${lastAssistantText}`;
      return summary;
    },

    /** Get the most recent running attempt with parsed JSON messages (cleans up stale >24h attempts) */
    async getRunningAttempt(taskId: string) {
      const runningAttempts = await db.select().from(schema.attempts)
        .where(and(eq(schema.attempts.taskId, taskId), eq(schema.attempts.status, 'running')))
        .orderBy(desc(schema.attempts.createdAt))
        .limit(1)
        .all();

      const runningAttempt = runningAttempts[0] || null;

      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      await db.update(schema.attempts)
        .set({ status: 'failed', completedAt: Date.now() })
        .where(and(
          eq(schema.attempts.taskId, taskId),
          eq(schema.attempts.status, 'running'),
          lt(schema.attempts.createdAt, oneDayAgo)
        ));

      if (!runningAttempt || runningAttempt.createdAt < oneDayAgo) {
        return { attempt: null, messages: [] };
      }

      const logs = await db.select().from(schema.attemptLogs)
        .where(eq(schema.attemptLogs.attemptId, runningAttempt.id))
        .orderBy(asc(schema.attemptLogs.createdAt))
        .all();

      const messages: any[] = [];
      for (const log of logs) {
        if (log.type === 'json') {
          try {
            const parsed = JSON.parse(log.content);
            if (parsed.type !== 'system') messages.push(parsed);
          } catch { /* skip invalid JSON */ }
        }
      }

      return {
        attempt: { id: runningAttempt.id, prompt: runningAttempt.displayPrompt || runningAttempt.prompt, status: runningAttempt.status },
        messages,
      };
    },

    /** Aggregate token/cost/diff stats across all attempts for a task */
    async getStats(taskId: string) {
      const attempts = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(desc(schema.attempts.createdAt))
        .all();

      let totalTokens = 0, totalCostUSD = 0, totalTurns = 0, totalDurationMs = 0;
      let totalAdditions = 0, totalDeletions = 0, filesChanged = 0;

      const latestAttempt = attempts[0];
      let contextUsed = latestAttempt?.contextUsed || 0;
      let contextLimit = latestAttempt?.contextLimit || 200000;
      let contextPercentage = latestAttempt?.contextPercentage || 0;

      // Fallback to previous attempt if current is running with no context data yet
      if (latestAttempt?.status === 'running' && contextPercentage === 0 && attempts.length > 1) {
        const prev = attempts[1];
        if (prev?.contextPercentage && prev.contextPercentage > 0) {
          contextUsed = prev.contextUsed || 0;
          contextLimit = prev.contextLimit || 200000;
          contextPercentage = prev.contextPercentage;
        }
      }

      const utilization = contextUsed / contextLimit;
      const utilizationPercent = utilization * 100;
      let status: string, score: number;
      if (utilization < 0.60) { status = 'HEALTHY'; score = 1.0; }
      else if (utilization < 0.75) { status = 'WARNING'; score = 0.8; }
      else if (utilization < 0.90) { status = 'CRITICAL'; score = 0.5; }
      else { status = 'EMERGENCY'; score = 0.2; }
      const compactThreshold = contextLimit >= 1_000_000
        ? Math.floor(contextLimit * 0.33)
        : Math.floor(contextLimit * 0.75);
      const contextHealth = { status, score, utilizationPercent, shouldCompact: contextUsed >= compactThreshold, compactThreshold };

      for (const attempt of attempts) {
        totalTokens += attempt.totalTokens || 0;
        totalCostUSD += parseFloat(attempt.totalCostUSD || '0');
        totalTurns += attempt.numTurns || 0;
        totalDurationMs += attempt.durationMs || 0;
        totalAdditions += attempt.diffAdditions || 0;
        totalDeletions += attempt.diffDeletions || 0;
        if ((attempt.diffAdditions || 0) > 0 || (attempt.diffDeletions || 0) > 0) filesChanged++;
      }

      return {
        totalTokens, totalCostUSD, totalTurns, totalDurationMs,
        totalAdditions, totalDeletions, filesChanged,
        contextUsed, contextLimit, contextPercentage, contextHealth,
        attemptCount: attempts.length,
        lastUpdatedAt: attempts[0]?.completedAt || Date.now(),
      };
    },
  };
}
