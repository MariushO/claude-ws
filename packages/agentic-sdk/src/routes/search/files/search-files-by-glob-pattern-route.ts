/**
 * GET /api/search/files — fuzzy file search by name with scoring
 * Thin transport adapter — delegates to createFileSearchService
 */
import { FastifyInstance } from 'fastify';
import { createFileSearchService } from '../../../services/files/search-and-content-search';

const svc = createFileSearchService();

/**
 * Inline fuzzy match with scoring — kept here because it is UI-specific scoring
 * logic tied to the search/files endpoint response shape (score + matches array).
 */
function fuzzyMatchWithScore(query: string, target: string): { score: number; matches: number[] } | null {
  if (!query) return { score: 0, matches: [] };

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  let checkIndex = 0;
  for (const char of queryLower) {
    const found = targetLower.indexOf(char, checkIndex);
    if (found === -1) return null;
    checkIndex = found + 1;
  }

  const matches: number[] = [];
  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;
  let consecutiveBonus = 0;

  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      matches.push(i);
      let matchScore = 1;

      if (lastMatchIndex === i - 1) {
        consecutiveBonus += 1;
        matchScore += consecutiveBonus * 2;
      } else {
        consecutiveBonus = 0;
      }

      if (i === 0) {
        matchScore += 10;
      } else {
        const prevChar = target[i - 1];
        if (['/','\\','.', '-', '_', ' '].includes(prevChar)) matchScore += 5;
        else if (target[i] === target[i].toUpperCase() && prevChar === prevChar.toLowerCase()) matchScore += 3;
      }

      if (query[queryIndex] === target[i]) matchScore += 1;

      score += matchScore;
      lastMatchIndex = i;
      queryIndex++;
    }
  }

  if (queryIndex !== queryLower.length) return null;
  score += Math.max(0, 50 - target.length);
  if (matches[0] === 0) score += 15;

  return { score, matches };
}

export default async function searchFilesByPatternRoute(fastify: FastifyInstance) {
  fastify.get('/api/search/files', async (request, reply) => {
    const { q, basePath, limit: limitStr } = request.query as any;
    const limit = parseInt(limitStr || '50', 10);

    if (!basePath) return reply.code(400).send({ error: 'basePath parameter is required' });

    try {
      const { results, total } = svc.fuzzySearchFiles(basePath, q, limit, fuzzyMatchWithScore);
      return { results, total };
    } catch (error: any) {
      if (error?.message === 'Path does not exist') {
        return reply.code(404).send({ error: 'Path does not exist' });
      }
      request.log.error({ err: error }, 'Error searching files');
      return reply.code(500).send({ error: 'Failed to search files' });
    }
  });
}
