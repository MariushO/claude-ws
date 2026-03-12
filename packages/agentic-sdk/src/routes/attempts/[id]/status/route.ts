/**
 * GET /api/attempts/:id/status — get lightweight status of an attempt (status field only)
 */
import { FastifyInstance } from 'fastify';

export default async function attemptStatus(fastify: FastifyInstance) {
  fastify.get('/api/attempts/:id/status', async (request, reply) => {
    const { id } = request.params as any;
    const status = await fastify.services.attempt.getStatus(id);
    if (!status) return reply.code(404).send({ error: 'Attempt not found' });
    return { status: status.status };
  });
}
