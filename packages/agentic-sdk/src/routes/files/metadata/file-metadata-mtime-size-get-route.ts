/**
 * GET /api/files/metadata - return file mtime and size without reading content
 * Thin transport adapter — delegates to createFileOperationsService
 */
import { FastifyInstance } from 'fastify';
import { createFileOperationsService } from '../../../services/files/operations-and-upload';

const svc = createFileOperationsService();

export default async function filesMetadataRoute(fastify: FastifyInstance) {
  fastify.get('/api/files/metadata', async (request, reply) => {
    const { path: filePath, basePath } = request.query as any;
    if (!filePath || !basePath) {
      return reply.code(400).send({ error: 'path and basePath parameters are required' });
    }
    try {
      return svc.getMetadata(basePath, filePath);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'Path traversal detected') {
          return reply.code(403).send({ error: 'Invalid path: directory traversal detected' });
        }
        if (error.message === 'File not found') return reply.code(404).send({ error: 'File not found' });
        if (error.message === 'Path is not a file') return reply.code(400).send({ error: 'Path is not a file' });
      }
      return reply.code(500).send({ error: 'Failed to get file metadata' });
    }
  });
}
