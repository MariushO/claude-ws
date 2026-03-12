/**
 * Files domain barrel - registers all /api/files/* sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import filesCollectionRoutes from './file-list-write-delete-routes';
import filesContentRoute from './content/file-content-read-write-route';
import filesMetadataRoute from './metadata/file-metadata-mtime-size-get-route';
import fileOperationsRoutes from './operations/file-delete-download-create-rename-routes';
import filesSearchByNameRoute from './search/file-search-by-name-in-directory-route';
import filesUploadRoute from './upload/file-multipart-upload-route';

export default async function filesDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(filesCollectionRoutes);
  await fastify.register(filesContentRoute);
  await fastify.register(filesMetadataRoute);
  await fastify.register(fileOperationsRoutes);
  await fastify.register(filesSearchByNameRoute);
  await fastify.register(filesUploadRoute);
}
