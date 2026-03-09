/**
 * Agent Manager - Thin orchestrator delegating to providers
 *
 * Selects between Claude CLI and SDK providers, builds prompts,
 * and forwards provider events to AgentManager events (identical API).
 * Cross-cutting concerns: sessionManager, checkpointManager, usageTracker, workflowTracker.
 */

// Ensure file checkpointing is always enabled
process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING = '1';

// Enable SDK task system (opt-in feature since v0.2.19)
process.env.CLAUDE_CODE_ENABLE_TASKS = 'true';

import { EventEmitter } from 'events';
import { resolve } from 'path';
import type { ClaudeOutput } from '../types';
import type { BackgroundShellInfo, SDKResultMessage } from './sdk-event-adapter';
import { sessionManager } from './session-manager';
import { checkpointManager } from './checkpoint-manager';
import { usageTracker } from './usage-tracker';
import { workflowTracker } from './workflow-tracker';
import { collectGitStats, gitStatsCache } from './git-stats-collector';
import { getSystemPrompt } from './system-prompt';
import { modelIdToDisplayName } from './models';
import { createLogger } from './logger';
import { getActiveProvider, type Provider, type ProviderSession } from './providers';

const log = createLogger('AgentManager');

interface AgentInstance {
  attemptId: string;
  session: ProviderSession;
  provider: Provider;
  startedAt: number;
  outputFormat?: string;
}

interface AgentEvents {
  started: (data: { attemptId: string; taskId: string }) => void;
  json: (data: { attemptId: string; data: ClaudeOutput }) => void;
  stderr: (data: { attemptId: string; content: string }) => void;
  exit: (data: { attemptId: string; code: number | null }) => void;
  question: (data: { attemptId: string; toolUseId: string; questions: unknown[] }) => void;
  questionResolved: (data: { attemptId: string }) => void;
  backgroundShell: (data: { attemptId: string; shell: BackgroundShellInfo }) => void;
  trackedProcess: (data: { attemptId: string; pid: number; command: string; logFile?: string }) => void;
  promptTooLong: (data: { attemptId: string }) => void;
}

export interface AgentStartOptions {
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
}

/**
 * Check if command is a server/dev command that should run in background
 */
function isServerCommand(command: string): boolean {
  const patterns = [
    /npm\s+run\s+(dev|start|serve)/i,
    /yarn\s+(dev|start|serve)/i,
    /pnpm\s+(dev|start|serve)/i,
    /npx\s+(directus|strapi|next|vite|nuxt)/i,
    /nohup\s+/i,
  ];
  return patterns.some(p => p.test(command));
}

/**
 * AgentManager - Singleton orchestrator that delegates to providers
 */
class AgentManager extends EventEmitter {
  private agents = new Map<string, AgentInstance>();
  // Track Bash tool_use commands to correlate with BGPID results
  private pendingBashCommands = new Map<string, { command: string; attemptId: string }>();
  // Persistent question storage — survives agent cleanup (keyed by taskId)
  // Used when CLI auto-handles AskUserQuestion and the attempt completes before user answers
  private persistentQuestions = new Map<string, { attemptId: string; toolUseId: string; questions: unknown[]; timestamp: number }>();

  constructor() {
    super();
    process.on('exit', () => this.cancelAll());
  }

