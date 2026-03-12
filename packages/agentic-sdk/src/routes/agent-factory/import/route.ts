/**
 * Agent factory import route — POST /api/agent-factory/import
 * Imports a discovered component (skill, agent, command, agent_set) into the agent factory registry
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryImportComponentRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/import', async (request, reply) => {
    const { type, name, description, sourcePath, metadata } = request.body as any;
    if (!type || !name || !sourcePath) {
      return reply.code(400).send({ error: 'Missing required fields: type, name, sourcePath' });
    }
    const result = await fastify.services.agentFactory.importPlugin?.({ type, name, description, sourcePath, metadata });
    if (!result) return reply.code(501).send({ error: 'Import not implemented in SDK' });
    return reply.code(201).send({ component: result });
  });
}
