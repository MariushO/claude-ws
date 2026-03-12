/**
 * Agent factory projects domain barrel — registers all project plugin, sync, install, and component routes
 */
import { FastifyInstance } from 'fastify';
import projectPluginsRoute from './[projectId]/plugins/route';
import projectSyncRoute from './[projectId]/sync/route';
import projectInstalledComponentsRoute from './[projectId]/installed/route';
import projectComponentsRoute from './[projectId]/components/route';
import projectUninstallComponentRoute from './[projectId]/uninstall/route';

export default async function agentFactoryProjectsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(projectPluginsRoute);
  await fastify.register(projectSyncRoute);
  await fastify.register(projectInstalledComponentsRoute);
  await fastify.register(projectComponentsRoute);
  await fastify.register(projectUninstallComponentRoute);
}
