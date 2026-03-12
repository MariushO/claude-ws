import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { createAgentFactoryService, PluginAlreadyAssignedError } from '@agentic-sdk/services/agent-factory/agent-factory-plugin-registry';
import { createLogger } from '@/lib/logger';

const log = createLogger('AFProjectComponents');
const agentFactoryService = createAgentFactoryService(db);

// GET /api/agent-factory/projects/:projectId/components - Get plugins for project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!verifyApiKey(request)) {
      return unauthorizedResponse();
    }

    const { projectId } = await params;
    const assignedPlugins = await agentFactoryService.listProjectPlugins(projectId);

    return NextResponse.json({ components: assignedPlugins });
  } catch (error) {
    log.error({ error }, 'Error fetching project plugins');
    return NextResponse.json({ error: 'Failed to fetch project plugins' }, { status: 500 });
  }
}

// POST /api/agent-factory/projects/:projectId/components - Assign plugin to project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!verifyApiKey(request)) {
      return unauthorizedResponse();
    }

    const { projectId } = await params;
    const body = await request.json();
    const { componentId } = body;

    if (!componentId) {
      return NextResponse.json({ error: 'Missing componentId' }, { status: 400 });
    }

    const plugin = await agentFactoryService.getPlugin(componentId);
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }

    const assignment = await agentFactoryService.associatePlugin(projectId, componentId);
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof PluginAlreadyAssignedError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    log.error({ error }, 'Error assigning plugin');
    return NextResponse.json({ error: 'Failed to assign plugin' }, { status: 500 });
  }
}

// DELETE /api/agent-factory/projects/:projectId/components - Remove assignment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!verifyApiKey(request)) {
      return unauthorizedResponse();
    }

    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const componentId = searchParams.get('componentId');

    if (!componentId) {
      return NextResponse.json({ error: 'Missing componentId parameter' }, { status: 400 });
    }

    await agentFactoryService.disassociatePlugin(projectId, componentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Error removing plugin assignment');
    return NextResponse.json({ error: 'Failed to remove plugin' }, { status: 500 });
  }
}
