/**
 * GET /api/search/files — fuzzy file search by name with scoring
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

const EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '__pycache__', '.cache'];
const EXCLUDED_FILES = ['.DS_Store', 'Thumbs.db'];

interface FuzzyMatch {
  score: number;
  matches: number[];
}

function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, matches: [] };

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  // Quick check: all query chars must exist in target
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
        if (prevChar === '/' || prevChar === '\\' || prevChar === '.' || prevChar === '-' || prevChar === '_' || prevChar === ' ') {
          matchScore += 5;
        } else if (target[i] === target[i].toUpperCase() && prevChar === prevChar.toLowerCase()) {
          matchScore += 3;
        }
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

function collectFiles(
  dirPath: string, basePath: string,
  results: { name: string; path: string; type: 'file' | 'directory' }[]
): void {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) continue;
      if (entry.isFile() && EXCLUDED_FILES.includes(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      results.push({
        name: entry.name,
        path: relativePath,
        type: entry.isDirectory() ? 'directory' : 'file',
      });

      if (entry.isDirectory()) {
        collectFiles(fullPath, basePath, results);
      }
    }
  } catch { /* skip unreadable dirs */ }
}

export default async function searchFilesByPatternRoute(fastify: FastifyInstance) {
  fastify.get('/api/search/files', async (request, reply) => {
    try {
      const { q, basePath, limit: limitStr } = request.query as any;
      const limit = parseInt(limitStr || '50', 10);

      if (!basePath) return reply.code(400).send({ error: 'basePath parameter is required' });

      const resolvedPath = path.resolve(basePath);
      if (!fs.existsSync(resolvedPath)) return reply.code(404).send({ error: 'Path does not exist' });

      const allFiles: { name: string; path: string; type: 'file' | 'directory' }[] = [];
      collectFiles(resolvedPath, resolvedPath, allFiles);

      if (!q?.trim()) {
        return {
          results: allFiles.slice(0, limit).map(f => ({ ...f, score: 0, matches: [] })),
          total: allFiles.length,
        };
      }

      const results: any[] = [];
      for (const file of allFiles) {
        const nameMatch = fuzzyMatch(q, file.name);
        const pathMatch = fuzzyMatch(q, file.path);
        const match = (nameMatch && pathMatch)
          ? (nameMatch.score >= pathMatch.score ? nameMatch : pathMatch)
          : (nameMatch || pathMatch);

        if (match) {
          results.push({ ...file, score: match.score, matches: match.matches });
        }
      }

      results.sort((a: any, b: any) => b.score - a.score);

      return { results: results.slice(0, limit), total: results.length };
    } catch (error: any) {
      request.log.error({ err: error }, 'Error searching files');
      return reply.code(500).send({ error: 'Failed to search files' });
    }
  });
}
