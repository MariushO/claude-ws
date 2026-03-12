/**
 * Auth verify route - check auth status and validate API keys.
 * Delegates all logic to fastify.services.auth (createAuthVerificationService).
 * GET: Check if auth is required (public, no auth middleware needed)
 * POST: Validate an API key and return validity status
 */
import { FastifyInstance } from 'fastify';

export default async function authVerifyRoute(fastify: FastifyInstance) {
  // GET /api/auth/verify - Check if auth is required (should be accessible without auth)
  fastify.get('/api/auth/verify', async (_request, _reply) => {
    return { authRequired: fastify.services.auth.isAuthEnabled() };
  });

  // POST /api/auth/verify - Validate an API key
  fastify.post('/api/auth/verify', async (request, reply) => {
    try {
      const { apiKey } = (request.body as any) || {};
      const authRequired = fastify.services.auth.isAuthEnabled();
      if (!authRequired) return { valid: true, authRequired: false };
      const valid = typeof apiKey === 'string' && fastify.services.auth.verifyKeyValue(apiKey);
      return { valid, authRequired: true };
    } catch {
      return reply.code(400).send({ error: 'Invalid request' });
    }
  });
}
