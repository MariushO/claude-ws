/**
 * Agent factory dependencies extraction route — POST /api/agent-factory/dependencies
 * Thin transport adapter — all logic in agent-factory plugin registry service.
 */
import { FastifyInstance } from 'fastify';
import { AgentFactoryValidationError } from '../../../services/agent-factory/agent-factory-plugin-registry';

export default async function agentFactoryExtractDependenciesRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/dependencies', async (request, reply) => {
    const { sourcePath, type, useClaude } = request.body as any;
    if (!sourcePath || !type) return reply.code(400).send({ error: 'Missing sourcePath or type' });

    try {
      return await fastify.services.agentFactory.extractDependencies(sourcePath, type, useClaude);
    } catch (error) {
      if (error instanceof AgentFactoryValidationError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });
}
