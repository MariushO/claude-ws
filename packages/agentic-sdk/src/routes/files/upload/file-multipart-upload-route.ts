/**
 * POST /api/files/upload — multipart file upload with optional archive extraction
 * Thin transport adapter — delegates to createFileOperationsService
 */
import { FastifyInstance } from 'fastify';
import { createFileOperationsService } from '../../../services/files/operations-and-upload';

const svc = createFileOperationsService();

export default async function filesUploadRoute(fastify: FastifyInstance) {
  fastify.post('/api/files/upload', async (request, reply) => {
    try {
      const parts: { filename: string; buffer: Buffer }[] = [];
      let targetPath: string | undefined;
      let rootPath: string | undefined;
      let decompress = false;

      const mp = (request as any).parts?.();
      if (mp) {
        for await (const part of mp) {
          if (part.file) {
            parts.push({ filename: part.filename, buffer: await part.toBuffer() });
          } else if (part.fieldname === 'targetPath') {
            targetPath = part.value;
          } else if (part.fieldname === 'rootPath') {
            rootPath = part.value;
          } else if (part.fieldname === 'decompress') {
            decompress = part.value === 'true';
          }
        }
      } else {
        const data = await (request as any).file?.();
        if (!data) return reply.code(400).send({ error: 'No files provided' });
        const fields = data.fields as any;
        targetPath = fields?.targetPath?.value;
        rootPath = fields?.rootPath?.value;
        decompress = fields?.decompress?.value === 'true';
        parts.push({ filename: data.filename, buffer: await data.toBuffer() });
      }

      if (parts.length === 0) return reply.code(400).send({ error: 'No files provided' });
      if (!targetPath || !rootPath) {
        return reply.code(400).send({ error: 'targetPath and rootPath are required' });
      }

      const fileData = parts.map(({ filename, buffer }) => ({ name: filename, buffer }));
      const results = await svc.uploadFiles(targetPath, rootPath, fileData, decompress);
      return { success: true, files: results };
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg === 'Path traversal detected' || msg === 'Root path outside home directory') {
        return reply.code(403).send({ error: 'Invalid path' });
      }
      if (msg === 'Target directory not found') return reply.code(404).send({ error: msg });
      if (msg === 'Target path is not a directory') return reply.code(400).send({ error: msg });
      if (error?.code === 'EACCES') return reply.code(403).send({ error: 'Permission denied' });
      request.log.error({ err: error }, 'Upload error');
      return reply.code(500).send({ error: 'Failed to upload files' });
    }
  });
}
