/**
 * Upload by fileId route - serve file content, get metadata, and delete tmp uploads
 */
import { FastifyInstance } from 'fastify';
import { readFile, readdir, unlink, stat } from 'fs/promises';
import { join, basename, extname } from 'path';
import { getContentTypeForExtension } from '../../../lib/content-type-map.ts';

function getMimeType(filename: string): string {
  return getContentTypeForExtension(extname(filename));
}

async function findFileInDirs(fileId: string, uploadsDir: string): Promise<{ path: string; filename: string } | null> {
  // Check tmp directory first
  const tmpDir = join(uploadsDir, 'tmp');
  try {
    const tmpFiles = await readdir(tmpDir);
    const tmpFile = tmpFiles.find(f => f.startsWith(fileId));
    if (tmpFile) return { path: join(tmpDir, tmpFile), filename: tmpFile };
  } catch { /* tmp dir may not exist */ }

  // Check attempt directories
  try {
    const dirs = await readdir(uploadsDir);
    for (const dir of dirs) {
      if (dir === 'tmp') continue;
      const dirPath = join(uploadsDir, dir);
      const dirStat = await stat(dirPath);
      if (!dirStat.isDirectory()) continue;
      const files = await readdir(dirPath);
      const found = files.find(f => f.startsWith(fileId));
      if (found) return { path: join(dirPath, found), filename: found };
    }
  } catch { /* uploads dir may not exist */ }

  return null;
}

export default async function uploadByFileIdRoute(fastify: FastifyInstance) {
  // GET /api/uploads/:fileId - serve file content (or metadata if ?metadata=true)
  fastify.get('/api/uploads/:fileId', async (request, reply) => {
    try {
      const fileId = (request.params as any).fileId;
      const { metadata } = request.query as any;

      // Validate fileId format (nanoid pattern)
      if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
        return reply.code(400).send({ error: 'Invalid file ID' });
      }

      // If metadata requested, return DB record
      if (metadata) {
        const upload = await fastify.services.upload.getById(fileId);
        if (!upload) return reply.code(404).send({ error: 'Upload not found' });
        return upload;
      }

      // Otherwise serve actual file content
      const uploadsDir = join(fastify.envConfig.dataDir, 'uploads');
      const found = await findFileInDirs(fileId, uploadsDir);
      if (!found) return reply.code(404).send({ error: 'File not found' });

      const buffer = await readFile(found.path);
      const mimeType = getMimeType(found.filename);

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

      // Only allow deleting tmp files (pending uploads)
      const tmpDir = join(fastify.envConfig.dataDir, 'uploads', 'tmp');
      try {
        const tmpFiles = await readdir(tmpDir);
        const tmpFile = tmpFiles.find(f => f.startsWith(fileId));
        if (!tmpFile) return reply.code(404).send({ error: 'Tmp file not found' });
        await unlink(join(tmpDir, tmpFile));
        return { success: true };
      } catch {
        return reply.code(404).send({ error: 'Tmp file not found' });
      }
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to delete file');
      return reply.code(500).send({ error: 'Failed to delete file' });
    }
  });
}
