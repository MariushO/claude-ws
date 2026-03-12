/**
 * Agent factory compare route — POST /api/agent-factory/compare
 * Compares a list of discovered plugins against the imported registry to find new/updated components
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryCompareDiscoveredPluginsRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/compare', async (request, reply) => {
    const { discovered } = request.body as any;
    const result = await fastify.services.agentFactory.comparePlugins?.(discovered);
    if (!result) return reply.code(501).send({ error: 'Compare not implemented in SDK' });
    return { plugins: result };
  });
}
