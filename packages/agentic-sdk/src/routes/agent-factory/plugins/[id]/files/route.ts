/**
 * Plugin files listing route — GET /api/agent-factory/plugins/:id/files
 * Builds file tree based on plugin type: skill->parent dir, agent_set->agentSetPath, command/agent->single file
 */
import { FastifyInstance } from 'fastify';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export async function buildFileTree(dirPath: string, relativePath: string): Promise<FileNode[]> {
  const fullPath = relativePath ? join(dirPath, relativePath) : dirPath;
  const entries = await readdir(fullPath, { withFileTypes: true });
  const nodes: FileNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const entryPath = relativePath ? join(relativePath, entry.name) : entry.name;
    const node: FileNode = {
      name: entry.name,
      path: entryPath,
      type: entry.isDirectory() ? 'directory' : 'file',
    };
    if (entry.isDirectory()) node.children = await buildFileTree(dirPath, entryPath);
    nodes.push(node);
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export default async function agentFactoryPluginFilesListRoute(fastify: FastifyInstance) {
  fastify.get('/api/agent-factory/plugins/:id/files', async (request, reply) => {
    const { id } = request.params as any;
    const plugin = await fastify.services.agentFactory.getPlugin(id);
    if (!plugin) return reply.code(404).send({ error: 'Plugin not found' });

    let fileTree: FileNode[];
    if (plugin.type === 'skill' && plugin.sourcePath) {
      const skillDir = dirname(plugin.sourcePath);
      if (!existsSync(skillDir)) return reply.code(404).send({ error: 'Skill directory not found' });
      fileTree = await buildFileTree(skillDir, '');
    } else if (plugin.type === 'agent_set' && plugin.agentSetPath) {
      if (!existsSync(plugin.agentSetPath)) return reply.code(404).send({ error: 'Agent set directory not found' });
      fileTree = await buildFileTree(plugin.agentSetPath, '');
    } else if (plugin.sourcePath) {
      const fileName = plugin.sourcePath.split('/').pop()!;
      fileTree = [{ name: fileName, path: fileName, type: 'file' }];
    } else {
      return reply.code(404).send({ error: 'Plugin path not found' });
    }
    return { files: fileTree };
  });
}
