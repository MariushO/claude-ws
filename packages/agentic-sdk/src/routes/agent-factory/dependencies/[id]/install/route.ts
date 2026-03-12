/**
 * Agent factory dependency install route — POST /api/agent-factory/dependencies/:id/install
 * Triggers installation of a specific plugin dependency by its ID
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryInstallDependencyRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/dependencies/:id/install', async (request, reply) => {
    const { id } = request.params as any;
    const result = await fastify.services.agentFactory.installDependency?.(id);
    if (!result) return reply.code(501).send({ error: 'Install not implemented in SDK' });
    return result;
  });
}
