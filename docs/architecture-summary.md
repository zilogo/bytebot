# Bytebot Architecture Summary

## Repository Structure
- **packages/bytebot-agent** – NestJS control plane managing tasks, LLM orchestration, and persistence.
- **packages/bytebotd** – Desktop automation daemon exposing computer control, input capture, and MCP tools backed by nut-js and uiohook.
- **packages/bytebot-ui** – Next.js + Express frontend with proxies for REST, Socket.IO, and noVNC traffic; renders the live virtual desktop.
- **packages/bytebot-agent-cc** – Claude Code–specific agent variant that streams actions via MCP and filters non-desktop tools.
- **packages/shared** – Shared TypeScript definitions (message content blocks, computer actions, converters) used across services.
- Deployment assets (Docker Compose, Helm), static assets, and documentation live at the repo root.

## Core Services and Responsibilities
- **Agent Scheduler & Processor** (`packages/bytebot-agent/src/agent/agent.scheduler.ts`, `agent.processor.ts`):
  - Cron loop dequeues tasks, writes uploaded files to the virtual desktop, and sets RUNNING status.
  - Processor builds LLM prompts from persisted messages + summaries, calls provider adapters, executes returned tools, and manages task lifecycle transitions.
  - Token-aware summarization keeps contexts within model limits.
- **Desktop Automation** (`packages/bytebotd/src/computer-use/computer-use.service.ts`):
  - Executes mouse, keyboard, window, and file operations via nut-js; shells out for wmctrl, sudo file writes, screenshots.
  - Returns base64 screenshots/documents for tool results.
- **Input Capture Loop** (`packages/bytebotd/src/input-tracking/input-tracking.service.ts`, `packages/bytebot-agent/src/agent/input-capture.service.ts`):
  - Captures human takeover actions, debounces repetitive events, couples screenshots with actions, and persists them as `UserAction` content blocks.
- **Realtime Collaboration** (`packages/bytebot-agent/src/tasks/tasks.gateway.ts`, `packages/bytebot-ui/src/hooks/useWebSocket.ts`):
  - Socket.IO gateway streams task updates/messages; UI hook manages joins, reconnection, and front-end state sync.
- **Frontend Desktop Viewer** (`packages/bytebot-ui/server.ts`, `components/ui/desktop-container.tsx`):
  - Express proxy tunnels WebSocket/HTTP traffic to agent + desktop services.
  - Desktop container swaps between VNC stream and screenshot viewer while maintaining 1280×960 aspect ratio.
- **Provider Integrations** (`packages/bytebot-agent/src/{anthropic,openai,google,proxy}/*.service.ts`):
  - Uniform `BytebotAgentService` interface supports Anthropic Messages, OpenAI Chat Completions, Gemini `generateContent`, and LiteLLM proxy.
  - Each adapter maps provider responses to shared content blocks and handles abort semantics (`BytebotAgentInterrupt`).
- **Claude Code Path** (`packages/bytebot-agent-cc/src/agent/agent.processor.ts`, `packages/bytebotd/src/mcp`):
  - Streams Claude Code results over MCP SSE, filters non-desktop tool calls, and updates task status via returned result events.
- **Analytics Hook** (`packages/bytebot-agent/src/agent/agent.analytics.ts`):
  - Optional endpoint receives task + transcript payload on cancel/fail/complete events when `BYTEBOT_ANALYTICS_ENDPOINT` is configured.

## Data & Workflow Highlights
- **Task Lifecycle**:
  1. REST `POST /tasks` stores task + initial message; optional file uploads saved base64 in Postgres (`packages/bytebot-agent/src/tasks/tasks.service.ts`).
  2. Scheduler moves due tasks to queue, writes attachments onto `/home/user/Desktop`, and triggers processing.
  3. Agent iterations persist assistant messages, tool results, created subtasks, and status transitions; summaries attach to older messages once generated.
  4. Takeover/resume/cancel events emit via Nest event emitter, pausing or resuming agent processing and toggling desktop input capture.
- **Shared Schema** (`packages/shared`):
  - Message content blocks encode text, images, tool use/result, thinking, and normalized user actions.
  - Conversion helpers ensure both LLM-issued and human actions share the same tool signature.
- **PostgreSQL Models** (`packages/bytebot-agent/prisma/schema.prisma`):
  - Tasks reference messages, summaries, and uploaded files; `model` field stores provider metadata (provider/name/title/context window).
  - Status/priority/type enums drive scheduling and UI filters.

## Deployment Notes
- Environment variables configure provider keys, service URLs, analytics endpoint, and LiteLLM proxy.
- Docker Compose stacks and Helm charts provision the agent, UI, desktop VM, database, and optional proxy services for local or Kubernetes deployments.

## Recommended Next Steps
1. Launch the Docker Compose stack to validate end-to-end task execution and desktop control.
2. Integrate LiteLLM or direct provider keys and verify dynamic model discovery via `GET /tasks/models`.
