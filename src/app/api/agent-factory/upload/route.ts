import { NextRequest, NextResponse } from 'next/server';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { getAgentFactoryDir, getGlobalClaudeDir } from '@/lib/agent-factory-dir';
import { uploadSessions, cleanupDirectory } from '@/lib/upload-sessions';
import { db } from '@/lib/db';
import { createAgentFactoryService } from '@agentic-sdk/services/agent-factory/agent-factory-plugin-registry';
import {
  handleArchiveUpload,
  confirmArchiveUpload,
} from '@agentic-sdk/services/agent-factory/upload-archive-orchestration';

const agentFactoryService = createAgentFactoryService(db);

/** Registry adapter bridging SDK upsertPlugin pattern to the agentFactory service */
const registryAdapter = {
  async upsertPlugin(name: string, type: string, data: Record<string, unknown>) {
    const allPlugins = await agentFactoryService.listPlugins({ type });
    const existing = (allPlugins as any[]).find((p: any) => p.name === name);
    if (existing) return agentFactoryService.updatePlugin(existing.id, data);
    return agentFactoryService.createPlugin({ type: type as any, name, ...data } as any);
  },
};

// POST /api/agent-factory/upload - Upload and extract component archive
export async function POST(request: NextRequest) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const contentType = request.headers.get('content-type') || '';

    // Handle JSON request (confirm mode with sessionId)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { sessionId, confirm, globalImport } = body;

      if (!confirm || !sessionId) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }

      const result = await confirmArchiveUpload(
        sessionId,
        globalImport,
        getAgentFactoryDir(),
        getGlobalClaudeDir(),
        uploadSessions,
        registryAdapter,
        cleanupDirectory
      );

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    // Handle FormData request (file upload)
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const dryRun = formData.get('dryRun') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await handleArchiveUpload(
      buffer,
      file.name,
      dryRun,
      getAgentFactoryDir(),
      uploadSessions
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to upload file',
    }, { status: 500 });
  }
}
