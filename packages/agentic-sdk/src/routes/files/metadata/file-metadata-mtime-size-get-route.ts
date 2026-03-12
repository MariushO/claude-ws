/**
 * GET /api/files/metadata - return file mtime and size without reading content
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';

export default async function filesMetadataRoute(fastify: FastifyInstance) {
  fastify.get('/api/files/metadata', async (request, reply) => {
    const { path: filePath, basePath } = request.query as any;
    if (!filePath || !basePath) {
      return reply.code(400).send({ error: 'path and basePath parameters are required' });
    }

    const fullPath = path.resolve(basePath, filePath);
    const normalizedBase = path.resolve(basePath);
    if (!fullPath.startsWith(normalizedBase)) {
      return reply.code(403).send({ error: 'Invalid path: directory traversal detected' });
    }
    if (!fs.existsSync(fullPath)) {
      return reply.code(404).send({ error: 'File not found' });
    }

    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return reply.code(400).send({ error: 'Path is not a file' });
    }

    return { mtime: stats.mtimeMs, size: stats.size };
  });
}
