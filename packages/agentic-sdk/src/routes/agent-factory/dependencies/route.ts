/**
 * Agent factory dependencies extraction route — POST /api/agent-factory/dependencies
 * Extracts library and plugin dependencies from a component source path
 */
import { FastifyInstance } from 'fastify';

export default async function agentFactoryExtractDependenciesRoute(fastify: FastifyInstance) {
  fastify.post('/api/agent-factory/dependencies', async (request, reply) => {
    const { sourcePath, type, useClaude } = request.body as any;
    if (!sourcePath || !type) return reply.code(400).send({ error: 'Missing sourcePath or type' });
    const result = await fastify.services.agentFactory.extractDependencies?.(sourcePath, type, useClaude);
    if (!result) {
      return {
        libraries: [],
        plugins: [],
        installScripts: {},
        dependencyTree: [],
        depth: 1,
        hasCycles: false,
        totalPlugins: 0,
      };
    }
    return result;
  });
}
