/**
 * Upload by fileId route - serve file content, get metadata, and delete tmp uploads
 * Thin transport adapter — logic in upload service + tmp file processor.
 */
import { FastifyInstance } from 'fastify';
import { readFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { getContentTypeForExtension } from '../../../lib/content-type-map';
import { findUploadedFile, deleteTmpFile } from '../../../services/upload/tmp-file-processor-and-cleanup';

export default async function uploadByFileIdRoute(fastify: FastifyInstance) {
  // GET /api/uploads/:fileId - serve file content (or metadata if ?metadata=true)
  fastify.get('/api/uploads/:fileId', async (request, reply) => {
    try {
      const fileId = (request.params as any).fileId;
      const { metadata } = request.query as any;

      if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        return reply.code(400).send({ error: 'Invalid file ID' });
      }

      if (metadata) {
        const upload = await fastify.services.upload.getById(fileId);
        if (!upload) return reply.code(404).send({ error: 'Upload not found' });
        return upload;
      }

      const uploadsDir = join(fastify.envConfig.dataDir, 'uploads');
      const found = await findUploadedFile(uploadsDir, fileId);
      if (!found) return reply.code(404).send({ error: 'File not found' });

      const buffer = await readFile(found.path);
      const mimeType = getContentTypeForExtension(extname(found.filename));

      reply.header('Content-Type', mimeType);
      reply.header('Content-Disposition', `inline; filename="${basename(found.filename)}"`);
      reply.header('Cache-Control', 'private, max-age=3600');
      return reply.send(buffer);
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to serve file');
      return reply.code(500).send({ error: 'Failed to serve file' });
    }
  });

  // DELETE /api/uploads/:fileId - only delete tmp (pending) files
  fastify.delete('/api/uploads/:fileId', async (request, reply) => {
    try {
      const fileId = (request.params as any).fileId;
      if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        return reply.code(400).send({ error: 'Invalid file ID' });
      }

      const uploadsDir = join(fastify.envConfig.dataDir, 'uploads');
      const deleted = await deleteTmpFile(uploadsDir, fileId);
      if (!deleted) return reply.code(404).send({ error: 'Tmp file not found' });
      return { success: true };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to delete file');
      return reply.code(500).send({ error: 'Failed to delete file' });
    }
  });
}
