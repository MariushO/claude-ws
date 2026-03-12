/**
 * Project settings route - get and save settings.
 * Thin transport adapter — all logic in project-crud service.
 */
import { FastifyInstance } from 'fastify';
import { ProjectValidationError } from '../../../../services/project/project-crud';

export default async function projectSettingsRoute(fastify: FastifyInstance) {
  fastify.get('/api/projects/:id/settings', async (request, reply) => {
    try {
      const settings = await fastify.services.project.getSettingsByProjectId((request.params as any).id);
      return { settings };
    } catch (error: any) {
      if (error instanceof ProjectValidationError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to fetch project settings' });
    }
  });

  fastify.post('/api/projects/:id/settings', async (request, reply) => {
    try {
      const { settings } = request.body as any;
      const normalized = await fastify.services.project.updateSettingsByProjectId((request.params as any).id, settings);
      return { settings: normalized };
    } catch (error: any) {
      if (error instanceof ProjectValidationError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Failed to update project settings' });
    }
  });
}
