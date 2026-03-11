import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { verifyApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { existsSync } from 'fs';
import { join } from 'path';
import { dependencyExtractor } from '@agentic-sdk/services/agent-factory/dependency-extractor';
import { createDependencyCacheService } from '@agentic-sdk/services/agent-factory/dependency-cache';
import { installScriptGenerator } from '@agentic-sdk/services/agent-factory/install-script-generator';
import { claudeDependencyAnalyzer } from '@agentic-sdk/services/agent-factory/claude-dependency-analyzer';
import { readdirSync } from 'fs';
import { createAgentFactoryService } from '@agentic-sdk/services/agent-factory/plugin-registry';
import { createLogger } from '@/lib/logger';

interface DependencyTreeNode { type: string; name: string; depth: number; }

const log = createLogger('AFPluginDeps');
const agentFactoryService = createAgentFactoryService(db);
const dependencyCache = createDependencyCacheService(db, schema);

function getPluginBasePath(plugin: any): string | null {
  return plugin.type === 'agent_set' ? plugin.agentSetPath : plugin.sourcePath;
}

async function extractAgentSetDependencies(agentSetPath: string) {
  const libraries: any[] = [];
  const plugins: any[] = [];
  for (const subdir of ['skills', 'commands', 'agents']) {
    const subdirPath = join(agentSetPath, subdir);
    if (!existsSync(subdirPath)) continue;
    for (const entry of readdirSync(subdirPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = join(subdirPath, entry.name);
      const type: 'skill' | 'command' | 'agent' = entry.isDirectory() ? 'skill' : (subdir === 'commands' ? 'command' : 'agent');
      const sourcePath = entry.isDirectory() ? join(entryPath, 'SKILL.md') : entryPath;
      if (existsSync(sourcePath)) {
        try {
          const extracted = await dependencyExtractor.extract(sourcePath, type);
          libraries.push(...extracted.libraries);
          plugins.push(...extracted.plugins);
        } catch { /* skip */ }
      }
    }
  }
  return { libraries, plugins };
}

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

    const pluginBasePath = getPluginBasePath(plugin);
    if (!pluginBasePath || !existsSync(pluginBasePath)) {
      return NextResponse.json({ error: 'Plugin source not found' }, { status: 404 });
    }

    const forceReResolve = request.nextUrl.searchParams.get('force') === 'true';
    if (!forceReResolve) {
      const cached = await dependencyCache.getByPluginId(id);
      if (cached) {
        return NextResponse.json({
          libraries: cached.libraryDeps,
          plugins: cached.pluginDeps,
          installScripts: {
            npm: cached.installScriptNpm, pnpm: cached.installScriptPnpm,
            yarn: cached.installScriptYarn, pip: cached.installScriptPip,
            poetry: cached.installScriptPoetry, cargo: cached.installScriptCargo,
            go: cached.installScriptGo, dockerfile: cached.dockerfile,
          },
          dependencyTree: cached.pluginDeps.map((c: any) => ({ type: c.type, name: c.name, depth: 1 })),
          depth: cached.depth, hasCycles: cached.hasCycles,
          totalPlugins: cached.pluginDeps?.length || 0, resolvedAt: cached.resolvedAt,
        });
      }
    }

    const extracted = plugin.type === 'agent_set'
      ? await extractAgentSetDependencies(pluginBasePath)
      : await dependencyExtractor.extract(pluginBasePath, plugin.type);

    const installScripts = installScriptGenerator.generateAll(extracted.libraries);
    const dependencyTree: DependencyTreeNode[] = extracted.plugins.map(c => ({ type: c.type, name: c.name, depth: 1 }));

    await dependencyCache.set({
      pluginId: id, sourcePath: pluginBasePath, type: plugin.type,
      libraryDeps: extracted.libraries, pluginDeps: extracted.plugins,
      installScriptNpm: installScripts.npm, installScriptPnpm: installScripts.pnpm,
      installScriptYarn: installScripts.yarn, installScriptPip: installScripts.pip,
      installScriptPoetry: installScripts.poetry, installScriptCargo: installScripts.cargo,
      installScriptGo: installScripts.go, dockerfile: installScripts.dockerfile,
      depth: 1, hasCycles: false, resolvedAt: Date.now(),
    });

    return NextResponse.json({
      libraries: extracted.libraries, plugins: extracted.plugins, installScripts,
      dependencyTree, depth: 1, hasCycles: false,
      totalPlugins: extracted.plugins.length, resolvedAt: Date.now(),
    });
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

    await dependencyCache.invalidateByPluginId(id);

    const plugin = await agentFactoryService.getPlugin(id);
    if (!plugin) return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });

    const pluginBasePath = getPluginBasePath(plugin);
    if (!pluginBasePath || !existsSync(pluginBasePath)) {
      return NextResponse.json({ error: 'Plugin source not found' }, { status: 404 });
    }

    let extracted;
    if (plugin.type === 'agent_set') {
      extracted = await extractAgentSetDependencies(pluginBasePath);
    } else if (useClaude) {
      const analyzed = await claudeDependencyAnalyzer.analyze(pluginBasePath, plugin.type);
      extracted = { libraries: analyzed.libraries, plugins: analyzed.plugins };
    } else {
      extracted = await dependencyExtractor.extract(pluginBasePath, plugin.type);
    }

    const installScripts = installScriptGenerator.generateAll(extracted.libraries);
    const dependencyTree: DependencyTreeNode[] = extracted.plugins.map(c => ({ type: c.type, name: c.name, depth: 1 }));

    await dependencyCache.set({
      pluginId: id, sourcePath: pluginBasePath, type: plugin.type,
      libraryDeps: extracted.libraries, pluginDeps: extracted.plugins,
      installScriptNpm: installScripts.npm, installScriptPnpm: installScripts.pnpm,
      installScriptYarn: installScripts.yarn, installScriptPip: installScripts.pip,
      installScriptPoetry: installScripts.poetry, installScriptCargo: installScripts.cargo,
      installScriptGo: installScripts.go, dockerfile: installScripts.dockerfile,
      depth: 1, hasCycles: false, resolvedAt: Date.now(),
    });

    return NextResponse.json({
      libraries: extracted.libraries, plugins: extracted.plugins, installScripts,
      dependencyTree, depth: 1, hasCycles: false,
      totalPlugins: extracted.plugins.length, resolvedAt: Date.now(),
      message: useClaude ? 'Dependencies analyzed with Claude SDK successfully' : 'Dependencies re-resolved successfully',
      analysisMethod: useClaude ? 'claude-sdk' : 'regex',
    });
  } catch (error) {
    log.error({ error }, 'Error re-resolving dependencies');
    return NextResponse.json({ error: 'Failed to re-resolve dependencies' }, { status: 500 });
  }
}
