/**
 * Commands root route - list all available Claude Code slash commands from ~/.claude/commands
 */
import { FastifyInstance } from 'fastify';

export default async function commandsRoute(fastify: FastifyInstance) {
  fastify.get('/api/commands', async (request, reply) => {
    try {
      const { projectPath } = request.query as any;
      return fastify.services.command.list(projectPath);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list commands');
      return reply.code(500).send({ error: 'Failed to list commands' });
    }
  });
}
