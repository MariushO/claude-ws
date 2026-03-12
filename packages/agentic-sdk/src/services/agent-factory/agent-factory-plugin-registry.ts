/**
 * Agent Factory plugin registry service - CRUD for plugins, project associations,
 * dependencies, and filesystem discovery of .claude/agentfactory/ plugins
 */
import { eq, and } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import * as schema from '../../db/database-schema';
import { generateId } from '../../lib/nanoid-id-generator';
import { dependencyExtractor } from './dependency-extractor';
import { claudeDependencyAnalyzer } from './claude-dependency-analyzer';
import { installScriptGenerator } from './install-script-generator';

export class AgentFactoryValidationError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'AgentFactoryValidationError';
  }
}

export class PluginAlreadyAssignedError extends Error {
  constructor(message: string = 'Plugin already assigned to project') {
    super(message);
    this.name = 'PluginAlreadyAssignedError';
  }
}

/** Explicit service interface — avoids TS inference truncation on large object literals with self-references */
export interface AgentFactoryService {
  listPlugins(filters?: { type?: string; projectId?: string }): Promise<any>;
  /** List plugins, filtering out imported ones whose source no longer exists on disk */
  listPluginsWithExistenceFilter(filters?: { type?: string }): Promise<any[]>;
  getPlugin(id: string): Promise<any>;
  createPlugin(data: { type: 'skill' | 'command' | 'agent' | 'agent_set'; name: string; description?: string; sourcePath?: string; storageType?: 'local' | 'imported' | 'external'; agentSetPath?: string; metadata?: string }): Promise<any>;
  /** Create plugin record AND generate file on disk. Returns {plugin} or {error, statusCode}. */
  createPluginWithFile(data: { type: 'skill' | 'command' | 'agent'; name: string; description?: string; storageType?: string; metadata?: any }): Promise<{ plugin: any } | { error: string; statusCode: number }>;
  updatePlugin(id: string, data: Partial<any>): Promise<any>;
  /** Delete plugin from DB and optionally remove its files from disk (local/imported in agent-factory dir) */
  deletePluginWithFiles(id: string): Promise<void>;
  deletePlugin(id: string): Promise<void>;
  listProjectPlugins(projectId: string): Promise<any>;
  /** List project plugins, removing orphans (missing source) from DB */
  listProjectPluginsWithOrphanCleanup(projectId: string): Promise<any[]>;
  associatePlugin(projectId: string, pluginId: string): Promise<any>;
  disassociatePlugin(projectId: string, pluginId: string): Promise<void>;
  listDependencies(pluginId: string): Promise<any>;
  addDependency(pluginId: string, dep: { type: string; spec: string }): Promise<any>;
  removeDependency(depId: string): Promise<void>;
  getPluginFile(id: string): Promise<string | null>;
  updatePluginFile(id: string, content: string): Promise<{ success: boolean } | null>;
  discoverPlugins(basePath: string): Promise<Array<{ name: string; type: string; sourcePath: string }>>;
  importPlugin(data: { type: string; name: string; description?: string; sourcePath: string; metadata?: string }): Promise<any>;
  comparePlugins(discovered: Array<{ type: string; name: string; description?: string; sourcePath: string; metadata?: any }>): Promise<{ plugins: any[] }>;
  syncProject(projectId: string, projectPath: string): Promise<any>;
  getInstalledComponents(projectId: string, projectPath: string): Promise<{ installed: string[] }>;
  uninstallComponent(projectId: string, componentId: string, projectPath: string): Promise<any>;
  extractDependencies(sourcePath: string, type: string, useClaude?: boolean): Promise<any>;
  installDependency(id: string): Promise<any>;
  handleUpload(data: unknown): Promise<{ error: string }>;
  confirmUpload(body: unknown): Promise<{ error: string }>;
  updateUploadSession(sessionId: string, items: unknown[]): Promise<{ error: string }>;
  cancelUploadSession(sessionId: string): Promise<void>;
}

