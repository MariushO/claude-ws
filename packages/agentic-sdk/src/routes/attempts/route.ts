/**
 * POST /api/attempts — create a new attempt and start the agent
 *
 * Supports:
 * - force_create: auto-create project + task if they don't exist
 * - request_method: 'queue' (default, returns immediately) or 'sync' (waits for completion)
 * - output_format / output_schema: format instructions for agent output
 * - model: optional model override
 * - Session continuation: resumes conversation from last successful attempt
 */
import path from 'path';
import { mkdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { FastifyInstance } from 'fastify';
import { eq, and, desc, asc } from 'drizzle-orm';
import * as schema from '../../db/database-schema';
import { generateId } from '../../lib/nanoid-id-generator';
import { formatOutput } from '../../lib/output-formatter';
import { getContentTypeForFormat } from '../../lib/content-type-map';
import { SessionManager } from '../../lib/session-manager';

/** Sanitize a string for use as a directory name */
function sanitizeDirName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Poll attempt status until completed/failed/cancelled or timeout */
async function waitForCompletion(
  fastify: FastifyInstance,
  attemptId: string,
  timeoutMs: number
): Promise<{ attempt: any; timedOut: boolean }> {
  const start = Date.now();
  const pollInterval = 500;

  while (Date.now() - start < timeoutMs) {
    const status = await fastify.services.attempt.getStatus(attemptId);
    if (status && status.status !== 'running') {
      const attempt = await fastify.services.attempt.getById(attemptId);
      return { attempt, timedOut: false };
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  const attempt = await fastify.services.attempt.getById(attemptId);
  return { attempt, timedOut: true };
}

export default async function attemptRoot(fastify: FastifyInstance) {
  const sessionManager = new SessionManager(fastify.db);

  fastify.post('/api/attempts', async (request, reply) => {
    try {
    const body = request.body as any;
    const {
      taskId,
      prompt,
      force_create,
      projectId,
      projectName,
      taskTitle,
      projectRootPath,
      request_method = 'queue',
      output_format,
      output_schema,
      timeout = 300000,
      model,
    } = body;

    // Validate request_method
    if (request_method && request_method !== 'sync' && request_method !== 'queue') {
      return reply.code(400).send({ error: 'Invalid request_method. Must be "sync" or "queue"' });
    }

    if (output_format && typeof output_format !== 'string') {
      return reply.code(400).send({ error: 'output_format must be a string' });
    }

    if (!taskId || !prompt) {
      return reply.code(400).send({ error: 'taskId and prompt are required' });
    }

    // Prepend schema instructions for custom format
    let finalPrompt = prompt;
    if (output_format === 'custom' && output_schema) {
      finalPrompt = `${output_schema}\n\n${prompt}`;
    }

    // --- Resolve or create project + task ---
    if (!force_create) {
      // Validate task exists
      const task = await fastify.services.task.getById(taskId);
      if (!task) return reply.code(404).send({ error: 'Task not found' });
      return createAndStartAttempt(fastify, sessionManager, task, finalPrompt, request_method, output_format, output_schema, timeout, model, reply);
    }

    // force_create: check if taskId already exists
    const existingTask = await fastify.services.task.getById(taskId);
    if (existingTask) {
      return createAndStartAttempt(fastify, sessionManager, existingTask, finalPrompt, request_method, output_format, output_schema, timeout, model, reply);
    }

    // Task doesn't exist — need projectId
    if (!projectId) return reply.code(400).send({ error: 'projectId required' });

    // Check if project exists, create if not
    let existingProject;
    try {
      existingProject = await fastify.services.project.getById(projectId);
    } catch (dbError) {
      return reply.code(500).send({ error: 'Database error checking project' });
    }

    if (!existingProject) {
      if (!projectName || projectName.trim() === '') {
        return reply.code(400).send({ error: 'projectName required' });
      }

      const sanitizedName = sanitizeDirName(projectName);
      if (!sanitizedName) {
        return reply.code(400).send({ error: 'projectName must contain at least one alphanumeric character' });
      }

      const projectDirName = `${projectId}-${sanitizedName}`;
      const projectPath = projectRootPath
        ? path.join(projectRootPath, projectDirName)
        : path.join(fastify.envConfig.dataDir, 'projects', projectDirName);

      // Create project folder
      try {
        await mkdir(projectPath, { recursive: true });
      } catch (err: any) {
        if (err?.code !== 'EEXIST') {
          return reply.code(500).send({ error: 'Failed to create project folder: ' + err.message });
        }
      }

      // Insert project into DB with the caller-specified ID
      try {
        await fastify.db.insert(schema.projects).values({
          id: projectId,
          name: projectName,
          path: projectPath,
          createdAt: Date.now(),
        });
      } catch {
        return reply.code(500).send({ error: 'Failed to create project' });
      }

      existingProject = { id: projectId, name: projectName, path: projectPath };
    }

    // Validate taskTitle
    if (!taskTitle || taskTitle.trim() === '') {
      return reply.code(400).send({ error: 'taskTitle required' });
    }

    // Create task with the caller-specified ID and proper position
    const tasksInStatus = await fastify.db
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.projectId, projectId), eq(schema.tasks.status, 'todo')))
      .orderBy(desc(schema.tasks.position))
      .limit(1);
    const position = tasksInStatus.length > 0 ? tasksInStatus[0].position + 1 : 0;

    const now = Date.now();
    const newTask = {
      id: taskId,
      projectId,
      title: taskTitle,
      description: null,
      status: 'todo' as const,
      position,
      chatInit: false,
      rewindSessionId: null,
      rewindMessageUuid: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await fastify.db.insert(schema.tasks).values(newTask);
    } catch {
      return reply.code(500).send({ error: 'Failed to create task' });
    }

    return createAndStartAttempt(fastify, sessionManager, newTask, finalPrompt, request_method, output_format, output_schema, timeout, model, reply);

    } catch (error: any) {
      // Handle foreign key constraint (invalid taskId reference)
      if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return reply.code(404).send({ error: 'Task not found' });
      }
      request.log.error({ err: error }, 'Failed to create attempt');
      return reply.code(500).send({ error: 'Failed to create attempt' });
    }
  });
}

