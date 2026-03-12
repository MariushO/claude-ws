/**
 * GET /api/search/content — grep-like content search across files
 * Supports case sensitivity, regex, wholeWord, per-file limit, max files
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '__pycache__', '.cache'];
const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
  '.sqlite', '.db',
];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

interface ContentMatch {
  lineNumber: number;
  line: string;
  column: number;
  matchLength: number;
}

interface FileResult {
  file: string;
  matches: ContentMatch[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchFile(filePath: string, pattern: RegExp, limit: number): Promise<ContentMatch[]> {
  return new Promise((resolve) => {
    const matches: ContentMatch[] = [];
    try {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
      let lineNumber = 0;

      rl.on('line', (line) => {
        lineNumber++;
        if (matches.length >= limit) { rl.close(); return; }

        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null && matches.length < limit) {
          matches.push({
            lineNumber,
            line: line.length > 500 ? line.substring(0, 500) + '...' : line,
            column: match.index,
            matchLength: match[0].length,
          });
          if (match[0].length === 0) break;
        }
      });

      rl.on('close', () => resolve(matches));
      rl.on('error', () => resolve(matches));
      fileStream.on('error', () => resolve(matches));
    } catch {
      resolve(matches);
    }
  });
}

async function searchDirectory(
  dirPath: string, basePath: string, pattern: RegExp,
  results: FileResult[], limitPerFile: number, maxFiles: number,
  onMatches: (count: number) => void, onFileSearched: () => void
): Promise<void> {
  if (results.length >= maxFiles) return;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.includes(entry.name)) continue;
        await searchDirectory(fullPath, basePath, pattern, results, limitPerFile, maxFiles, onMatches, onFileSearched);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.includes(ext)) continue;

        try {
          const stats = fs.statSync(fullPath);
          if (stats.size > MAX_FILE_SIZE) continue;
        } catch { continue; }

        const matches = await searchFile(fullPath, pattern, limitPerFile);
        onFileSearched();

        if (matches.length > 0) {
          results.push({ file: path.relative(basePath, fullPath), matches });
          onMatches(matches.length);
        }
      }
    }
  } catch { /* skip unreadable dirs */ }
}

export default async function searchContentRoute(fastify: FastifyInstance) {
  fastify.get('/api/search/content', async (request, reply) => {
    try {
      const { q, basePath, caseSensitive, regex, wholeWord, limit, maxFiles } = request.query as any;

      if (!basePath) return reply.code(400).send({ error: 'basePath parameter is required' });
      if (!q?.trim()) return reply.code(400).send({ error: 'q (query) parameter is required' });

      const resolvedPath = path.resolve(basePath);
      if (!fs.existsSync(resolvedPath)) return reply.code(404).send({ error: 'Path does not exist' });

      const limitPerFile = parseInt(limit || '100', 10);
      const maxFilesCount = parseInt(maxFiles || '50', 10);

      let pattern: RegExp;
      try {
        let patternStr = regex === 'true' ? q : escapeRegex(q);
        if (wholeWord === 'true') patternStr = `\\b${patternStr}\\b`;
        pattern = new RegExp(patternStr, caseSensitive === 'true' ? 'g' : 'gi');
      } catch {
        return reply.code(400).send({ error: 'Invalid regex pattern' });
      }

      const results: FileResult[] = [];
      let totalMatches = 0;
      let filesSearched = 0;

      await searchDirectory(
        resolvedPath, resolvedPath, pattern, results, limitPerFile, maxFilesCount,
        (matches) => { totalMatches += matches; },
        () => { filesSearched++; }
      );

      return { results, totalMatches, filesSearched, query: q };
    } catch (error: any) {
      request.log.error({ err: error }, 'Error searching content');
      return reply.code(500).send({ error: 'Failed to search content' });
    }
  });
}