export function createAgentFactoryService(db: any): AgentFactoryService {
  return {
    async listPlugins(filters?: { type?: string; projectId?: string }) {
      if (filters?.projectId) {
        return this.listProjectPlugins(filters.projectId);
      }
      const query = db.select().from(schema.agentFactoryPlugins);
      if (filters?.type) {
        return query.where(eq(schema.agentFactoryPlugins.type, filters.type as any)).all();
      }
      return query.all();
    },

    async listPluginsWithExistenceFilter(filters?: { type?: string }) {
      const { existsSync } = await import('fs');
      const all = await this.listPlugins(filters);
      return (all as any[]).filter((plugin: any) => {
        if (plugin.storageType === 'imported') {
          return plugin.sourcePath && existsSync(plugin.sourcePath);
        }
        return true;
      });
    },

    async getPlugin(id: string) {
      return db.select().from(schema.agentFactoryPlugins)
        .where(eq(schema.agentFactoryPlugins.id, id)).get();
    },

    async createPlugin(data: {
      type: 'skill' | 'command' | 'agent' | 'agent_set';
      name: string;
      description?: string;
      sourcePath?: string;
      storageType?: 'local' | 'imported' | 'external';
      agentSetPath?: string;
      metadata?: string;
    }) {
      const id = generateId('plg');
      const now = Date.now();
      const record = {
        id,
        type: data.type,
        name: data.name,
        description: data.description || null,
        sourcePath: data.sourcePath || null,
        storageType: data.storageType || 'local' as const,
        agentSetPath: data.agentSetPath || null,
        metadata: data.metadata || null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.agentFactoryPlugins).values(record);
      return record;
    },

    async createPluginWithFile(data: { type: 'skill' | 'command' | 'agent'; name: string; description?: string; storageType?: string; metadata?: any }) {
      const { generatePluginFile, getPluginPath, pluginExists } = await import('./plugin-file-generator');
      const { type, name, description, storageType = 'local', metadata } = data;
      const pluginType = type as 'skill' | 'command' | 'agent';

      if (!['skill', 'command', 'agent'].includes(pluginType)) {
        return { error: 'Invalid type. Must be skill, command, or agent', statusCode: 400 };
      }

      if (pluginExists(pluginType, name)) {
        return { error: `Plugin file already exists at ${getPluginPath(pluginType, name)}`, statusCode: 409 };
      }

      const allPlugins = await this.listPlugins({ type: pluginType });
      if ((allPlugins as any[]).find((p: any) => p.name === name)) {
        return { error: 'Plugin with this name already exists in database', statusCode: 409 };
      }

      try {
        await generatePluginFile({ type: pluginType, name, description: description || undefined });
      } catch (fileError: unknown) {
        const err = fileError as Error & { code?: string };
        if (err.code === 'PLUGIN_EXISTS') {
          return { error: err.message, statusCode: 409 };
        }
        return { error: 'Failed to create plugin file on disk', statusCode: 500 };
      }

      const actualPath = getPluginPath(pluginType, name);
      const plugin = await this.createPlugin({
        type: pluginType,
        name,
        description: description || undefined,
        sourcePath: actualPath,
        storageType: storageType as any,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      });
      return { plugin };
    },

    async updatePlugin(id: string, data: Partial<schema.AgentFactoryPlugin>) {
      await db.update(schema.agentFactoryPlugins)
        .set({ ...data, updatedAt: Date.now() })
        .where(eq(schema.agentFactoryPlugins.id, id));
      return this.getPlugin(id);
    },

    async deletePlugin(id: string) {
      await db.delete(schema.agentFactoryPlugins)
        .where(eq(schema.agentFactoryPlugins.id, id));
    },

    async deletePluginWithFiles(id: string) {
      const existing = await this.getPlugin(id);
      if (!existing) return;

      const { existsSync } = await import('fs');
      const { rm } = await import('fs/promises');
      const { dirname: dirnameFs } = await import('path');

      let shouldDeleteFiles = false;
      let deletePath: string | null = null;

      if (existing.storageType === 'local' || existing.storageType === 'imported') {
        if (existing.type === 'agent_set') {
          shouldDeleteFiles = !!(existing.agentSetPath && existing.agentSetPath.includes('/agent-factory/'));
          deletePath = existing.agentSetPath || null;
        } else {
          shouldDeleteFiles = !!(existing.sourcePath && existing.sourcePath.includes('/agent-factory/'));
          deletePath = existing.sourcePath || null;
        }
      }

      if (shouldDeleteFiles && deletePath && existsSync(deletePath)) {
        try {
          if (existing.type === 'skill') {
            await rm(dirnameFs(deletePath), { recursive: true, force: true });
          } else if (existing.type === 'agent_set') {
            await rm(deletePath, { recursive: true, force: true });
          } else {
            await rm(deletePath, { force: true });
          }
        } catch { /* continue with DB deletion even if file deletion fails */ }
      }

      await this.deletePlugin(id);
    },

    async listProjectPluginsWithOrphanCleanup(projectId: string) {
      const { existsSync } = await import('fs');
      const assigned = await this.listProjectPlugins(projectId);

      const missingIds: string[] = [];
      const valid = (assigned as any[]).filter((plugin: any) => {
        const pathToCheck = plugin.type === 'agent_set' ? plugin.agentSetPath : plugin.sourcePath;
        if (pathToCheck && existsSync(pathToCheck)) return true;
        missingIds.push(plugin.id);
        return false;
      });

      for (const pluginId of missingIds) {
        await this.deletePlugin(pluginId);
      }

      return valid;
    },

    async listProjectPlugins(projectId: string) {
      return db.select({
        id: schema.agentFactoryPlugins.id,
        type: schema.agentFactoryPlugins.type,
        name: schema.agentFactoryPlugins.name,
        description: schema.agentFactoryPlugins.description,
        sourcePath: schema.agentFactoryPlugins.sourcePath,
        storageType: schema.agentFactoryPlugins.storageType,
        metadata: schema.agentFactoryPlugins.metadata,
        enabled: schema.projectPlugins.enabled,
      })
        .from(schema.projectPlugins)
        .innerJoin(
          schema.agentFactoryPlugins,
          eq(schema.projectPlugins.pluginId, schema.agentFactoryPlugins.id)
        )
        .where(eq(schema.projectPlugins.projectId, projectId))
        .all();
    },

    async associatePlugin(projectId: string, pluginId: string) {
      try {
        const id = generateId('pp');
        const record = { id, projectId, pluginId, enabled: true, createdAt: Date.now() };
        await db.insert(schema.projectPlugins).values(record);
        return record;
      } catch (err: any) {
        if (err?.message?.includes('UNIQUE') || err?.code === 'SQLITE_CONSTRAINT') {
          throw new PluginAlreadyAssignedError();
        }
        throw err;
      }
    },

    async disassociatePlugin(projectId: string, pluginId: string) {
      await db.delete(schema.projectPlugins).where(
        and(
          eq(schema.projectPlugins.projectId, projectId),
          eq(schema.projectPlugins.pluginId, pluginId)
        )
      );
    },

    async listDependencies(pluginId: string) {
      return db.select().from(schema.pluginDependencies)
        .where(eq(schema.pluginDependencies.pluginId, pluginId))
        .all();
    },

    async addDependency(pluginId: string, dep: { type: string; spec: string }) {
      const id = generateId('dep');
      const record = {
        id,
        pluginId,
        dependencyType: dep.type as any,
        spec: dep.spec,
        createdAt: Date.now(),
      };
      await db.insert(schema.pluginDependencies).values(record);
      return record;
    },

    async removeDependency(depId: string) {
      await db.delete(schema.pluginDependencies)
        .where(eq(schema.pluginDependencies.id, depId));
    },

    async getPluginFile(id: string) {
      const plugin = await this.getPlugin(id);
      if (!plugin?.sourcePath) return null;
      try {
        return await fs.readFile(plugin.sourcePath, 'utf-8');
      } catch {
        return null;
      }
    },

    async updatePluginFile(id: string, content: string) {
      const plugin = await this.getPlugin(id);
      if (!plugin?.sourcePath) return null;
      await fs.writeFile(plugin.sourcePath, content, 'utf-8');
      return { success: true };
    },

    // --- Extended methods ---

    async importPlugin(data: { type: string; name: string; description?: string; sourcePath: string; metadata?: string }) {
      const { type, name, description, sourcePath, metadata } = data;
      if (!type || !name || !sourcePath) return null;

      const { existsSync } = await import('fs');
      const { cp, readFile, writeFile, mkdir } = await import('fs/promises');

      if (!existsSync(sourcePath)) return null;

      const homeDir = (await import('os')).homedir();
      const dataDir = process.env.DATA_DIR || path.join(homeDir, 'data');
      const afDir = path.join(dataDir, 'agent-factory');
      const typeDir = path.join(afDir, `${type}s`);

      await mkdir(typeDir, { recursive: true });

      let targetPath: string;
      if (type === 'skill') {
        targetPath = path.join(typeDir, name);
        await cp(sourcePath, targetPath, { recursive: true });
      } else {
        const fileName = path.basename(sourcePath);
        targetPath = path.join(typeDir, fileName);
        const content = await readFile(sourcePath, 'utf-8');
        await writeFile(targetPath, content, 'utf-8');
      }

      const id = generateId('plg');
      const now = Date.now();
      const record = {
        id, type, name,
        description: description || null,
        sourcePath: targetPath,
        storageType: 'imported' as const,
        metadata: metadata || null,
        createdAt: now, updatedAt: now,
      };
      await db.insert(schema.agentFactoryPlugins).values(record);
      return record;
    },

    async comparePlugins(discovered: Array<{ type: string; name: string; description?: string; sourcePath: string; metadata?: any }>) {
      const { existsSync } = await import('fs');
      const { stat } = await import('fs/promises');

      const imported = await db.select().from(schema.agentFactoryPlugins)
        .where(eq(schema.agentFactoryPlugins.storageType, 'imported' as any)).all();

      const result: Array<any> = [];
      for (const comp of discovered) {
        const existing = imported.find((c: any) => c.type === comp.type && c.name === comp.name);
        if (!existing) { result.push({ ...comp, status: 'new' }); continue; }

        const sourceExists = comp.sourcePath && existsSync(comp.sourcePath);
        const importedExists = existing.sourcePath && existsSync(existing.sourcePath);
        if (!sourceExists || !importedExists) { result.push({ ...comp, status: 'new' }); continue; }

        try {
          const sourceStats = await stat(comp.sourcePath);
          const importedStats = await stat(existing.sourcePath!);
          if (sourceStats.mtimeMs > importedStats.mtimeMs) {
            result.push({ ...comp, status: 'update', existingPlugin: { id: existing.id, sourcePath: existing.sourcePath, updatedAt: existing.updatedAt } });
          } else {
            result.push({ ...comp, status: 'current', existingPlugin: { id: existing.id, sourcePath: existing.sourcePath, updatedAt: existing.updatedAt } });
          }
        } catch { result.push({ ...comp, status: 'new' }); }
      }
      return { plugins: result };
    },

    async syncProject(projectId: string, projectPath: string) {
      const { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, readFileSync, writeFileSync } = await import('fs');

      function copyDirectory(src: string, dest: string) {
        if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
        for (const entry of readdirSync(src, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue;
          const s = path.join(src, entry.name), d = path.join(dest, entry.name);
          entry.isDirectory() ? copyDirectory(s, d) : copyFileSync(s, d);
        }
      }

      const settingsPath = path.join(projectPath, '.claude', 'project-settings.json');
      if (!existsSync(settingsPath)) return { success: false, error: 'Project settings not found' };
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const allIds = [...(settings.selectedComponents || []), ...(settings.selectedAgentSets || [])];
      if (allIds.length === 0) return { success: true, installed: [], skipped: [], errors: [] };

      const allComponents = await db.select().from(schema.agentFactoryPlugins).all();
      const selected = allComponents.filter((c: any) => allIds.includes(c.id));
      const claudeDir = path.join(projectPath, '.claude');
      if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

      const installed: string[] = [], skipped: string[] = [], errors: string[] = [];

      for (const comp of selected) {
        try {
          const sourcePath = comp.type === 'agent_set' ? comp.agentSetPath : comp.sourcePath;
          if (!sourcePath || !existsSync(sourcePath)) { errors.push(`${comp.name}: Source not found`); continue; }

          if (comp.type === 'skill') {
            let skillSrc = sourcePath;
            if (!statSync(sourcePath).isDirectory()) skillSrc = path.dirname(sourcePath);
            const target = path.join(claudeDir, 'skills', comp.name);
            if (existsSync(target)) rmSync(target, { recursive: true, force: true });
            mkdirSync(target, { recursive: true });
            copyDirectory(skillSrc, target);
            installed.push(`skill: ${comp.name}`);
          } else if (comp.type === 'command' || comp.type === 'agent') {
            const dir = path.join(claudeDir, `${comp.type}s`);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            const fileName = path.basename(sourcePath);
            copyFileSync(sourcePath, path.join(dir, fileName));
            installed.push(`${comp.type}: ${comp.name}`);
          } else if (comp.type === 'agent_set') {
            for (const subdir of ['skills', 'commands', 'agents']) {
              const src = path.join(sourcePath, subdir);
              if (!existsSync(src)) continue;
              for (const entry of readdirSync(src, { withFileTypes: true })) {
                if (entry.name.startsWith('.')) continue;
                const s = path.join(src, entry.name), targetDir = path.join(claudeDir, subdir);
                if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
                if (entry.isDirectory()) {
                  const t = path.join(targetDir, entry.name);
                  if (existsSync(t)) rmSync(t, { recursive: true, force: true });
                  copyDirectory(s, t);
                } else {
                  copyFileSync(s, path.join(targetDir, entry.name));
                }
                installed.push(`agent-set: ${subdir}/${entry.name}`);
              }
            }
          }
        } catch (e: any) { errors.push(`${comp.name}: ${e.message}`); }
      }

      const configPath = path.join(claudeDir, 'config.json');
      let config: any = {};
      try { if (existsSync(configPath)) config = JSON.parse(readFileSync(configPath, 'utf-8')); } catch {}
      config.components = allIds;
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

      return { success: true, installed, skipped, errors };
    },

    async getInstalledComponents(projectId: string, projectPath: string) {
      const { existsSync, readFileSync, readdirSync } = await import('fs');

      const settingsPath = path.join(projectPath, '.claude', 'project-settings.json');
      if (!existsSync(settingsPath)) return { installed: [] };

      let settings;
      try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { return { installed: [] }; }
      const allIds = [...(settings.selectedComponents || []), ...(settings.selectedAgentSets || [])];
      if (allIds.length === 0) return { installed: [] };

      const allComponents = await db.select().from(schema.agentFactoryPlugins).all();
      const selected = allComponents.filter((c: any) => allIds.includes(c.id));
      const claudeDir = path.join(projectPath, '.claude');

      const installed = selected.filter((c: any) => {
        switch (c.type) {
          case 'skill': return existsSync(path.join(claudeDir, 'skills', c.name));
          case 'command': return existsSync(path.join(claudeDir, 'commands', `${c.name}.md`));
          case 'agent': return existsSync(path.join(claudeDir, 'agents', `${c.name}.md`));
          case 'agent_set': {
            if (!c.agentSetPath || !existsSync(c.agentSetPath)) return false;
            for (const subdir of ['skills', 'commands', 'agents']) {
              const src = path.join(c.agentSetPath, subdir);
              if (!existsSync(src)) continue;
              for (const entry of readdirSync(src, { withFileTypes: true })) {
                if (!entry.name.startsWith('.') && existsSync(path.join(claudeDir, subdir, entry.name))) return true;
              }
            }
            return false;
          }
          default: return false;
        }
      }).map((c: any) => c.id);

      return { installed };
    },

    async uninstallComponent(projectId: string, componentId: string, projectPath: string) {
      const { existsSync, readFileSync, writeFileSync, rmSync, readdirSync } = await import('fs');

      const component = await this.getPlugin(componentId);
      if (!component) return { success: false, error: 'Component not found' };

      const claudeDir = path.join(projectPath, '.claude');

      switch (component.type) {
        case 'skill': {
          const dir = path.join(claudeDir, 'skills', component.name);
          if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
          break;
        }
        case 'command': {
          const file = path.join(claudeDir, 'commands', `${component.name}.md`);
          if (existsSync(file)) rmSync(file, { force: true });
          break;
        }
        case 'agent': {
          const file = path.join(claudeDir, 'agents', `${component.name}.md`);
          if (existsSync(file)) rmSync(file, { force: true });
          break;
        }
        case 'agent_set': {
          if (component.agentSetPath && existsSync(component.agentSetPath)) {
            for (const subdir of ['skills', 'commands', 'agents']) {
              const src = path.join(component.agentSetPath, subdir);
              if (!existsSync(src)) continue;
              for (const entry of readdirSync(src, { withFileTypes: true })) {
                if (entry.name.startsWith('.')) continue;
                const target = path.join(claudeDir, subdir, entry.name);
                if (existsSync(target)) rmSync(target, { recursive: true, force: true });
              }
            }
          }
          break;
        }
      }

      const settingsPath = path.join(claudeDir, 'project-settings.json');
      if (existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
          if (component.type === 'agent_set') {
            settings.selectedAgentSets = (settings.selectedAgentSets || []).filter((id: string) => id !== componentId);
          } else {
            settings.selectedComponents = (settings.selectedComponents || []).filter((id: string) => id !== componentId);
          }
          writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        } catch {}
      }

      const configPath = path.join(claudeDir, 'config.json');
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'));
          if (Array.isArray(config.components)) {
            config.components = config.components.filter((id: string) => id !== componentId);
            writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
          }
        } catch {}
      }

      return { success: true, message: `Uninstalled ${component.name}` };
    },

    async extractDependencies(sourcePath: string, type: string, useClaude?: boolean) {
      const { existsSync } = await import('fs');
      const { homedir } = await import('os');
      const resolvedPath = path.resolve(sourcePath);
      if (!resolvedPath.startsWith(homedir())) {
        throw new AgentFactoryValidationError('Access denied', 403);
      }
      if (!existsSync(sourcePath)) {
        throw new AgentFactoryValidationError('Source path not found', 404);
      }

      let extracted;
      if (useClaude) {
        const analyzed = await claudeDependencyAnalyzer.analyze(sourcePath, type);
        extracted = { libraries: analyzed.libraries, plugins: analyzed.plugins };
      } else {
        extracted = await dependencyExtractor.extract(sourcePath, type);
      }

      const installScripts = installScriptGenerator.generateAll(extracted.libraries);
      const dependencyTree = (extracted.plugins || []).map((c: any) => ({
        type: c.type, name: c.name, depth: 1,
      }));

      return {
        libraries: extracted.libraries,
        plugins: extracted.plugins || [],
        installScripts,
        dependencyTree,
        depth: 1,
        hasCycles: false,
        totalPlugins: (extracted.plugins || []).length,
        resolvedAt: Date.now(),
        analysisMethod: useClaude ? 'claude-sdk' : 'regex',
      };
    },

    async installDependency(id: string) {
      const dep = await db.select().from(schema.pluginDependencies)
        .where(eq(schema.pluginDependencies.id, id)).get();
      if (!dep) return null;

      let installCommand = '';
      if (dep.dependencyType === 'python') installCommand = `pip install ${dep.spec}`;
      else if (dep.dependencyType === 'npm') installCommand = `npm install ${dep.spec}`;
      else if (dep.dependencyType === 'system') installCommand = `# System package: ${dep.spec}`;

      await db.update(schema.pluginDependencies)
        .set({ installed: true })
        .where(eq(schema.pluginDependencies.id, id));

      return { success: true, message: 'Dependency marked as installed', installCommand };
    },

    async handleUpload(_data: unknown) {
      return { error: 'Archive upload not available in agentic-sdk (requires adm-zip/tar)' };
    },

    async confirmUpload(_body: unknown) {
      return { error: 'Archive upload not available in agentic-sdk (requires adm-zip/tar)' };
    },

    async updateUploadSession(_sessionId: string, _items: unknown[]) {
      return { error: 'Upload sessions not available in agentic-sdk' };
    },

    async cancelUploadSession(_sessionId: string): Promise<void> {
      // no-op - upload sessions not available in agentic-sdk
    },

    async discoverPlugins(basePath: string) {
      const agentFactoryDir = path.join(basePath, '.claude', 'agentfactory');
      const discovered: Array<{ name: string; type: string; sourcePath: string }> = [];

      async function scanDir(dir: string, type: string) {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              discovered.push({
                name: entry.name,
                type,
                sourcePath: path.join(dir, entry.name),
              });
            }
          }
        } catch { /* directory may not exist */ }
      }

      await Promise.all([
        scanDir(path.join(agentFactoryDir, 'skills'), 'skill'),
        scanDir(path.join(agentFactoryDir, 'commands'), 'command'),
        scanDir(path.join(agentFactoryDir, 'agents'), 'agent'),
      ]);

      return discovered;
    },
  };
}
