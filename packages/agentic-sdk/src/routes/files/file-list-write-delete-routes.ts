/**
 * Files collection routes - GET /api/files (directory tree with git status),
 * POST /api/files (write), DELETE /api/files (delete)
 * Thin transport adapter — file tree logic in file-tree-builder service.
 */
import { FastifyInstance } from 'fastify';

export default async function filesCollectionRoutes(fastify: FastifyInstance) {
  // GET /api/files - directory tree with git status
  fastify.get('/api/files', async (request, reply) => {
    try {
      const query = request.query as any;
      const basePath = query.path;
      const depth = parseInt(query.depth || '10', 10);
      const showHidden = query.showHidden !== 'false';

      if (!basePath) return reply.code(400).send({ error: 'path parameter is required' });

      const result = await fastify.services.fileTreeBuilder.listDirectoryTree(basePath, { depth, showHidden });
      reply.header('Cache-Control', 'no-store, max-age=0');
      return result;
    } catch (error: any) {
      if (error.message === 'Path does not exist') return reply.code(404).send({ error: error.message });
      if (error.message === 'Path is not a directory') return reply.code(400).send({ error: error.message });
      if (error.message?.startsWith('Access denied')) return reply.code(403).send({ error: error.message });
      request.log.error({ err: error }, 'Error reading directory');
      return reply.code(500).send({ error: 'Failed to read directory' });
    }
  });

  // POST /api/files - write file content
  fastify.post('/api/files', async (request, reply) => {
    const { projectPath, filePath, content } = request.body as any;
    if (!projectPath || !filePath || content === undefined) {
      return reply.code(400).send({ error: 'projectPath, filePath, and content are required' });
    }
    await fastify.services.file.writeFile(projectPath, filePath, content);
    return reply.code(201).send({ success: true });
  });

  // DELETE /api/files - delete file
  fastify.delete('/api/files', async (request, reply) => {
    const { projectPath, filePath } = request.query as any;
    if (!projectPath || !filePath) {
      return reply.code(400).send({ error: 'projectPath and filePath are required' });
    }
    try {
      await fastify.services.file.deleteFile(projectPath, filePath);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }
  });
}
