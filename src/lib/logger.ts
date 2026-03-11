/**
 * Re-export from agentic-sdk shared module.
 * All consumers import from '@/lib/logger' — this shim keeps those imports working.
 */
export { createLogger, logger, type Logger } from '@agentic-sdk/lib/pino-logger';