  /**
   * Start a new agent query via the active provider
   */
  async start(options: AgentStartOptions): Promise<void> {
    const { attemptId, projectPath, prompt, sessionOptions, filePaths, outputFormat, outputSchema, maxTurns, model } = options;

    if (this.agents.has(attemptId)) return;

    // Build full prompt
    let fullPrompt = prompt;

    // Add file references as @ syntax
    if (filePaths && filePaths.length > 0) {
      const fileRefs = filePaths.map(fp => `@${fp}`).join(' ');
      fullPrompt = `${fileRefs} ${prompt}`;
    }

    // Add system prompt (BGPID instructions for background servers)
    const systemPrompt = getSystemPrompt({ prompt, projectPath });
    if (systemPrompt) {
      fullPrompt += `\n\n${systemPrompt}`;
    }

    // Add output format instructions
    if (outputFormat) {
      fullPrompt += this.buildOutputFormatPrompt(outputFormat, outputSchema, attemptId);
    }

    // Build model identity for system prompt
    const effectiveModel = model || 'claude-opus-4-6';
    const modelDisplayName = modelIdToDisplayName(effectiveModel);
    const modelIdentity = modelDisplayName !== effectiveModel
      ? `You are powered by the model named ${modelDisplayName}. The exact model ID is ${effectiveModel}.`
      : `You are powered by the model ${effectiveModel}.`;

    // Get the active provider
    const provider = getActiveProvider();

    // Wire up provider events for this attempt
    this.wireProviderEvents(provider, attemptId, outputFormat, projectPath);

    try {
      const session = await provider.start({
        attemptId,
        projectPath,
        prompt: fullPrompt,
        model: effectiveModel,
        sessionOptions,
        maxTurns,
        systemPromptAppend: modelIdentity,
        outputFormat,
        outputSchema,
      });

      const instance: AgentInstance = {
        attemptId,
        session,
        provider,
        startedAt: Date.now(),
        outputFormat,
      };

      this.agents.set(attemptId, instance);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error({ attemptId, err: error }, 'Failed to start provider');
      this.emit('stderr', { attemptId, content: errorMessage });
      this.emit('exit', { attemptId, code: 1 });
    }
  }

  /**
   * Wire provider events to AgentManager events for a specific attempt
   */
  private wireProviderEvents(provider: Provider, attemptId: string, outputFormat?: string, projectPath?: string): void {
    // Use a cleanup function to remove all listeners at once
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];
    const cleanup = () => {
      for (const { event, fn } of listeners) {
        provider.removeListener(event, fn);
      }
    };
    const addListener = (event: string, fn: (...args: any[]) => void) => {
      listeners.push({ event, fn });
      provider.on(event as any, fn);
    };

    addListener('message', async (data: {
      attemptId: string;
      output: ClaudeOutput;
      sessionId?: string;
      checkpointUuid?: string;
      backgroundShell?: BackgroundShellInfo;
      resultMessage?: SDKResultMessage;
      rawMessage?: unknown;
    }) => {
      if (data.attemptId !== attemptId) return;

      // Handle session ID capture
      if (data.sessionId) {
        const instance = this.agents.get(attemptId);
        if (instance) {
          instance.session.sessionId = data.sessionId;
        }
        await sessionManager.saveSession(attemptId, data.sessionId);
      }

      // Handle checkpoint UUID capture
      if (data.checkpointUuid) {
        checkpointManager.captureCheckpointUuid(attemptId, data.checkpointUuid);
      }

      // Track subagent workflow and Bash commands from raw messages
      if (data.rawMessage) {
        this.trackWorkflowFromMessage(attemptId, data.rawMessage);
      }

      // Track usage stats from result messages
      if (data.resultMessage) {
        usageTracker.trackResult(attemptId, data.resultMessage);
      }

      // Handle background shell
      if (data.backgroundShell) {
        this.emit('backgroundShell', { attemptId, shell: data.backgroundShell });
      }

      // Emit adapted message (suppress result if custom output format)
      if (!(data.output.type === 'result' && outputFormat)) {
        if (outputFormat) {
          data.output.outputFormat = outputFormat;
        }
        this.emit('json', { attemptId, data: data.output });
      }
    });

    addListener('question', (data: { attemptId: string; toolUseId: string; questions: unknown[] }) => {
      if (data.attemptId !== attemptId) return;
      this.emit('question', data);
    });

    addListener('questionResolved', (data: { attemptId: string }) => {
      if (data.attemptId !== attemptId) return;
      this.emit('questionResolved', data);
    });

    addListener('complete', async (data: { attemptId: string; sessionId?: string }) => {
      if (data.attemptId !== attemptId) return;

      // Read custom output file if requested
      if (outputFormat) {
        this.readOutputFile(attemptId, outputFormat);
      }

      // Collect git stats
      if (projectPath) {
        try {
          const gitStats = await collectGitStats(projectPath);
          if (gitStats) gitStatsCache.set(attemptId, gitStats);
        } catch { /* continue */ }
      }

      this.agents.delete(attemptId);
      this.emit('exit', { attemptId, code: 0 });
      cleanup();
    });

