/**
 * GET /api/attempts/:id/workflow — return workflow tree for an attempt
 * Falls back to DB subagents table for completed attempts.
 */
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../db/database-schema';

export default async function attemptWorkflow(fastify: FastifyInstance) {
  fastify.get('/api/attempts/:id/workflow', async (request, _reply) => {
    const { id: attemptId } = request.params as any;

    // Query subagents from DB
    const subagents = await fastify.db
      .select()
      .from(schema.subagents)
      .where(eq(schema.subagents.attemptId, attemptId));

    if (subagents.length === 0) {
      return {
        source: 'db',
        nodes: [],
        messages: [],
        summary: { chain: [], completedCount: 0, activeCount: 0, totalCount: 0 },
      };
    }

    // Build summary from DB records
    const rootNodes = subagents.filter((s: any) => !s.parentId);
    const chain = rootNodes.map((s: any) => s.name || s.type);
    const completedCount = subagents.filter((s: any) => s.status === 'completed').length;
    const activeCount = subagents.filter((s: any) => s.status === 'in_progress').length;

    // Map DB records to SubagentNode format, sorted by depth then startedAt
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
      }));

    return {
      source: 'db',
      nodes,
      messages: [],
      summary: { chain, completedCount, activeCount, totalCount: subagents.length },
    };
  });
}
