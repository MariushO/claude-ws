/**
 * GET /api/files/search — recursive file search by name with fuzzy matching
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

const EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '__pycache__', '.cache'];
const EXCLUDED_FILES = ['.DS_Store', 'Thumbs.db'];

interface SearchResult {
  path: string;
  name: string;
  type: 'file' | 'directory';
  relativePath: string;
}

function fuzzyMatch(text: string, query: string): boolean {
  let ti = 0;
  let qi = 0;
  while (ti < text.length && qi < query.length) {
    if (text[ti] === query[qi]) qi++;
    ti++;
  }
  return qi === query.length;
}

function searchDirectory(
  dirPath: string,
  basePath: string,
  query: string,
  results: SearchResult[],
  limit: number,
  depth: number = 0
): void {
  if (depth > 10 || results.length >= limit * 2) return;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit * 2) break;
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) continue;
      if (entry.isFile() && EXCLUDED_FILES.includes(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      const nameLower = entry.name.toLowerCase();

      if (nameLower.includes(query) || fuzzyMatch(nameLower, query)) {
        results.push({
          path: fullPath,
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          relativePath,
        });
      }

      if (entry.isDirectory()) {
        searchDirectory(fullPath, basePath, query, results, limit, depth + 1);
      }
    }
  } catch { /* ignore permission errors */ }
}

export default async function filesSearchByNameRoute(fastify: FastifyInstance) {
  fastify.get('/api/files/search', async (request, reply) => {
    try {
      const { basePath, query, limit: limitStr } = request.query as any;
      const limit = parseInt(limitStr || '10', 10);

      if (!basePath) return reply.code(400).send({ error: 'basePath parameter is required' });

      const resolvedPath = path.resolve(basePath);
      if (!fs.existsSync(resolvedPath)) return reply.code(404).send({ error: 'Path does not exist' });

      if (!query) return { results: [] };

      const results: SearchResult[] = [];
      const queryLower = query.toLowerCase();
      searchDirectory(resolvedPath, resolvedPath, queryLower, results, limit);

      results.sort((a, b) => {
        const aExact = a.name.toLowerCase() === queryLower;
        const bExact = b.name.toLowerCase() === queryLower;
        if (aExact !== bExact) return aExact ? -1 : 1;

        const aStarts = a.name.toLowerCase().startsWith(queryLower);
        const bStarts = b.name.toLowerCase().startsWith(queryLower);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;

        return a.relativePath.length - b.relativePath.length;
      });

      return { results: results.slice(0, limit) };
    } catch (error: any) {
      request.log.error({ err: error }, 'Error searching files');
      return reply.code(500).send({ error: 'Failed to search files' });
    }
  });
}
