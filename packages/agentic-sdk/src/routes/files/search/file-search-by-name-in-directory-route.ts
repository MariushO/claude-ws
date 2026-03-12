/**
 * GET /api/files/search — recursive file search by name with fuzzy matching
 * Thin transport adapter — delegates to createFileSearchService
 */
import { FastifyInstance } from 'fastify';
import { createFileSearchService } from '../../../services/files/search-and-content-search';

const svc = createFileSearchService();

export default async function filesSearchByNameRoute(fastify: FastifyInstance) {
  fastify.get('/api/files/search', async (request, reply) => {
    const { basePath, query, limit: limitStr } = request.query as any;
    const limit = parseInt(limitStr || '10', 10);

    if (!basePath) return reply.code(400).send({ error: 'basePath parameter is required' });
    if (!query) return { results: [] };

    try {
      const results = svc.searchFilesByName(basePath, query, limit);
      return { results };
    } catch (error: any) {
      if (error?.message === 'Path does not exist') {
        return reply.code(404).send({ error: 'Path does not exist' });
      }
      request.log.error({ err: error }, 'Error searching files');
      return reply.code(500).send({ error: 'Failed to search files' });
    }
  });
}
