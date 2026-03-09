'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { ClaudeOutput, WsAttemptFinished } from '@/types';
import { useRunningTasksStore } from '@/stores/running-tasks-store';
import { useQuestionsStore } from '@/stores/questions-store';
import { useWorkflowStore } from '@/stores/workflow-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('AttemptStreamHook');

interface UseAttemptStreamOptions {
  taskId?: string;
  onComplete?: (taskId: string) => void;
}

// Question types for AskUserQuestion
interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface ActiveQuestion {
  attemptId: string;
  toolUseId: string;
  questions: Question[];
}

interface UseAttemptStreamResult {
  messages: ClaudeOutput[];
  isConnected: boolean;
  startAttempt: (taskId: string, prompt: string, displayPrompt?: string, fileIds?: string[], model?: string) => void;
  cancelAttempt: () => void;
  interruptAndSend: (taskId: string, prompt: string, displayPrompt?: string, fileIds?: string[], model?: string) => Promise<void>;
  currentAttemptId: string | null;
  currentPrompt: string | null;
  isRunning: boolean;
  activeQuestion: ActiveQuestion | null;
  answerQuestion: (questions: Question[], answers: Record<string, string>) => void;
  cancelQuestion: () => void;
  refetchQuestion: () => Promise<void>;
}

