/**
 * Command by name route - get command content and process command prompt with argument substitution
 */
import { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';

function parseCommand(content: string) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!frontmatterMatch) return { body: content };
  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();
  const result: any = { body };
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  if (descMatch) result.description = descMatch[1].trim();
  const argMatch = frontmatter.match(/argument-hint:\s*(.+)/);
  if (argMatch) result.argumentHint = argMatch[1].trim();
  return result;
}

export default async function commandByNameRoute(fastify: FastifyInstance) {
  fastify.get('/api/commands/:name', async (request, reply) => {
    try {
      const { name } = request.params as any;
      const { subcommand } = request.query as any;
      const safeName = basename(name);
      const commandsDir = join(homedir(), '.claude', 'commands');
      const filePath = subcommand
        ? join(commandsDir, safeName, `${basename(subcommand)}.md`)
        : join(commandsDir, `${safeName}.md`);
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(resolve(commandsDir))) return reply.code(403).send({ error: 'Invalid command path' });
      if (!existsSync(filePath)) return reply.code(404).send({ error: 'Command not found' });
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseCommand(content);
      return { name: subcommand ? `${name}:${subcommand}` : name, ...parsed };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get command');
      return reply.code(500).send({ error: 'Failed to get command' });
    }
  });

  fastify.post('/api/commands/:name', async (request, reply) => {
    try {
      const { name } = request.params as any;
      const { arguments: args, subcommand } = request.body as any;
      const safeName = basename(name);
      const commandsDir = join(homedir(), '.claude', 'commands');
      const filePath = subcommand
        ? join(commandsDir, safeName, `${basename(subcommand)}.md`)
        : join(commandsDir, `${safeName}.md`);
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(resolve(commandsDir))) return reply.code(403).send({ error: 'Invalid command path' });
      if (!existsSync(filePath)) return reply.code(404).send({ error: 'Command not found' });
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseCommand(content);
      let processedPrompt = parsed.body;
      processedPrompt = args
        ? processedPrompt.replace(/\$ARGUMENTS/g, args)
        : processedPrompt.replace(/\$ARGUMENTS/g, '');
      return { name: subcommand ? `${name}:${subcommand}` : name, prompt: processedPrompt.trim() };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to process command');
      return reply.code(500).send({ error: 'Failed to process command' });
    }
  });
}
