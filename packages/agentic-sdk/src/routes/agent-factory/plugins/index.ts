/**
 * Agent factory plugins domain barrel — registers all plugin CRUD, dependency, and file routes
 */
import { FastifyInstance } from 'fastify';
import pluginsRootRoute from './route';
import pluginByIdRoute from './[id]/route';
import pluginDependenciesRoute from './[id]/dependencies/route';
import pluginFilesDomainRoutes from './[id]/files/index';

export default async function agentFactoryPluginsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(pluginsRootRoute);
  await fastify.register(pluginByIdRoute);
  await fastify.register(pluginDependenciesRoute);
  await fastify.register(pluginFilesDomainRoutes);
}
