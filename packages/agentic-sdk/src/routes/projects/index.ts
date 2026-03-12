/**
 * Projects domain barrel — registers all project sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import projectsRoot from './route';
import projectById from './[id]/route';
import projectSettings from './[id]/settings/route';

export default async function projectsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(projectsRoot);
  await fastify.register(projectById);
  await fastify.register(projectSettings);
}
