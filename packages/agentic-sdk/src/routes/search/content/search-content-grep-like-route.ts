/**
 * GET /api/search/content — grep-like content search across files
 * Thin transport adapter — delegates to createFileSearchService
 */
import { FastifyInstance } from 'fastify';
import { createFileSearchService } from '../../../services/files/search-and-content-search';

const svc = createFileSearchService();

export default async function searchContentRoute(fastify: FastifyInstance) {
  fastify.get('/api/search/content', async (request, reply) => {
    const { q, basePath, caseSensitive, regex, wholeWord, limit, maxFiles } = request.query as any;

    if (!basePath) return reply.code(400).send({ error: 'basePath parameter is required' });
    if (!q?.trim()) return reply.code(400).send({ error: 'q (query) parameter is required' });

    try {
      const result = await svc.searchContentAdvanced(basePath, q, {
        caseSensitive: caseSensitive === 'true',
        regex: regex === 'true',
        wholeWord: wholeWord === 'true',
        limitPerFile: parseInt(limit || '100', 10),
        maxFiles: parseInt(maxFiles || '50', 10),
      });
      return { ...result, query: q };
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg === 'Path does not exist') return reply.code(404).send({ error: msg });
      if (msg === 'Invalid regex pattern') return reply.code(400).send({ error: msg });
      request.log.error({ err: error }, 'Error searching content');
      return reply.code(500).send({ error: 'Failed to search content' });
    }
  });
}
