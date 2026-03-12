/**
 * Query Options Builder for Claude SDK Provider
 *
 * Constructs the full options object passed to the SDK query() call, including:
 * - allowed tools list (built-ins + MCP wildcards)
 * - session resume/resumeSessionAt passthrough
 * - checkpoint options
 * - canUseTool callback factory (AskUserQuestion gate + Bash BGPID fix)
 * - subprocess environment (strips proxy/session detection vars)
 * - system prompt preset
 * - Windows claude.exe path resolution
 */

import { existsSync } from 'fs';
import { join, normalize } from 'path';
import { checkpointManager } from '../checkpoint-manager';
import { createLogger } from '../logger';
import { isServerCommand } from './claude-sdk-model-alias-and-server-command-utils';
import type { MCPServerConfig } from './claude-sdk-mcp-config-loader';

const log = createLogger('SDKProvider:QueryBuilder');

export interface AskUserQuestionAnswer {
  questions: unknown[];
  answers: Record<string, string>;
}

export type CanUseToolCallback = (toolName: string, input: Record<string, unknown>) => Promise<
  | { behavior: 'allow'; updatedInput: Record<string, unknown> }
  | { behavior: 'deny'; message: string }
>;

export interface QueryOptionsBuilderParams {
  projectPath: string;
  model: string;
  sessionOptions?: { resume?: string; resumeSessionAt?: string };
  maxTurns?: number;
  systemPromptAppend?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  mcpToolWildcards: string[];
  controller: AbortController;
  canUseToolCallback: CanUseToolCallback;
  stderrHandler: (data: string) => void;
}

/**
 * Build the options object for SDK query(), minus prompt.
 */
export function buildQueryOptions(params: QueryOptionsBuilderParams) {
  const {
    projectPath, model, sessionOptions, maxTurns, systemPromptAppend,
    mcpServers, mcpToolWildcards, controller, canUseToolCallback, stderrHandler,
  } = params;

  const checkpointOptions = checkpointManager.getCheckpointingOptions();

  // Resolve Windows claude.exe path
  const resolvedClaudePath = (() => {
    if (process.platform !== 'win32') return undefined;
    const envPath = process.env.CLAUDE_PATH;
    if (envPath && existsSync(normalize(envPath))) return normalize(envPath);
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const candidates = [
      join(home, '.local', 'bin', 'claude.exe'),
      join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return undefined;
  })();

  // Build clean subprocess env — strip proxy/session-detection vars
  const subprocessEnv = { ...process.env };
  delete subprocessEnv.ANTHROPIC_BASE_URL;
  delete subprocessEnv.ANTHROPIC_PROXIED_BASE_URL;
  delete subprocessEnv.CLAUDECODE;
  delete subprocessEnv.CLAUDE_CODE_ENTRYPOINT;

  const queryOptions = {
    cwd: projectPath,
    model,
    permissionMode: 'bypassPermissions' as const,
    settingSources: ['user', 'project'] as ('user' | 'project')[],
    ...(mcpServers ? { mcpServers } : {}),
    allowedTools: [
      'Skill', 'Task',
      'Read', 'Write', 'Edit', 'NotebookEdit',
      'Bash', 'Grep', 'Glob',
      'WebFetch', 'WebSearch',
      'TodoWrite', 'AskUserQuestion',
      ...mcpToolWildcards,
    ],
    ...(sessionOptions?.resume ? { resume: sessionOptions.resume } : {}),
    ...(sessionOptions?.resumeSessionAt ? { resumeSessionAt: sessionOptions.resumeSessionAt } : {}),
    ...checkpointOptions,
    ...(maxTurns ? { maxTurns } : {}),
    abortController: controller,
    canUseTool: canUseToolCallback,
    env: subprocessEnv,
    ...(resolvedClaudePath ? { pathToClaudeCodeExecutable: resolvedClaudePath } : {}),
    systemPrompt: {
      type: 'preset' as const,
      preset: 'claude_code' as const,
      append: systemPromptAppend || '',
    },
    stderr: stderrHandler,
  };

  log.debug({ model, cwd: projectPath, mcpCount: mcpToolWildcards.length }, 'Query options built');
  return queryOptions;
}

/**
 * Build the canUseTool callback that:
 * 1. Gates AskUserQuestion via a promise resolved by answerQuestion()
 * 2. Injects BGPID capture for server Bash commands
 */
export function buildCanUseToolCallback(
  attemptId: string,
  hasPending: () => boolean,
  registerQuestion: (toolUseId: string, questions: unknown[]) => void,
  waitForAnswer: (toolUseId: string) => Promise<AskUserQuestionAnswer | null>,
): CanUseToolCallback {
  return async (toolName: string, input: Record<string, unknown>) => {
    log.debug({ toolName, attemptId }, 'canUseTool called');

    if (toolName === 'AskUserQuestion') {
      if (hasPending()) {
        return { behavior: 'deny', message: 'Duplicate question' };
      }
      const toolUseId = `ask-${Date.now()}`;
      const questions = (input.questions as unknown[]) || [];
      registerQuestion(toolUseId, questions);

      const answer = await waitForAnswer(toolUseId);

      if (!answer || Object.keys(answer.answers).length === 0) {
        return { behavior: 'deny', message: 'User cancelled' };
      }
      return { behavior: 'allow', updatedInput: answer as unknown as Record<string, unknown> };
    }

    // Bash BGPID fix — intercept server commands missing background PID capture
    if (toolName === 'Bash') {
      const command = input.command as string | undefined;
      if (command && isServerCommand(command) && !command.includes('echo "BGPID:$!"')) {
        if (/>\s*\/tmp\/[^\s]+\.log\s*$/.test(command)) {
          const fixedCommand = command.trim() + ' 2>&1 & echo "BGPID:$!"';
          log.debug({ fixedCommand }, 'Fixed BGPID pattern');
          return { behavior: 'allow', updatedInput: { ...input, command: fixedCommand } };
        }
      }
    }

    return { behavior: 'allow', updatedInput: input };
  };
}
