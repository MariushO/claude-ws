/**
 * POST /api/files/upload — multipart file upload with duplicate handling
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';

function validatePathWithinRoot(targetPath: string, rootPath: string): string {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep) && resolvedTarget !== resolvedRoot) {
    throw new Error('Path traversal detected');
  }
  const home = os.homedir();
  if (!resolvedRoot.startsWith(home + path.sep) && resolvedRoot !== home) {
    throw new Error('Root path outside home directory');
  }
  return resolvedTarget;
}

export default async function filesUploadRoute(fastify: FastifyInstance) {
  fastify.post('/api/files/upload', async (request, reply) => {
    try {
      // Collect all file parts
      const parts: any[] = [];
      let targetPath: string | undefined;
      let rootPath: string | undefined;

      // Use the parts iterator to handle both files and fields
      const mp = (request as any).parts?.();
      if (mp) {
        for await (const part of mp) {
          if (part.file) {
            parts.push({ filename: part.filename, buffer: await part.toBuffer() });
          } else if (part.fieldname === 'targetPath') {
            targetPath = part.value;
          } else if (part.fieldname === 'rootPath') {
            rootPath = part.value;
          }
        }
      } else {
        // Fallback: single file via request.file()
        const data = await (request as any).file?.();
        if (!data) return reply.code(400).send({ error: 'No files provided' });
        const fields = data.fields as any;
        targetPath = fields?.targetPath?.value;
        rootPath = fields?.rootPath?.value;
        parts.push({ filename: data.filename, buffer: await data.toBuffer() });
      }

      if (parts.length === 0) return reply.code(400).send({ error: 'No files provided' });
      if (!targetPath || !rootPath) {
        return reply.code(400).send({ error: 'targetPath and rootPath are required' });
      }

      // Validate path
      const resolvedTarget = validatePathWithinRoot(targetPath, rootPath);

      if (!fs.existsSync(resolvedTarget)) {
        return reply.code(404).send({ error: 'Target directory not found' });
      }
      const targetStats = fs.statSync(resolvedTarget);
      if (!targetStats.isDirectory()) {
        return reply.code(400).send({ error: 'Target path is not a directory' });
      }

      const results: { name: string; path: string }[] = [];

      for (const { filename: rawFilename, buffer } of parts) {
        const filename = rawFilename.replace(/[/\\]/g, '_');
        let filePath = path.join(resolvedTarget, filename);

        // Handle duplicate filenames
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filename);
          const base = path.basename(filename, ext);
          let counter = 1;
          while (fs.existsSync(filePath)) {
            filePath = path.join(resolvedTarget, `${base}_${counter}${ext}`);
            counter++;
          }
        }

        await fs.promises.writeFile(filePath, buffer);
        results.push({ name: path.basename(filePath), path: filePath });
      }

      return { success: true, files: results };
    } catch (error: any) {
      if (error.message === 'Path traversal detected' || error.message === 'Root path outside home directory') {
        return reply.code(403).send({ error: 'Invalid path' });
      }
      request.log.error({ err: error }, 'Upload error');
      return reply.code(500).send({ error: 'Failed to upload files' });
    }
  });
}
