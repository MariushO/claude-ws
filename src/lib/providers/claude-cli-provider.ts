/**
 * Claude CLI Provider - Spawns Claude CLI with stream-json protocol
 *
 * Uses `claude --input-format stream-json --output-format stream-json`
 * for long-running interactive sessions. CLI natively handles MCP,
 * skills, slash commands — no JS config needed.
 */

import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import { adaptSDKMessage, isValidSDKMessage, type SDKResultMessage } from '../sdk-event-adapter';
import { findClaudePath } from '../cli-query';
import { createLogger } from '../logger';
import type { Provider, ProviderSession, ProviderStartOptions, ProviderEventData, ProviderId } from './types';

const log = createLogger('CLIProvider');

// --- Pending question types ---

interface PendingQuestion {
  toolUseId: string;
  questions: unknown[];
  timestamp: number;
}

// --- CLI Session ---

class CLISession implements ProviderSession {
  readonly providerId: ProviderId = 'claude-cli';
  sessionId: string | undefined;
  outputFormat?: string;
  child: ChildProcess;
  private pendingQuestion: PendingQuestion | null = null;

  constructor(
    readonly attemptId: string,
    child: ChildProcess,
    outputFormat?: string,
  ) {
    this.child = child;
    this.outputFormat = outputFormat;
  }

  setPendingQuestion(q: PendingQuestion | null): void {
    this.pendingQuestion = q;
  }

  getPendingQuestion(): PendingQuestion | null {
    return this.pendingQuestion;
  }

  /**
   * Write a tool_result answer to stdin
   */
  writeToolResult(toolUseId: string, content: string): boolean {
    if (!this.child.stdin || this.child.stdin.destroyed) return false;
    const msg = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content }],
      },
    });
    return this.child.stdin.write(msg + '\n');
  }

  cancel(): void {
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }, 3000);
    }
  }
}

// --- Provider ---

export class ClaudeCLIProvider extends EventEmitter implements Provider {
  readonly id: ProviderId = 'claude-cli';

  private sessions = new Map<string, CLISession>();

  resolveModel(displayModelId: string): string {
    // CLI accepts full model IDs directly
    return displayModelId;
  }

