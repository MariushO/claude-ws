# Claude Workspace - Product Definition & Requirements

## What is Claude Workspace?

**Claude Workspace (claude-ws)** is a visual, local-first web application evolving from a unified development workspace into an **AI-powered business hub for solo CEOs and indie operators**. It provides a Kanban board for task management, an integrated code editor, Git integration, terminal access, real-time AI chat with Claude, and an expanding ecosystem of claw agents ([OpenClaw](https://openclaw.ai/)) for business automation—all in a single, cohesive interface powered by a local SQLite database.

## Product Vision

Enable solo founders and indie operators to **run their entire business from a single AI workspace** — not just code, but email, sales, marketing, customer support, calendar, and operations — all managed by AI agents. The workspace combines development tools with [claw agents](https://openclaw.ai/) that handle business tasks autonomously, turning one person into a full team.

**Target Users:**
- **Solo CEOs & Indie Hackers** — One-person businesses needing AI agents for all business functions
- **Developers** — Claude Code users needing persistent task tracking, code editing, and conversation management
- **Small Teams** — Growing teams adopting AI-first workflows across development and operations

---

## Features Overview

| Feature | Description | Status |
|---------|-------------|--------|
| **Kanban Board** | Drag-and-drop task management with columns (Todo, In Progress, In Review, Done, Cancelled). Full conversation history attached to each task. | Released |
| **Code Editor** | Multi-tab CodeMirror editor with syntax highlighting for 10+ languages (JS, TS, Python, Rust, Go, Java, C++, SQL, HTML, CSS, Markdown, YAML, PHP, XML). AI suggestions inline. | Released |
| **Git Integration** | Status, staging, committing, diff viewing, branch visualization, and conflict resolution with visual diff resolver modal. | Released |
| **Terminal** | Integrated terminal with shell restoration (survives server restarts), process management, rate limiting, and port detection. | Released |
| **Real-time Streaming** | Live Claude responses via Socket.io with chunked message delivery and progress indicators. | Released |
| **Checkpoints** | Save conversation state at any point and rewind to previous snapshots. Fork checkpoints to branch conversations. | Released |
| **Agent Factory** | Plugin system for custom skills and commands. Support for custom agents with dependency resolution. | Released |
| **Agentic SDK** | Standalone headless Fastify backend (REST + SSE) for programmatic access, CI/CD integration, and automation. | Released |
| **Search** | Full-text search across tasks, attempts, conversation history, and files. | Released |
| **Access Anywhere** | Remote access via Cloudflare Tunnels or ctunnel. API key authentication for secure headless access. | Released |
| **Internationalization (i18n)** | 8 language support: English, German, Spanish, French, Japanese, Korean, Vietnamese, Simplified Chinese. | Released |
| **Themes** | Light mode, Dark mode, VS Code Variants, Dracula theme. System preference detection. | Released |
| **Claw Agent Hub** | Adopt and manage OpenClaw agents for business tasks (email, calendar, social media, support). | Planned Q2 2026 |
| **Multi-Channel Inbox** | Unified messaging across WhatsApp, Slack, Discord, Teams, email via agent routing. | Planned Q2 2026 |
| **Workflow Automation** | Visual pipeline builder connecting agents for automated business operations. | Planned Q3 2026 |

---

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Frontend Framework** | Next.js | 16.1.6 |
| **UI Library** | React | 19.2.3 |
| **Backend (Main)** | Next.js API Routes + Custom Server | 16.1.6 |
| **Backend (Headless)** | Fastify | 5.8.2 |
| **Database** | SQLite + Drizzle ORM | better-sqlite3 12.6.2, Drizzle 0.45.1 |
| **Real-time Communication** | Socket.io | 4.8.3 |
| **SDK** | Claude Agent SDK | @anthropic-ai/claude-agent-sdk 0.2.42 |
| **State Management** | Zustand | 5.0.11 |
| **UI Components** | Radix UI + shadcn/ui | Various (dialog, dropdown, tabs, select, etc.) |
| **Styling** | Tailwind CSS | 4.1.18 |
| **Code Editor** | CodeMirror | 6.x via @uiw/react-codemirror 4.25.4 |
| **Terminal Emulator** | xterm.js | 6.0.0 |
| **Logging** | Pino | 10.3.1 |
| **Internationalization** | next-intl | 4.8.2 |
| **Icons** | Lucide React | 0.562.0 |
| **Themes** | next-themes | 0.4.6 |
| **Build Tool** | tsx (TypeScript executor) | 4.21.0 |

---

## Deployment Models

### 1. Quick Try (npx)
```bash
npx -y claude-ws
```
Fastest way to get started. Automatically downloads and runs the latest published version.

### 2. Global Installation
```bash
npm install -g claude-ws
claude-ws
```
Install as a global binary. Convenient for regular use. Works with `claude-workspace` alias too.

### 3. From Source
```bash
git clone https://github.com/Claude-Workspace/claude-ws.git
cd claude-ws
pnpm install
pnpm dev
```
Development mode with hot reloading. Requires Node.js 20+ and pnpm 9+.

### 4. Production (PM2)
```bash
npm install -g pm2 claude-ws
pm2 start claude-ws --name claudews --cwd /path/to/project
pm2 save && pm2 startup
```
Production-grade deployment with automatic restart and crash recovery. Store configuration in `.env`.

---

## Non-Functional Requirements

### Local-First Architecture
- All data stored in local SQLite database (`.data/claude-ws.db`)
- No cloud sync by default; can configure remote access via tunnels
- Database survives server restarts; shell sessions and running tasks are restored

### Real-time Streaming
- Socket.io push notifications for conversation updates, task changes, and log entries
- Message chunking for large responses (Anthropic API response streaming)
- Progressive UI updates during Claude responses

### Multi-language Support
Eight languages included: English, German, Spanish, French, Japanese, Korean, Vietnamese, Simplified Chinese. Uses `next-intl` for translation management via JSON files in `./locales/`.

### Database Schema
Dual-update pattern required:
- **Source of truth:** `src/lib/db/schema.ts` (Drizzle ORM definitions)
- **Runtime initialization:** `src/lib/db/index.ts` `initDb()` function (SQL ALTER TABLE for backward compatibility)

### API Authentication
- Optional API key authentication via `API_ACCESS_KEY` environment variable
- Header: `x-api-key: {value}`
- Timing-safe comparison to prevent timing attacks
- Public endpoints: `/api/auth/verify`, `/api/tunnel/status`, `/api/uploads/` (GET only)

### Error Handling
- Try-catch blocks for all async operations
- Proper HTTP status codes (401 for auth, 404 for not found, 500 for server errors)
- Detailed error logging via Pino logger with log levels (debug, info, warn, error)

### Logging
- Structured logging using Pino
- Log level configurable via `LOG_LEVEL` environment variable (debug for dev, warn for prod)
- Logger instances per module with context (e.g., `createLogger('AgentManager')`)

### Security Standards
- **Path Validation:** Path traversal prevention using `path.relative()` and explicit checks
- **Zip Slip Prevention:** Validate archive paths when extracting files
- **Command Injection:** Use parameterized commands and avoid shell interpolation for user input
- **Timing-Safe Comparison:** Use `safeCompare()` for API key and sensitive string matching
- **CORS:** Explicit origin allowlist (not wildcard)
- **Rate Limiting:** Terminal creation limited to 10 per minute per project

### Performance
- Database queries optimized with indexes on frequently used columns
- Socket.io message compression for large payloads
- CodeMirror syntax highlighting optimized for responsive editing
- Terminal emulator debounced for high-frequency updates
- Lazy loading for large file lists and conversation histories

---

## Environment Configuration

| Variable | Purpose | Default | Example |
|----------|---------|---------|---------|
| `PORT` | Server port | `8556` | `8556` |
| `ANTHROPIC_BASE_URL` | API endpoint (or proxy) | `https://api.anthropic.com` | Custom proxy URL |
| `ANTHROPIC_AUTH_TOKEN` | API authentication | — | sk-ant-... |
| `ANTHROPIC_MODEL` | Default Claude model | — | claude-sonnet-4-20250514 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus tier model | Fallback to `ANTHROPIC_MODEL` | claude-opus-4-6 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet tier model | Fallback to `ANTHROPIC_MODEL` | claude-sonnet-4-6 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku tier model | Fallback to `ANTHROPIC_MODEL` | claude-haiku-4-5-20251001 |
| `API_ACCESS_KEY` | Headless API key | (empty) | your-secret-key |
| `LOG_LEVEL` | Log verbosity | debug (dev) / warn (prod) | debug, info, warn, error |
| `DATA_DIR` | Database and data folder | User's CWD | `/var/lib/claude-ws` |
| `ANTHROPIC_API_RETRY_TIMES` | API retry attempts | `3` | 1-5 |
| `ANTHROPIC_API_RETRY_DELAY_MS` | Delay between retries | `10000` | 1000-60000 |

---

## Database Schema Highlights

### Core Tables
- **projects** — Workspace folders with metadata
- **tasks** — Kanban cards with status (todo, in_progress, in_review, done, cancelled)
- **attempts** — Claude execution records with prompts, status, and results
- **attemptLogs** — Real-time message log for each attempt (supports streaming)
- **checkpoints** — Conversation state snapshots for rewind/fork
- **shells** — Terminal sessions with process info and status tracking

### Agent Factory Tables
- **agentFactoryPlugins** — Registered custom agents/skills
- **projectPlugins** — Project-scoped plugin references
- **pluginDependencies** — Plugin dependency graph for resolution

### Operational Tables
- **appSettings** — App-level configuration (theme, language, layout)
- **subagents** — Spawned subagent process tracking

---

## API Architecture

### Next.js API Routes (Frontend)
- Located in `src/app/api/`
- Handle authentication, file uploads, Git operations, language definitions
- Delegate business logic to services from agentic-sdk
- Pattern: Service injection with Drizzle ORM database instance

### Agentic SDK Routes (Backend)
- Standalone Fastify server in `packages/agentic-sdk/`
- Pure REST + SSE (no Socket.io)
- Reusable services for task CRUD, agent execution, file operations
- Headless-first design for CI/CD and automation

### Real-time Communication
- Socket.io for live updates from server to client
- Events: `conversation-update`, `attempt-status`, `log-entry`, `task-changed`
- Namespace isolation for projects and attempts

---

## Key Design Patterns

### Zustand Store Pattern
Lightweight, single-source-of-truth state management per domain:
```typescript
interface State {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

export const useStore = create<State>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggleOpen: () => set((state) => ({ open: !state.open })),
}));
```

### Service Pattern
Encapsulate business logic in services, inject database:
```typescript
export function createTaskService(db: Database) {
  return {
    getById: (id: string) => db.query.tasks.findFirst({ where: eq(tasks.id, id) }),
    // ... other methods
  };
}
```

### Component Composition
React 19 functional components with hooks. Large components split into sub-components and utilities. Example: `file-tab-content.tsx` split into toolbar, markdown-view, and state-hook modules.

### Custom Hooks for Logic Extraction
Hooks (`use-*.ts` files) encapsulate stateful logic:
- `use-git-actions.ts` — Git operations
- `use-terminal-lifecycle.ts` — Terminal session management
- `use-prompt-keyboard.ts` — Input handling

---

## Success Metrics & Acceptance Criteria

| Criterion | Definition | Validation |
|-----------|-----------|-----------|
| **Functionality** | All features in the table above work as specified | Manual testing + automated tests |
| **Performance** | Page load <2s, editor response <100ms, Git operations <5s | Lighthouse audit, performance traces |
| **Reliability** | 99.9% uptime, graceful error recovery | Crash logs, error tracking |
| **Security** | No path traversal, timing-safe comparisons, CORS allowlist | OWASP Top 10 assessment, code review |
| **Usability** | Keyboard navigation, 8-language support, theme preference | Accessibility audit (A11y), user feedback |
| **Data Integrity** | Database transactions for critical ops, idempotent operations | Data consistency tests, rollback validation |

---

## Known Limitations & Constraints

- **Single-machine:** Database is local SQLite; no built-in multi-user concurrency (use tunnels for remote access)
- **Node.js 20+:** Requires modern Node.js for native modules (better-sqlite3, node-pty)
- **File size:** Large file editing (>10MB) may cause UI lag
- **Terminal:** Limited to Bash/Shell; custom shell support via environment variables
- **No claw agent support yet:** OpenClaw Gateway integration planned for Q2 2026
- **No multi-channel messaging:** Unified inbox planned for Q2 2026

---

## Related Documentation

- [README](../README.md) — Quick start, configuration, project structure
- [System Architecture](./system-architecture.md) — Component interaction, database schema, API design
- [Code Standards](./code-standards.md) — File naming, TypeScript conventions, component patterns
- [Project Roadmap](./project-roadmap.md) — Feature timeline, claw agent integration plans, version history
- [Cloudflare Tunnel Setup](./cloudflare-tunnel.md) — Remote access configuration

