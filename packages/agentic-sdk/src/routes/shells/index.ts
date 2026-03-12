/**
 * Shells domain barrel — registers all shell sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import shellsRoot from './route';

export default async function shellsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(shellsRoot);
}
