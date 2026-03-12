/**
 * POST /api/checkpoints/rewind — rewind task to a checkpoint
 * Thin transport adapter — delegates to checkpointOps service.
 */
import { FastifyInstance } from 'fastify';
import { SessionManager } from '../../../lib/session-manager';
import { CheckpointNotFoundError } from '../../../services/checkpoints/fork-and-rewind-operations';

export default async function checkpointRewindRoute(fastify: FastifyInstance) {
  const sessionManager = new SessionManager(fastify.db);

  fastify.post('/api/checkpoints/rewind', async (request, reply) => {
    try {
      const { checkpointId, rewindFiles = true } = (request.body as any) || {};
      if (!checkpointId) return reply.code(400).send({ error: 'checkpointId required' });

      const result = await fastify.services.checkpointOps.rewindWithSideEffects(checkpointId, rewindFiles, {
        attemptSdkFileRewind: async () => ({ success: false, error: 'SDK file rewind not available in agentic-sdk' }),
        setRewindState: (taskId, sessionId, messageUuid) => sessionManager.setRewindState(taskId, sessionId, messageUuid),
      });

      return result;
    } catch (error: any) {
      if (error instanceof CheckpointNotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      request.log.error({ err: error }, 'Failed to rewind checkpoint');
      return reply.code(500).send({ error: 'Failed to rewind checkpoint' });
    }
  });
}
