/**
 * Task conversation routes - GET /api/tasks/:id/conversation
 * Builds conversation turns from all attempts with message deduplication.
 * Matches Next.js route logic exactly.
 */
import { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import * as schema from '../../../../db/database-schema';

interface ConversationTurn {
  type: 'user' | 'assistant';
  prompt?: string;
  messages: any[];
  attemptId: string;
  timestamp: number;
  files?: any[];
  attemptStatus?: string;
}

export default async function taskConversationHistoryRoutes(fastify: FastifyInstance) {
  fastify.get('/api/tasks/:id/conversation', async (request, reply) => {
    try {
      const { id: taskId } = request.params as any;

      // Get all attempts for this task, ordered by creation time
      const attempts = await fastify.db
        .select()
        .from(schema.attempts)
        .where(eq(schema.attempts.taskId, taskId))
        .orderBy(asc(schema.attempts.createdAt));

      const turns: ConversationTurn[] = [];

      for (const attempt of attempts) {
        // Get files attached to this attempt
        const files = await fastify.db
          .select()
          .from(schema.attemptFiles)
          .where(eq(schema.attemptFiles.attemptId, attempt.id))
          .orderBy(asc(schema.attemptFiles.createdAt));

        // Add user turn
        turns.push({
          type: 'user',
          prompt: attempt.displayPrompt || attempt.prompt,
          messages: [],
          attemptId: attempt.id,
          timestamp: attempt.createdAt,
          files: files.length > 0 ? files : undefined,
          attemptStatus: attempt.status,
        });

        // Get all JSON logs for this attempt
        const logs = await fastify.db
          .select()
          .from(schema.attemptLogs)
          .where(eq(schema.attemptLogs.attemptId, attempt.id))
          .orderBy(asc(schema.attemptLogs.createdAt));

        // Parse JSON logs — deduplicate content blocks
        const allContentBlocks: any[] = [];
        const seenToolIds = new Set<string>();
        const seenTextHashes = new Set<string>();
        const toolResultMap = new Map<string, any>();
        const userAnswerMessages: any[] = [];

        for (const log of logs) {
          if (log.type === 'json') {
            try {
              const parsed = JSON.parse(log.content);
              if (parsed.type === 'system') continue;

              // Handle user_answer logs
              if (parsed.type === 'user_answer') {
                allContentBlocks.push({
                  type: 'text',
                  text: parsed.displayText || JSON.stringify(parsed),
                });
                userAnswerMessages.push(parsed);
                continue;
              }

              // Collect content blocks from assistant messages
              if (parsed.type === 'assistant' && parsed.message?.content) {
                for (const block of parsed.message.content) {
                  if (block.type === 'tool_use' && block.id) {
                    if (!seenToolIds.has(block.id)) {
                      allContentBlocks.push(block);
                      seenToolIds.add(block.id);
                    }
                  } else if (block.type === 'text' && block.text) {
                    const textHash = block.text.substring(0, 100);
                    if (!seenTextHashes.has(textHash)) {
                      allContentBlocks.push(block);
                      seenTextHashes.add(textHash);
                    }
                  } else if (block.type === 'thinking' && block.thinking) {
                    const thinkHash = 'think:' + block.thinking.substring(0, 100);
                    if (!seenTextHashes.has(thinkHash)) {
                      allContentBlocks.push(block);
                      seenTextHashes.add(thinkHash);
                    }
                  }
                }
              }
              // Extract tool_result from user messages
              else if (parsed.type === 'user' && parsed.message?.content) {
                for (const block of parsed.message.content) {
                  if (block.type === 'tool_result') {
                    const toolUseId = block.tool_use_id;
                    if (toolUseId) {
                      toolResultMap.set(toolUseId, {
                        type: 'tool_result',
                        tool_data: { tool_use_id: toolUseId },
                        result: block.content || '',
                        is_error: block.is_error || false,
                      });
                    }
                  }
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        // Build merged assistant message
        const toolResultMessages = Array.from(toolResultMap.values());
        const mergedAssistantMessage =
          allContentBlocks.length > 0
            ? { type: 'assistant', message: { content: allContentBlocks } }
            : null;

        const messages: any[] = [
          ...toolResultMessages,
          ...(mergedAssistantMessage ? [mergedAssistantMessage] : []),
          ...userAnswerMessages,
        ];

        if (messages.length > 0) {
          turns.push({
            type: 'assistant',
            messages,
            attemptId: attempt.id,
            timestamp: attempt.createdAt,
            attemptStatus: attempt.status,
          });
        }
      }

      return { turns };
    } catch (error: any) {
      request.log.error({ err: error }, 'Failed to fetch conversation');
      return reply.code(500).send({ error: 'Failed to fetch conversation' });
    }
  });
}
