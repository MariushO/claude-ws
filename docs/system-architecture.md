# System Architecture

**Claude Workspace** is a distributed system combining a Next.js frontend, custom Node.js server, standalone Fastify backend, and local SQLite database. It enables Claude Code users to manage AI-assisted projects through a visual Kanban interface with persistent history, real-time streaming, and local-first data storage.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ User's Web Browser (http://localhost:8556)                  │
│  ├─ React 19 Components (Next.js client)                    │
│  ├─ Zustand Stores (state management)                       │
│  ├─ Socket.io Client (real-time updates)                    │
│  └─ CodeMirror Editor + xterm.js Terminal                   │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP Requests + WebSocket
┌──────────────────▼──────────────────────────────────────────┐
│ Next.js Server (port 8556)                                   │
│  ├─ API Routes (/api/*)                                      │
│  ├─ Socket.io Server                                         │
│  ├─ File Upload/Download Handler                             │
│  ├─ Anthropic API Proxy (token caching)                       │
│  └─ Agent Manager + Terminal + Git Manager                   │
└──────────────────┬──────────────────────────────────────────┘
                   │ Service Calls
┌──────────────────▼──────────────────────────────────────────┐
│ Agentic SDK Shared Services                                  │
│  ├─ Task CRUD & Reorder Service                              │
│  ├─ Checkpoint Service                                       │
│  ├─ File Service                                             │
│  ├─ Git Service                                              │
│  ├─ Terminal Service                                         │
│  └─ Shell Manager                                            │
└──────────────────┬──────────────────────────────────────────┘
                   │ Database Queries
┌──────────────────▼──────────────────────────────────────────┐
│ SQLite Database (better-sqlite3)                             │
│  ├─ Drizzle ORM (type-safe queries)                          │
│  ├─ WAL mode (concurrent reads/writes)                       │
│  ├─ Foreign key constraints enabled                          │
│  └─ Data file: ~/.data/claude-ws.db                          │
└─────────────────────────────────────────────────────────────┘

Optional: Standalone Agentic SDK Server (port 3100)
┌─────────────────────────────────────────────────────────────┐
│ Fastify Server (headless REST + SSE)                         │
│  ├─ No UI, no Socket.io                                      │
│  ├─ Same services as main server                             │
│  ├─ JSON API + Server-Sent Events for streaming              │
│  └─ Ideal for CI/CD, automation, custom integrations         │
└─────────────────────────────────────────────────────────────┘
```

## server.ts: Entry Point & Initialization

**File:** `server.ts`

Responsibilities:

1. **Environment Setup**
   - Loads `.env` from user's working directory (where `claude-ws` is invoked)
   - Falls back to `~/.claude/settings.json` for API keys
   - Sets `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` globally
   - Unsets `CLAUDECODE` env var to prevent nested session detection

2. **Anthropic Proxy Initialization**
   - Calls `initAnthropicProxy()` before importing agent-manager
   - Redirects all Anthropic SDK calls through proxy for token caching
   - Enables prompt caching and usage tracking across attempts

3. **HTTP Server Setup**
   - Creates Node.js `http.createServer()` instance
   - Boots Next.js app with custom request handler
   - Configures graceful shutdown on SIGTERM/SIGINT

4. **Socket.io Server**
   - Listens for connection events
   - Broadcasts agent events (started, json, stderr, exit, etc.)
   - Handles question resolution and inline editing

5. **API Route Handlers**
   - Maps HTTP requests to domain-specific handlers (attempts, projects, etc.)
   - Calls appropriate service modules
   - Returns JSON responses with proper HTTP status codes

6. **Managers Setup**
   - Initializes `sessionManager`, `checkpointManager`, `shellManager`, etc.
   - Attaches cleanup handlers for graceful shutdown
   - Wires up Socket.io event listeners

7. **Port Configuration**
   - Default: 8556 (overridable via PORT env var)
   - Logs startup message with URL

## middleware.ts: Edge Runtime Authentication & i18n

**File:** `middleware.ts` (90 lines)

Runs in Next.js Edge Runtime (Cloudflare Workers compatible).

**Authentication:**
- Uses custom `edgeSafeCompare()` — XOR-based constant-time string comparison (no Node.js crypto)
- Validates `x-api-key` header against `API_ACCESS_KEY` env var
- Whitelist of public endpoints:
  - `/api/auth/verify`
  - `/api/tunnel/status`
  - `/api/settings/api-access-key`
  - `/api/uploads/*` (GET only)
- Returns 401 if API key invalid or missing (when configured)

**i18n Routing:**
- Uses `next-intl` middleware for locale detection
- Routes requests to `[locale]` dynamic segment
- Supports: en, de, es, fr, ja, ko, vi, zh
- Detects language from browser headers or URL

**Cache Headers:**
- In dev: no-cache headers to prevent stale responses
- In prod: normal caching

## Agent Execution Pipeline

### Data Flow

```
Frontend (React)
    ↓
POST /api/attempts (with prompt, taskId, filePaths)
    ↓
Attempt API Handler
    ↓
Agent Manager
    ├─ Validate project path
    ├─ Get system prompt
    ├─ Build user message (prompt + file attachments)
    ├─ Select provider (CLI or SDK)
    └─ Start provider session
    ↓
Provider (CLI or SDK)
    ├─ Initialize Anthropic client
    ├─ Apply proxy for token caching
    ├─ Stream messages from Claude
    └─ Emit raw events
    ↓
Event Adapter
    ├─ Convert provider events to AgentManager events
    ├─ Parse tool_use (Bash, Python, etc.)
    ├─ Handle AskUserQuestion
    └─ Track token usage
    ↓
Event Wiring
    ├─ Store logs to DB
    ├─ Update attempt status
    ├─ Emit Socket.io events
    └─ Handle checkpointing
    ↓
Frontend (Socket.io listener)
    ├─ Update attempt-store
    ├─ Display logs in terminal
    ├─ Render tool output
    └─ Trigger UI updates
```

### Agent Manager (src/lib/agent-manager.ts)

Core orchestrator:

```typescript
interface AgentInstance {
  attemptId: string;
  session: ProviderSession;
  provider: Provider;
  startedAt: number;
  outputFormat?: string;
}

class AgentManager extends EventEmitter {
  private agents = new Map<string, AgentInstance>();
  private persistentQuestions = new Map<string, ...>();

  async start(options: AgentStartOptions): Promise<void>
  async cancel(attemptId: string): Promise<void>
  async resume(attemptId: string, sessionId: string): Promise<void>
}

// Events:
// - started: { attemptId, taskId }
// - json: { attemptId, data: ClaudeOutput }
// - stderr: { attemptId, content }
// - exit: { attemptId, code }
// - question: { attemptId, toolUseId, questions }
// - backgroundShell: { attemptId, shell: BackgroundShellInfo }
```

**Flow:**

1. Validate project path exists
2. Get system prompt via `getSystemPrompt(projectPath)`
3. Load file attachments if provided
4. Select provider based on `CLAUDE_PROVIDER` env (default: CLI)
5. Call `provider.start(session)` with prompt and files
6. Wire provider events to AgentManager events via `wireProviderEvents()`
7. Store attempt to DB with `sessionId`
8. Emit Socket.io events on each provider event
9. On exit: calculate usage, update attempt record, handle checkpointing

### Providers (src/lib/providers/)

**Provider Interface:**

```typescript
interface Provider {
  start(options: ProviderStartOptions): Promise<ProviderSession>;
  cancel(session: ProviderSession): Promise<void>;
  resume(session: ProviderSession): Promise<void>;
}

interface ProviderSession {
  id: string;
  eventEmitter: EventEmitter;
}
```

**Two Implementations:**

#### Claude CLI Provider (`src/lib/providers/claude-cli-provider.ts`)

- Spawns subprocess: `claude-code-v1 <project_path>`
- Uses stdin/stdout streams
- Parses tool_use from stdout
- Local execution with full file system access
- Slower feedback loop (subprocess overhead)
- Default provider

#### Claude SDK Provider (`src/lib/providers/claude-sdk-provider.ts`)

- Imports Claude Agent SDK directly
- Creates agent instance via SDK API
- Direct message streaming
- In-process execution (faster)
- Requires Anthropic API key
- Enabled via `CLAUDE_PROVIDER=sdk` env

### Event Wiring (src/lib/agent-event-wiring.ts)

Converts provider events to AgentManager events:

```typescript
interface EventWiringContext {
  agentManager: AgentManager;
  database: Database;
  socketService: SocketService;
  sessionManager: SessionManager;
  checkpointManager: CheckpointManager;
  // ...more dependencies
}

function wireProviderEvents(
  session: ProviderSession,
  context: EventWiringContext
): void {
  // On provider.on('message'):
  //   - Parse tool_use blocks
  //   - Store logs to DB
  //   - Emit agentManager.emit('json', ...)
  //   - Handle questions
  //   - Checkpoint state
}
```

**Event handlers:**
- `message` → parse JSON, emit `json` event, store logs
- `question` → emit `question` event, add to persistent questions
- `exit` → finalize attempt, calculate usage, update DB
- Errors → emit `stderr`, log to DB

## Database Architecture

### SQLite with Write-Ahead Logging (WAL)

**Location:** `data/claude-ws.db` (user's project directory)

**Mode:** SQLite WAL (Write-Ahead Logging)
- Enables concurrent reads while writes are in progress
- Better performance than default journal mode
- Requires cleanup (WAL files: `-shm`, `-wal`)

### Drizzle ORM

**Schema:** `packages/agentic-sdk/src/db/database-schema.ts`
**Connection:** `packages/agentic-sdk/src/db/database-connection.ts`
**Initialization:** `packages/agentic-sdk/src/db/database-init-tables.ts`

**Main Tables:**

| Table | Purpose | Cascade Delete |
|-------|---------|-----------------|
| `projects` | Workspace projects | No (root entity) |
| `tasks` | Kanban board cards | On project delete |
| `attempts` | Agent execution records | On task delete |
| `attemptLogs` | Streaming output chunks | On attempt delete |
| `attemptFiles` | Uploaded file attachments | On attempt delete |
| `checkpoints` | Conversation state snapshots | On attempt delete |
| `shells` | Background shell processes | On project delete |
| `subagents` | Spawned subagents | On project delete |
| `agentFactoryPlugins` | Plugin registry | No (global) |
| `projectPlugins` | Project-specific plugins | On project delete |
| `pluginDependencies` | Dependency tree | Cascade |
| `pluginDependencyCache` | Dependency resolution cache | On demand |
| `appSettings` | Global configuration | No (singleton) |

**Sample Queries:**
```typescript
// Get all tasks for a project
db.select().from(tasks).where(eq(tasks.projectId, projectId));

// Get attempts for a task with logs
const attempt = db.select().from(attempts).where(eq(attempts.taskId, taskId));
const logs = db.select().from(attemptLogs).where(eq(attemptLogs.attemptId, attemptId));

// Get checkpoint and rewind
const checkpoint = db.select().from(checkpoints).where(eq(checkpoints.id, checkpointId));
```

### Database Initialization

**Function:** `initDb()` in `packages/agentic-sdk/src/db/database-init-tables.ts`

Runs on server startup:

1. Open SQLite connection
2. Enable WAL mode: `PRAGMA journal_mode = WAL;`
3. For each table schema:
   - Execute `CREATE TABLE IF NOT EXISTS ...` SQL
   - Handle missing columns with `ALTER TABLE ADD COLUMN` (wrapped in try-catch)
4. Set foreign key constraints

**Important:** Always update both:
- `database-schema.ts` — Drizzle ORM schema (source of truth)
- `database-init-tables.ts` — SQL DDL statements for `initDb()`

If you only update schema without initDb(), existing databases will fail with "no such column" errors.

## Real-Time Communication

### Main App: Socket.io

**Server:** Created in `server.ts`
**Client:** `src/lib/socket-service.ts`

**Events:**

| Event | Direction | Payload |
|-------|-----------|---------|
| `connection` | Server → | `{ socketId }` |
| `attempt:started` | Server → | `{ attemptId, taskId }` |
| `attempt:json` | Server → | `{ attemptId, data: ClaudeOutput }` |
| `attempt:stderr` | Server → | `{ attemptId, content }` |
| `attempt:exit` | Server → | `{ attemptId, code }` |
| `attempt:question` | Server → | `{ attemptId, toolUseId, questions }` |
| `attempt:question:resolved` | Client → | `{ attemptId, answer }` |
| `attempt:backgroundShell` | Server → | `{ attemptId, shell }` |
| `file:changed` | Server → | `{ path, content }` |
| `inline-edit` | Client → | `{ attemptId, range, content }` |

**Features:**
- Auto-reconnect with exponential backoff
- Survives HMR (Hot Module Reload) via window.__INLINE_EDIT_SOCKET__
- Single connection per client (singleton pattern)
- Binary message support for large payloads

### Agentic SDK: Server-Sent Events (SSE)

**Routes:** `packages/agentic-sdk/src/routes/attempt-sse-routes.ts`

```
GET /api/attempts/:attemptId/stream
```

Streams attempt output as newline-delimited JSON events:

```
event: message
data: {"type":"stdout","content":"..."}

event: exit
data: {"code":0}
```

**Advantages:**
- No WebSocket overhead
- Works through HTTP proxies
- Browser native EventSource API
- Unidirectional (server-to-client only)

## Anthropic Proxy with Token Caching

**Setup:** `src/lib/anthropic-proxy-setup.ts`
**Cache:** `src/lib/proxy-token-cache.ts`

### How It Works

1. **Intercept SDK Calls**
   - Monkey-patch `fetch()` global before importing Anthropic SDK
   - All requests go through proxy function first

2. **Token Caching Strategy**
   - On each request: hash prompt content
   - Check cache for same content hash
   - If hit: use cached `cache_creation_tokens` and `cache_read_tokens` stats
   - If miss: forward to Anthropic API normally

3. **Cache Structure**
   ```typescript
   Map<contentHash, {
     tokens: number;
     timestamp: number;
     createdTokens: number;
     readTokens: number;
   }>
   ```

4. **Benefits**
   - Reduce token costs on repeated contexts (prompts, files)
   - Track cache hit/miss rates
   - Improve latency on cache hits (no API call)

5. **Limitations**
   - In-memory only (lost on server restart)
   - Single server instance (no cross-server cache)
   - No cache invalidation strategy (accumulates memory)

### Token Tracking

**On each attempt completion:**
1. Calculate total tokens: input + output + cache creation + cache read
2. Estimate cost via model pricing
3. Store in `attempts` table:
   - `totalTokens`, `inputTokens`, `outputTokens`
   - `cacheCreationTokens`, `cacheReadTokens`
   - `totalCostUSD` (estimated)
4. Emit `attempt:usage` Socket.io event

## Monorepo Structure (pnpm Workspace)

**File:** `pnpm-workspace.yaml`

```yaml
packages:
  - .                        # Main app (Next.js)
  - packages/agentic-sdk     # Headless Fastify backend
```

### Shared Code Strategy

**Main App Files:**
- `src/lib/db/schema.ts` → Re-exports from agentic-sdk

**Agentic SDK Imports:**
- `import { projects, tasks, ... } from '@agentic-sdk/db/database-schema'`

**Why?**
- Single source of truth for database schema
- Main app and SDK share same tables
- Main app can read SDK's database directly
- Reduces duplication

### Build Process

1. **Install:** `pnpm install` (installs both packages)
2. **Dev:** `pnpm dev` (main) + `pnpm agentic-sdk:dev` (SDK, in separate terminal)
3. **Build:**
   - Main: `pnpm build` (Next.js build, includes SDK types)
   - SDK: Compiled on-the-fly via tsx in production
4. **Publish:** Only main app published to npm (agentic-sdk bundled inside)

## Security Architecture

### API Authentication

**Middleware:** `middleware.ts` (Edge Runtime)
- Constant-time comparison: `edgeSafeCompare()` (XOR-based, no timing leaks)
- API key validation on every request
- Configurable via `API_ACCESS_KEY` env var
- Public endpoints whitelisted (auth, tunnel, uploads GET)

### File Path Validation

**Function:** `validate-path-within-home-directory.ts`
- Blocks path traversal attacks (../)
- Ensures all operations stay within `$HOME`
- Called before file I/O operations

### Environment Variable Management

**Sensitive vars:** Never committed to git
- `.env` → Created locally by user (gitignored)
- `.env.example` → Template with example values
- `~/.claude/settings.json` → Fallback for API keys

**API Key Rotation:**
- Middleware reads `API_ACCESS_KEY` from `process.env` directly
- Changes take effect on next request (no restart)

## Performance Considerations

### Caching & Proxying

- **Token Caching** — In-memory prompt cache reduces API calls
- **File Checkpointing** — SDK checkpoints reduce context overhead
- **Database Indexing** — Drizzle indexes on `taskId`, `createdAt` for fast queries
- **Socket.io Binary** — Large payloads sent as binary for speed

### Concurrency

- **WAL Mode** — SQLite allows concurrent reads
- **Multiple Agents** — Agents run in parallel (managed by provider)
- **Async I/O** — All file ops non-blocking
- **Stream Processing** — Output streamed to frontend in chunks (not buffered)

### Resource Management

- **Shell Cleanup** — Background shells terminate on project close
- **Socket Cleanup** — HMR-safe socket retention prevents leaks
- **Memory Bounds** — Token cache has no limit (consider max size in production)
- **Graceful Shutdown** — SIGTERM handlers flush DB, close sockets

## Deployment Architecture

### Single Server

Main app (`server.ts`) runs on port 8556:
- Handles frontend requests
- Processes API calls
- Manages agent execution
- Streams via Socket.io

Optional: Agentic SDK on port 3100 (separate process).

### Production with PM2

**Config:** `ecosystem.config.cjs`
```javascript
module.exports = {
  apps: [
    {
      name: 'claude-ws',
      script: './server.ts',
      env: { NODE_ENV: 'production', PORT: 8556 },
      instances: 1,
      exec_mode: 'cluster',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
    }
  ]
};
```

**Start:** `pm2 start ecosystem.config.cjs`

### Cloudflare Tunnel

**Setup:** `/api/tunnel/setup` endpoint
- Creates tunnel from user's local machine to `<subdomain>.claude.ws`
- Uses Cloudflare `cloudflared` binary
- Allows remote access without port forwarding

## Agentic SDK: Canonical Import Path & Services

**Location:** `packages/agentic-sdk/`

### Purpose
Standalone Fastify server + shared service library providing REST + SSE API for programmatic access, CI/CD integration, and automation. The SDK barrel (`packages/agentic-sdk/src/index.ts`) is the **canonical import path** for all business logic.

### SDK Barrel Export Pattern

**File:** `packages/agentic-sdk/src/index.ts` (public API)

All services are factory functions returning method objects:

```typescript
import {
  createProjectService,
  createTaskService,
  createAttemptService,
  createCheckpointService,
  createFileService,
  createSearchService,
  createShellService,
  createCommandService,
  createAgentFactoryService,
  // ...and 15+ more services
} from '@agentic-sdk';

const projectService = createProjectService(db);
const task = await projectService.getById(projectId);
```

### All 11 API Domains Covered

| Domain | Services | Purpose |
|--------|----------|---------|
| **Projects** | `createProjectService` | Project CRUD, settings |
| **Tasks** | `createTaskService` | Task CRUD, reordering, attempts |
| **Attempts** | `createAttemptService` | Attempt CRUD, logs, creation |
| **Uploads** | `createUploadService` | File upload, decompression, tmp files |
| **Checkpoints** | `createCheckpointService`, `createCheckpointOperationsService` | Create/restore checkpoints, fork, rewind |
| **Files** | `createFileService`, `createFileOperationsService`, `createFileContentReadWriteService`, `createFileTreeAndContentService`, `createFileTreeBuilderService` | File read/write, operations, tree building |
| **Search** | `createSearchService`, `createFileSearchService`, `createChatHistorySearchService` | Content search, file search, history search |
| **Shells** | `createShellService` | Shell creation, management |
| **Commands** | `createCommandService` | Slash command discovery, listing |
| **Auth** | (integrated in middleware) | API key validation, verification |
| **Agent Factory** | `createAgentFactoryService`, `createAgentFactoryProjectSyncService`, `createAgentFactoryFilesystemService` | Plugin registry, sync, filesystem ops |

### 40+ Service Files (Business Logic Layer)

**Location:** `packages/agentic-sdk/src/services/`

All business logic lives here; Next.js routes are **thin proxies** that delegate to services:

```
services/
├── project-crud-service.ts
├── task-crud-and-reorder-service.ts
├── attempt-crud-and-logs-service.ts
├── attempt-file-upload-storage-service.ts
├── checkpoint-crud-and-rewind-service.ts
├── checkpoint-fork-and-rewind-operations-service.ts
├── filesystem-read-write-service.ts
├── file-operations-and-upload-service.ts
├── file-content-read-write-service.ts
├── file-tree-and-content-service.ts
├── file-tree-builder-service.ts
├── file-mime-and-language-constants.ts
├── content-search-and-file-glob-service.ts
├── file-search-and-content-search-service.ts
├── chat-history-search-service.ts
├── shell-process-db-tracking-service.ts
├── slash-command-listing-service.ts
├── force-create-project-and-task-service.ts
├── agent-factory-plugin-registry-service.ts
├── agent-factory-project-sync-and-install-service.ts
└── agent-factory-plugin-filesystem-operations-service.ts
```

### Route Pattern: Thin Proxies

**Next.js routes** (`src/app/api/*/route.ts`):
- Parse HTTP request (body, params, query)
- Call appropriate SDK service factory
- Return JSON response

**Example:**
```typescript
// src/app/api/tasks/[id]/route.ts (thin proxy)
import { createTaskService } from '@agentic-sdk';

export async function GET(req, { params }) {
  const service = createTaskService(db);
  const task = await service.getById(params.id);
  return Response.json({ task });
}
```

**Fastify routes** (`packages/agentic-sdk/src/routes/`):
- Same service calls, different transport
- Uses SSE (Server-Sent Events) instead of Socket.io
- Standalone server on port 3100

### Database Layer (Shared)

**Location:** `packages/agentic-sdk/src/db/`

- `database-schema.ts` — Drizzle ORM schema (source of truth)
- `database-connection.ts` — SQLite connection setup
- `database-init-tables.ts` — Table initialization SQL

**Main App Import:**
```typescript
// src/lib/db/schema.ts (re-export)
export { projects, tasks, attempts, ... } from '@agentic-sdk/db';
```

### Server Entry Points

#### Fastify (Headless API)
**File:** `packages/agentic-sdk/bin/server-entrypoint.ts`
- Pure REST + SSE, no Socket.io
- Registers CORS, multipart, auth plugins
- Mounts all service routes
- Port 3100 (configurable)

#### Next.js (Web UI)
**File:** `server.ts`
- Boots Next.js with custom HTTP server
- Initializes Socket.io for real-time updates
- Routes to SDK services via Next.js API
- Port 8556 (configurable)

### API Documentation
See `/api/docs` (Swagger endpoint) when running Fastify backend.

---

## Data Flow Diagram: Full Request Cycle

```
User clicks "Run Task" in UI
    ↓
React component calls fetch('/api/attempts', { prompt, taskId, ... })
    ↓
middleware.ts validates API key (or allows if none)
    ↓
server.ts routes to /api/attempts POST handler
    ↓
Handler calls createTaskService(db).createAttempt()
    ↓
Service creates Attempt record in DB
    ↓
agentManager.start(options) is called
    ↓
Provider (Claude CLI or SDK) is selected
    ↓
Provider spawns/initializes Claude execution
    ↓
Claude streams messages back to provider
    ↓
Provider emits events (message, tool_use, exit)
    ↓
Event wiring converts to agentManager events
    ↓
Each event:
  1. Stored to DB (logs, checkpoint, usage)
  2. Emitted via Socket.io to all connected clients
    ↓
Frontend Socket.io listener receives event
    ↓
React store (attempt-store) updates state
    ↓
Component re-renders with new output
    ↓
User sees live streaming response
```

**Headless Alternative (Agentic SDK):**
```
External tool calls GET /api/attempts/:id/stream (Fastify)
    ↓
Fastify routes through same shared services
    ↓
Service executes task
    ↓
Events streamed as Server-Sent Events (SSE)
    ↓
External tool processes newline-delimited JSON
```

This architecture enables real-time, responsive AI task execution with full audit trail and checkpoint/rewind capability, while supporting both web UI and headless automation.
