/**
 * Commands domain barrel — registers all command sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import commandsRoot from './route';
import commandByName from './[name]/route';

export default async function commandsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(commandsRoot);
  await fastify.register(commandByName);
}
