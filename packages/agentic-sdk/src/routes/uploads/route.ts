/**
 * Uploads root route - list uploads by attemptId, create via multipart, and upload to tmp storage
 */
import { FastifyInstance } from 'fastify';
import { writeFile, mkdir } from 'fs/promises';
import { join, extname } from 'path';
import { generateId } from '../../lib/nanoid-id-generator.ts';

const ALLOWED_TYPES = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/markdown',
  'text/x-typescript', 'text/typescript', 'application/typescript',
  'text/javascript', 'application/javascript', 'application/json',
  'text/css', 'text/html', 'text/xml', 'application/xml',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 10MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.{2,}/g, '.').slice(0, 100);
}

function getExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

export default async function uploadsRoute(fastify: FastifyInstance) {
  // GET /api/uploads - list uploads by attemptId
  fastify.get('/api/uploads', async (request, reply) => {
    const { attemptId } = request.query as any;
    if (!attemptId) return reply.code(400).send({ error: 'attemptId is required' });
    return fastify.services.upload.list(attemptId);
  });

  // POST /api/uploads - upload file(s)
  // If attemptId field is present: save to attempt storage (DB + file)
  // If no attemptId: save to tmp storage (file only, returns tempId)
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

      // If attemptId is provided, use the existing upload service (single file)
      if (attemptId) {
        const file = files[0];
        const upload = await fastify.services.upload.save(attemptId, {
          filename: file.filename,
          originalName: file.filename,
          mimeType: file.mimetype,
          size: file.buffer.length,
          buffer: file.buffer,
        });
        return reply.code(201).send(upload);
      }

      // Otherwise: tmp upload mode (legacy behavior)
      const totalSize = files.reduce((sum, f) => sum + f.buffer.length, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        return reply.code(400).send({ error: 'Total size exceeds 50MB limit' });
      }

      const tmpDir = join(fastify.envConfig.dataDir, 'uploads', 'tmp');
      await mkdir(tmpDir, { recursive: true });

      const results = [];
      for (const file of files) {
        // Validate size
        if (file.buffer.length > MAX_FILE_SIZE) {
          return reply.code(400).send({ error: `File too large: ${(file.buffer.length / 1024 / 1024).toFixed(1)}MB (max 10MB)` });
        }

        const tempId = generateId('tmp');
        const safeName = sanitizeFilename(file.filename);
        const ext = getExtension(safeName);
        const storedFilename = `${tempId}-${Date.now()}${ext ? `.${ext}` : ''}`;

        await writeFile(join(tmpDir, storedFilename), file.buffer);

        results.push({
          tempId,
          filename: storedFilename,
          originalName: file.filename,
          mimeType: file.mimetype,
          size: file.buffer.length,
        });
      }

      return reply.code(201).send({ files: results });
    } catch (error: any) {
      request.log.error({ err: error }, 'Upload failed');
      return reply.code(500).send({ error: 'Failed to upload files' });
    }
  });
}
