/**
 * Model Alias Mapper and Server Command Detector for Claude SDK Provider
 *
 * - MODEL_ALIAS_MAP: maps full model IDs to short SDK aliases (opus, sonnet, haiku)
 * - resolveModel: translates a display model ID to the SDK-expected alias
 * - isServerCommand: detects long-running server commands that need BGPID fix
 */

// --- Model Alias Mapping ---

const MODEL_ALIAS_MAP: Record<string, string> = {
  'claude-opus-4-6': 'opus',
  'claude-sonnet-4-5-20250929': 'sonnet',
  'claude-haiku-4-5-20251001': 'haiku',
  'claude-3-5-sonnet-20241022': 'sonnet',
};

/**
 * Translate a full display model ID to its SDK short alias.
 * Falls back to the original ID if no mapping exists.
 */
export function resolveModel(displayModelId: string): string {
  return MODEL_ALIAS_MAP[displayModelId] || displayModelId;
}

// --- Server Command Detection ---

const SERVER_PATTERNS = [
  /npm\s+run\s+(dev|start|serve)/i,
  /yarn\s+(dev|start|serve)/i,
  /pnpm\s+(dev|start|serve)/i,
  /npx\s+(directus|strapi|next|vite|nuxt)/i,
  /nohup\s+/i,
];

/**
 * Detect whether a Bash command launches a long-running server process
 * that requires the BGPID background PID fix.
 */
export function isServerCommand(command: string): boolean {
  return SERVER_PATTERNS.some(p => p.test(command));
}
