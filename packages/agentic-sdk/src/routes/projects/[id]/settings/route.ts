/**
 * Project settings route - get and save project settings (selectedComponents, selectedAgentSets)
 */
import { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export default async function projectSettingsRoute(fastify: FastifyInstance) {
  fastify.get('/api/projects/:id/settings', async (request, reply) => {
    const { id } = request.params as any;
    const project = await fastify.services.project.getById(id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });

    const settingsPath = join(project.path, '.claude', 'project-settings.json');
    if (!existsSync(settingsPath)) return reply.code(404).send({ error: 'Settings not found' });

    try {
      const content = readFileSync(settingsPath, 'utf-8');
      return { settings: JSON.parse(content) };
    } catch {
      return reply.code(500).send({ error: 'Failed to read settings' });
    }
  });

  fastify.post('/api/projects/:id/settings', async (request, reply) => {
    try {
      const { id } = request.params as any;
      const project = await fastify.services.project.getById(id);
      if (!project) return reply.code(404).send({ error: 'Project not found' });

      const { settings } = request.body as any;
      if (!settings) return reply.code(400).send({ error: 'Missing settings in request body' });

      const newSettings = {
        selectedComponents: settings.selectedComponents || [],
        selectedAgentSets: settings.selectedAgentSets || [],
      };

      const claudeDir = join(project.path, '.claude');
      if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, 'project-settings.json'), JSON.stringify(newSettings, null, 2), 'utf-8');

      return { settings: newSettings };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to update project settings');
      return reply.code(500).send({ error: 'Failed to update project settings' });
    }
  });
}
