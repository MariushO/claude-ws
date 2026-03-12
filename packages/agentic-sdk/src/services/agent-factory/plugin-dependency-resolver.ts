/**
 * Plugin dependency resolver service — orchestrates dependency extraction, caching,
 * and response formatting for a single plugin.
 * Encapsulates the extract → cache → format pipeline shared between GET and POST
 * on /api/agent-factory/plugins/:id/dependencies.
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { dependencyExtractor } from './dependency-extractor';
import { installScriptGenerator, type GeneratedScripts } from './install-script-generator';
import { claudeDependencyAnalyzer } from './claude-dependency-analyzer';
import { createDependencyCacheService } from './dependency-cache';
import * as schema from '../../db/database-schema';

export interface DependencyTreeNode { type: string; name: string; depth: number; }

export interface ResolvedDependencies {
  libraries: any[];
  plugins: any[];
  installScripts: GeneratedScripts;
  dependencyTree: DependencyTreeNode[];
  depth: number;
  hasCycles: boolean;
  totalPlugins: number;
  resolvedAt: number;
  message?: string;
  analysisMethod?: string;
}

/** Collect dependencies from every component inside an agent_set directory */
async function extractAgentSetDependencies(agentSetPath: string) {
  const libraries: any[] = [];
  const plugins: any[] = [];

  for (const subdir of ['skills', 'commands', 'agents']) {
    const subdirPath = join(agentSetPath, subdir);
    if (!existsSync(subdirPath)) continue;

    for (const entry of readdirSync(subdirPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const entryPath = join(subdirPath, entry.name);
      const type: 'skill' | 'command' | 'agent' = entry.isDirectory()
        ? 'skill'
        : (subdir === 'commands' ? 'command' : 'agent');
      const sourcePath = entry.isDirectory() ? join(entryPath, 'SKILL.md') : entryPath;

      if (existsSync(sourcePath)) {
        try {
          const extracted = await dependencyExtractor.extract(sourcePath, type);
          libraries.push(...extracted.libraries);
          plugins.push(...extracted.plugins);
        } catch { /* skip unreadable entries */ }
      }
    }
  }

  return { libraries, plugins };
}

/** Format extracted deps into the standard API response shape */
function formatResponse(
  extracted: { libraries: any[]; plugins: any[] },
  extra?: { message?: string; analysisMethod?: string }
): ResolvedDependencies {
  const installScripts = installScriptGenerator.generateAll(extracted.libraries);
  const dependencyTree: DependencyTreeNode[] = extracted.plugins.map((c: any) => ({
    type: c.type, name: c.name, depth: 1,
  }));

  return {
    libraries: extracted.libraries,
    plugins: extracted.plugins,
    installScripts,
    dependencyTree,
    depth: 1,
    hasCycles: false,
    totalPlugins: extracted.plugins.length,
    resolvedAt: Date.now(),
    ...extra,
  };
}

/**
 * Factory — creates the dependency resolver service bound to a db instance.
 * Requires db to have the pluginDependencyCache table via the shared schema.
 */
export function createPluginDependencyResolver(db: any) {
  const cache = createDependencyCacheService(db, schema);

  return {
    /**
     * Get plugin dependencies with cache. Pass forceReResolve=true to skip cache.
     * Returns null if plugin or its source path is not found.
     */
    async get(
      plugin: any,
      options: { forceReResolve?: boolean } = {}
    ): Promise<ResolvedDependencies | { error: string; statusCode: number }> {
      const pluginBasePath = plugin.type === 'agent_set' ? plugin.agentSetPath : plugin.sourcePath;

      if (!pluginBasePath || !existsSync(pluginBasePath)) {
        return { error: 'Plugin source not found', statusCode: 404 };
      }

      if (!options.forceReResolve) {
        const cached = await cache.getByPluginId(plugin.id);
        if (cached) {
          return {
            libraries: cached.libraryDeps,
            plugins: cached.pluginDeps,
            installScripts: {
              npm: cached.installScriptNpm, pnpm: cached.installScriptPnpm,
              yarn: cached.installScriptYarn, pip: cached.installScriptPip,
              poetry: cached.installScriptPoetry, cargo: cached.installScriptCargo,
              go: cached.installScriptGo, dockerfile: cached.dockerfile,
            },
            dependencyTree: cached.pluginDeps.map((c: any) => ({ type: c.type, name: c.name, depth: 1 })),
            depth: cached.depth,
            hasCycles: cached.hasCycles,
            totalPlugins: cached.pluginDeps?.length || 0,
            resolvedAt: cached.resolvedAt,
          };
        }
      }

      const extracted = plugin.type === 'agent_set'
        ? await extractAgentSetDependencies(pluginBasePath)
        : await dependencyExtractor.extract(pluginBasePath, plugin.type);

      await this._saveToCache(plugin.id, pluginBasePath, plugin.type, extracted);
      return formatResponse(extracted);
    },

    /**
     * Re-resolve dependencies (invalidates cache first).
     * useClaude=true uses the Claude SDK analyzer instead of regex.
     */
    async reResolve(
      plugin: any,
      options: { useClaude?: boolean } = {}
    ): Promise<ResolvedDependencies | { error: string; statusCode: number }> {
      const pluginBasePath = plugin.type === 'agent_set' ? plugin.agentSetPath : plugin.sourcePath;

      if (!pluginBasePath || !existsSync(pluginBasePath)) {
        return { error: 'Plugin source not found', statusCode: 404 };
      }

      await cache.invalidateByPluginId(plugin.id);

      let extracted;
      if (plugin.type === 'agent_set') {
        extracted = await extractAgentSetDependencies(pluginBasePath);
      } else if (options.useClaude) {
        const analyzed = await claudeDependencyAnalyzer.analyze(pluginBasePath, plugin.type);
        extracted = { libraries: analyzed.libraries, plugins: analyzed.plugins };
      } else {
        extracted = await dependencyExtractor.extract(pluginBasePath, plugin.type);
      }

      await this._saveToCache(plugin.id, pluginBasePath, plugin.type, extracted);

      return formatResponse(extracted, {
        message: options.useClaude
          ? 'Dependencies analyzed with Claude SDK successfully'
          : 'Dependencies re-resolved successfully',
        analysisMethod: options.useClaude ? 'claude-sdk' : 'regex',
      });
    },

    async _saveToCache(pluginId: string, sourcePath: string, type: string, extracted: { libraries: any[]; plugins: any[] }) {
      const installScripts = installScriptGenerator.generateAll(extracted.libraries);
      await cache.set({
        pluginId, sourcePath, type,
        libraryDeps: extracted.libraries, pluginDeps: extracted.plugins,
        installScriptNpm: installScripts.npm, installScriptPnpm: installScripts.pnpm,
        installScriptYarn: installScripts.yarn, installScriptPip: installScripts.pip,
        installScriptPoetry: installScripts.poetry, installScriptCargo: installScripts.cargo,
        installScriptGo: installScripts.go, dockerfile: installScripts.dockerfile,
        depth: 1, hasCycles: false, resolvedAt: Date.now(),
      });
    },
  };
}

export type PluginDependencyResolver = ReturnType<typeof createPluginDependencyResolver>;
