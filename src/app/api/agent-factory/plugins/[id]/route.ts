import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { createAgentFactoryService } from '@agentic-sdk/services/agent-factory/agent-factory-plugin-registry';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentFactoryPluginsAPI');
const agentFactoryService = createAgentFactoryService(db);

// GET /api/agent-factory/plugins/:id - Get single plugin
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const { id } = await params;
    const plugin = await agentFactoryService.getPlugin(id);

    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }

    return NextResponse.json({ plugin });
  } catch (error) {
    log.error({ err: error }, 'Error fetching plugin');
    return NextResponse.json({ error: 'Failed to fetch plugin' }, { status: 500 });
  }
}

// PUT /api/agent-factory/plugins/:id - Update plugin
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const { id } = await params;
    const body = await request.json();
    const { name, description, sourcePath, metadata } = body;

    const existing = await agentFactoryService.getPlugin(id);
    if (!existing) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (sourcePath !== undefined) updateData.sourcePath = sourcePath;
    if (metadata !== undefined) updateData.metadata = metadata ? JSON.stringify(metadata) : null;

    const updated = await agentFactoryService.updatePlugin(id, updateData);

    return NextResponse.json({ plugin: updated });
  } catch (error) {
    log.error({ err: error }, 'Error updating plugin');
    return NextResponse.json({ error: 'Failed to update plugin' }, { status: 500 });
  }
}

// DELETE /api/agent-factory/plugins/:id - Delete plugin and its files from disk
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const { id } = await params;
    const existing = await agentFactoryService.getPlugin(id);

    if (!existing) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }

    await agentFactoryService.deletePluginWithFiles(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, 'Error deleting plugin');
    return NextResponse.json({ error: 'Failed to delete plugin' }, { status: 500 });
  }
}
