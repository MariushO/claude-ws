/**
 * POST /api/attempts/:id/answer — submit answer to a pending agent question
 */
import { FastifyInstance } from 'fastify';

export default async function attemptAnswer(fastify: FastifyInstance) {
  fastify.post('/api/attempts/:id/answer', async (request, reply) => {
    const { id } = request.params as any;
    const { toolUseId, questions, answers } = request.body as any;
    if (!answers) return reply.code(400).send({ error: 'answers is required' });

    // Save answer log
    const answerText = Object.entries(answers).map(([q, a]) => `${q}: **${a}**`).join('\n');
    await fastify.services.attempt.addLog(id, 'json', JSON.stringify({
      type: 'user_answer', questions, answers,
      displayText: `✓ You answered:\n${answerText}`
    }));

    const result = fastify.agentManager.answerQuestion(id, toolUseId, questions || [], answers);
    if (!result) return reply.code(404).send({ error: 'No pending question for this attempt' });
    return { success: true };
  });
}
