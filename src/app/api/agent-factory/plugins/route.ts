import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { createAgentFactoryService } from '@agentic-sdk/services/agent-factory/agent-factory-plugin-registry';
import { createLogger } from '@/lib/logger';

const log = createLogger('AFPlugins');
const agentFactoryService = createAgentFactoryService(db);

// GET /api/agent-factory/plugins - List plugins, filtering out imported ones with missing source
export async function GET(request: NextRequest) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? undefined;

    const validType = type && ['skill', 'command', 'agent', 'agent_set'].includes(type) ? type : undefined;
    const plugins = await agentFactoryService.listPluginsWithExistenceFilter({ type: validType });

    return NextResponse.json({ plugins });
  } catch (error) {
    log.error({ error }, 'Error fetching plugins');
    return NextResponse.json({ error: 'Failed to fetch plugins' }, { status: 500 });
  }
}

// POST /api/agent-factory/plugins - Create plugin with file on disk
export async function POST(request: NextRequest) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const body = await request.json();
    const { type, name, description, storageType, metadata } = body;

    if (!type || !name) {
      return NextResponse.json({ error: 'Missing required fields: type, name' }, { status: 400 });
    }

    const result = await agentFactoryService.createPluginWithFile({ type, name, description, storageType, metadata });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }

    return NextResponse.json({ plugin: result.plugin }, { status: 201 });
  } catch (error) {
    log.error({ error }, 'Error creating plugin');
    return NextResponse.json({ error: 'Failed to create plugin' }, { status: 500 });
  }
}
