/**
 * Agent factory upload domain barrel — registers archive upload, session update, and cancel routes
 */
import { FastifyInstance } from 'fastify';
import uploadRoute from './route';
import uploadUpdateRoute from './update/route';
import uploadCancelRoute from './cancel/route';

export default async function agentFactoryUploadDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(uploadRoute);
  await fastify.register(uploadUpdateRoute);
  await fastify.register(uploadCancelRoute);
}
