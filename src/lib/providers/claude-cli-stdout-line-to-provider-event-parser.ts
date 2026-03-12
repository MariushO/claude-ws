/**
 * CLI Stdout Line Parser for Claude CLI Provider
 *
 * Parses a single newline-delimited JSON line from the CLI stdout stream,
 * adapts it via sdk-event-adapter, and returns a structured result that
 * the provider can act on (emit events, update session state, close stdin).
 *
 * Separated from the provider class to keep processMessage logic testable
 * and to reduce the provider file size.
 */

import { adaptSDKMessage, isValidSDKMessage, type SDKResultMessage } from '../sdk-event-adapter';
import { createLogger } from '../logger';
import type { CLISession } from './claude-cli-session-and-pending-question-types';

const log = createLogger('CLIProvider:Parser');

export interface ParsedCLILine {
  /** Adapted output + metadata ready to emit as a 'message' event */
  messagePayload: {
    output: ReturnType<typeof adaptSDKMessage>['output'];
    sessionId?: string;
    checkpointUuid?: string;
    backgroundShell?: ReturnType<typeof adaptSDKMessage>['backgroundShell'];
    resultMessage?: SDKResultMessage;
    rawMessage: unknown;
  };
  /** Set when an AskUserQuestion tool-use was detected */
  askUserQuestion?: { toolUseId: string; questions: unknown[] };
  /** True when the CLI auto-handled a pending AskUserQuestion via tool_result */
  cliAutoHandledQuestion: boolean;
  /** True when this is a result message — caller should close stdin */
  isResultMessage: boolean;
}

/**
 * Parse one line of CLI stdout output.
 * Returns null if the line is not valid JSON or not a recognised SDK message.
 */
export function parseCLILine(line: string, session: CLISession): ParsedCLILine | null {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    log.trace({ line: line.substring(0, 100) }, 'Non-JSON line');
    return null;
  }

  const { attemptId } = session;
  log.debug({ type: (message as Record<string, unknown>)?.type, attemptId }, 'CLI message received');

  if (!isValidSDKMessage(message)) {
    log.debug({ type: (message as Record<string, unknown>)?.type }, 'Invalid message skipped');
    return null;
  }

  const adapted = adaptSDKMessage(message);

  // Detect AskUserQuestion tool-use in assistant message
  let askUserQuestion: ParsedCLILine['askUserQuestion'];
  if (adapted.askUserQuestion) {
    askUserQuestion = adapted.askUserQuestion;
  }

  // Detect CLI auto-handling AskUserQuestion via a user/tool_result message
  let cliAutoHandledQuestion = false;
  if (
    (message as Record<string, unknown>).type === 'user' &&
    session.getPendingQuestion()
  ) {
    const rawContent = (message as { message?: { content?: Array<{ type: string; tool_use_id?: string }> } })
      .message?.content || [];
    const pending = session.getPendingQuestion();
    for (const block of rawContent) {
      if (
        block.type === 'tool_result' &&
        block.tool_use_id &&
        pending &&
        block.tool_use_id === pending.toolUseId
      ) {
        log.info(
          { attemptId, toolUseId: block.tool_use_id },
          'CLI auto-handled AskUserQuestion, clearing pending (answer will use auto-retry flow)',
        );
        cliAutoHandledQuestion = true;
        break;
      }
    }
  }

  const isResultMessage = (message as Record<string, unknown>).type === 'result';

  return {
    messagePayload: {
      output: adapted.output,
      sessionId: adapted.sessionId,
      checkpointUuid: adapted.checkpointUuid,
      backgroundShell: adapted.backgroundShell,
      resultMessage: isResultMessage ? (message as SDKResultMessage) : undefined,
      rawMessage: message,
    },
    askUserQuestion,
    cliAutoHandledQuestion,
    isResultMessage,
  };
}