  async start(options: ProviderStartOptions): Promise<ProviderSession> {
    const { attemptId, projectPath, prompt, sessionOptions, maxTurns, model, systemPromptAppend, outputFormat } = options;

    const claudePath = findClaudePath();
    if (!claudePath) {
      // Emit error and return a dummy session
      const error = 'Claude CLI not found. Set CLAUDE_PATH in your .env file.';
      this.emit('error', { attemptId, error, errorName: 'CLINotFound' });
      throw new Error(error);
    }

    const args: string[] = [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions',
    ];

    if (model) {
      args.push('--model', model);
    }

    if (sessionOptions?.resume) {
      args.push('--resume', sessionOptions.resume);
    }

    if (maxTurns) {
      args.push('--max-turns', String(maxTurns));
    }

    // Append system prompt (model identity) via --append-system-prompt
    if (systemPromptAppend) {
      args.push('--append-system-prompt', systemPromptAppend);
    }

    // Normalize path for Windows
    const normalizedProjectPath = process.platform === 'win32'
      ? projectPath.replace(/\//g, '\\')
      : projectPath;

    log.info({ claudePath, argsCount: args.length, attemptId }, 'Spawning CLI process');

    const child = spawn(claudePath, args, {
      cwd: normalizedProjectPath,
      stdio: ['pipe', 'pipe', 'pipe'], // stdin open for sending messages
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        TERM: 'dumb',
        PATH: process.platform === 'win32'
          ? (process.env.PATH || '').split(';').filter(p => {
              const lp = p.toLowerCase().trim().replace(/\//g, '\\');
              return !lp.startsWith('c:\\windows') &&
                !lp.startsWith('c:\\program files (x86)\\windows kits');
            }).join(';')
          : `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin`,
      },
    });

    const session = new CLISession(attemptId, child, outputFormat);
    this.sessions.set(attemptId, session);

    // Send initial prompt via stdin
    const initialMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: prompt }],
      },
    });
    child.stdin?.write(initialMessage + '\n');

    // Set up output handling
    let buffer = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        this.processMessage(session, line);
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
      this.emit('error', {
        attemptId,
        error: err.message,
        errorName: err.name,
      });
    });

    child.on('exit', (code) => {
      log.info({ attemptId, code }, 'Process exited');

      // Process remaining buffer
      if (buffer.trim()) {
        this.processMessage(session, buffer);
      }

      this.sessions.delete(attemptId);
      this.emit('complete', { attemptId, sessionId: session.sessionId });
    });

    return session;
  }

  private processMessage(session: CLISession, line: string): void {
    const { attemptId } = session;

    try {
      const message = JSON.parse(line);
      log.debug({ type: message?.type, attemptId }, 'CLI message received');

      if (!isValidSDKMessage(message)) {
        log.debug({ type: message?.type }, 'Invalid message skipped');
        return;
      }

      const adapted = adaptSDKMessage(message);

      // Capture session ID
      if (adapted.sessionId) {
        session.sessionId = adapted.sessionId;
      }

      // Detect AskUserQuestion from assistant messages
      if (adapted.askUserQuestion) {
        const { toolUseId, questions } = adapted.askUserQuestion;
        session.setPendingQuestion({ toolUseId, questions, timestamp: Date.now() });
        this.emit('question', { attemptId, toolUseId, questions });
        // Don't return — still emit the message for UI display
      }

      // Detect CLI auto-handling AskUserQuestion (bypassPermissions sends tool_result automatically)
      // When this happens, clear pending question so we don't send a duplicate tool_result via stdin.
      // The user's answer will be handled by the server's auto-retry flow instead.
      if (message.type === 'user' && session.getPendingQuestion()) {
        const rawContent = (message as { message?: { content?: Array<{ type: string; tool_use_id?: string }> } }).message?.content || [];
        const pending = session.getPendingQuestion();
        for (const block of rawContent) {
          if (block.type === 'tool_result' && block.tool_use_id && pending && block.tool_use_id === pending.toolUseId) {
            log.info({ attemptId, toolUseId: block.tool_use_id }, 'CLI auto-handled AskUserQuestion, clearing pending (answer will use auto-retry flow)');
            session.setPendingQuestion(null);
            break;
          }
        }
      }

      // Emit adapted message with metadata
      this.emit('message', {
        attemptId,
        output: adapted.output,
        sessionId: adapted.sessionId,
        checkpointUuid: adapted.checkpointUuid,
        backgroundShell: adapted.backgroundShell,
        resultMessage: message.type === 'result' ? message as SDKResultMessage : undefined,
        rawMessage: message,
      });

      // Close stdin on result message so CLI process can exit naturally
      // Without this, the CLI hangs waiting for more stdin input
      if (message.type === 'result') {
        log.info({ attemptId }, 'Result message received, closing stdin');
        session.child.stdin?.end();
      }
    } catch {
      // Non-JSON output — ignore
      log.trace({ line: line.substring(0, 100) }, 'Non-JSON line');
    }
  }

  answerQuestion(attemptId: string, toolUseId: string | undefined, questions: unknown[], answers: Record<string, string>): boolean {
    const session = this.sessions.get(attemptId);
    if (!session) {
      log.warn({ attemptId }, 'answerQuestion: session not found');
      return false;
    }

    const pending = session.getPendingQuestion();
    if (!pending) {
      log.info({ attemptId }, 'answerQuestion: no pending question (CLI likely auto-handled it)');
      return false;
    }

    if (toolUseId && pending.toolUseId !== toolUseId) {
      log.warn({ attemptId, expected: pending.toolUseId, received: toolUseId }, 'Rejecting stale answer');
      return false;
    }

    // Format the answer as the SDK expects
    const answerContent = JSON.stringify({ questions, answers });
    const success = session.writeToolResult(pending.toolUseId, answerContent);

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

    // Send deny as tool_result
    const success = session.writeToolResult(pending.toolUseId, 'User cancelled');

    if (success) {
      session.setPendingQuestion(null);
      this.emit('questionResolved', { attemptId });
    }

    return success;
  }

  hasPendingQuestion(attemptId: string): boolean {
    const session = this.sessions.get(attemptId);
    return !!session?.getPendingQuestion();
  }

  getPendingQuestionData(attemptId: string): { toolUseId: string; questions: unknown[]; timestamp: number } | null {
    const session = this.sessions.get(attemptId);
    return session?.getPendingQuestion() || null;
  }

  cancelSession(attemptId: string): boolean {
    const session = this.sessions.get(attemptId);
    if (!session) return false;

    session.cancel();
    this.sessions.delete(attemptId);
    return true;
  }

  // Type-safe event emitter overrides
  override on<K extends keyof ProviderEventData>(event: K, listener: (data: ProviderEventData[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof ProviderEventData>(event: K, data: ProviderEventData[K]): boolean {
    return super.emit(event, data);
  }
}
