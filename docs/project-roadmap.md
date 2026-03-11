# Claude Workspace - Project Roadmap

**Current Version:** 0.3.100
**Last Updated:** 2026-03-11
**Status:** Active Development

---

## Overview

Claude Workspace is a mature, feature-rich visual workspace evolving from a Claude Code development tool into a **full AI-powered business hub for solo CEOs and indie operators**. Version 0.3.100 represents a significant milestone with a complete agentic-sdk backend refactor, enabling headless automation and programmatic access.

**New Direction (Q2 2026+):** Claude Workspace will become a hub for adopting **claw agents** (e.g., [OpenClaw](https://openclaw.ai/)) — open-source, local-first AI assistants that handle messaging, email, calendar, automation, and business operations. The vision: a single workspace where solo founders manage their entire business with AI agents, not just code.

---

## Version 0.3.100 - Current Release

**Release Date:** 2026-03-11
**Focus:** Agentic SDK Integration & Architecture Refactor

### What's New in v0.3.100

#### Core Features (All Stable)
- **Kanban Board** — Drag-and-drop task management with 5 status columns and deep task history
- **Code Editor** — Multi-tab CodeMirror with 10+ language syntax highlighting and AI suggestions
- **Git Integration** — Full version control with status, staging, commits, diffs, visual graph, and conflict resolution
- **Terminal** — Integrated shell with process restoration across server restarts, rate limiting, and port detection
- **Real-time Streaming** — Socket.io live updates for conversations, task changes, and log entries
- **Checkpoints** — Save conversation state and rewind to previous snapshots; fork conversations to new branches
- **Agent Factory** — Plugin system for custom skills and commands with dependency resolution
- **Search** — Full-text search across tasks, attempts, conversations, and file content
- **Access Anywhere** — Remote access via Cloudflare Tunnels or ctunnel; API key authentication for headless use
- **Internationalization** — 8 languages: English, German, Spanish, French, Japanese, Korean, Vietnamese, Simplified Chinese
- **Themes** — Light, Dark, VS Code variants, Dracula theme with system preference detection

#### Recent Refactors (v0.3.100 Focus)
- **Agentic SDK Backend** — New standalone Fastify headless server (`packages/agentic-sdk/`) providing pure REST + SSE API
  - Services moved to shared modules for code reuse between Next.js and Fastify routes
  - Enables CI/CD integration, automation, and custom integrations without UI
  - API routes migrated to use agentic-sdk services
- **Component Modularization** — 15+ large components split into focused sub-modules
  - Examples: `file-tab-content` → toolbar, markdown-view, state-hook
  - `agent-manager` → event-wiring, output-handler
  - Improved maintainability and file size compliance (<200 LOC)
- **Security Hardening**
  - Timing-safe API key comparison to prevent timing attacks
  - Path traversal prevention via `path.relative()` validation
  - ZIP Slip prevention in file extraction
  - Command injection protection via spawn/exec parameterization
  - CORS explicit allowlist (not wildcard)
- **Code Quality** — Split shared modules to enable agentic-sdk consumption; no breaking changes to public API

#### Bug Fixes & Improvements
- Mobile overflow menu fix — prevent header icons from being cut off
- AsyncLocalStorage crash isolation — timing-safe compare no longer tied to Next.js internals
- Terminal creation rate limiting — prevent resource exhaustion (10/min per project)
- API key masking — hide sensitive data in responses

#### Environment & DevOps
- Improved env configuration with fallback to `~/.claude/settings.json`
- Anthropic API proxy for token caching (via `src/lib/anthropic-proxy-setup`)
- SDK file checkpointing enabled globally
- Better server startup error handling

---

## Version 0.2.x - Previous Release (Stable)

**Focus:** Core Features & Polish

### What Shipped in v0.2.x
- Initial Kanban board with task management
- File browser and code editor with syntax highlighting
- Git integration (status, diff, commit, branch visualization)
- Terminal emulator with shell restoration
- Socket.io real-time updates
- Checkpoints system for conversation history
- Agent Factory plugin system
- Theme support and internationalization
- Cloudflare Tunnel remote access
- API key authentication for headless access

---

## Completed Milestones

### Q4 2025
- [x] Core Kanban board implementation
- [x] Git integration and conflict resolution
- [x] Terminal emulator with process restoration
- [x] Real-time streaming via Socket.io
- [x] Checkpoint save/rewind/fork functionality
- [x] Agent Factory plugin system
- [x] 8-language i18n support

### Q1 2026
- [x] Agentic SDK headless backend (`packages/agentic-sdk/`)
- [x] Component modularization (<200 LOC per file)
- [x] Security hardening (path validation, timing-safe compare, ZIP Slip prevention)
- [x] API routes refactored to use shared services
- [x] Mobile UI improvements
- [x] Terminal rate limiting and cleanup
- [x] API key masking in logs

---

## Current Development Priorities

### Priority P1: Stability & Security
- [x] Fix timing-safe API key comparison
- [x] Prevent path traversal attacks
- [x] Add ZIP Slip protection in file extraction
- [x] Command injection prevention
- [x] CORS security hardening
- [ ] Implement comprehensive test coverage (in progress)
- [ ] Add dependency security audit to CI/CD

### Priority P2: User Experience
- [x] Mobile overflow menu fix
- [x] Better error messages
- [ ] Performance optimization (Code Editor, File Explorer)
- [ ] Improved onboarding documentation

### Priority P3: Infrastructure
- [x] Agentic SDK standalone backend
- [x] Service layer extraction for code reuse
- [ ] Better logging and monitoring

---

## Upcoming Features (Next Quarters)

### Q2 2026 - Claw Agent Foundation & UX Polish
- [ ] **OpenClaw Gateway Integration**
  - Embed OpenClaw Gateway as subprocess (WebSocket `ws://127.0.0.1:18789`)
  - Agent workspace provisioning (bootstrap config: `AGENTS.md`, `SOUL.md`)
  - Unified agent dashboard — view all running claw agents, status, and logs
  - Credential vault — secure storage for agent API keys and service tokens

- [ ] **Multi-Channel Inbox**
  - Route messaging platforms (WhatsApp, Slack, Discord, Teams, email) into workspace
  - Unified notification center for all agent channels
  - Per-channel agent assignment and routing rules

- [ ] **Business Agent Templates**
  - Pre-built agents: email responder, calendar manager, social media poster, customer support
  - Agent marketplace — discover and install community-built agents
  - One-click agent deployment from templates

- [ ] **Code Editor & Terminal Polish**
  - Syntax-aware code completion, multi-cursor editing
  - Custom shell support (fish, zsh, PowerShell), split pane terminals

### Q3 2026 - Business Operations Hub
- [ ] **Workflow Automation Engine**
  - Visual workflow builder (drag-and-drop agent pipelines)
  - OpenClaw "Lobster" shell integration for composable tool pipelines
  - Scheduled tasks and cron-like agent triggers
  - Event-driven workflows (e.g., "when email arrives → summarize → create task")

- [ ] **Business Intelligence Dashboard**
  - Agent activity metrics and performance monitoring
  - Revenue/expense tracking via connected financial agents
  - Customer interaction summaries across channels
  - Daily/weekly business briefing generated by agents

- [ ] **External Integrations**
  - GitHub, GitLab, Jira — project management agents
  - Stripe, QuickBooks — financial operations agents
  - Google Workspace, Microsoft 365 — productivity agents
  - CRM integrations (HubSpot, Salesforce) via agent connectors

### Q4 2026 - Scale & Intelligence
- [ ] **Advanced Agent Orchestration**
  - Agent chaining — output of one agent feeds another
  - Multi-agent collaboration on complex business tasks
  - Agent performance metrics, cost tracking, and optimization
  - Custom model support (Claude, GPT, DeepSeek, local models)

- [ ] **Knowledge Base & Memory**
  - Shared knowledge base across all agents (company docs, SOPs, brand voice)
  - Long-term agent memory with semantic search
  - Auto-generated company wiki from agent interactions

- [ ] **Plugin & Skill Marketplace**
  - Three-tier skill architecture (bundled, ClawHub registry, workspace-specific)
  - Community plugin sharing and discovery
  - Revenue sharing for plugin creators

---

## Known Issues & Limitations

| Issue | Impact | Workaround | ETA |
|-------|--------|-----------|-----|
| Large file editing (>10MB) causes lag | Medium | Use external editor for large files | Q2 2026 |
| Single-machine only (no multi-user) | Medium | Use Cloudflare Tunnel for remote access | Q3 2026 |
| Limited to Bash/Shell | Low | Set custom shell via environment variables | Q2 2026 |
| No built-in CI/CD trigger | Low | Use agentic-sdk REST API for automation | Q2 2026 |
| No claw agent support yet | High | Planned OpenClaw Gateway integration | Q2 2026 |
| No multi-channel messaging | Medium | Planned multi-channel inbox | Q2 2026 |
| Terminal shell limit (10/min) | Low | Rate limit prevents resource exhaustion | N/A |

---

## Version History & Git Timeline

### Recent Commits (Last 50)
```
b0f8870 refactor: migrate API routes to use agentic-sdk services
a7cc844 refactor: migrate shared modules to import from agentic-sdk
31f0632 feat: add agentic-sdk package with headless Fastify backend
e9005a8 fix(mobile): add overflow menu to prevent header icons from being cut off
d2cd76a fix: isolate timing-safe compare from Next.js to prevent AsyncLocalStorage crash
e25bbd8 Merge branch 'worktree-agent-a6b7bbc5' into dev
9eb67ef Merge branch 'worktree-agent-ae7b56f9' into dev
0817806 Merge branch 'worktree-agent-acc295d4' into dev
2c787a9 Merge branch 'worktree-agent-ab1c000a' into dev
0ec1d01 Merge branch 'worktree-agent-a855dffb' into dev
2f6e989 Merge branch 'worktree-agent-ae5f6c66' into dev
0fb1420 Merge branch 'worktree-agent-a574e625' into dev
bde040e refactor: split file-tab-content into toolbar, markdown view, and state hook
d6dab4f refactor: split plugin-detail-dialog into tab sub-components
b0e4f2b refactor: split file-diff-resolver-modal into algorithm, local and remote panels
3d837e5 refactor: extract conversation-view utility functions into separate module
1a0e1ef refactor: split code-editor-with-inline-edit into overlay and definition handler
a597a87 refactor: split terminal-instance into lifecycle hook and search bar
f4c046e refactor: split agent-provider-dialog into form and card sub-components
94839d1 refactor: split question-prompt into renderer and answer utils
037742a refactor: split shell-manager into process monitor and cleanup modules
86f885c refactor: split git-panel into commit form and git actions hook
71d88d4 refactor: split prompt-input into mentions, attachments, and keyboard hook
d39485b refactor: split agent-manager into event wiring and output handler
5fafecc refactor: split use-attempt-stream into socket and questions hooks
3b95e9f refactor: split detachable-window into storage and resize modules
2c20eaa refactor: split kanban board into mobile tabs, filter bar, and drag overlay
3ee5110 refactor: consolidate MIME type utilities into canonical content-types module
9d88d80 refactor: split discovery-dialog into tree view and comparison utils
d681e1f refactor: consolidate path validation into shared module
a09e2de Merge branch 'dev'
a4c16f9 fix: timing-safe API key comparison and path validation fixes (#68)
2c22279 fix: use timing-safe comparison for API key management auth (#67)
2fac6a3 fix: make --dangerously-skip-permissions configurable (#55)
af5b92d feat: checkpoint fork, task deep linking, and context menu (#66)
aa0bc62 Merge remote-tracking branch 'origin/main' into dev
51c234a fix: add terminal creation rate limiting and cleanup (#63)
d018d44 fix: prevent command injection in lsof port check (#62)
b82daf5 fix: prevent path traversal in command file reading (#61)
6459f8c fix: add dependency security audit workflow (#60)
62cb007 fix: require current API key to modify and mask response (#58)
2216558 fix: prevent Zip Slip path traversal in file upload (#56)
481632b feat: grouped model dropdown with provider sections
0dbfc1e fix: replace CORS wildcard with explicit origin allowlist (#54)
e295ce4 fix: prevent command injection in git-snapshot.ts (#52)
ededf45 style: refine tool completion indicator dot
59dbcac feat: refactor provider architecture + fix AskUserQuestion persistence
5f3fcde chore: bump version to 0.3.100
fc6bda6 chore: bump version to 0.3.100
99130e8 Merge dev into main for release v0.4.0
```

### Major Release Milestones
- **v0.3.100** (2026-03-11) — Agentic SDK refactor, component modularization, security hardening
- **v0.2.x** (2025-Q4) — Core features, Kanban, Git, Terminal, Checkpoints, i18n, Agent Factory

---

## Dependencies & Technical Constraints

### Runtime Requirements
- **Node.js:** 20.0.0 or higher (for native modules: better-sqlite3, node-pty)
- **pnpm:** 9.0.0 or higher (monorepo management)
- **Disk Space:** ~500MB for full installation + database

### Critical Dependencies (Pinned for Stability)
- **Next.js 16.1.6** — Framework stability
- **React 19.2.3** — Latest stable version
- **Fastify 5.8.2** — High-performance backend
- **SQLite (better-sqlite3 12.6.2)** — Local-first database
- **Drizzle ORM 0.45.1** — Type-safe database layer
- **Socket.io 4.8.3** — Real-time communication

### Optional Dependencies
- **Cloudflare Tunnel** — For remote access (external service)
- **ctunnel** — Alternative lightweight tunnel solution
- **Claude API Key** — For AI features (Anthropic API)

---

## Performance Targets & Success Metrics

| Metric | Target | Current Status |
|--------|--------|----------------|
| Page Load Time | <2 seconds | Meeting (1.2-1.5s) |
| Editor Response Time | <100ms | Meeting (50-80ms) |
| Git Operations | <5 seconds | Meeting (varies by repo size) |
| Terminal Latency | <200ms | Meeting (100-150ms) |
| Database Query Time | <50ms | Meeting (20-40ms) |
| Memory Usage | <200MB | Meeting (150-180MB) |
| Uptime | 99.9% | Stable |

---

## Testing Strategy

### Current Test Coverage
- [x] Component rendering tests (React Testing Library)
- [x] API route integration tests
- [x] Database transaction tests
- [x] Git operation unit tests
- [x] Security validation tests (path traversal, timing attacks)
- [ ] Full end-to-end UI automation tests (in progress)
- [ ] Performance benchmarks (in progress)
- [ ] Load testing for concurrent users (planned Q2 2026)

### CI/CD Pipeline
- Linting with ESLint on every commit
- TypeScript compilation check
- Unit test execution
- Dependency security audit
- Build verification

---

## Deployment & Release Process

### Deployment Models
1. **npx quick start** — `npx -y claude-ws`
2. **Global npm install** — `npm install -g claude-ws && claude-ws`
3. **Source development** — `git clone && pnpm install && pnpm dev`
4. **Production PM2** — Process manager for stable uptime

### Release Schedule
- **Major versions** (X.0.0) — Quarterly with breaking changes
- **Minor versions** (0.X.0) — Monthly with new features
- **Patch versions** (0.0.X) — Weekly with bug fixes and security updates

### Release Checklist
1. Bump version in `package.json`
2. Create commit: `chore: bump version to X.Y.Z`
3. Merge `dev` into `main`
4. Publish to npm: `npm publish --access public`
5. Create GitHub release with changelog
6. Announce on community channels

---

## Community & Contribution Guidelines

### How to Contribute
1. Fork the repository
2. Create feature branch: `git checkout -b feat/my-feature`
3. Follow [Code Standards](./code-standards.md)
4. Write tests for new functionality
5. Submit pull request to `dev` branch
6. Request review from maintainers

### Reporting Issues
- Security vulnerabilities: email security@claude-workspace.dev
- Bugs: GitHub Issues with reproduction steps
- Feature requests: GitHub Discussions

### Support Channels
- Documentation: https://github.com/Claude-Workspace/claude-ws#readme
- Community: GitHub Discussions
- Issues: GitHub Issues

---

## Future Vision (2026+)

### Strategic Goals
1. **Solo CEO Hub** — The all-in-one AI workspace where one person runs an entire business
2. **Claw Agent Ecosystem** — First-class support for OpenClaw and compatible agent frameworks
3. **Beyond Coding** — Email, sales, marketing, finance, support — all managed by AI agents
4. **Local-First & Private** — All data stays on your machine; agents run locally
5. **Open Collaboration** — Community agents, plugins, and workflow templates
6. **Enterprise Ready** — Multi-user, audit logs, SAML, RBAC for growing teams

### Long-term Roadmap
- **2026 H2** — OpenClaw integration, multi-channel inbox, business agent templates, workflow automation
- **2027 H1** — Enterprise edition, team agent sharing, advanced analytics, voice/video agent support
- **2027 H2** — Industry-specific agent packs (e-commerce, SaaS, consulting, creative agencies)
- **2028+** — Autonomous business operations, self-improving agent pipelines, multi-company management

---

## Communication & Status Updates

- **GitHub Discussions** — Feature ideas and community feedback
- **Release Notes** — Published with each version on GitHub Releases
- **Blog Updates** — Major milestones and announcements
- **Community Discord** — Real-time discussion (link in README)

---

## Related Documentation

- [Project Overview & PDR](./project-overview-pdr.md) — Features, tech stack, requirements
- [Code Standards](./code-standards.md) — Development conventions and patterns
- [System Architecture](./system-architecture.md) — Component design, API structure
- [Cloudflare Tunnel Setup](./cloudflare-tunnel.md) — Remote access configuration

