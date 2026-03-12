/**
 * GET /api/attempts/:id — fetch attempt with logs, optionally return formatted output file
 * POST /api/attempts/:id — reactivate a stopped attempt
 * Thin transport adapter — all logic in attempt service.
 */
import { FastifyInstance } from 'fastify';
import { formatOutput } from '../../../lib/output-formatter';
import { getContentTypeForFormat } from '../../../lib/content-type-map';

export default async function attemptById(fastify: FastifyInstance) {
  fastify.get('/api/attempts/:id', async (request, reply) => {
    const { id } = request.params as any;
    const url = new URL(request.url, `http://${request.hostname}`);

    const attempt = await fastify.services.attempt.getById(id);
    if (!attempt) return reply.code(404).send({ error: 'Attempt not found' });

    const wantsFormatted = url.searchParams.has('output_format');
    const storedFormat = attempt.outputFormat;

    if (wantsFormatted && storedFormat) {
      const result = await fastify.services.attempt.readOutputFile(id, storedFormat);
      if (result.found) {
        const contentType = getContentTypeForFormat(storedFormat);
        reply.header('Content-Type', contentType);
        return reply.code(200).send(result.content);
      }
      return reply.code(404).send({ error: 'Output file not found' });
    }

    if (!storedFormat || storedFormat === 'json') {
      return attempt;
    }

    const messages = fastify.services.attempt.parseLogsToMessages(attempt.logs || []);
    const formatted = formatOutput(messages, storedFormat, attempt.outputSchema, {
      id: attempt.id, taskId: attempt.taskId, prompt: attempt.prompt,
      status: attempt.status, createdAt: attempt.createdAt, completedAt: attempt.completedAt,
    });
    return formatted;
  });

  fastify.post('/api/attempts/:id', async (request, reply) => {
    const { id } = request.params as any;
    const attempt = await fastify.services.attempt.getById(id);
    if (!attempt) return reply.code(404).send({ error: 'Attempt not found' });

    if (attempt.status === 'running') {
      return { success: true, alreadyRunning: true, attempt: { id: attempt.id, status: attempt.status } };
    }

    await fastify.services.attempt.updateStatus(id, 'running', { completedAt: undefined });
    return { success: true, attempt: { id: attempt.id, status: 'running' } };
  });
}
