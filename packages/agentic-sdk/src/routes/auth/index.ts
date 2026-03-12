/**
 * Auth domain barrel — registers all auth sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import authVerify from './verify/route';

export default async function authDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(authVerify);
}
