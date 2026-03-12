/**
 * Attempt CRUD service - create/update attempts and manage streaming attempt_logs entries
 */
import { eq } from 'drizzle-orm';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import * as schema from '../../db/database-schema';
import { generateId } from '../../lib/nanoid-id-generator';

export function createAttemptService(db: any) {
  return {
    async getById(id: string) {
      const attempt = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.id, id)).get();
      if (!attempt) return null;
      const logs = await db.select().from(schema.attemptLogs)
        .where(eq(schema.attemptLogs.attemptId, id))
        .orderBy(schema.attemptLogs.createdAt)
        .all();
      return { ...attempt, logs };
    },

    async create(data: {
      taskId: string;
      prompt: string;
      displayPrompt?: string;
      outputFormat?: string;
      outputSchema?: string;
    }) {
      const id = generateId('atmp');
      const attempt = {
        id,
        taskId: data.taskId,
        prompt: data.prompt,
        displayPrompt: data.displayPrompt || null,
        outputFormat: data.outputFormat || null,
        outputSchema: data.outputSchema || null,
        status: 'running' as const,
        createdAt: Date.now(),
      };
      await db.insert(schema.attempts).values(attempt);
      return attempt;
    },

    async updateStatus(
      id: string,
      status: string,
      extras?: {
        sessionId?: string;
        completedAt?: number | null;
        totalTokens?: number;
        inputTokens?: number;
        outputTokens?: number;
        cacheCreationTokens?: number;
        cacheReadTokens?: number;
        totalCostUSD?: string;
        numTurns?: number;
        durationMs?: number;
        contextUsed?: number;
        contextLimit?: number;
        contextPercentage?: number;
      }
    ) {
      const updates: any = { status, ...extras };
      // Auto-set completedAt for terminal states, clear it for running (reactivation)
      if (status === 'completed' && updates.completedAt === undefined) {
        updates.completedAt = Date.now();
      } else if (status === 'running' && updates.completedAt === undefined) {
        updates.completedAt = null;
      }
      await db.update(schema.attempts).set(updates).where(eq(schema.attempts.id, id));
      return db.select().from(schema.attempts).where(eq(schema.attempts.id, id)).get();
    },

    async addLog(attemptId: string, type: 'stdout' | 'stderr' | 'json', content: string) {
      await db.insert(schema.attemptLogs).values({
        attemptId,
        type,
        content,
        createdAt: Date.now(),
      });
    },

    async getLogs(attemptId: string) {
      return db.select().from(schema.attemptLogs)
        .where(eq(schema.attemptLogs.attemptId, attemptId))
        .orderBy(schema.attemptLogs.createdAt)
        .all();
    },

    async getFiles(attemptId: string) {
      return db.select().from(schema.attemptFiles)
        .where(eq(schema.attemptFiles.attemptId, attemptId))
        .orderBy(schema.attemptFiles.createdAt)
        .all();
    },

    async getStatus(id: string) {
      const row = await db
        .select({ id: schema.attempts.id, status: schema.attempts.status, completedAt: schema.attempts.completedAt })
        .from(schema.attempts)
        .where(eq(schema.attempts.id, id))
        .get();
      return row || null;
    },

    async cancel(id: string) {
      await db.update(schema.attempts)
        .set({ status: 'cancelled', completedAt: Date.now() })
        .where(eq(schema.attempts.id, id));
    },

    /** Parse JSON logs into typed messages, filtering out invalid entries */
    parseLogsToMessages(logs: Array<{ type: string; content: string }>) {
      return logs
        .filter(log => log.type === 'json')
        .map(log => {
          try { return JSON.parse(log.content); }
          catch { return null; }
        })
        .filter(Boolean);
    },

    /** Get attempt with parsed output messages (logs → ClaudeOutput[]) */
    async getWithParsedOutput(id: string) {
      const result = await this.getById(id);
      if (!result) return null;
      const { logs, ...attemptData } = result;
      const messages = this.parseLogsToMessages(logs);
      return { attemptData, messages };
    },

    /** Read output file from tmp directory for formatted output responses */
    async readOutputFile(attemptId: string, format: string): Promise<{ content: string; found: true } | { found: false }> {
      const dataDir = process.env.DATA_DIR || join(process.env.CLAUDE_WS_USER_CWD || process.cwd(), 'data');
      const filePath = join(dataDir, 'tmp', `${attemptId}.${format}`);
      if (!existsSync(filePath)) return { found: false };
      const content = await readFile(filePath, 'utf-8');
      return { content, found: true };
    },
  };
}
