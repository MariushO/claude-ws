/**
 * Plugin file content by path route — GET /api/agent-factory/plugins/:id/files/*
 * Reads file content from within a plugin directory, with path traversal protection
 */
import { FastifyInstance } from 'fastify';
import { readFile, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

export default async function agentFactoryPluginFileContentByPathRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins/:id/files/*', async (request, reply) => {
    const { id } = request.params as any;
    const filePath = (request.params as any)['*'];
    if (!filePath) return reply.code(400).send({ error: 'File path required' });

    const plugin = await fastify.services.agentFactory.getPlugin(id);
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });

    let basePath: string;
    if (plugin.type === 'skill' && plugin.sourcePath) basePath = dirname(plugin.sourcePath);
    else if (plugin.type === 'agent_set' && plugin.agentSetPath) basePath = plugin.agentSetPath;
    else if (plugin.sourcePath) basePath = dirname(plugin.sourcePath);
    else return reply.code(404).send({ error: 'Plugin path not found' });

    const fullPath = join(basePath, filePath);
    const resolved = resolve(fullPath);
    if (!resolved.startsWith(homedir())) return reply.code(403).send({ error: 'Access denied' });
    if (!existsSync(fullPath)) return reply.code(404).send({ error: 'File not found' });

    const stats = await stat(fullPath);
    if (stats.isDirectory()) return reply.code(400).send({ error: 'Is a directory' });

    const content = await readFile(fullPath, 'utf-8');
    const ext = filePath.split('.').pop() || '';
    return {
      name: filePath.split('/').pop(),
      path: filePath,
      content,
      language: ext,
      size: stats.size,
    };
  });
}
