/**
 * Tasks domain barrel - registers all task sub-routes under /api/tasks
 */
import { FastifyInstance } from 'fastify';

import taskListAndCreateRoutes from './task-list-and-create-routes';
import taskReorderRoutes from './reorder/task-reorder-single-and-batch-routes';
import taskGetUpdateDeleteByIdRoutes from './[id]/task-get-update-delete-by-id-routes';
import taskAttemptsListRoutes from './[id]/attempts/task-attempts-list-routes';
import taskCompactConversationRoutes from './[id]/compact/task-compact-conversation-routes';
import taskConversationHistoryRoutes from './[id]/conversation/task-conversation-history-routes';
import taskPendingQuestionRoutes from './[id]/pending-question/task-pending-question-routes';
import taskRunningAttemptRoutes from './[id]/running-attempt/task-running-attempt-routes';
import taskAggregateStatsRoutes from './[id]/stats/task-aggregate-stats-routes';

export default async function taskDomainRoutes(fastify: FastifyInstance) {
  await fastify.register(taskListAndCreateRoutes);
  await fastify.register(taskReorderRoutes);
  await fastify.register(taskGetUpdateDeleteByIdRoutes);
  await fastify.register(taskAttemptsListRoutes);
  await fastify.register(taskCompactConversationRoutes);
  await fastify.register(taskConversationHistoryRoutes);
  await fastify.register(taskPendingQuestionRoutes);
  await fastify.register(taskRunningAttemptRoutes);
  await fastify.register(taskAggregateStatsRoutes);
}
