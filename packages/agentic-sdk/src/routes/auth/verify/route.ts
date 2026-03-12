/**
 * Auth verify route - check auth status and validate API keys
 * GET: Check if auth is required (public, no auth middleware needed)
 * POST: Validate an API key and return validity status
 */
import { FastifyInstance } from 'fastify';
import { safeCompare } from '../../../lib/timing-safe-compare.ts';

export default async function authVerifyRoute(fastify: FastifyInstance) {
  // GET /api/auth/verify - Check if auth is required (should be accessible without auth)
  fastify.get('/api/auth/verify', async (_request, _reply) => {
    const authRequired = !!fastify.envConfig.apiAccessKey;
    return { authRequired };
  });

  // POST /api/auth/verify - Validate an API key
  fastify.post('/api/auth/verify', async (request, reply) => {
    try {
      const { apiKey } = (request.body as any) || {};
      const authRequired = !!fastify.envConfig.apiAccessKey;

      // If auth is not required, always return valid
      if (!authRequired) {
        return { valid: true, authRequired: false };
      }

      // Check if provided key matches (timing-safe)
      const valid = typeof apiKey === 'string' && safeCompare(apiKey, fastify.envConfig.apiAccessKey!);

      return { valid, authRequired: true };
    } catch {
      return reply.code(400).send({ error: 'Invalid request' });
    }
  });
}
