import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { createAgentFactoryService } from '@agentic-sdk/services/agent-factory/agent-factory-plugin-registry';
import { createPluginDependencyResolver } from '@agentic-sdk/services/agent-factory/plugin-dependency-resolver';
import { createLogger } from '@/lib/logger';

const log = createLogger('AFPluginDeps');
const agentFactoryService = createAgentFactoryService(db);
const dependencyResolver = createPluginDependencyResolver(db);

// GET /api/agent-factory/plugins/:id/dependencies - Get plugin dependencies (with cache)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const { id } = await params;
    const plugin = await agentFactoryService.getPlugin(id);
    if (!plugin) return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });

    const forceReResolve = request.nextUrl.searchParams.get('force') === 'true';
    const result = await dependencyResolver.get(plugin, { forceReResolve });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error({ error }, 'Error extracting dependencies');
    return NextResponse.json({ error: 'Failed to extract dependencies' }, { status: 500 });
  }
}

// POST /api/agent-factory/plugins/:id/dependencies - Re-resolve dependencies (invalidate cache)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyApiKey(request)) return unauthorizedResponse();

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const useClaude = body.useClaude === true;

    const plugin = await agentFactoryService.getPlugin(id);
    if (!plugin) return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });

    const result = await dependencyResolver.reResolve(plugin, { useClaude });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode });
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error({ error }, 'Error re-resolving dependencies');
    return NextResponse.json({ error: 'Failed to re-resolve dependencies' }, { status: 500 });
  }
}
