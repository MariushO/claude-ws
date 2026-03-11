# Codebase Summary

Claude Workspace (v0.3.100) is a beautifully crafted workspace interface for Claude Code with real-time streaming, Kanban task management, and local SQLite database. It provides a visual workspace for managing Claude Code tasks with code editing, Git integration, agent factory plugins, and checkpointing.

## Top-Level Directory Layout

```
claude-ws/
├── bin/                    # Entry point scripts
├── src/                    # Next.js frontend + API routes
├── packages/agentic-sdk/   # Headless Fastify backend (REST + SSE)
├── public/                 # Static assets and swagger docs
├── drizzle/                # SQLite migrations
├── locales/                # i18n translations (8 languages)
├── scripts/                # Build and maintenance utilities
├── server.ts               # Custom Node HTTP server entry point
├── middleware.ts           # Next.js Edge middleware (auth + i18n)
├── next.config.ts          # Next.js configuration
├── tsconfig.json           # TypeScript configuration
├── pnpm-workspace.yaml     # pnpm monorepo config
├── drizzle.config.ts       # Drizzle ORM migration config
├── package.json            # Main package metadata
└── ecosystem.config.cjs    # PM2 process manager config
```

## src/ Structure

### App Directory (Next.js Pages & API Routes)

**`src/app/`** — Next.js app router with pages and API routes.

- **`[locale]/`** — Dynamic locale routing (8 supported languages: en, de, es, fr, ja, ko, vi, zh)
  - Layout, pages, workspace UI
- **`api/`** — REST endpoints organized by feature domain:
  - `agent-factory/` — Plugin discovery, project setup, file imports
  - `attempts/` — Task execution, logs, streaming
  - `auth/` — Authentication endpoints
  - `checkpoints/` — Conversation state snapshots
  - `git/` — Git operations
  - `shells/` — Background shell processes
  - `projects/` — Workspace projects CRUD
  - `tasks/` — Kanban task management
  - `terminal/` — Terminal emulation
  - `tunnel/` — Cloudflare tunnel setup
  - `uploads/` — File uploads
  - Other domains: code, commands, search, settings, models, etc.

### Components Directory (UI/UX)

**`src/components/`** — Organized by feature area (~20 subdirectories):

| Directory | Purpose |
|-----------|---------|
| `agent-factory/` | Plugin discovery and management UI |
| `auth/` | Login/logout forms |
| `claude/` | Agent execution and output display |
| `editor/` | CodeMirror tabbed editor |
| `header/` | Top navigation and control bar |
| `kanban/` | Board, columns, card UI |
| `questions/` | AskUserQuestion dialog |
| `search/` | File search and content search |
| `sidebar/` | Project sidebar navigation |
| `task/` | Kanban card details |
| `terminal/` | Terminal UI and shell integration |
| `workflow/` | Workflow visualization |
| `ui/` | Radix UI component wrappers (shadcn/ui) |
| `settings/` | User preferences |
| `providers/` | React context/provider setup |

**Total: ~25 component subdirectories with 100+ total component files**

### Lib Directory (Services & Utilities)

**`src/lib/`** — 45+ core service modules organized by domain:

| Module | Purpose |
|--------|---------|
| **Agent Execution** | |
| `agent-manager.ts` | Orchestrator delegating to providers (CLI/SDK) |
| `providers/` | Provider registry (Claude CLI, SDK providers) |
| `agent-event-wiring.ts` | Event wiring from providers to frontend |
| `agent-output-handler.ts` | JSON/structured output parsing |
| **Data Persistence** | |
| `db/` | Drizzle ORM schema and initialization |
| `checkpoint-manager.ts` | Conversation state snapshots |
| `session-manager.ts` | Agent session tracking |
| **File & Code** | |
| `file-to-attachment.ts` | File upload handling |
| `file-processor.ts` | File content processing |
| `dependency-resolver.ts` | NPM dependency analysis |
| `component-file-generator.ts` | Auto-generate component files |
| `diff-generator.ts` | Unified diff generation |
| **System Integration** | |
| `shell-manager.ts` | Subprocess management |
| `terminal-manager.ts` | Terminal emulation |
| `git-snapshot.ts` | Git status and history |
| `workflow-tracker.ts` | Background workflow tracking |
| **Proxy & Caching** | |
| `anthropic-proxy-setup.ts` | API proxy with token caching |
| `proxy-token-cache.ts` | Token cache implementation |
| **Real-time Communication** | |
| `socket-service.ts` | Socket.io client singleton |
| `attempt-waiter.ts` | Promise-based attempt waiting |
| **Utilities** | |
| `models.ts` | Model registry and display names |
| `logger.ts` | Pino-based logging |
| `utils.ts` | General utilities |
| `i18n.ts` | i18n setup |
| `validate-path-within-home-directory.ts` | Security validation |

