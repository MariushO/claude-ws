import { NextRequest, NextResponse } from 'next/server';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { getAgentFactoryDir, getGlobalClaudeDir } from '@/lib/agent-factory-dir';
import { uploadSessions, cleanupDirectory } from '@/lib/upload-sessions';
import { db } from '@/lib/db';
import { createAgentFactoryService } from '@agentic-sdk/services/agent-factory/plugin-registry';
import { extractArchive } from '@agentic-sdk/services/agent-factory/archive-extraction';
import {
  analyzeForPreview,
  analyzeAndOrganize,
  importFromSession,
} from '@agentic-sdk/services/agent-factory/upload-analysis-and-import';

const agentFactoryService = createAgentFactoryService(db);

// POST /api/agent-factory/upload - Upload and extract component archive
export async function POST(request: NextRequest) {
  try {
    if (!verifyApiKey(request)) {
      return unauthorizedResponse();
    }

    const contentType = request.headers.get('content-type') || '';

    // Handle JSON request (confirm mode with sessionId)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { sessionId, confirm, globalImport } = body;

      if (confirm && sessionId) {
        const session = uploadSessions.get(sessionId);
        if (!session) {
          return NextResponse.json({ error: 'Session expired or not found. Please upload again.' }, { status: 400 });
        }

        const targetDir = globalImport ? getGlobalClaudeDir() : getAgentFactoryDir();

        await mkdir(join(targetDir, 'skills'), { recursive: true });
        await mkdir(join(targetDir, 'commands'), { recursive: true });
        await mkdir(join(targetDir, 'agents'), { recursive: true });

        const items = await importFromSession(session, targetDir, globalImport, agentFactoryService, cleanupDirectory);

        await cleanupDirectory(session.extractDir);
        uploadSessions.delete(sessionId);

        const locationMsg = globalImport ? ' globally to ~/.claude' : '';
        return NextResponse.json({
          success: true,
          message: `File uploaded successfully${locationMsg}. Organized ${items.length} component(s).`,
          items,
          globalImport
        });
      }

      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Handle FormData request (file upload)
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const dryRun = formData.get('dryRun') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const validExtensions = ['.zip', '.tar', '.gz', '.gzip', '.tgz'];
    if (!validExtensions.some(ext => fileName.endsWith(ext))) {
      return NextResponse.json({
        error: 'Invalid file type. Only .zip, .tar, .gz, .gzip, or .tgz files are allowed.'
      }, { status: 400 });
    }

    const agentFactoryDir = getAgentFactoryDir();
    await mkdir(join(agentFactoryDir, 'skills'), { recursive: true });
    await mkdir(join(agentFactoryDir, 'commands'), { recursive: true });
    await mkdir(join(agentFactoryDir, 'agents'), { recursive: true });

    const tempDir = join(process.env.TMPDIR || '/tmp', 'agent-factory-upload');
    if (!existsSync(tempDir)) {
      await mkdir(tempDir, { recursive: true });
    }

    const tempFilePath = join(tempDir, `${Date.now()}-${file.name}`);
    const extractDir = join(tempDir, `extract-${Date.now()}`);
    const buffer = Buffer.from(await file.arrayBuffer());

    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (buffer.length > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 400 });
    }

    await writeFile(tempFilePath, buffer);
    await mkdir(extractDir, { recursive: true });
    await extractArchive(tempFilePath, extractDir, file.name);
    await unlink(tempFilePath);

    if (dryRun) {
      const previewItems = await analyzeForPreview(extractDir, agentFactoryDir);
      const newSessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
      uploadSessions.set(newSessionId, { extractDir, items: previewItems, createdAt: Date.now() });

      return NextResponse.json({ success: true, sessionId: newSessionId, items: previewItems });
    }

    const items = await analyzeAndOrganize(extractDir, agentFactoryDir);
    await cleanupDirectory(extractDir);

    return NextResponse.json({
      success: true,
      message: `File uploaded successfully. Organized ${items.length} component(s).`,
      items
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to upload file'
    }, { status: 500 });
  }
}
