/**
 * GET /api/search/chat-history — search prompts and assistant responses across tasks
 */
import { FastifyInstance } from 'fastify';
import { eq, like, or, and, inArray } from 'drizzle-orm';
import * as schema from '../../../db/database-schema.ts';

interface ChatHistoryMatch {
  taskId: string;
  matchedText: string;
  source: 'prompt' | 'assistant';
  attemptId: string;
}

function extractMatchSnippet(text: string, queryLower: string): string | null {
  const textLower = text.toLowerCase();
  const matchIndex = textLower.indexOf(queryLower);
  if (matchIndex === -1) return null;

  const contextChars = 40;
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + queryLower.length + contextChars);

  let snippet = text.substring(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  snippet = snippet.replace(/\s+/g, ' ');

  return snippet;
}

export default async function searchChatHistoryRoute(fastify: FastifyInstance) {
  fastify.get('/api/search/chat-history', async (request, reply) => {
    try {
      const { q, projectId, projectIds: projectIdsStr } = request.query as any;

      if (!q || q.trim().length < 2) return { matches: [] };

      const queryLower = q.toLowerCase();
      const db = (fastify as any).db;

      // Parse project IDs
      const projectIdList: string[] = [];
      if (projectIdsStr) {
        projectIdList.push(...String(projectIdsStr).split(',').filter(Boolean));
      } else if (projectId) {
        projectIdList.push(projectId);
      }

      // Get tasks for the project(s), or all tasks if no filter
      let tasks: any[];
      if (projectIdList.length > 0) {
        tasks = await db
          .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
          .from(schema.tasks)
          .where(inArray(schema.tasks.projectId, projectIdList))
          .all();
      } else {
        tasks = await db
          .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
          .from(schema.tasks)
          .all();
      }

      const taskIds = tasks.map((t: any) => t.id);
      if (taskIds.length === 0) return { matches: [], query: q };

      const taskMatchMap = new Map<string, ChatHistoryMatch>();

      // Search in attempt prompts (prompt and displayPrompt columns)
      const promptMatches = await db
        .select({
          id: schema.attempts.id,
          taskId: schema.attempts.taskId,
          prompt: schema.attempts.prompt,
          displayPrompt: schema.attempts.displayPrompt,
        })
        .from(schema.attempts)
        .where(
          and(
            inArray(schema.attempts.taskId, taskIds),
            or(
              like(schema.attempts.prompt, `%${q}%`),
              like(schema.attempts.displayPrompt, `%${q}%`)
            )
          )
        )
        .limit(50)
        .all();

      for (const attempt of promptMatches) {
        if (taskMatchMap.has(attempt.taskId)) continue;
        const searchText = attempt.displayPrompt || attempt.prompt;
        const snippet = extractMatchSnippet(searchText, queryLower);
        if (snippet) {
          taskMatchMap.set(attempt.taskId, {
            taskId: attempt.taskId,
            matchedText: snippet,
            source: 'prompt',
            attemptId: attempt.id,
          });
        }
      }

      // Fetch all attempts for the tasks (needed for log search)
      const allAttempts = await db
        .select({ id: schema.attempts.id, taskId: schema.attempts.taskId })
        .from(schema.attempts)
        .where(inArray(schema.attempts.taskId, taskIds))
        .all();

      const attemptToTaskMap = new Map<string, string>(
        allAttempts.map((a: any) => [a.id, a.taskId])
      );
      const allAttemptIds = allAttempts.map((a: any) => a.id);

      // Search in attempt_logs content (json type) for assistant messages
      if (allAttemptIds.length > 0) {
        const logMatches = await db
          .select({
            id: schema.attemptLogs.id,
            attemptId: schema.attemptLogs.attemptId,
            content: schema.attemptLogs.content,
          })
          .from(schema.attemptLogs)
          .where(
            and(
              inArray(schema.attemptLogs.attemptId, allAttemptIds),
              eq(schema.attemptLogs.type, 'json'),
              like(schema.attemptLogs.content, `%${q}%`)
            )
          )
          .limit(100)
          .all();

        for (const log of logMatches) {
          const taskId = attemptToTaskMap.get(log.attemptId);
          if (!taskId || taskMatchMap.has(taskId)) continue;

          try {
            const parsed = JSON.parse(log.content);
            // Only process assistant messages with content blocks
            if (parsed.type === 'assistant' && parsed.message?.content) {
              let textContent = '';
              for (const block of parsed.message.content) {
                if (block.type === 'text' && block.text) {
                  textContent += block.text + ' ';
                }
              }

              if (textContent) {
                const snippet = extractMatchSnippet(textContent.trim(), queryLower);
                if (snippet) {
                  taskMatchMap.set(taskId, {
                    taskId,
                    matchedText: snippet,
                    source: 'assistant',
                    attemptId: log.attemptId,
                  });
                }
              }
            }
          } catch {
            // Skip entries with invalid JSON
          }
        }
      }

      return { matches: Array.from(taskMatchMap.values()), query: q };
    } catch (error: any) {
      request.log.error({ err: error }, 'Error searching chat history');
      return reply.code(500).send({ error: 'Failed to search chat history' });
    }
  });
}
