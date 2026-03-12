/**
 * Projects root route - list all projects (ordered by createdAt DESC) and create a new project
 * with folder creation and CLAUDE.md template generation
 */
import { FastifyInstance } from 'fastify';
import { mkdir, writeFile, access } from 'fs/promises';
import { join } from 'path';

export default async function projectsRoute(fastify: FastifyInstance) {
  // GET /api/projects - list all projects (newest first)
  fastify.get('/api/projects', async () => {
    return fastify.services.project.list();
  });

  // POST /api/projects - create a new project
  fastify.post('/api/projects', async (request, reply) => {
    try {
      const { name, path: projectPath } = request.body as any;
      if (!name || !projectPath) {
        return reply.code(400).send({ error: 'Name and path are required' });
      }

      // Create the project folder
      try {
        await mkdir(projectPath, { recursive: true });
      } catch (err: any) {
        if (err?.code !== 'EEXIST') {
          return reply.code(500).send({ error: 'Failed to create project folder: ' + err.message });
        }
      }

      // Generate CLAUDE.md if it doesn't exist
      const claudeMdPath = join(projectPath, 'CLAUDE.md');
      try {
        await access(claudeMdPath);
      } catch {
        const content = `# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.\n\n<!-- TODO: Update this file once the project is scaffolded with actual build commands, architecture, and conventions. -->\n`;
        await writeFile(claudeMdPath, content, 'utf-8');
      }

      const project = await fastify.services.project.create({ name, path: projectPath });
      return reply.code(201).send(project);
    } catch (error: any) {
      // Handle unique constraint violation (duplicate path)
      if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return reply.code(409).send({ error: 'A project with this path already exists' });
      }
      request.log.error({ err: error }, 'Failed to create project');
      return reply.code(500).send({ error: 'Failed to create project' });
    }
  });
}
