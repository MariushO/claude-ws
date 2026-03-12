/**
 * Agent factory domain barrel — registers all agent factory sub-routes:
 * plugins CRUD/files/deps, projects sync/install/components, discover, import, compare,
 * file-content, files listing, dependencies extraction/install, and upload sessions
 */
import { FastifyInstance } from 'fastify';
import pluginsDomainRoutes from './plugins/index';
import projectsDomainRoutes from './projects/index';
import discoverRoute from './discover/route';
import importRoute from './import/route';
import compareRoute from './compare/route';
import fileContentRoute from './file-content/route';
import filesRoute from './files/route';
import dependenciesRoute from './dependencies/route';
import dependencyInstallRoute from './dependencies/[id]/install/route';
import uploadDomainRoutes from './upload/index';

export default async function agentFactoryDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(pluginsDomainRoutes);
  await fastify.register(projectsDomainRoutes);
  await fastify.register(discoverRoute);
  await fastify.register(importRoute);
  await fastify.register(compareRoute);
  await fastify.register(fileContentRoute);
  await fastify.register(filesRoute);
  await fastify.register(dependenciesRoute);
  await fastify.register(dependencyInstallRoute);
  await fastify.register(uploadDomainRoutes);
}
