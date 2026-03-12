/**
 * Attempts domain barrel — registers all attempt sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import attemptRoot from './route';
import attemptById from './[id]/route';
import attemptAlive from './[id]/alive/route';
import attemptAnswer from './[id]/answer/route';
import attemptPendingQuestion from './[id]/pending-question/route';
import attemptStatus from './[id]/status/route';
import attemptWorkflow from './[id]/workflow/route';

export default async function attemptsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(attemptRoot);
  await fastify.register(attemptById);
  await fastify.register(attemptAlive);
  await fastify.register(attemptAnswer);
  await fastify.register(attemptPendingQuestion);
  await fastify.register(attemptStatus);
  await fastify.register(attemptWorkflow);
}
