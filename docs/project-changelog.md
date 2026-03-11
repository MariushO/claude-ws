# Project Changelog

Record of significant changes, features, and fixes to Claude Workspace.

## [2026-03-11] Agentic SDK Barrel Export — Canonical Import Path

**Status:** Complete | **Impact:** High | **Documentation**

### Overview
Established SDK barrel (`packages/agentic-sdk/src/index.ts`) as canonical import path for all business logic. All 11 API domains now route through SDK services with consistent factory pattern: `createXService(db?)` returning method objects.

### Services Exported
- **Projects:** `createProjectService` — CRUD, settings
- **Tasks:** `createTaskService` — CRUD, reordering, attempts
- **Attempts:** `createAttemptService` — CRUD, logs, creation setup
- **Uploads:** `createUploadService` — File upload, decompression, tmp files
- **Checkpoints:** `createCheckpointService`, `createCheckpointOperationsService` — Create/restore, fork, rewind
- **Files:** 5 services — `createFileService`, `createFileOperationsService`, `createFileContentReadWriteService`, `createFileTreeAndContentService`, `createFileTreeBuilderService`
- **Search:** 3 services — `createSearchService`, `createFileSearchService`, `createChatHistorySearchService`
- **Shells:** `createShellService` — Creation, management
- **Commands:** `createCommandService` — Slash command discovery
- **Agent Factory:** 3 services — `createAgentFactoryService`, `createAgentFactoryProjectSyncService`, `createAgentFactoryFilesystemService`

### Architecture Improvement
- **40+ service files** in `packages/agentic-sdk/src/services/`
- All business logic centralized; Next.js routes reduced to thin proxies
- Fastify backend reuses same services (different transport)
- Single source of truth for each API domain

### Documentation
- Updated `system-architecture.md` — SDK barrel pattern, route delegation, all 11 domains
- Updated `codebase-summary.md` — 40+ services, factory pattern, shared architecture

---

## [2026-03-11] Major Migration: All API Routes → Agentic-SDK

**Status:** Complete | **Impact:** High | **Breaking:** No

### Overview
Completed comprehensive migration of all 11 API domains to delegate through `packages/agentic-sdk` services. Next.js API routes are now thin proxies that route requests to SDK services, establishing a clear separation: Next.js routes → SDK services → DB/filesystem.

### Changes Made

#### New SDK Service Files (6)
- `chat-history-search-service.ts` — Search across attempt prompts and logs
- `checkpoint-fork-and-rewind-operations-service.ts` — Fork tasks, copy attempts/checkpoints, rewind with cleanup
- `file-operations-and-upload-service.ts` — Delete, download, create, rename files/dirs; upload with decompression
- `file-search-and-content-search-service.ts` — File name search, fuzzy search, grep-like content search
- `agent-factory-plugin-filesystem-operations-service.ts` — Plugin file listing, read/write, discovery, comparison
- `agent-factory-project-sync-and-install-service.ts` — Project plugin sync, install, uninstall

#### Enhanced Existing SDK Services (7)
- `attempt-crud-and-logs-service.ts` — Added `createWithSetup()`, `getProjectForTask()`, `getFormattedLogs()`
- `project-crud-service.ts` — Added `getSettings()`, `updateSettings()`
- `task-crud-and-reorder-service.ts` — Enhanced `remove()` with upload dir cleanup
- `attempt-file-upload-storage-service.ts` — Added `uploadToTmp()`, `findFileById()`, `deleteTmpFile()`, `readFileBuffer()`
- `slash-command-listing-service.ts` — Added skills scanning
- `agent-factory-plugin-registry-service.ts` — Added 10+ new methods
- `checkpoint-crud-and-rewind-service.ts` — (unchanged, new ops in separate file)

#### Route Files Refactored (30+)
All Next.js route handlers in `src/app/api/` converted to thin proxies:
- `/api/attempts/*` → Delegates to `attempt-crud-and-logs-service.ts`
- `/api/projects/*` → Delegates to `project-crud-service.ts`
- `/api/tasks/*` → Delegates to `task-crud-and-reorder-service.ts`
- `/api/checkpoints/*` → Delegates to checkpoint services
- `/api/files/*` → Delegates to file operation services
- `/api/search/*` → Delegates to search services
- `/api/shells/*` → Delegates to shell service
- `/api/uploads/*` → Delegates to upload service
- `/api/commands/*` → Delegates to command service
- `/api/agent-factory/*` → Delegates to agent factory services
- `/api/auth/*` → Delegates to auth service

#### Files Deleted
- `checkpoint-fork-helpers.ts` — Logic consolidated into `checkpoint-fork-and-rewind-operations-service.ts`

#### Code Quality
- Zero new TypeScript errors introduced
- All route handlers pass type checking
- Service layer maintains backward compatibility
- No breaking API changes

### Architecture Impact

**Before:**
- Business logic scattered across Next.js route handlers and scattered service modules
- API domains had inconsistent patterns
- Difficult to reuse logic in Fastify backend

**After:**
- Clear separation: Routes (thin) → Services (business logic) → DB/filesystem
- Single source of truth for each API domain in SDK services
- Easy to reuse services in both Next.js and Fastify
- Consistent error handling and validation across all routes

### Testing & Validation
- All existing API tests pass
- Route handlers properly delegate to services
- No regression in functionality
- Performance unchanged (service layer adds minimal overhead)

### Documentation Updates
- Updated `system-architecture.md` with new API route pattern
- Updated `codebase-summary.md` with SDK services list
- Updated `docs/agentic-sdk.md` with new service files

### Migration Path for Future Features
- New API endpoints: implement service in SDK first, then wire in Next.js route
- New business logic: always place in services layer, never in route handlers
- Bug fixes: fix in service layer, routes automatically updated

---

## [2026-03-10] Checkpoint & Rewind Refactoring

**Status:** Complete | **Impact:** Medium

- Separated checkpoint operations into dedicated service files
- Improved rewind cleanup logic
- Better error handling for missing checkpoints

---

## [2026-03-05] File Operations Consolidation

**Status:** Complete | **Impact:** Medium

- Unified file delete, create, rename logic into single service
- Added support for directory operations
- Improved error messages for file conflicts

---

## [2026-02-28] Agent Factory Plugin System

**Status:** Complete | **Impact:** High | **New Feature**

- Plugin registry for discovering and managing Claude Agent SDK plugins
- Project-level plugin synchronization
- Plugin dependency resolution
- Filesystem-based plugin file operations

---

## [2026-02-15] Initial Release v0.3.100

**Status:** Complete

- Next.js frontend with Kanban board
- SQLite database with Drizzle ORM
- Socket.io real-time streaming
- Agentic SDK Fastify backend
- 8-language i18n support
- Cloudflare tunnel integration
- Agent execution with Claude SDK/CLI providers
