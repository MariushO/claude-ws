// Re-export from SDK service for backward compatibility
export {
  generatePluginFile,
  getPluginPath,
  pluginExists,
  type GeneratePluginFileOptions,
  type PluginFileExistsError,
} from '../../packages/agentic-sdk/src/services/agent-factory/plugin-file-generator';
