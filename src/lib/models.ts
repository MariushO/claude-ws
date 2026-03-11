/**
 * Re-export from agentic-sdk shared module.
 * All consumers import from '@/lib/models' — this shim keeps those imports working.
 */
export {
  type Model,
  AVAILABLE_MODELS,
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_ALIAS,
  getModelById,
  isValidModelId,
  modelIdToDisplayName,
  getModelShortName,
} from '@agentic-sdk/lib/claude-available-models';
