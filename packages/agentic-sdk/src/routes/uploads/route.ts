/**
 * Uploads root route - list uploads by attemptId, create via multipart
 * Thin transport adapter — logic in upload service + tmp file processor.
 */
import { FastifyInstance } from 'fastify';
import { join } from 'path';
import { saveTmpFiles } from '../../services/upload/tmp-file-processor-and-cleanup';

export default async function uploadsRoute(fastify: FastifyInstance) {
  // GET /api/uploads - list uploads by attemptId
  fastify.get('/api/uploads', async (request, reply) => {
    const { attemptId } = request.query as any;
    if (!attemptId) return reply.code(400).send({ error: 'attemptId is required' });
    return fastify.services.upload.list(attemptId);
  });

  // POST /api/uploads - upload file(s)
  fastify.post('/api/uploads', async (request, reply) => {
    try {
      const parts = request.parts();
      const files: { buffer: Buffer; filename: string; mimetype: string }[] = [];
      let attemptId: string | undefined;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'attemptId') attemptId = (part as any).value;
        } else if (part.type === 'file') {
          const buffer = await part.toBuffer();
          files.push({ buffer, filename: part.filename, mimetype: part.mimetype });
        }
      }

      if (files.length === 0) return reply.code(400).send({ error: 'No files provided' });

      // If attemptId is provided, use the DB-backed upload service
      if (attemptId) {
        const file = files[0];
        const upload = await fastify.services.upload.save(attemptId, {
          filename: file.filename, originalName: file.filename,
          mimeType: file.mimetype, size: file.buffer.length, buffer: file.buffer,
        });
        return reply.code(201).send(upload);
      }

      // Otherwise: tmp upload mode
      const uploadsDir = join(fastify.envConfig.dataDir, 'uploads');
      const results = await saveTmpFiles(uploadsDir, files);
      return reply.code(201).send({ files: results });
    } catch (error: any) {
      if (error.message?.includes('size exceeds') || error.message?.includes('File too large')) {
        return reply.code(400).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Upload failed');
      return reply.code(500).send({ error: 'Failed to upload files' });
    }
  });
}
