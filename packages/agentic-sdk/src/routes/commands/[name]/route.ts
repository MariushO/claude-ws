/**
 * Command by name route - get command content and process command prompt with argument substitution.
 * All file I/O and parsing is delegated to fastify.services.command.
 */
import { FastifyInstance } from 'fastify';

export default async function commandByNameRoute(fastify: FastifyInstance) {
  fastify.get('/api/commands/:name', async (request, reply) => {
    try {
      const { name } = request.params as any;
      const { subcommand } = request.query as any;
      const result = fastify.services.command.getContent(name, subcommand);
      if ('code' in result) {
        return result.code === 'NOT_FOUND'
          ? reply.code(404).send({ error: 'Command not found' })
          : reply.code(403).send({ error: 'Invalid command path' });
      }
      return result;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get command');
      return reply.code(500).send({ error: 'Failed to get command' });
    }
  });

  fastify.post('/api/commands/:name', async (request, reply) => {
    try {
      const { name } = request.params as any;
      const { arguments: args, subcommand } = request.body as any;
      const result = fastify.services.command.processPrompt(name, args, subcommand);
      if ('code' in result) {
        return result.code === 'NOT_FOUND'
          ? reply.code(404).send({ error: 'Command not found' })
          : reply.code(403).send({ error: 'Invalid command path' });
      }
      return result;
    } catch (error) {
      request.log.error({ err: error }, 'Failed to process command');
      return reply.code(500).send({ error: 'Failed to process command' });
    }
  });
}
