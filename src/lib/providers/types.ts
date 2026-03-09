/**
 * Provider Architecture Types
 *
 * Defines the contract all Claude providers implement.
 * Providers handle the actual Claude interaction (SDK or CLI),
 * while AgentManager orchestrates cross-cutting concerns.
 */

import { EventEmitter } from 'events';
import type { ClaudeOutput } from '../../types';
import type { BackgroundShellInfo, SDKResultMessage } from '../sdk-event-adapter';

export type ProviderId = 'claude-sdk' | 'claude-cli';

export interface ProviderStartOptions {
  attemptId: string;
  projectPath: string;
  prompt: string;
  model?: string;
  sessionOptions?: {
    resume?: string;
    resumeSessionAt?: string;
  };
  filePaths?: string[];
  outputFormat?: string;
  outputSchema?: string;
  maxTurns?: number;
  systemPromptAppend?: string; // Model identity text
}

export interface ProviderSession {
  readonly attemptId: string;
  readonly providerId: ProviderId;
  sessionId: string | undefined;
  outputFormat?: string;
  cancel(): void;
}

export interface ProviderEventData {
  message: {
    attemptId: string;
    output: ClaudeOutput;
    sessionId?: string;
    checkpointUuid?: string;
    backgroundShell?: BackgroundShellInfo;
    resultMessage?: SDKResultMessage;
    rawMessage?: unknown;
  };
  question: {
    attemptId: string;
    toolUseId: string;
    questions: unknown[];
  };
  questionResolved: {
    attemptId: string;
  };
  complete: {
    attemptId: string;
    sessionId?: string;
  };
  error: {
    attemptId: string;
    error: string;
    errorName: string;
    isPromptTooLong?: boolean;
    wasResuming?: boolean;
  };
  stderr: {
    attemptId: string;
    content: string;
  };
}

export interface Provider extends EventEmitter {
  readonly id: ProviderId;

  /**
   * Start a new provider session.
   * Events are emitted on the provider instance.
   */
  start(options: ProviderStartOptions): Promise<ProviderSession>;

  /**
   * Answer a pending AskUserQuestion for a session
   */
  answerQuestion(attemptId: string, toolUseId: string | undefined, questions: unknown[], answers: Record<string, string>): boolean;

  /**
   * Cancel a pending AskUserQuestion
   */
  cancelQuestion(attemptId: string): boolean;

  /**
   * Check if there's a pending question for an attempt
   */
  hasPendingQuestion(attemptId: string): boolean;

  /**
   * Get pending question data for an attempt
   */
  getPendingQuestionData(attemptId: string): { toolUseId: string; questions: unknown[]; timestamp: number } | null;

  /**
   * Resolve model ID to provider-specific format
   */
  resolveModel(displayModelId: string): string;

  // Type-safe event emitter overrides
  on<K extends keyof ProviderEventData>(event: K, listener: (data: ProviderEventData[K]) => void): this;
  emit<K extends keyof ProviderEventData>(event: K, data: ProviderEventData[K]): boolean;
}
