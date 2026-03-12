/**
 * Plugin files sub-routes barrel — registers all file-related routes for a plugin
 */
import { FastifyInstance } from 'fastify';
import pluginFilesListRoute from './route';
import pluginFileContentByPathRoute from './[...path]/route';
import pluginFileSaveRoute from './save/route';

export default async function agentFactoryPluginFilesDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(pluginFilesListRoute);
  await fastify.register(pluginFileContentByPathRoute);
  await fastify.register(pluginFileSaveRoute);
}