/** Core helper — create attempt, wire session, start agent, handle sync/queue */
async function createAndStartAttempt(
  fastify: FastifyInstance,
  sessionManager: SessionManager,
  task: any,
  prompt: string,
  requestMethod: string,
  outputFormat: string | undefined,
  outputSchema: string | undefined,
  timeout: number,
  model: string | undefined,
  reply: any,
) {
  // Resolve project for agent execution
  const project = await fastify.services.project.getById(task.projectId);
  if (!project) return reply.code(404).send({ error: 'Project not found' });

  // Get session options for conversation continuation
  const sessionOptions = await sessionManager.getSessionOptionsWithAutoFix(task.id);

  const attempt = await fastify.services.attempt.create({
    taskId: task.id,
    prompt,
    outputFormat: outputFormat || undefined,
    outputSchema: outputSchema || undefined,
  });

  // Update task status to in_progress if it was todo
  if (task.status === 'todo') {
    await fastify.db
      .update(schema.tasks)
      .set({ status: 'in_progress', updatedAt: Date.now() })
      .where(eq(schema.tasks.id, task.id));
  }

  // Start the agent
  fastify.agentManager.start({
    attemptId: attempt.id,
    projectPath: project.path,
    prompt,
    model: model || undefined,
    sessionOptions: Object.keys(sessionOptions).length > 0 ? sessionOptions : undefined,
    outputFormat: outputFormat || undefined,
    outputSchema: outputSchema || undefined,
  });

  // Queue mode: return immediately
  if (requestMethod === 'queue') {
    return reply.code(201).send(attempt);
  }

  // Sync mode: wait for completion
  const result = await waitForCompletion(fastify, attempt.id, timeout);

  if (result.timedOut) {
    return reply.code(408).send({
      error: `Attempt timed out after ${timeout}ms`,
      attemptId: attempt.id,
      retryUrl: `/api/attempts/${attempt.id}`,
    });
  }

  // If output_format set, try to return the generated file
  if (outputFormat) {
    const filePath = path.join(fastify.envConfig.dataDir, 'tmp', `${attempt.id}.${outputFormat}`);

    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const contentType = getContentTypeForFormat(outputFormat);
        reply.header('Content-Type', contentType);
        return reply.code(200).send(content);
      } catch {
        return reply.code(500).send({ error: 'Failed to read output file' });
      }
    }

    return reply.code(404).send({ error: 'Output file not found', attemptId: attempt.id });
  }

  // No output_format: fetch logs and return formatted JSON
  const logs = await fastify.services.attempt.getLogs(attempt.id);
  const messages = logs
    .filter((log: any) => log.type === 'json')
    .map((log: any) => { try { return JSON.parse(log.content); } catch { return null; } })
    .filter(Boolean);

  const formatted = formatOutput(messages, 'json', outputSchema || null, {
    id: result.attempt.id,
    taskId: result.attempt.taskId,
    prompt: result.attempt.prompt,
    status: result.attempt.status,
    createdAt: result.attempt.createdAt,
    completedAt: result.attempt.completedAt,
  });

  return reply.code(200).send(formatted);
}
