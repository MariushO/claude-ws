/**
 * Session manager — handles Claude session persistence and resumption for conversation continuation.
 * Validates session files, detects corruption, and auto-fixes sessions with API errors at the end.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { eq, desc, and, inArray } from 'drizzle-orm';
import * as schema from '../db/database-schema';

export interface SessionOptions {
  resume?: string;
  resumeSessionAt?: string;
}

export class SessionManager {
  constructor(private db: any) {}

  /** Get the last resumable session ID for a task (completed/cancelled attempts only) */
  async getLastSessionId(taskId: string): Promise<string | null> {
    const rows = await this.db
      .select({ sessionId: schema.attempts.sessionId })
      .from(schema.attempts)
      .where(
        and(
          eq(schema.attempts.taskId, taskId),
          inArray(schema.attempts.status, ['completed', 'cancelled'])
        )
      )
      .orderBy(desc(schema.attempts.createdAt))
      .limit(1);
    return rows.length > 0 ? rows[0].sessionId : null;
  }

  /** Get session options — checks for rewind state first, then falls back to last session */
  async getSessionOptions(taskId: string): Promise<SessionOptions> {
    const taskRows = await this.db
      .select({
        rewindSessionId: schema.tasks.rewindSessionId,
        rewindMessageUuid: schema.tasks.rewindMessageUuid,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, taskId))
      .limit(1);

    const task = taskRows[0];
    if (task?.rewindSessionId && task?.rewindMessageUuid) {
      return { resume: task.rewindSessionId, resumeSessionAt: task.rewindMessageUuid };
    }

    const sessionId = await this.getLastSessionId(taskId);
    return sessionId ? { resume: sessionId } : {};
  }

  /** Get session file path by searching ~/.claude/projects/ directories */
  getSessionFilePath(sessionId: string): string | null {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    if (!fs.existsSync(projectsDir)) return null;

    const projectDirs = fs.readdirSync(projectsDir);
    for (const dir of projectDirs) {
      const candidatePath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
      if (fs.existsSync(candidatePath)) return candidatePath;
    }
    return null;
  }

  /** Validate session file — checks existence, non-empty, and has conversation content */
  validateSessionFile(sessionId: string): { valid: boolean; reason?: string } {
    const filePath = this.getSessionFilePath(sessionId);
    if (!filePath) return { valid: false, reason: 'file_not_found' };

    try {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) return { valid: false, reason: 'file_empty' };

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length === 0) return { valid: false, reason: 'no_valid_entries' };

      let hasConversationContent = false;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'user' || entry.type === 'assistant' || entry.type === 'result') {
            hasConversationContent = true;
            break;
          }
        } catch {
          return { valid: false, reason: 'invalid_json' };
        }
      }

      return hasConversationContent ? { valid: true } : { valid: false, reason: 'no_conversation_content' };
    } catch {
      return { valid: false, reason: 'read_error' };
    }
  }

  /** Find last good assistant message UUID in a session that has API errors at the end */
  async findLastGoodMessageInSession(sessionId: string): Promise<string | null> {
    const sessionFilePath = this.getSessionFilePath(sessionId);
    if (!sessionFilePath) return null;

    const lines: string[] = [];
    const fileStream = fs.createReadStream(sessionFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (line.trim()) lines.push(line);
    }

    // Check if session ends with API error
    let hasApiErrorAtEnd = false;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.isApiErrorMessage) { hasApiErrorAtEnd = true; break; }
      } catch { /* skip */ }
    }

    if (!hasApiErrorAtEnd) return null;

    // Find last successful assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && !entry.isApiErrorMessage && entry.uuid) {
          return entry.uuid;
        }
      } catch { /* skip */ }
    }

    return null;
  }

  /** Get session options with automatic corruption detection and auto-fix */
  async getSessionOptionsWithAutoFix(taskId: string): Promise<SessionOptions> {
    const options = await this.getSessionOptions(taskId);

    // If already using rewind, no need to check
    if (options.resumeSessionAt) return options;

    if (options.resume) {
      // Validate session file
      const validation = this.validateSessionFile(options.resume);
      if (!validation.valid) return {};

      // Check for API errors at end and auto-fix by rewinding
      const lastGoodMessage = await this.findLastGoodMessageInSession(options.resume);
      if (lastGoodMessage) {
        return { resume: options.resume, resumeSessionAt: lastGoodMessage };
      }
    }

    return options;
  }
}
