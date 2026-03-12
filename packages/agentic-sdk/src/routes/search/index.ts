/**
 * Search domain barrel - registers all /api/search/* sub-routes with Fastify
 */
import { FastifyInstance } from 'fastify';
import searchContentRoute from './content/search-content-grep-like-route';
import searchFilesByPatternRoute from './files/search-files-by-glob-pattern-route';
import searchChatHistoryRoute from './chat-history/search-chat-history-across-tasks-route';

export default async function searchDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(searchContentRoute);
  await fastify.register(searchFilesByPatternRoute);
  await fastify.register(searchChatHistoryRoute);
}
