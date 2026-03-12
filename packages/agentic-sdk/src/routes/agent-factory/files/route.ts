/**
 * Agent factory files listing route — POST /api/agent-factory/files
 * Lists files from a component source path for discovered (not yet imported) components
 */
import { FastifyInstance } from 'fastify';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { buildFileTree } from '../plugins/[id]/files/route';

export default async function agentFactoryListSourceFilesRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/files', async (request, reply) => {
    const { sourcePath, type } = request.body as any;
    if (!sourcePath || !type) return reply.code(400).send({ error: 'Missing sourcePath or type' });

    const resolved = resolve(sourcePath);
    if (!resolved.startsWith(homedir())) return reply.code(403).send({ error: 'Access denied' });
    if (!existsSync(sourcePath)) return reply.code(404).send({ error: 'Source path not found' });

    if (type !== 'skill') {
      const fileName = sourcePath.split('/').pop()!;
      return { files: [{ name: fileName, path: fileName, type: 'file' }] };
    }

    const files = await buildFileTree(sourcePath, '');
    return { files };
  });
}