### Stores Directory (State Management)

**`src/stores/`** — 24 Zustand stores for client-side state:

| Store | Purpose |
|-------|---------|
| `attempt-store.ts` | Active attempt state, logs |
| `task-store.ts` | Task CRUD and UI state |
| `project-store.ts` | Project selection, metadata |
| `shell-store.ts` | Active shells list |
| `terminal-store.ts` | Terminal sessions |
| `sidebar-store.ts` | Sidebar collapse/expand |
| `settings-ui-store.ts` | User preferences UI |
| `auth-store.ts` | Login status and user info |
| `agent-factory-store.ts` | Plugin registry |
| `agent-factory-ui-store.ts` | Plugin UI state |
| `model-store.ts` | Selected model |
| `context-mention-store.ts` | File context mentions |
| `attachment-store.ts` | File attachments |
| `questions-store.ts` | AskUserQuestion state |
| `workflow-store.ts` | Workflow metadata |
| `right-sidebar-store.ts` | Right panel state |
| `panel-layout-store.ts` | Panel resize state |
| `floating-windows-store.ts` | Floating window positions |
| `inline-edit-store.ts` | Inline code editor |
| `locale-store.ts` | Language selection |
| `running-tasks-store.ts` | Task execution tracking |
| `interactive-command-store.ts` | Interactive command state |
| `tunnel-store.ts` | Tunnel configuration |

### Hooks Directory (Custom React Hooks)

**`src/hooks/`** — 13 custom hooks for data fetching and side effects:

- `use-active-project.ts` — Get/set active project
- `use-attempt-socket.ts` — Socket.io connection for attempts
- `use-attempt-stream.ts` — Server-sent events streaming
- `use-chat-history-search.ts` — Search in conversation history
- `use-file-sync.ts` — Sync files with filesystem
- `use-socket.ts` — Generic socket.io wrapper
- `use-inline-edit.ts` — Inline code editing
- `use-mobile-viewport.ts` — Responsive design helper
- `use-resizable.ts` — Drag-to-resize panels
- `use-escape-close.ts` — ESC key handler
- `use-toast.ts` — Toast notifications
- `use-touch-detection.ts` — Mobile touch detection
- `use-attempt-questions.ts` — Question dialog handling

## packages/agentic-sdk Structure

**Shared service library + standalone Fastify backend** — REST + SSE API without Socket.io or UI.

### Agentic SDK src/

```
packages/agentic-sdk/src/
├── agent/                          # Agent lifecycle and execution
│   ├── claude-sdk-agent-provider.ts
│   ├── agent-lifecycle-manager.ts
│   └── claude-sdk-message-to-output-adapter.ts
├── routes/                         # REST endpoint definitions (thin proxies)
│   ├── attempt-routes.ts
│   ├── attempt-sse-routes.ts
│   ├── file-routes.ts
│   ├── project-routes.ts
│   ├── search-routes.ts
│   ├── task-routes.ts
│   ├── shell-routes.ts
│   ├── checkpoint-routes.ts
│   ├── upload-routes.ts
│   ├── command-routes.ts
│   └── agent-factory-routes.ts
├── services/                       # 40+ Business logic services
│   ├── project-crud-service.ts
│   ├── task-crud-and-reorder-service.ts
│   ├── attempt-crud-and-logs-service.ts
│   ├── attempt-file-upload-storage-service.ts
│   ├── checkpoint-crud-and-rewind-service.ts
│   ├── checkpoint-fork-and-rewind-operations-service.ts
│   ├── filesystem-read-write-service.ts
│   ├── file-operations-and-upload-service.ts
│   ├── file-content-read-write-service.ts
│   ├── file-tree-and-content-service.ts
│   ├── file-tree-builder-service.ts
│   ├── file-mime-and-language-constants.ts
│   ├── content-search-and-file-glob-service.ts
│   ├── file-search-and-content-search-service.ts
│   ├── chat-history-search-service.ts
│   ├── shell-process-db-tracking-service.ts
│   ├── slash-command-listing-service.ts
│   ├── force-create-project-and-task-service.ts
│   ├── agent-factory-plugin-registry-service.ts
│   ├── agent-factory-project-sync-and-install-service.ts
│   └── agent-factory-plugin-filesystem-operations-service.ts
├── db/                             # Database (shared from main)
│   ├── database-schema.ts
│   ├── database-connection.ts
│   └── database-init-tables.ts
├── config/                         # Configuration
│   └── env-config.ts
├── lib/                            # Utilities
│   ├── pino-logger.ts
│   ├── claude-available-models.ts
│   └── timing-safe-compare.ts
├── plugins/                        # Fastify plugins
│   ├── fastify-auth-plugin.ts
│   └── fastify-error-handler-plugin.ts
├── index.ts                        # Public barrel export (canonical import path)
├── fastify-app-setup.ts            # Fastify server factory
└── app-factory.ts                  # App bootstrap
```

