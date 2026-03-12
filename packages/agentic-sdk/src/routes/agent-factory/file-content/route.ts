/**
 * Agent factory file content route — POST /api/agent-factory/file-content
 * Reads a specific file's content from a component source path (with path traversal protection)
 */
import { FastifyInstance } from 'fastify';
import { readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

export default async function agentFactoryReadFileContentRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/file-content', async (request, reply) => {
    const { basePath, filePath } = request.body as any;
    if (!basePath || !filePath) return reply.code(400).send({ error: 'Missing basePath or filePath' });

    let fullPath: string;
    if (existsSync(basePath) && (await stat(basePath)).isFile()) fullPath = basePath;
    else fullPath = join(basePath, filePath);

    const resolved = resolve(fullPath);
    if (!resolved.startsWith(homedir())) return reply.code(403).send({ error: 'Access denied' });
    if (!existsSync(fullPath)) return reply.code(404).send({ error: 'File not found' });

    const stats = await stat(fullPath);
    if (stats.isDirectory()) return reply.code(400).send({ error: 'Is a directory' });

    const content = await readFile(fullPath, 'utf-8');
    const ext = filePath.split('.').pop() || '';
    return {
      name: filePath.split('/').pop() || filePath,
      path: filePath,
      content,
      language: ext,
      size: stats.size,
    };
  });
}
