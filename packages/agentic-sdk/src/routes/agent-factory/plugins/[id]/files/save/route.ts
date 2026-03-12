/**
 * Plugin file save route — PUT /api/agent-factory/plugins/:id/files/save
 * Writes file content back to plugin source directory (local storage only)
 */
import { FastifyInstance } from 'fastify';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

export default async function agentFactoryPluginFileSaveRoute(fastify: FastifyInstance) {
  fastify.put('/api/agent-factory/plugins/:id/files/save', async (request, reply) => {
    const { id } = request.params as any;
    const { filePath, content } = request.body as any;

    const plugin = await fastify.services.agentFactory.getPlugin(id);
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });
    if (plugin.storageType !== 'local') return reply.code(403).send({ error: 'Only local components can be edited' });

    let basePath: string;
    if (plugin.type === 'skill' && plugin.sourcePath) basePath = dirname(plugin.sourcePath);
    else if (plugin.type === 'agent_set' && plugin.agentSetPath) basePath = plugin.agentSetPath!;
    else if (plugin.sourcePath) basePath = plugin.sourcePath;
    else return reply.code(404).send({ error: 'Plugin path not found' });

    let fullPath: string;
    if (plugin.type === 'command' || plugin.type === 'agent') fullPath = plugin.sourcePath!;
    else fullPath = join(basePath, filePath);

    const resolved = resolve(fullPath);
    if (!resolved.startsWith(homedir())) return reply.code(403).send({ error: 'Access denied' });

    const dirPath = dirname(fullPath);
    if (!existsSync(dirPath)) await mkdir(dirPath, { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
    return { success: true };
  });
}
