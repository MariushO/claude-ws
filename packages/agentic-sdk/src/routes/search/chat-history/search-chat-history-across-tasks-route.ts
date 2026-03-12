/**
 * GET /api/search/chat-history — search prompts and assistant responses across tasks
 * Thin transport adapter — delegates to createChatHistorySearchService
 */
import { FastifyInstance } from 'fastify';
import { createChatHistorySearchService } from '../../../services/chat-history-search';

export default async function searchChatHistoryRoute(fastify: FastifyInstance) {
  fastify.get('/api/search/chat-history', async (request, reply) => {
    const { q, projectId, projectIds: projectIdsStr } = request.query as any;

    if (!q || q.trim().length < 2) return { matches: [] };

    const projectIds = projectIdsStr
      ? String(projectIdsStr).split(',').filter(Boolean)
      : projectId
        ? [projectId]
        : undefined;

    try {
      const svc = createChatHistorySearchService(fastify.db);
      const matches = await svc.searchChatHistory(q.trim(), { projectIds });
      return { matches, query: q };
    } catch (error: any) {
      request.log.error({ err: error }, 'Error searching chat history');
      return reply.code(500).send({ error: 'Failed to search chat history' });
    }
  });
}
