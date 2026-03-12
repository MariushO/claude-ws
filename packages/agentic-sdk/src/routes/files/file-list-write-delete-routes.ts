/**
 * Files collection routes - GET /api/files (directory tree with git status),
 * POST /api/files (write), DELETE /api/files (delete)
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '.turbo'];
const EXCLUDED_FILES = ['.DS_Store', 'Thumbs.db'];

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileEntry[];
  gitStatus?: string;
}

interface GitStatusResult {
  fileStatus: Map<string, string>;
  untrackedDirs: string[];
}

async function getGitStatusMap(cwd: string): Promise<GitStatusResult> {
  const fileStatus = new Map<string, string>();
  const untrackedDirs: string[] = [];

  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd, timeout: 5000 });
    for (const line of stdout.trim().split('\n')) {
      if (!line || line.length < 3) continue;
      const indexStatus = line[0];
      const worktreeStatus = line[1];
      let filePath = line.slice(3).trim();

      if (filePath.includes(' -> ')) filePath = filePath.split(' -> ')[1];

      if (indexStatus === '?' && worktreeStatus === '?') {
        if (filePath.endsWith('/')) {
          untrackedDirs.push(filePath.slice(0, -1));
        } else {
          fileStatus.set(filePath, 'U');
        }
        continue;
      }

      const status = indexStatus !== ' ' ? indexStatus : worktreeStatus;
      if (status === 'M' || status === 'A' || status === 'D' || status === 'R') {
        fileStatus.set(filePath, status);
      } else if (status === 'U') {
        fileStatus.set(filePath, 'U');
      } else {
        fileStatus.set(filePath, 'M');
      }
    }
  } catch { /* not a git repo */ }

  return { fileStatus, untrackedDirs };
}

function buildFileTree(
  dirPath: string,
  basePath: string,
  maxDepth: number,
  showHidden: boolean,
  gitStatus: GitStatusResult,
  currentDepth: number = 0
): FileEntry[] {
  if (currentDepth >= maxDepth) return [];

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      if (!showHidden && entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && EXCLUDED_DIRS.includes(entry.name)) continue;
      if (entry.isFile() && EXCLUDED_FILES.includes(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        const children = buildFileTree(fullPath, basePath, maxDepth, showHidden, gitStatus, currentDepth + 1);
        result.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          children: children.length > 0 ? children : undefined,
        });
      } else {
        let fileGitStatus = gitStatus.fileStatus.get(relativePath);
        if (!fileGitStatus) {
          const isInUntrackedDir = gitStatus.untrackedDirs.some(dir => relativePath.startsWith(dir + '/'));
          if (isInUntrackedDir) fileGitStatus = 'U';
        }
        result.push({
          name: entry.name,
          path: relativePath,
          type: 'file',
          gitStatus: fileGitStatus,
        });
      }
    }

    return result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export default async function filesCollectionRoutes(fastify: FastifyInstance) {
  // GET /api/files - directory tree with git status
  fastify.get('/api/files', async (request, reply) => {
    try {
      const query = request.query as any;
      const basePath = query.path;
      const depth = parseInt(query.depth || '10', 10);
      const showHidden = query.showHidden !== 'false';

      if (!basePath) return reply.code(400).send({ error: 'path parameter is required' });

      const resolvedPath = path.resolve(basePath);
      if (!fs.existsSync(resolvedPath)) return reply.code(404).send({ error: 'Path does not exist' });

      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) return reply.code(400).send({ error: 'Path is not a directory' });

      const gitStatus = await getGitStatusMap(resolvedPath);
      const entries = buildFileTree(resolvedPath, resolvedPath, depth, showHidden, gitStatus);

      reply.header('Cache-Control', 'no-store, max-age=0');
      return { entries, basePath: resolvedPath };
    } catch (error: any) {
      request.log.error({ err: error }, 'Error reading directory');
      return reply.code(500).send({ error: 'Failed to read directory' });
    }
  });

  // POST /api/files - write file content (SDK-specific endpoint, kept for backward compat)
  fastify.post('/api/files', async (request, reply) => {
    const { projectPath, filePath, content } = request.body as any;
    if (!projectPath || !filePath || content === undefined) {
      return reply.code(400).send({ error: 'projectPath, filePath, and content are required' });
    }
    await fastify.services.file.writeFile(projectPath, filePath, content);
    return reply.code(201).send({ success: true });
  });

  // DELETE /api/files - delete file (SDK-specific endpoint, kept for backward compat)
  fastify.delete('/api/files', async (request, reply) => {
    const { projectPath, filePath } = request.query as any;
    if (!projectPath || !filePath) {
      return reply.code(400).send({ error: 'projectPath and filePath are required' });
    }
    try {
      await fastify.services.file.deleteFile(projectPath, filePath);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }
  });
}
