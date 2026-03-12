/**
 * MCP Configuration Loader for Claude SDK Provider
 *
 * Loads MCP server configurations from:
 * 1. ~/.claude.json (global + per-project)
 * 2. <projectPath>/.mcp.json (project-local)
 *
 * Merges and interpolates environment variables in server configs.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createLogger } from '../logger';

const log = createLogger('SDKProvider:MCP');

// --- MCP Configuration Types ---

export interface MCPStdioServerConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface MCPSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export type MCPServerConfig = MCPStdioServerConfig | MCPHttpServerConfig | MCPSSEServerConfig;

export interface MCPConfig {
  mcpServers?: Record<string, MCPServerConfig>;
}

// --- Loader Functions ---

function loadSingleMCPConfig(configPath: string): Record<string, MCPServerConfig> | null {
  if (!existsSync(configPath)) return null;

  try {
    const content = readFileSync(configPath, 'utf-8');
    let config = JSON.parse(content) as MCPConfig;

    if (!config.mcpServers) {
      const keys = Object.keys(config);
      const looksLikeServers = keys.some(key => {
        const val = (config as Record<string, unknown>)[key];
        return val && typeof val === 'object' && ('command' in val || 'url' in val || 'type' in val);
      });
      if (looksLikeServers) {
        config = { mcpServers: config as unknown as Record<string, MCPServerConfig> };
      }
    }

    return config.mcpServers || null;
  } catch (error) {
    log.warn({ err: error, path: configPath }, 'Failed to parse config file');
    return null;
  }
}

function interpolateEnvVars(servers: Record<string, MCPServerConfig>): void {
  for (const [, serverConfig] of Object.entries(servers)) {
    if ('env' in serverConfig && serverConfig.env) {
      for (const [key, value] of Object.entries(serverConfig.env)) {
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
          const envVar = value.slice(2, -1);
          serverConfig.env[key] = process.env[envVar] || '';
        }
      }
    }
    if ('headers' in serverConfig && serverConfig.headers) {
      for (const [key, value] of Object.entries(serverConfig.headers)) {
        if (typeof value === 'string' && value.includes('${')) {
          serverConfig.headers[key] = value.replace(/\$\{([^}]+)\}/g, (_, envVar) => process.env[envVar] || '');
        }
      }
    }
  }
}

/**
 * Load and merge MCP server configs from global ~/.claude.json and project .mcp.json.
 * Returns null if no servers are found.
 */
export function loadMCPConfig(projectPath: string): MCPConfig | null {
  const claudeConfigPath = join(homedir(), '.claude.json');
  const projectConfigPath = join(projectPath, '.mcp.json');
  let userServers: Record<string, MCPServerConfig> | null = null;

  if (existsSync(claudeConfigPath)) {
    try {
      const content = readFileSync(claudeConfigPath, 'utf-8');
      const config = JSON.parse(content);

      if (config.mcpServers && typeof config.mcpServers === 'object' && Object.keys(config.mcpServers).length > 0) {
        userServers = config.mcpServers as Record<string, MCPServerConfig>;
        log.info({ servers: Object.keys(userServers || {}), path: claudeConfigPath }, 'Loaded global MCP config');
      }

      if (config.projects && config.projects[projectPath]?.mcpServers) {
        const projectServers = config.projects[projectPath].mcpServers as Record<string, MCPServerConfig>;
        if (Object.keys(projectServers).length > 0) {
          userServers = { ...(userServers || {}), ...projectServers };
          log.info({ servers: Object.keys(projectServers), projectPath }, 'Loaded CLI project MCP config');
        }
      }
    } catch (error) {
      log.warn({ err: error, path: claudeConfigPath }, 'Failed to parse config file');
    }
  }

  const projectServers = loadSingleMCPConfig(projectConfigPath);
  if (projectServers) {
    log.info({ servers: Object.keys(projectServers), path: projectConfigPath }, 'Loaded project MCP config');
  }

  const mergedServers: Record<string, MCPServerConfig> = {
    ...(userServers || {}),
    ...(projectServers || {}),
  };

  if (Object.keys(mergedServers).length === 0) {
    log.info('No MCP servers found in user or project config');
    return null;
  }

  interpolateEnvVars(mergedServers);
  log.info({ servers: Object.keys(mergedServers) }, 'Merged MCP servers');
  return { mcpServers: mergedServers };
}

/**
 * Derive tool wildcard patterns from MCP server names.
 * e.g. serverName "playwright" → "mcp__playwright__*"
 */
export function getMCPToolWildcards(mcpServers: Record<string, MCPServerConfig>): string[] {
  return Object.keys(mcpServers).map(serverName => `mcp__${serverName}__*`);
}
