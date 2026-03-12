/**
 * Claude CLI Provider - Spawns Claude CLI with stream-json protocol
 *
 * Orchestrator: delegates process spawning and stdout parsing to focused
 * sub-modules. Owns session lifecycle, AskUserQuestion coordination,
 * and event emission.
 *
 * Sub-modules:
 * - CLISession / PendingQuestion → claude-cli-session-and-pending-question-types.ts
 * - Process spawner              → claude-cli-process-spawner.ts
 * - Stdout line parser           → claude-cli-stdout-line-to-provider-event-parser.ts
 */

import { EventEmitter } from 'events';
import { findClaudePath } from '../cli-query';
import { createLogger } from '../logger';
import { CLISession } from './claude-cli-session-and-pending-question-types';
import { spawnCLIProcess, sendInitialPrompt } from './claude-cli-process-spawner';
import { parseCLILine } from './claude-cli-stdout-line-to-provider-event-parser';
import type { Provider, ProviderSession, ProviderStartOptions, ProviderEventData, ProviderId } from './types';

const log = createLogger('CLIProvider');

export class ClaudeCLIProvider extends EventEmitter implements Provider {
  readonly id: ProviderId = 'claude-cli';

  private sessions = new Map<string, CLISession>();

  resolveModel(displayModelId: string): string {
    return displayModelId; // CLI accepts full model IDs directly
  }

  async start(options: ProviderStartOptions): Promise<ProviderSession> {
    const { attemptId, projectPath, prompt, sessionOptions, maxTurns, model, systemPromptAppend, outputFormat } = options;

    const claudePath = findClaudePath();
    if (!claudePath) {
      const error = 'Claude CLI not found. Set CLAUDE_PATH in your .env file.';
      this.emit('error', { attemptId, error, errorName: 'CLINotFound' });
      throw new Error(error);
    }

    const child = spawnCLIProcess({
      claudePath, projectPath, model, attemptId,
      sessionResume: sessionOptions?.resume,
      maxTurns, systemPromptAppend,
    });

    const session = new CLISession(attemptId, child, outputFormat);
    this.sessions.set(attemptId, session);
    sendInitialPrompt(child, prompt);

    let buffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) this.processLine(session, line);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const content = chunk.toString();
      log.debug({ attemptId, content: content.substring(0, 200) }, 'stderr received');
      this.emit('stderr', { attemptId, content });
    });

    child.on('error', (err) => {
      log.error({ attemptId, err }, 'Process error');
      this.sessions.delete(attemptId);
      this.emit('error', { attemptId, error: err.message, errorName: err.name });
    });

    child.on('exit', (code) => {
      log.info({ attemptId, code }, 'Process exited');
      if (buffer.trim()) this.processLine(session, buffer);
      this.sessions.delete(attemptId);
      this.emit('complete', { attemptId, sessionId: session.sessionId });
    });

    return session;
  }

  private processLine(session: CLISession, line: string): void {
    const { attemptId } = session;
    const parsed = parseCLILine(line, session);
    if (!parsed) return;

    if (parsed.messagePayload.sessionId) session.sessionId = parsed.messagePayload.sessionId;

    if (parsed.askUserQuestion) {
      const { toolUseId, questions } = parsed.askUserQuestion;
      session.setPendingQuestion({ toolUseId, questions, timestamp: Date.now() });
      this.emit('question', { attemptId, toolUseId, questions });
    }

    if (parsed.cliAutoHandledQuestion) session.setPendingQuestion(null);

    this.emit('message', { attemptId, ...parsed.messagePayload });

    if (parsed.isResultMessage) {
      log.info({ attemptId }, 'Result message received, closing stdin');
      session.child.stdin?.end();
    }
  }

  answerQuestion(attemptId: string, toolUseId: string | undefined, questions: unknown[], answers: Record<string, string>): boolean {
    const session = this.sessions.get(attemptId);
    if (!session) { log.warn({ attemptId }, 'answerQuestion: session not found'); return false; }

    const pending = session.getPendingQuestion();
    if (!pending) { log.info({ attemptId }, 'answerQuestion: no pending question'); return false; }

    if (toolUseId && pending.toolUseId !== toolUseId) {
      log.warn({ attemptId, expected: pending.toolUseId, received: toolUseId }, 'Rejecting stale answer');
      return false;
    }

    const success = session.writeToolResult(pending.toolUseId, JSON.stringify({ questions, answers }));
    if (success) {
      log.info({ attemptId, toolUseId: pending.toolUseId }, 'Answer sent to CLI via stdin');
      session.setPendingQuestion(null);
      this.emit('questionResolved', { attemptId });
    } else {
      log.error({ attemptId, toolUseId: pending.toolUseId }, 'Failed to write answer to CLI stdin');
    }
    return success;
  }

  cancelQuestion(attemptId: string): boolean {
    const session = this.sessions.get(attemptId);
    if (!session) return false;
    const pending = session.getPendingQuestion();
    if (!pending) return false;
    const success = session.writeToolResult(pending.toolUseId, 'User cancelled');
    if (success) { session.setPendingQuestion(null); this.emit('questionResolved', { attemptId }); }
    return success;
  }

  hasPendingQuestion(attemptId: string): boolean {
    return !!this.sessions.get(attemptId)?.getPendingQuestion();
  }

  getPendingQuestionData(attemptId: string): { toolUseId: string; questions: unknown[]; timestamp: number } | null {
    return this.sessions.get(attemptId)?.getPendingQuestion() || null;
  }

  cancelSession(attemptId: string): boolean {
    const session = this.sessions.get(attemptId);
    if (!session) return false;
    session.cancel();
    this.sessions.delete(attemptId);
    return true;
  }

  override on<K extends keyof ProviderEventData>(event: K, listener: (data: ProviderEventData[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof ProviderEventData>(event: K, data: ProviderEventData[K]): boolean {
    return super.emit(event, data);
  }
}
