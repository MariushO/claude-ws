/**
 * POST /api/uploads/process — move temp files to attempt storage and insert DB records
 * POST /api/uploads/cleanup — delete orphaned temp files older than 1 hour
 */
import { FastifyInstance } from 'fastify';
import { join } from 'path';
import { processAttachments, cleanupOrphanedTempFiles } from '../../../services/upload/tmp-file-processor-and-cleanup.ts';

export default async function uploadProcessAndCleanupRoute(fastify: FastifyInstance) {
  // POST /api/uploads/process — finalize temp uploads into an attempt
  fastify.post('/api/uploads/process', async (request, reply) => {
    try {
      const { attemptId, tempIds } = (request.body as any) || {};
      if (!attemptId) return reply.code(400).send({ error: 'attemptId is required' });
      if (!Array.isArray(tempIds) || tempIds.length === 0) {
        return reply.code(400).send({ error: 'tempIds array is required' });
      }

      const db = (fastify as any).db;
      const uploadsDir = join(fastify.envConfig.dataDir, 'uploads');
      const processed = await processAttachments(db, uploadsDir, attemptId, tempIds);

      return { success: true, files: processed };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to process attachments');
      return reply.code(500).send({ error: 'Failed to process attachments' });
    }
  });

  // POST /api/uploads/cleanup — remove orphaned temp files older than 1 hour
  fastify.post('/api/uploads/cleanup', async (request, reply) => {
    try {
      const uploadsDir = join(fastify.envConfig.dataDir, 'uploads');
      const cleaned = await cleanupOrphanedTempFiles(uploadsDir);
      return { success: true, cleaned };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to cleanup temp files');
      return reply.code(500).send({ error: 'Failed to cleanup temp files' });
    }
  });
}
