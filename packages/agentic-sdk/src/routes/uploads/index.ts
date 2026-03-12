/**
 * Uploads domain barrel — registers all upload sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import uploadsRoot from './route';
import uploadByFileId from './[fileId]/route';
import uploadProcessAndCleanup from './process-and-cleanup/upload-process-tmp-and-cleanup-orphaned-route';

export default async function uploadsDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(uploadProcessAndCleanup);
  await fastify.register(uploadsRoot);
  await fastify.register(uploadByFileId);
}