**Key characteristics:**
- **Canonical imports:** All business logic accessed via `@agentic-sdk` barrel export
- **Factory pattern:** `createXService(db?)` returns method objects
- **Shared across:** Both Next.js routes and Fastify backend delegate to same services
- **All 11 API domains:** Projects, Tasks, Attempts, Uploads, Checkpoints, Files, Search, Shells, Commands, Auth, Agent Factory
- **Server-Sent Events:** SSE streaming for headless API (not Socket.io)
- **Standalone Fastify:** Port 3100, pure REST + SSE, no UI
- **Shared database:** Same schema and tables as main Next.js app

## Locales Directory

**`locales/`** — 8 JSON files for internationalization:

- `en.json` (English)
- `de.json` (German)
- `es.json` (Spanish)
- `fr.json` (French)
- `ja.json` (Japanese)
- `ko.json` (Korean)
- `vi.json` (Vietnamese)
- `zh.json` (Chinese)

Strings organized by feature domain for easy lookup.

## Drizzle Directory

**`drizzle/`** — SQLite migrations:

- `0000_low_gressill.sql` — Initial schema
- `0001_calm_thunderbolt_ross.sql` — Schema update 1
- `0002_smooth_magneto.sql` — Schema update 2
- `meta/` — Migration metadata

Generated by `drizzle-kit` from `src/lib/db/schema.ts`.

## Scripts Directory

**`scripts/`** — Build and maintenance utilities:

| Script | Purpose |
|--------|---------|
| `check-dependencies.sh` | Validate all imports are in `dependencies` not `devDependencies` |
| `db-fix-columns.ts` | Repair/add missing database columns |
| `test-package.sh` | Test npm package locally |
| `update-swagger-server.sh` | Regenerate Swagger docs |

## Key Configuration Files

| File | Purpose |
|------|---------|
| `server.ts` | Custom Node HTTP server: loads .env, initializes Anthropic proxy, boots Next.js, sets up Socket.io |
| `middleware.ts` | Next.js Edge middleware: validates API keys, handles i18n routing |
| `next.config.ts` | Next.js build config (webpack, env, experimental features) |
| `tsconfig.json` | TypeScript strict mode with path aliases (@/) |
| `drizzle.config.ts` | Drizzle ORM: SQLite driver, schema path, migrations |
| `pnpm-workspace.yaml` | Monorepo: root + agentic-sdk package |
| `.env.example` | Template for environment variables |
| `ecosystem.config.cjs` | PM2 config for production process management |

## Database Schema (SQLite with Drizzle ORM)

**Located in:** `packages/agentic-sdk/src/db/database-schema.ts`
**Re-exported from:** `src/lib/db/schema.ts` (for backward compatibility)

Core tables:

- `projects` — Workspace projects
- `tasks` — Kanban board cards
- `attempts` — Agent execution records
- `attemptLogs` — Streaming output chunks
- `attemptFiles` — Uploaded file attachments
- `checkpoints` — Conversation state snapshots
- `shells` — Background shell processes
- `subagents` — Spawned subagents
- `agentFactoryPlugins` — Plugin registry
- `projectPlugins` — Project-specific plugins
- `pluginDependencies` — Plugin dependency tree
- `pluginDependencyCache` — Dependency resolution cache
- `appSettings` — Global app configuration

All tables include `createdAt` timestamps and use Drizzle indexes for performance.

## Build & Runtime

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Start Next.js dev server with custom server |
| `pnpm build` | Build Next.js for production |
| `pnpm start` | Start production server |
| `pnpm db:generate` | Generate Drizzle migration files |
| `pnpm agentic-sdk:dev` | Watch and rebuild agentic-sdk |
| `pnpm agentic-sdk:start` | Start agentic-sdk in production |

**Ports:**
- Main app: 8556 (configurable via PORT env)
- Agentic SDK: 3100 (configurable)

## Summary Statistics

| Category | Count |
|----------|-------|
| API endpoint domains | 20+ |
| Component directories | ~25 |
| Core lib modules | 45+ |
| Zustand stores | 24 |
| Custom hooks | 13 |
| Supported languages | 8 |
| Database tables | 13 |
| Migration files | 3 |

This is a large, feature-rich application with clear separation of concerns: frontend UI (components + stores + hooks), backend orchestration (agent-manager + providers), data layer (database + schemas), and a headless API server (agentic-sdk).
