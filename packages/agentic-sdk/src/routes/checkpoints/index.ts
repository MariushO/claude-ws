/**
 * Checkpoints domain barrel — registers all /api/checkpoints/* sub-routes
 */
import { FastifyInstance } from 'fastify';
import checkpointListRoute from './route';
import checkpointBackfillRoute from './backfill/route';
import checkpointForkRoute from './fork/route';
import checkpointRewindRoute from './rewind/route';

export default async function checkpointsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(checkpointListRoute);
  await fastify.register(checkpointBackfillRoute);
  await fastify.register(checkpointForkRoute);
  await fastify.register(checkpointRewindRoute);
}