export function useAttemptStream(
  options?: UseAttemptStreamOptions
): UseAttemptStreamResult {
  const taskId = options?.taskId;
  const onCompleteRef = useRef(options?.onComplete);
  const socketRef = useRef<Socket | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);
  // CRITICAL: Use ref to track currentAttemptId for synchronous filtering in socket callbacks
  // State is async and cannot be used to filter messages in real-time
  const currentAttemptIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ClaudeOutput[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null);
  const { addRunningTask, removeRunningTask, markTaskCompleted } = useRunningTasksStore();

  // Keep callback ref updated
  onCompleteRef.current = options?.onComplete;

  useEffect(() => {
    const socketInstance = io({
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setIsConnected(true);
      // Re-subscribe to current attempt room on reconnect
      // State validation is handled by checkRunningAttempt effect
      setCurrentAttemptId((currentId) => {
        if (currentId) {
          socketInstance.emit('attempt:subscribe', { attemptId: currentId });
          // Fetch pending question from server on reconnect
          // This recovers questions that were emitted while we were disconnected
          fetch(`/api/attempts/${currentId}/pending-question`, { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.question) {
                log.debug({ question: data.question }, 'Recovered pending question on reconnect');
                setActiveQuestion(data.question);
              }
            })
            .catch(() => {});
        }
        return currentId;
      });
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('task:started', (data: { taskId: string }) => {
      addRunningTask(data.taskId);
    });

    socketInstance.on('task:finished', (data: { taskId: string; status: string }) => {
      removeRunningTask(data.taskId);
      if (data.status === 'completed') {
        markTaskCompleted(data.taskId);
        // Move task to in_review regardless of which task user is viewing
        onCompleteRef.current?.(data.taskId);
      }
    });

    // Handle attempt started event (from REST API or WebSocket)
    // Auto-subscribe if we're viewing this task
    socketInstance.on('attempt:started', (data: { attemptId: string; taskId: string }) => {
      // Only subscribe if this attempt is for the current task we're viewing
      if (data.taskId === taskId) {
        currentTaskIdRef.current = data.taskId;
        currentAttemptIdRef.current = data.attemptId; // CRITICAL: Sync ref BEFORE state for immediate filtering
        setCurrentAttemptId(data.attemptId);
        setIsRunning(true);
        addRunningTask(data.taskId);
        socketInstance.emit('attempt:subscribe', { attemptId: data.attemptId });
      }
    });

    // Message handling - SDK streams both deltas and complete messages
    socketInstance.on('output:json', (data: { attemptId: string; data: ClaudeOutput }) => {
      const { attemptId, data: output } = data;

      // CRITICAL: Filter messages by attemptId to prevent cross-task streaming
      // When multiple tasks are running, socket receives messages from ALL attempts
      // Only process messages that belong to the current attempt
      // Use ref for SYNCHRONOUS filtering - state is async and unreliable for real-time filtering
      if (currentAttemptIdRef.current && attemptId !== currentAttemptIdRef.current) {
        return; // EARLY RETURN - skip this message entirely
      }

      if (output.type === 'result') {
        setIsRunning(false);
        if (currentTaskIdRef.current) removeRunningTask(currentTaskIdRef.current);
      }

      setMessages((prev) => {
        // Handle streaming text/thinking deltas
        if (output.type === 'content_block_delta' && (output as any).delta) {
          const delta = (output as any).delta;

          // Only handle text and thinking deltas
          if (delta.type !== 'text_delta' && delta.type !== 'thinking_delta') {
            return prev; // Ignore other deltas (tool streaming works fine)
          }

          // Find or create assistant message for this attempt
          const existingIndex = prev.findLastIndex(
            (m) => m.type === 'assistant' && (m as any)._attemptId === attemptId
          );

          let assistantMsg: any;
          let content: any[];

          if (existingIndex >= 0 && (prev[existingIndex] as any)._fromStreaming) {
            assistantMsg = { ...prev[existingIndex] };
            content = [...(assistantMsg.message?.content || [])];
          } else {
            assistantMsg = {
              type: 'assistant',
              message: { role: 'assistant', content: [] },
              _attemptId: attemptId,
              _msgId: Math.random().toString(36),
              _fromStreaming: true,
            };
            content = [];
          }

          // Accumulate text delta
          if (delta.type === 'text_delta' && delta.text) {
            const textBlockIndex = content.findIndex((b: any) => b.type === 'text');
            if (textBlockIndex >= 0) {
              content[textBlockIndex] = {
                ...content[textBlockIndex],
                text: (content[textBlockIndex].text || '') + delta.text,
              };
            } else {
              content.push({ type: 'text', text: delta.text });
            }
          }

          // Accumulate thinking delta
          if (delta.type === 'thinking_delta' && delta.thinking) {
            const thinkingBlockIndex = content.findIndex((b: any) => b.type === 'thinking');
            if (thinkingBlockIndex >= 0) {
              content[thinkingBlockIndex] = {
                ...content[thinkingBlockIndex],
                thinking: (content[thinkingBlockIndex].thinking || '') + delta.thinking,
              };
            } else {
              content.push({ type: 'thinking', thinking: delta.thinking });
            }
          }

          assistantMsg.message = { ...assistantMsg.message, content };

          // Only update if we found an existing streaming message
          const shouldUpdate = existingIndex >= 0 && (prev[existingIndex] as any)._fromStreaming;
          if (shouldUpdate) {
            const updated = [...prev];
            updated[existingIndex] = assistantMsg;
            return updated;
          }
          return [...prev, assistantMsg];
        }

        // Generate unique ID for this message
        const msgId = Math.random().toString(36);
        const taggedOutput = { ...output, _attemptId: attemptId, _msgId: msgId } as ClaudeOutput & { _attemptId: string; _msgId: string };

        // For tool_use messages, try to update existing or append
        if (output.type === 'tool_use' && output.id) {
          const existingIndex = prev.findIndex(
            (m) => m.type === 'tool_use' && m.id === output.id
          );
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = taggedOutput;
            return updated;
          }
        }

        // For tool_result messages, update existing by tool_use_id
        if (output.type === 'tool_result' && output.tool_data?.tool_use_id) {
          const toolUseId = output.tool_data.tool_use_id;
          const existingIndex = prev.findIndex(
            (m) => m.type === 'tool_result' && m.tool_data?.tool_use_id === toolUseId
          );
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = taggedOutput;
            return updated;
          }
        }

        // For assistant messages, update the last assistant message for the same attempt
        // ONLY merge if:
        // 1. Message has _fromStreaming flag (created during streaming, not loaded from API)
        // 2. It's the LAST message in the array (same turn, not a new turn)
        // If there's a tool_result or user message after, this is a NEW turn - append instead
        if (output.type === 'assistant') {
          const lastMsg = prev[prev.length - 1];
          const isLastMsgStreamingAssistant = lastMsg?.type === 'assistant' && (lastMsg as any)._fromStreaming;

          // Only merge if the last message is a streaming assistant (same turn)
          if (isLastMsgStreamingAssistant) {
            const existingIndex = prev.length - 1;
            const existing = prev[existingIndex] as any;
            const existingContent = existing.message?.content || [];
            const newContent = output.message?.content || [];

            // Merge content blocks: keep existing blocks, update/add new ones
            const mergedContent = [...existingContent];
            for (const newBlock of newContent) {
              const blockIndex = mergedContent.findIndex(
                (b: any) => b.type === newBlock.type && (
                  (newBlock.type === 'tool_use' && b.id === newBlock.id) ||
                  (newBlock.type !== 'tool_use')
                )
              );

              if (blockIndex >= 0 && newBlock.type !== 'tool_use') {
                // Update non-tool_use block (text, thinking)
                const oldBlock = mergedContent[blockIndex];
                if (newBlock.type === 'text') {
                  // Keep the longer text
                  if ((newBlock.text?.length || 0) >= (oldBlock.text?.length || 0)) {
                    mergedContent[blockIndex] = newBlock;
                  }
                } else if (newBlock.type === 'thinking') {
                  // Keep the longer thinking
                  if ((newBlock.thinking?.length || 0) >= (oldBlock.thinking?.length || 0)) {
                    mergedContent[blockIndex] = newBlock;
                  }
                } else {
                  mergedContent[blockIndex] = newBlock;
                }
              } else if (blockIndex < 0) {
                // New block, append it
                mergedContent.push(newBlock);
              }
            }

            const updated = [...prev];
            updated[existingIndex] = {
              ...existing,
              message: { ...output.message, content: mergedContent },
              _attemptId: attemptId,
            };
            return updated;
          }
        }

        // Default: append new message
        // Mark assistant messages as streaming-created so they can be merge targets
        const finalOutput = output.type === 'assistant'
          ? { ...taggedOutput, _fromStreaming: true }
          : taggedOutput;
        return [...prev, finalOutput];
      });
    });

    socketInstance.on('attempt:finished', (data: WsAttemptFinished) => {
      setCurrentAttemptId((currentId) => {
        if (data.attemptId === currentId) {
          setIsRunning(false);
          // Note: removeRunningTask, markTaskCompleted, and onComplete are now handled by task:finished
          // which fires regardless of which task user is viewing
        }
        return currentId;
      });
    });

    socketInstance.on('error', (data: { message: string }) => {
      setIsRunning(false);
      if (currentTaskIdRef.current) removeRunningTask(currentTaskIdRef.current);
    });

    socketInstance.on('question:ask', (data: any) => {
      log.debug({ data }, 'Received question:ask event');
      // Only accept questions for the current attempt — reject if ref is null or mismatched
      if (!currentAttemptIdRef.current || data.attemptId !== currentAttemptIdRef.current) {
        log.debug({ receivedAttemptId: data.attemptId, currentAttemptId: currentAttemptIdRef.current }, 'Ignoring question from different attempt');
        return;
      }
      setActiveQuestion({ attemptId: data.attemptId, toolUseId: data.toolUseId, questions: data.questions });
    });

    // Listen for global question events (for questions panel)
    socketInstance.on('question:new', (data: any) => {
      useQuestionsStore.getState().addQuestion({
        attemptId: data.attemptId,
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        projectId: data.projectId,
        toolUseId: data.toolUseId,
        questions: data.questions,
        timestamp: data.timestamp,
      });
    });

    socketInstance.on('question:resolved', (data: { attemptId: string }) => {
      useQuestionsStore.getState().removeQuestion(data.attemptId);
    });

    // Listen for per-attempt workflow updates (full data including nodes/messages)
    socketInstance.on('status:workflow', (data: { attemptId: string; nodes: unknown[]; messages: unknown[]; summary: { chain: string[]; completedCount: number; activeCount: number; totalCount: number } }) => {
      // Feed workflow store with full node data for the workflow panel
      useWorkflowStore.getState().updateWorkflow(data.attemptId, {
        nodes: data.nodes as any,
        messages: data.messages as any,
        summary: data.summary,
      });
    });

    // Listen for global workflow updates (for workflow panel cross-task tracking)
    socketInstance.on('workflow:update', (data: { attemptId: string; taskId: string; taskTitle: string; summary: { chain: string[]; completedCount: number; activeCount: number; totalCount: number } }) => {
      useWorkflowStore.getState().updateWorkflow(data.attemptId, {
        taskId: data.taskId,
        taskTitle: data.taskTitle,
        summary: data.summary,
      });
      // Clean up entries with no active agents
      if (data.summary.activeCount === 0 && data.summary.totalCount > 0) {
        // Keep for a bit so user can see final state, then remove
        setTimeout(() => {
          const entry = useWorkflowStore.getState().workflows.get(data.attemptId);
          if (entry && entry.summary.activeCount === 0) {
            useWorkflowStore.getState().removeWorkflow(data.attemptId);
          }
        }, 30000);
      }
    });

    // Listen for stderr output (error messages from agent)
    socketInstance.on('output:stderr', (data: { attemptId: string; content: string }) => {
      if (currentAttemptIdRef.current && data.attemptId !== currentAttemptIdRef.current) return;
      setMessages((prev) => [...prev, {
        type: 'system' as any,
        content: data.content,
        isError: true,
        _attemptId: data.attemptId,
        _msgId: Math.random().toString(36),
      }]);
    });

    // Listen for context compacting status
    socketInstance.on('context:compacting', (data: { attemptId: string; taskId: string }) => {
      setMessages((prev) => [...prev, {
        type: 'system' as any,
        content: 'Compacting conversation context...',
        _attemptId: data.attemptId,
        _msgId: Math.random().toString(36),
      }]);
    });

    // Listen for prompt-too-long error
    socketInstance.on('context:prompt-too-long', (data: { attemptId: string; message: string }) => {
      if (currentAttemptIdRef.current && data.attemptId !== currentAttemptIdRef.current) return;
      setMessages((prev) => [...prev, {
        type: 'system' as any,
        content: data.message,
        isError: true,
        _attemptId: data.attemptId,
        _msgId: Math.random().toString(36),
      }]);
    });

    return () => {
      socketInstance.close();
      socketRef.current = null;
    };
  }, []);

  // Clear messages and reset state when taskId changes
  useEffect(() => {
    console.log('[useAttemptStream] taskId changed to:', taskId, '| prev attemptId:', currentAttemptIdRef.current);
    // Unsubscribe from old attempt room to stop receiving its events
    if (currentAttemptIdRef.current && socketRef.current) {
      socketRef.current.emit('attempt:unsubscribe', { attemptId: currentAttemptIdRef.current });
    }
    // Clear previous task's messages
    setMessages([]);
    setCurrentAttemptId(null);
    currentAttemptIdRef.current = null; // CRITICAL: Sync ref to prevent stale filtering
    setCurrentPrompt(null);
    setIsRunning(false);
    setActiveQuestion(null);
    // Don't clear currentTaskIdRef here - we'll update it in checkRunningAttempt
  }, [taskId]);

  // Ensure socket subscription when attempt ID and connection are both available
  // This is a safety net for cases where checkRunningAttempt's subscribe fails
  // (e.g., socket was connecting when checkRunningAttempt ran)
  useEffect(() => {
    if (isConnected && currentAttemptId && socketRef.current) {
      socketRef.current.emit('attempt:subscribe', { attemptId: currentAttemptId });
    }
  }, [isConnected, currentAttemptId]);

  // Fetch pending question from server (authoritative source)
  const fetchPendingQuestion = useCallback(async (attemptId: string, signal?: AbortSignal) => {
    try {
      console.log('[fetchPendingQuestion] Fetching for attempt:', attemptId);
      const res = await fetch(`/api/attempts/${attemptId}/pending-question`, { cache: 'no-store', signal });
      if (!res.ok) {
        console.log('[fetchPendingQuestion] Failed, HTTP', res.status);
        return;
      }
      const data = await res.json();
      console.log('[fetchPendingQuestion] Result:', data.question ? `Found (toolUseId: ${data.question.toolUseId})` : 'No pending question');
      if (data.question) {
        setActiveQuestion(data.question);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('[fetchPendingQuestion] Error:', err);
    }
  }, []);

  // Fetch persistent question for a task (survives CLI auto-handle + attempt completion)
  const fetchPersistentQuestion = useCallback(async (taskId: string, signal?: AbortSignal) => {
    try {
      console.log('[fetchPersistentQuestion] Fetching for task:', taskId);
      const res = await fetch(`/api/tasks/${taskId}/pending-question`, { cache: 'no-store', signal });
      if (!res.ok) return;
      const data = await res.json();
      console.log('[fetchPersistentQuestion] Result:', data.question ? `Found (toolUseId: ${data.question.toolUseId})` : 'No persistent question');
      if (data.question) {
        setActiveQuestion(data.question);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.error('[fetchPersistentQuestion] Error:', err);
    }
  }, []);

  // Re-fetch pending question for current attempt (used by UI to recover stuck questions)
  // If currentAttemptIdRef is null (checkRunningAttempt hasn't completed yet), try to fetch
  // the running attempt first, then fetch the question.
  const refetchQuestion = useCallback(async () => {
    let attemptId = currentAttemptIdRef.current;

    // If we don't have the attempt ID yet, try to get it from the running attempt API
    if (!attemptId && taskId) {
      try {
        const res = await fetch(`/api/tasks/${taskId}/running-attempt`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.attempt?.status === 'running') {
            attemptId = data.attempt.id;
          }
        }
      } catch {
        // Fall through
      }
    }

    if (attemptId) {
      await fetchPendingQuestion(attemptId);
    } else if (taskId) {
      // No running attempt — try persistent question (CLI auto-handled)
      await fetchPersistentQuestion(taskId);
    }
  }, [fetchPendingQuestion, fetchPersistentQuestion, taskId]);

  // Check for running attempt on mount/taskId change
  useEffect(() => {
    if (!taskId) return;
    const abortController = new AbortController();
    const checkRunningAttempt = async () => {
      try {
        console.log('[checkRunningAttempt] Checking for running attempt, taskId:', taskId);
        const res = await fetch(`/api/tasks/${taskId}/running-attempt`, { cache: 'no-store', signal: abortController.signal });
        if (!res.ok) {
          console.log('[checkRunningAttempt] No running attempt (HTTP', res.status, ')');
          return;
        }
        const data = await res.json();
        // Abort guard: if taskId changed while we were fetching, discard stale results
        if (abortController.signal.aborted) return;
        console.log('[checkRunningAttempt] Response:', { attemptId: data.attempt?.id, status: data.attempt?.status, messageCount: data.messages?.length });
        if (data.attempt && data.attempt.status === 'running') {
          currentTaskIdRef.current = taskId;
          currentAttemptIdRef.current = data.attempt.id; // CRITICAL: Sync ref BEFORE state for immediate filtering
          setCurrentAttemptId(data.attempt.id);
          setCurrentPrompt(data.attempt.prompt);
          const loadedMessages = (data.messages || []).map((m: any) => ({
            ...m,
            _attemptId: data.attempt.id,
            _msgId: Math.random().toString(36)
          }));
          setMessages(loadedMessages);
          setIsRunning(true);
          addRunningTask(taskId);

          // Subscribe FIRST so we receive re-emitted question:ask from server
          if (socketRef.current?.connected) {
            socketRef.current.emit('attempt:subscribe', { attemptId: data.attempt.id });
          }

          // Also fetch pending question via HTTP as backup
          console.log('[checkRunningAttempt] Fetching pending question for attempt:', data.attempt.id);
          await fetchPendingQuestion(data.attempt.id, abortController.signal);
        } else {
          // No running attempt — check for persistent question (CLI auto-handled, attempt completed)
          currentTaskIdRef.current = taskId;
          await fetchPersistentQuestion(taskId, abortController.signal);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        // Ensure currentTaskIdRef is updated even on error
        currentTaskIdRef.current = taskId;
      }
    };
    checkRunningAttempt();
    return () => abortController.abort();
  }, [taskId, fetchPendingQuestion]); // Remove isConnected from deps - we handle it inside

  const startAttempt = useCallback((taskId: string, prompt: string, displayPrompt?: string, fileIds?: string[], model?: string) => {
    const socket = socketRef.current;
    if (!socket || !isConnected) return;
    currentTaskIdRef.current = taskId;
    // Don't clear messages here — defer to attempt:started callback
    // This prevents turn 1 response from disappearing before history reloads
    setCurrentPrompt(displayPrompt || prompt);
    setIsRunning(true);
    addRunningTask(taskId);
    socket.once('attempt:started', (data: any) => {
      currentAttemptIdRef.current = data.attemptId; // CRITICAL: Sync ref BEFORE state for immediate filtering
      setCurrentAttemptId(data.attemptId);
      setMessages([]); // Clear streaming messages AFTER new attempt is confirmed
      socket.emit('attempt:subscribe', { attemptId: data.attemptId });
    });
    socket.emit('attempt:start', { taskId, prompt, displayPrompt, fileIds, model });
  }, [isConnected]);

  const answerQuestion = useCallback(async (questions: Question[], answers: Record<string, string>) => {
    const socket = socketRef.current;
    if (!socket || !activeQuestion) return;

    const attemptId = activeQuestion.attemptId;
    const answeredToolUseId = activeQuestion.toolUseId;

    // Mark as running immediately — either the existing attempt resumes (SDK)
    // or a new attempt is created via auto-retry (CLI). Either way, work is happening.
    setIsRunning(true);
    if (currentTaskIdRef.current) addRunningTask(currentTaskIdRef.current);

    // Send SDK format with toolUseId for server-side validation
    // The agent-manager's canUseTool callback will resume streaming
    socket.emit('question:answer', {
      attemptId,
      toolUseId: answeredToolUseId,
      questions,
      answers,
    });

    // Save answer to database for persistence across reloads
    try {
      await fetch(`/api/attempts/${attemptId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, answers })
      });
    } catch (err) {
      log.error({ err }, 'Failed to save answer to database');
    }

    // Add a message showing the user's answer to the conversation
    // This creates a record of what the user chose
    const answerText = Object.entries(answers)
      .map(([question, answer]) => `${question}: **${answer}**`)
      .join('\n');
    setMessages((prev) => [
      ...prev,
      {
        type: 'assistant' as const,
        message: {
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: `✓ **You answered:**\n${answerText}` }]
        },
        _attemptId: attemptId,
        _msgId: Math.random().toString(36)
      }
    ]);

    // Clear only if activeQuestion is still the one we just answered
    // This prevents wiping a NEW question that arrived between answering and clearing
    setActiveQuestion((prev) =>
      prev?.toolUseId === answeredToolUseId ? null : prev
    );
  }, [activeQuestion]);

  const cancelQuestion = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !activeQuestion) return;
    // Send empty answers to signal cancellation
    socket.emit('question:cancel', { attemptId: activeQuestion.attemptId });
    setActiveQuestion(null);
  }, [activeQuestion]);

  const cancelAttempt = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !currentAttemptId) return;
    socket.emit('attempt:cancel', { attemptId: currentAttemptId });
    setIsRunning(false);
    setActiveQuestion(null);
    if (currentTaskIdRef.current) removeRunningTask(currentTaskIdRef.current);
  }, [currentAttemptId]);

  // Interrupt current streaming and send a new message
  // Cancels the active attempt, waits for completion, then starts a new attempt
  // The new attempt auto-resumes the conversation session via sessionManager
  const interruptAndSend = useCallback(async (
    taskId: string, prompt: string, displayPrompt?: string,
    fileIds?: string[], model?: string
  ) => {
    const socket = socketRef.current;
    if (!socket || !isConnected) return;

    const attemptToCancel = currentAttemptIdRef.current;

    // If currently running, cancel first and wait for completion
    if (attemptToCancel) {
      // Attach handler BEFORE emitting cancel to avoid race condition
      await new Promise<void>((resolve) => {
        const handler = (data: { attemptId: string }) => {
          if (data.attemptId === attemptToCancel) {
            clearTimeout(timeout);
            socket.off('attempt:finished', handler);
            resolve();
          }
        };
        const timeout = setTimeout(() => {
          socket.off('attempt:finished', handler); // Clean up handler on timeout
          resolve();
        }, 3000);
        socket.on('attempt:finished', handler);
        socket.emit('attempt:cancel', { attemptId: attemptToCancel });
      });
    }

    // Reset state before starting new attempt
    setIsRunning(false);
    setActiveQuestion(null);
    if (currentTaskIdRef.current) removeRunningTask(currentTaskIdRef.current);

    // Start new attempt (will auto-resume session via sessionManager)
    startAttempt(taskId, prompt, displayPrompt, fileIds, model);
  }, [isConnected, startAttempt]);

  return { messages, isConnected, startAttempt, cancelAttempt, interruptAndSend, currentAttemptId, currentPrompt, isRunning, activeQuestion, answerQuestion, cancelQuestion, refetchQuestion };
}
