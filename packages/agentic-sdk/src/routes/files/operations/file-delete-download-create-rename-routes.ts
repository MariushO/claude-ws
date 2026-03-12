/**
 * File operations routes - DELETE (delete), POST (download), PATCH (create), PUT (rename)
 * All operations validate that paths stay within the user's home directory.
 */
import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { rm, rename, mkdir, writeFile, access } from 'fs/promises';

function validateRootPath(rootPath: string): string {
  const resolved = path.resolve(rootPath);
  const home = os.homedir();
  if (!resolved.startsWith(home + path.sep) && resolved !== home) {
    throw new Error('Root path outside home directory');
  }
  return resolved;
}

function validatePath(targetPath: string, rootPath: string): string {
  const resolved = path.resolve(rootPath, targetPath);
  const normalizedRoot = path.resolve(rootPath);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export default async function fileOperationsRoutes(fastify: FastifyInstance) {
  // DELETE /api/files/operations - delete a file or folder
  fastify.delete('/api/files/operations', async (request, reply) => {
    const { path: targetPath, rootPath } = request.body as any;
    if (!targetPath || !rootPath) {
      return reply.code(400).send({ error: 'path and rootPath are required' });
    }
    try {
      const safeRoot = validateRootPath(rootPath);
      const safePath = validatePath(targetPath, safeRoot);
      try {
        await access(safePath);
      } catch {
        return reply.code(404).send({ error: 'Path not found' });
      }
      await rm(safePath, { recursive: true, force: true });
      return { success: true };
    } catch (err: any) {
      if (err.message === 'Root path outside home directory' || err.message === 'Path traversal detected') {
        return reply.code(403).send({ error: err.message });
      }
      if (err.code === 'EACCES') {
        return reply.code(403).send({ error: 'Permission denied' });
      }
      return reply.code(500).send({ error: err.message || 'Failed to delete' });
    }
  });

  // POST /api/files/operations - read/download file content (or folder listing for dirs)
  fastify.post('/api/files/operations', async (request, reply) => {
    const { path: targetPath, rootPath } = request.body as any;
    if (!targetPath || !rootPath) {
      return reply.code(400).send({ error: 'path and rootPath are required' });
    }
    try {
      const safeRoot = validateRootPath(rootPath);
      const safePath = validatePath(targetPath, safeRoot);
      if (!fs.existsSync(safePath)) {
        return reply.code(404).send({ error: 'File not found' });
      }
      const stats = fs.statSync(safePath);
      if (stats.isDirectory()) {
        return reply.code(400).send({ error: 'Cannot download a directory directly; use a zip tool' });
      }
      const content = fs.readFileSync(safePath);
      const filename = path.basename(safePath);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(content);
    } catch (err: any) {
      if (err.message === 'Root path outside home directory' || err.message === 'Path traversal detected') {
        return reply.code(403).send({ error: err.message });
      }
      return reply.code(500).send({ error: err.message || 'Failed to read file' });
    }
  });

  // PATCH /api/files/operations - create a new file or folder
  fastify.patch('/api/files/operations', async (request, reply) => {
    const { parentPath, rootPath, name, type } = request.body as any;
    if (!parentPath || !rootPath || !name || !type) {
      return reply.code(400).send({ error: 'parentPath, rootPath, name, and type are required' });
    }
    if (type !== 'file' && type !== 'folder') {
      return reply.code(400).send({ error: "type must be 'file' or 'folder'" });
    }
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
      return reply.code(400).send({ error: 'Invalid name: must not contain path separators or ..' });
    }
    try {
      const safeRoot = validateRootPath(rootPath);
      const safeParent = validatePath(parentPath, safeRoot);
      // Parent must exist
      try {
        await access(safeParent);
      } catch {
        return reply.code(404).send({ error: 'Parent path not found' });
      }
      // Parent must be a directory
      const parentStats = fs.statSync(safeParent);
      if (!parentStats.isDirectory()) {
        return reply.code(400).send({ error: 'Parent path is not a directory' });
      }
      const newPath = path.join(safeParent, name);
      // New path must not already exist
      if (fs.existsSync(newPath)) {
        return reply.code(409).send({ error: 'Path already exists' });
      }
      if (type === 'folder') {
        await mkdir(newPath, { recursive: true });
      } else {
        await writeFile(newPath, '', 'utf-8');
      }
      return { success: true, path: newPath };
    } catch (err: any) {
      if (err.message === 'Root path outside home directory' || err.message === 'Path traversal detected') {
        return reply.code(403).send({ error: err.message });
      }
      return reply.code(500).send({ error: err.message || 'Failed to create' });
    }
  });

  // PUT /api/files/operations - rename a file or folder
  fastify.put('/api/files/operations', async (request, reply) => {
    const { path: targetPath, rootPath, newName } = request.body as any;
    if (!targetPath || !rootPath || !newName) {
      return reply.code(400).send({ error: 'path, rootPath, and newName are required' });
    }
    if (newName.includes('/') || newName.includes('\\') || newName.includes('..')) {
      return reply.code(400).send({ error: 'Invalid newName: must not contain path separators or ..' });
    }
    try {
      const safeRoot = validateRootPath(rootPath);
      const safePath = validatePath(targetPath, safeRoot);
      // Source must exist
      try {
        await access(safePath);
      } catch {
        return reply.code(404).send({ error: 'Path not found' });
      }
      const newPath = path.join(path.dirname(safePath), newName);
      validatePath(path.relative(safeRoot, newPath), safeRoot);
      // Destination must not already exist
      if (fs.existsSync(newPath)) {
        return reply.code(409).send({ error: 'Destination path already exists' });
      }
      await rename(safePath, newPath);
      return { success: true, newPath };
    } catch (err: any) {
      if (err.message === 'Root path outside home directory' || err.message === 'Path traversal detected') {
        return reply.code(403).send({ error: err.message });
      }
      return reply.code(500).send({ error: err.message || 'Failed to rename' });
    }
  });
}
