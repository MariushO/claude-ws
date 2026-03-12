/**
 * File operations routes - DELETE (delete), POST (download), PATCH (create), PUT (rename)
 * Thin transport adapter — delegates to createFileOperationsService
 */
import { FastifyInstance } from 'fastify';
import { createFileOperationsService } from '../../../services/files/operations-and-upload';

const svc = createFileOperationsService();

function mapError(err: unknown, reply: any) {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === 'Path traversal detected' || msg === 'Root path outside home directory') {
      return reply.code(403).send({ error: 'Invalid path' });
    }
    if (msg === 'Path not found' || msg === 'Parent directory not found' || msg === 'File not found') {
      return reply.code(404).send({ error: msg });
    }
    if (msg === 'Already exists') {
      return reply.code(409).send({ error: 'A file or folder with that name already exists' });
    }
    if (msg === 'Parent path is not a directory') return reply.code(400).send({ error: msg });
    if (msg === 'Invalid name') {
      return reply.code(400).send({ error: 'Invalid name. Cannot contain path separators or ..' });
    }
    if ('code' in err && (err as NodeJS.ErrnoException).code === 'EACCES') {
      return reply.code(403).send({ error: 'Permission denied' });
    }
  }
  return reply.code(500).send({ error: 'Internal server error' });
}

export default async function fileOperationsRoutes(fastify: FastifyInstance) {
  // DELETE /api/files/operations - delete a file or folder
  fastify.delete('/api/files/operations', async (request, reply) => {
    const { path: targetPath, rootPath } = request.body as any;
    if (!targetPath || !rootPath) {
      return reply.code(400).send({ error: 'path and rootPath are required' });
    }
    try {
      await svc.deleteFileOrDir(targetPath, rootPath);
      return { success: true };
    } catch (err) {
      return mapError(err, reply);
    }
  });

  // POST /api/files/operations - download file or folder (directories as ZIP)
  fastify.post('/api/files/operations', async (request, reply) => {
    const { path: targetPath, rootPath } = request.body as any;
    if (!targetPath || !rootPath) {
      return reply.code(400).send({ error: 'path and rootPath are required' });
    }
    try {
      const { buffer, filename, contentType } = await svc.downloadFileOrDir(targetPath, rootPath);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Type', contentType);
      reply.header('Content-Length', buffer.byteLength.toString());
      return reply.send(Buffer.from(buffer));
    } catch (err) {
      return mapError(err, reply);
    }
  });

  // PATCH /api/files/operations - create a new file or folder
  fastify.patch('/api/files/operations', async (request, reply) => {
    const { parentPath, rootPath, name, type } = request.body as any;
    if (!parentPath || !rootPath || !name || !type) {
      return reply.code(400).send({ error: 'parentPath, rootPath, name, and type are required' });
    }
    if (type !== 'file' && type !== 'folder') {
      return reply.code(400).send({ error: "type must be 'file' or 'folder'" });
    }
    try {
      const newPath = await svc.createFileOrDir(parentPath, rootPath, name, type);
      return { success: true, path: newPath };
    } catch (err) {
      return mapError(err, reply);
    }
  });

  // PUT /api/files/operations - rename a file or folder
  fastify.put('/api/files/operations', async (request, reply) => {
    const { path: targetPath, rootPath, newName } = request.body as any;
    if (!targetPath || !rootPath || !newName) {
      return reply.code(400).send({ error: 'path, rootPath, and newName are required' });
    }
    try {
      const newPath = await svc.renameFileOrDir(targetPath, rootPath, newName);
      return { success: true, newPath };
    } catch (err) {
      return mapError(err, reply);
    }
  });
}
