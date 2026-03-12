/**
 * GET /api/files/content — read file with language detection, binary check, mtime
 * POST /api/files/content — save file content (existing files only)
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const LANGUAGE_MAP: Record<string, string | null> = {
  '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml', '.toml': null,
  '.env': null, '.gitignore': null, '.dockerignore': null,
  '.md': 'markdown', '.mdx': 'markdown',
  '.sh': null, '.bash': null, '.zsh': null,
  '.py': 'python', '.go': null, '.rs': 'rust', '.sql': 'sql', '.php': 'php', '.java': 'java',
  '.c': 'cpp', '.cpp': 'cpp', '.cc': 'cpp', '.h': 'cpp', '.hpp': 'cpp',
  '.txt': null, '.log': null,
};

const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.zip', '.tar', '.gz', '.rar',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
];

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.xml': 'application/xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
};

function getMimeType(ext: string): string {
  return MIME_MAP[ext] || 'application/octet-stream';
}

function detectLanguage(filePath: string): string | null {
  const fileName = path.basename(filePath);
  const specialFiles: Record<string, string | null> = {
    'Dockerfile': null, 'Makefile': null,
    '.eslintrc': 'json', '.prettierrc': 'json',
    'tsconfig.json': 'json', 'package.json': 'json',
  };
  return specialFiles[fileName] !== undefined ? specialFiles[fileName] : null;
}

function validateBasePath(basePath: string): string {
  const normalizedBase = path.resolve(basePath);
  const home = os.homedir();
  if (!normalizedBase.startsWith(home + path.sep) && normalizedBase !== home) {
    throw new Error('Access denied: base path outside home directory');
  }
  return normalizedBase;
}

export default async function filesContentRoute(fastify: FastifyInstance) {
  // GET /api/files/content?path=xxx&basePath=xxx
  fastify.get('/api/files/content', async (request, reply) => {
    try {
      const { path: filePath, basePath } = request.query as any;
      if (!filePath || !basePath) {
        return reply.code(400).send({ error: 'path and basePath parameters are required' });
      }

      const normalizedBase = validateBasePath(basePath);
      const fullPath = path.resolve(basePath, filePath);

      // Security: prevent directory traversal
      if (!fullPath.startsWith(normalizedBase)) {
        return reply.code(403).send({ error: 'Invalid path: directory traversal detected' });
      }

      if (!fs.existsSync(fullPath)) return reply.code(404).send({ error: 'File not found' });

      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) return reply.code(400).send({ error: 'Path is not a file' });
      if (stats.size > MAX_FILE_SIZE) {
        return reply.code(413).send({ error: 'File too large', size: stats.size, maxSize: MAX_FILE_SIZE });
      }

      const ext = path.extname(fullPath).toLowerCase();
      const mtimeMs = stats.mtimeMs;

      if (BINARY_EXTENSIONS.includes(ext)) {
        return { content: null, language: null, size: stats.size, isBinary: true, mimeType: getMimeType(ext), mtime: mtimeMs };
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const language = LANGUAGE_MAP[ext] || detectLanguage(fullPath);

      return { content, language, size: stats.size, isBinary: false, mimeType: getMimeType(ext), mtime: mtimeMs };
    } catch (error: any) {
      if (error.message?.includes('Access denied')) {
        return reply.code(403).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Error reading file');
      return reply.code(500).send({ error: 'Failed to read file' });
    }
  });

  // POST /api/files/content — save file content
  fastify.post('/api/files/content', async (request, reply) => {
    try {
      const { basePath, path: filePath, content } = request.body as any;
      if (!filePath || !basePath || typeof content !== 'string') {
        return reply.code(400).send({ error: 'basePath, path, and content are required' });
      }

      const normalizedBase = validateBasePath(basePath);
      const fullPath = path.resolve(basePath, filePath);

      if (!fullPath.startsWith(normalizedBase)) {
        return reply.code(403).send({ error: 'Invalid path: directory traversal detected' });
      }

      if (!fs.existsSync(fullPath)) return reply.code(404).send({ error: 'File not found' });

      const stats = fs.statSync(fullPath);
      if (!stats.isFile()) return reply.code(400).send({ error: 'Path is not a file' });

      const ext = path.extname(fullPath).toLowerCase();
      if (BINARY_EXTENSIONS.includes(ext)) {
        return reply.code(400).send({ error: 'Cannot write to binary files' });
      }

      fs.writeFileSync(fullPath, content, 'utf-8');
      const newStats = fs.statSync(fullPath);

      return { success: true, size: newStats.size };
    } catch (error: any) {
      if (error.message?.includes('Access denied')) {
        return reply.code(403).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Error writing file');
      return reply.code(500).send({ error: 'Failed to write file' });
    }
  });
}