    addListener('error', (data: { attemptId: string; error: string; errorName: string; isPromptTooLong?: boolean }) => {
      if (data.attemptId !== attemptId) return;

      this.emit('stderr', { attemptId, content: `${data.errorName}: ${data.error}` });

      if (data.isPromptTooLong) {
        this.emit('promptTooLong', { attemptId });
      }

      this.agents.delete(attemptId);
      this.emit('exit', { attemptId, code: 1 });
      cleanup();
    });

    addListener('stderr', (data: { attemptId: string; content: string }) => {
      if (data.attemptId !== attemptId) return;
      this.emit('stderr', data);
    });
  }

  /**
   * Track workflow from raw SDK/CLI messages
   */
  private trackWorkflowFromMessage(attemptId: string, message: unknown): void {
    const msg = message as { type: string; message?: { content: Array<{ type: string; id?: string; name?: string; input?: unknown }> }; parent_tool_use_id?: string | null };

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_use' && block.name === 'Task' && block.id) {
          const taskInput = (block as { input?: { subagent_type?: string; team_name?: string; name?: string } }).input;
          workflowTracker.trackSubagentStart(
            attemptId, block.id, taskInput?.subagent_type || 'unknown',
            msg.parent_tool_use_id || null,
            { teamName: taskInput?.team_name, name: taskInput?.name }
          );
        }
        if (block.type === 'tool_use' && block.name === 'TeamCreate' && block.id) {
          const teamInput = (block as { input?: { team_name?: string } }).input;
          if (teamInput?.team_name) workflowTracker.trackTeamCreate(attemptId, teamInput.team_name);
        }
        if (block.type === 'tool_use' && block.name === 'SendMessage' && block.id) {
          const msgInput = (block as { input?: { type?: string; recipient?: string; content?: string; summary?: string } }).input;
          if (msgInput) workflowTracker.trackMessage(attemptId, msgInput);
        }
        // Track Bash tool_uses for BGPID correlation
        if (block.type === 'tool_use' && block.name === 'Bash' && block.id) {
          const bashInput = block.input as { command?: string } | undefined;
          const toolId = block.id;
          if (bashInput?.command) {
            this.pendingBashCommands.set(toolId, { command: bashInput.command, attemptId });
            setTimeout(() => this.pendingBashCommands.delete(toolId), 5 * 60 * 1000);
          }
        }
      }
    }

    if (msg.type === 'user' && msg.message?.content) {
      const userContent = msg.message.content as Array<{ type: string; tool_use_id?: string; is_error?: boolean; content?: string | unknown[] }>;
      for (const block of userContent) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          workflowTracker.trackSubagentEnd(attemptId, block.tool_use_id, !block.is_error);

          // Detect BGPID pattern
          let content = '';
          if (typeof block.content === 'string') {
            content = block.content;
          } else if (Array.isArray(block.content)) {
            content = (block.content as Array<{ text?: string }>)
              .filter(c => c && typeof c === 'object' && 'text' in c)
              .map(c => c.text || '').join('');
          }

          const bgpidMatch = content.match(/BGPID:(\d+)/);
          const emptyBgpidMatch = content.match(/BGPID:\s*$/m) || content.trim() === 'BGPID:';

          if (bgpidMatch && block.tool_use_id) {
            const pid = parseInt(bgpidMatch[1], 10);
            const bashInfo = this.pendingBashCommands.get(block.tool_use_id);
            const command = bashInfo?.command || `Background process (PID: ${pid})`;
            const logMatch = command.match(/>\s*([^\s]+\.log)/);
            this.emit('trackedProcess', { attemptId, pid, command, logFile: logMatch?.[1] });
            this.pendingBashCommands.delete(block.tool_use_id);
          } else if (emptyBgpidMatch && block.tool_use_id) {
            const bashInfo = this.pendingBashCommands.get(block.tool_use_id);
            if (bashInfo?.command && isServerCommand(bashInfo.command)) {
              const nohupMatch = bashInfo.command.match(/nohup\s+(.+?)\s*>\s*\/tmp\//);
              if (nohupMatch) {
                this.emit('backgroundShell', {
                  attemptId,
                  shell: { toolUseId: block.tool_use_id, command: nohupMatch[1].trim(), description: 'Auto-spawned from empty BGPID', originalCommand: bashInfo.command },
                });
              }
            }
            this.pendingBashCommands.delete(block.tool_use_id);
          }
        }
      }
    }
  }

  /**
   * Build output format instructions to append to prompt
   */
  private buildOutputFormatPrompt(outputFormat: string, outputSchema?: string, attemptId?: string): string {
    const dataDir = process.env.DATA_DIR || process.cwd();
    const outputFilePath = resolve(dataDir, 'tmp', attemptId || 'unknown');

    let example = '';
    switch (outputFormat.toLowerCase()) {
      case 'json': example = `Example: Write:\n["Max", "Bella", "Charlie"]\n\nNOT:\n{Max, Bella, Charlie} (unquoted strings - invalid JSON)\nNOT:\n{"file_path":"...", "content":["Max"]} (don't wrap in metadata)`; break;
      case 'yaml': case 'yml': example = `Example: Write:\n- Max\n- Bella\n- Charlie\n\nNOT:\n["Max", "Bella", "Charlie"] (that's JSON, not YAML)`; break;
      case 'html': case 'htm': example = `Example: Write:\n<div class="container">\n  <h1>Results</h1>\n</div>\n\nNOT:\n{"html": "<div>..."} (don't wrap in metadata)`; break;
      case 'css': example = `Example: Write:\n.container { color: red; }\n\nNOT:\n{"css": ".container {...}"} (don't wrap in metadata)`; break;
      case 'js': example = `Example: Write:\nconst result = ["Max", "Bella"];\nconsole.log(result);\n\nNOT:\n{"javascript": "const..."} (don't wrap in metadata)`; break;
      case 'md': case 'markdown': example = `Example: Write:\n# Results\n\n- Max\n- Bella\n- Charlie\n\nNOT:\n{"markdown": "# Results"} (don't wrap in metadata)`; break;
      case 'csv': example = `Example: Write:\nMax,Bella,Charlie\n\nNOT:\n["Max","Bella","Charlie"] (that's JSON, not CSV)`; break;
      case 'tsv': example = `Example: Write:\nMax\tBella\tCharlie\n\nNOT:\n["Max","Bella","Charlie"] (that's JSON, not TSV)`; break;
      case 'txt': example = `Example: Write:\nMax\nBella\nCharlie\n\nNOT:\n{"content": "Max\\nBella"} (don't wrap in metadata)`; break;
      case 'xml': example = `Example: Write:\n<?xml version="1.0"?>\n<root>\n  <item>Max</item>\n</root>\n\nNOT:\n{"xml": "<?xml...>"} (don't wrap in metadata)`; break;
      default: example = `Example: Write the actual ${outputFormat.toUpperCase()} content directly, not wrapped in any metadata or JSON object.`;
    }

    let prompt = `\n\n=== REQUIRED OUTPUT ===\nYou MUST write your WORK RESULTS to a ${outputFormat.toUpperCase()} file at: ${outputFilePath}.${outputFormat}`;
    if (outputSchema) prompt += `\n\nFormat:\n${outputSchema}`;
    prompt += `\n\nCRITICAL INSTRUCTIONS:
1. Use Write tool with PARAMETER 1 (file path) and PARAMETER 2 (your content)
2. DO NOT wrap content in metadata like {"file_path": ..., "content": ...}
3. The file should contain ONLY the actual ${outputFormat.toUpperCase()} data
4. MANDATORY: After writing, you MUST use Read tool to verify the file was written correctly
5. If the file content is invalid, fix it and rewrite

${example}

Your task is INCOMPLETE until:\n1. File exists with valid content\n2. You have Read it back to verify\n========================`;

    return prompt;
  }

  /**
   * Read custom output file after completion
   */
  private readOutputFile(attemptId: string, outputFormat: string): void {
    try {
      const fs = require('fs');
      const dataDir = process.env.DATA_DIR || process.cwd();
      const outputFilePath = resolve(dataDir, 'tmp', `${attemptId}.${outputFormat}`);

      if (fs.existsSync(outputFilePath)) {
        const fileContent = fs.readFileSync(outputFilePath, 'utf-8');
        this.emit('json', {
          attemptId,
          data: {
            type: 'result',
            subtype: 'success',
            is_error: false,
            content: fileContent,
            outputFormat,
          } as ClaudeOutput & { content: string },
        });
      } else {
        this.emit('stderr', { attemptId, content: `Error: Expected output file not found: ${outputFilePath}` });
      }
    } catch (readError) {
      log.error({ err: readError }, 'Failed to read output file');
    }
  }

  // --- Public API (identical to original) ---

  answerQuestion(attemptId: string, toolUseId: string | undefined, questions: unknown[], answers: Record<string, string>): boolean {
    const instance = this.agents.get(attemptId);
    if (!instance) return false;
    return instance.provider.answerQuestion(attemptId, toolUseId, questions, answers);
  }

  cancelQuestion(attemptId: string): boolean {
    const instance = this.agents.get(attemptId);
    if (!instance) return false;
    return instance.provider.cancelQuestion(attemptId);
  }

  hasPendingQuestion(attemptId: string): boolean {
    const instance = this.agents.get(attemptId);
    if (!instance) return false;
    return instance.provider.hasPendingQuestion(attemptId);
  }

  getPendingQuestionData(attemptId: string): { toolUseId: string; questions: unknown[]; timestamp: number } | null {
    const instance = this.agents.get(attemptId);
    if (!instance) return null;
    return instance.provider.getPendingQuestionData(attemptId);
  }

  getAllPendingQuestions(): Array<{ attemptId: string; toolUseId: string; questions: unknown[]; timestamp: number }> {
    const result: Array<{ attemptId: string; toolUseId: string; questions: unknown[]; timestamp: number }> = [];
    for (const [attemptId, instance] of this.agents) {
      const data = instance.provider.getPendingQuestionData(attemptId);
      if (data) result.push({ attemptId, ...data });
    }
    return result;
  }

  // Persistent question methods — question data survives agent cleanup
  setPersistentQuestion(taskId: string, data: { attemptId: string; toolUseId: string; questions: unknown[]; timestamp: number }): void {
    this.persistentQuestions.set(taskId, data);
  }

  getPersistentQuestion(taskId: string): { attemptId: string; toolUseId: string; questions: unknown[]; timestamp: number } | null {
    return this.persistentQuestions.get(taskId) || null;
  }

  clearPersistentQuestion(taskId: string): void {
    this.persistentQuestions.delete(taskId);
  }

  async sendInput(attemptId: string, _input: string): Promise<boolean> {
    const instance = this.agents.get(attemptId);
    if (!instance || !instance.session.sessionId) return false;
    return false;
  }

  async compact(options: { attemptId: string; projectPath: string; conversationSummary?: string }): Promise<void> {
    const { attemptId, projectPath, conversationSummary } = options;
    const compactPrompt = conversationSummary
      ? `You are continuing a previous conversation that reached the context limit. Here is a summary of the previous context:\n\n${conversationSummary}\n\nPlease acknowledge this context briefly and let the user know you're ready to continue.`
      : 'A previous conversation reached the context limit. Please let the user know you are ready to continue with a fresh context.';

    await this.start({ attemptId, projectPath, prompt: compactPrompt, maxTurns: 1 });
  }

  cancel(attemptId: string): boolean {
    const instance = this.agents.get(attemptId);
    if (!instance) return false;

    instance.session.cancel();
    this.agents.delete(attemptId);
    return true;
  }

  cancelAll(): void {
    for (const [, instance] of this.agents) {
      instance.session.cancel();
    }
    this.agents.clear();
  }

  isRunning(attemptId: string): boolean {
    return this.agents.has(attemptId);
  }

  get runningCount(): number {
    return this.agents.size;
  }

  getRunningAttempts(): string[] {
    return Array.from(this.agents.keys());
  }

  getSessionId(attemptId: string): string | undefined {
    return this.agents.get(attemptId)?.session.sessionId;
  }

  // Type-safe event emitter methods
  override on<K extends keyof AgentEvents>(event: K, listener: AgentEvents[K]): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof AgentEvents>(event: K, ...args: Parameters<AgentEvents[K]>): boolean {
    return super.emit(event, ...args);
  }
}

// Export singleton instance (global for cross-module access)
const globalKey = '__claude_agent_manager__' as const;

declare global {
  var __claude_agent_manager__: AgentManager | undefined;
}

export const agentManager: AgentManager =
  (globalThis as any)[globalKey] ?? new AgentManager();

if (!(globalThis as any)[globalKey]) {
  (globalThis as any)[globalKey] = agentManager;
}
