/**
 * Shells route - list, create, update status, and get shell process records per project.
 * Response mapping delegated to toShellInfo() from the shell service.
 */
import { FastifyInstance } from 'fastify';
import { toShellInfo } from '../../services/shell/shell-process-db-tracking';

export default async function shellsRoute(fastify: FastifyInstance) {
  fastify.get('/api/shells', async (request, reply) => {
    try {
      const { projectId } = request.query as any;
      if (!projectId) return reply.code(400).send({ error: 'projectId is required' });
      const shells = await fastify.services.shell.list(projectId);
      return shells.map(toShellInfo);
    } catch (err) {
      fastify.log.error(err, 'Failed to list shells');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  fastify.post('/api/shells', async (request, reply) => {
    try {
      const shell = await fastify.services.shell.create(request.body as any);
      return reply.code(201).send(shell);
    } catch (err) {
      fastify.log.error(err, 'Failed to create shell');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  fastify.put('/api/shells/:id', async (request, reply) => {
    try {
      const { status, exitCode, exitSignal, stoppedAt } = request.body as any;
      if (!status) return reply.code(400).send({ error: 'status is required' });
      const shell = await fastify.services.shell.updateStatus(
        (request.params as any).id,
        status,
        { exitCode, exitSignal, stoppedAt },
      );
      if (!shell) return reply.code(404).send({ error: 'Shell not found' });
      return shell;
    } catch (err) {
      fastify.log.error(err, 'Failed to update shell status');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/api/shells/:id', async (request, reply) => {
    try {
      const shell = await fastify.services.shell.getById((request.params as any).id);
      if (!shell) return reply.code(404).send({ error: 'Shell not found' });
      return shell;
    } catch (err) {
      fastify.log.error(err, 'Failed to get shell');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });
}
