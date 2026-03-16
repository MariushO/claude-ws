/**
 * Attempt workflow tree service - queries subagents from DB and builds workflow tree
 * for completed attempts. Live/running attempts use workflowTracker (in-memory, stays in route).
 */
import { eq } from 'drizzle-orm';
import * as schema from '../../db/database-schema';

export function createAttemptWorkflowService(db: any) {
  return {
    /** Get workflow tree from DB for a completed attempt */
    async getWorkflowFromDb(attemptId: string) {
      const subagents = await db.query.subagents.findMany({
        where: eq(schema.subagents.attemptId, attemptId),
      });

      const tasks = await db.query.trackedTasks.findMany({
        where: eq(schema.trackedTasks.attemptId, attemptId),
      });

      const messages = await db.query.agentMessages.findMany({
        where: eq(schema.agentMessages.attemptId, attemptId),
      });

      if (subagents.length === 0 && tasks.length === 0 && messages.length === 0) {
        return {
          source: 'db' as const,
          nodes: [],
          messages: [],
          tasks: [],
          mode: 'subagent' as const,
          summary: { chain: [] as string[], completedCount: 0, activeCount: 0, totalCount: 0 },
        };
      }

      const rootNodes = subagents.filter((s: any) => !s.parentId);
      const chain = rootNodes.map((s: any) => s.name || s.type);
      const completedCount = subagents.filter((s: any) => s.status === 'completed').length;
      const activeCount = subagents.filter((s: any) => s.status === 'in_progress').length;

      const nodes = subagents
        .sort((a: any, b: any) => {
          if (a.depth !== b.depth) return a.depth - b.depth;
          return (a.startedAt || 0) - (b.startedAt || 0);
        })
        .map((s: any) => ({
          id: s.id,
          type: s.type,
          name: s.name,
          status: s.status,
          parentId: s.parentId,
          depth: s.depth,
          teamName: s.teamName,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          durationMs: s.durationMs,
          error: s.error,
          prompt: s.prompt,
          resultPreview: s.resultPreview,
          resultFull: s.resultFull,
        }));

      const messageList = messages
        .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
        .map((m: any) => ({
          fromAgent: m.fromAgent,
          fromType: m.fromType,
          toType: m.toType,
          content: m.content,
          summary: m.summary,
          isBroadcast: m.isBroadcast,
          timestamp: m.timestamp,
        }));

      const trackedTasksList = tasks
        .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((t: any) => ({
          id: t.id,
          subject: t.subject,
          description: t.description,
          status: t.status,
          owner: t.owner,
          activeForm: t.activeForm,
          updatedAt: t.updatedAt,
        }));

      // Detect mode: if any agent has a teamName, it's an agent-team
      const hasTeam = subagents.some((s: any) => s.teamName);
      const mode: 'subagent' | 'agent-team' = hasTeam ? 'agent-team' : 'subagent';

      return {
        source: 'db' as const,
        nodes,
        messages: messageList,
        tasks: trackedTasksList,
        mode,
        summary: { chain, completedCount, activeCount, totalCount: subagents.length },
      };
    },

    /** Delete all agent session data for an attempt */
    async deleteWorkflowData(attemptId: string) {
      await db.delete(schema.subagents).where(eq(schema.subagents.attemptId, attemptId));
      await db.delete(schema.trackedTasks).where(eq(schema.trackedTasks.attemptId, attemptId));
      await db.delete(schema.agentMessages).where(eq(schema.agentMessages.attemptId, attemptId));
    },
  };
}
