/**
 * GET /api/files/content — read file with language detection, binary check, mtime
 * POST /api/files/content — save file content (existing files only)
 * Thin transport adapter — delegates to createFileTreeAndContentService
 */
import { FastifyInstance } from 'fastify';
import { createFileTreeAndContentService } from '../../../services/files/tree-and-content';

const svc = createFileTreeAndContentService();

export default async function filesContentRoute(fastify: FastifyInstance) {
  // GET /api/files/content?path=xxx&basePath=xxx
  fastify.get('/api/files/content', async (request, reply) => {
    const { path: filePath, basePath } = request.query as any;
    if (!filePath || !basePath) {
      return reply.code(400).send({ error: 'path and basePath parameters are required' });
    }
    try {
      return svc.getFileContentSync(basePath, filePath);
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg === 'Access denied: base path outside home directory') return reply.code(403).send({ error: msg });
      if (msg === 'Invalid path: directory traversal detected') return reply.code(403).send({ error: msg });
      if (msg === 'File not found') return reply.code(404).send({ error: msg });
      if (msg === 'Path is not a file') return reply.code(400).send({ error: msg });
      if (msg === 'File too large') return reply.code(413).send({ error: msg });
      request.log.error({ err: error }, 'Error reading file');
      return reply.code(500).send({ error: 'Failed to read file' });
    }
  });

  // POST /api/files/content — save file content
  fastify.post('/api/files/content', async (request, reply) => {
    const { basePath, path: filePath, content } = request.body as any;
    if (!filePath || !basePath || typeof content !== 'string') {
      return reply.code(400).send({ error: 'basePath, path, and content are required' });
    }
    try {
      return svc.saveFileContentSync(basePath, filePath, content);
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg === 'Access denied: base path outside home directory') return reply.code(403).send({ error: msg });
      if (msg === 'Invalid path: directory traversal detected') return reply.code(403).send({ error: msg });
      if (msg === 'File not found') return reply.code(404).send({ error: msg });
      if (msg === 'Path is not a file') return reply.code(400).send({ error: msg });
      if (msg === 'Cannot write to binary files') return reply.code(400).send({ error: msg });
      request.log.error({ err: error }, 'Error writing file');
      return reply.code(500).send({ error: 'Failed to write file' });
    }
  });
}
