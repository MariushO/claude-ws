/**
 * GET /api/attempts/:id — fetch attempt with logs, optionally return formatted output file
 * POST /api/attempts/:id — reactivate a stopped attempt (set status back to running)
 */
import path from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { FastifyInstance } from 'fastify';
import { formatOutput } from '../../../lib/output-formatter';
import { getContentTypeForFormat } from '../../../lib/content-type-map';

export default async function attemptById(fastify: FastifyInstance) {
  fastify.get('/api/attempts/:id', async (request, reply) => {
    const { id } = request.params as any;
    const url = new URL(request.url, `http://${request.hostname}`);

    const attempt = await fastify.services.attempt.getById(id);
    if (!attempt) return reply.code(404).send({ error: 'Attempt not found' });

    // If ?output_format is present and attempt has a stored format, return the generated file
    const wantsFormatted = url.searchParams.has('output_format');
    const storedFormat = attempt.outputFormat;

    if (wantsFormatted && storedFormat) {
      const filePath = path.join(fastify.envConfig.dataDir, 'tmp', `${id}.${storedFormat}`);

      if (existsSync(filePath)) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const contentType = getContentTypeForFormat(storedFormat);
          reply.header('Content-Type', contentType);
          return reply.code(200).send(content);
        } catch {
          return reply.code(500).send({ error: 'Failed to read output file' });
        }
      }

      return reply.code(404).send({ error: 'Output file not found', filePath });
    }

    // Default: return JSON with logs
    if (!storedFormat || storedFormat === 'json') {
      return attempt; // already includes logs from getById
    }

    // Format according to stored outputFormat
    const messages = (attempt.logs || [])
      .filter((log: any) => log.type === 'json')
      .map((log: any) => { try { return JSON.parse(log.content); } catch { return null; } })
      .filter(Boolean);

    const formatted = formatOutput(messages, storedFormat, attempt.outputSchema, {
      id: attempt.id,
      taskId: attempt.taskId,
      prompt: attempt.prompt,
      status: attempt.status,
      createdAt: attempt.createdAt,
      completedAt: attempt.completedAt,
    });

    return formatted;
  });

  fastify.post('/api/attempts/:id', async (request, reply) => {
    const { id } = request.params as any;
    const attempt = await fastify.services.attempt.getById(id);
    if (!attempt) return reply.code(404).send({ error: 'Attempt not found' });

    // Already running — return success with flag
    if (attempt.status === 'running') {
      return {
        success: true,
        alreadyRunning: true,
        attempt: { id: attempt.id, status: attempt.status },
      };
    }

    // Reactivate: set status back to running, clear completedAt
    await fastify.services.attempt.updateStatus(id, 'running', { completedAt: undefined });

    return {
      success: true,
      attempt: { id: attempt.id, status: 'running' },
    };
  });
}
