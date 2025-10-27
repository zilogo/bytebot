# Bytebot Architecture Guide

## Overview

Bytebot is an AI-powered desktop automation platform that enables intelligent agents to control and interact with virtual desktop environments. It combines multiple service layers to provide task orchestration, LLM integration, desktop control, and real-time UI synchronization.

## Repository Structure & Packages

### Core Packages

**`packages/bytebot-agent`** (NestJS Control Plane - Port 9991)
- Task scheduling and orchestration
- LLM provider integrations (Anthropic, OpenAI, Google)
- Message/conversation persistence  
- Event-driven task lifecycle management
- WebSocket gateway for real-time updates
- REST API for task management
- Prisma ORM for PostgreSQL persistence

**`packages/bytebotd`** (Desktop Daemon - Port 9990)
- Computer control service using nut-js for mouse/keyboard automation
- Real-time human input tracking via uiohook-napi
- Screenshot capture and file operations
- MCP (Model Context Protocol) server for Claude Code integration
- noVNC server for desktop visualization
- Input event deduplication and buffering

**`packages/bytebot-ui`** (Next.js Frontend - Port 9992)
- React/Next.js frontend with Tailwind CSS
- Express server with HTTP proxying middleware
- WebSocket proxy for Socket.IO integration
- VNC stream viewer with live desktop display
- Task management interface
- Real-time message streaming

**`packages/bytebot-agent-cc`** (Claude Code Variant)
- Specialized agent for Claude Code integration
- Streams task results over MCP SSE
- Filters non-desktop tool calls
- Uses `@anthropic-ai/claude-code` SDK

**`packages/shared`** (Type Definitions)
- Shared TypeScript types for message content blocks
- Computer action type definitions
- Conversion utilities between LLM and desktop action formats
- Tool use/result interfaces

**`packages/bytebot-llm-proxy`** (LiteLLM Proxy)
- Optional unified LLM provider gateway
- Model discovery and routing
- Supports multiple provider backends

## Technology Stack

### Backend
- **Framework**: NestJS 11 with TypeScript 5
- **Database**: PostgreSQL 16 (Prisma ORM)
- **Desktop Automation**: nut-js, wmctrl, uiohook-napi
- **LLM Integration**: Anthropic SDK, OpenAI SDK, Google GenAI SDK, LiteLLM
- **Real-time Communication**: Socket.IO 4.8
- **Task Scheduling**: @nestjs/schedule with cron expressions
- **Event Management**: @nestjs/event-emitter for async event handling

### Frontend
- **Framework**: React 19 with Next.js 15
- **Styling**: Tailwind CSS 4 with custom animations
- **Component Library**: Radix UI for accessible primitives
- **Real-time**: Socket.IO client for WebSocket communication
- **VNC Viewer**: react-vnc for remote desktop display
- **HTTP Proxy**: http-proxy-middleware for backend routing

### DevOps & Deployment
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Kubernetes-ready with Helm charts
- **Package Manager**: npm/yarn monorepo structure
- **Build**: SWC compiler, ts-loader, next build

## Architecture Layers

### 1. Data Persistence Layer (bytebot-agent)

**Prisma Schema** (`prisma/schema.prisma`)

```
Task
├── id (UUID)
├── description (string)
├── status (enum: PENDING, RUNNING, NEEDS_HELP, NEEDS_REVIEW, COMPLETED, CANCELLED, FAILED)
├── priority (enum: LOW, MEDIUM, HIGH, URGENT)
├── type (enum: IMMEDIATE, SCHEDULED)
├── model (JSON metadata: provider/name/title/contextWindow)
├── createdAt, executedAt, completedAt
└── Relationships:
    ├── messages: Message[]
    ├── summaries: Summary[]
    └── files: File[]

Message
├── id (UUID)
├── content (JSON - message content blocks per Anthropic format)
├── role (enum: USER, ASSISTANT)
├── createdAt
└── Relationships:
    ├── task: Task (foreign key)
    └── summary: Summary? (optional for summarized messages)

Summary (Token-aware context compression)
├── id (UUID)
├── content (string - compressed summary)
├── createdAt
└── Relationships:
    ├── task: Task
    ├── messages: Message[] (messages included in summary)
    └── parentSummary: Summary? (hierarchical summaries)

File (Pre-uploaded task attachments)
├── id (UUID)
├── name, type (MIME), size, data (base64)
└── task: Task
```

**Key Design**: Hierarchical summaries enable token-aware context management when approaching model context windows (75% threshold triggers summarization).

### 2. Agent Processor Pipeline (bytebot-agent)

The agent processor implements a non-blocking, iterative task execution loop:

```
Scheduler (5s cron)
  ↓
Find highest-priority PENDING/SCHEDULED task
  ↓
Write task.files to /home/user/Desktop (base64 decode)
  ↓
Set task status → RUNNING
  ↓
AgentProcessor.processTask(taskId)
  ↓
runIteration() [non-blocking async loop]
  ├─ Load latest summary (if exists)
  ├─ Load unsummarized messages
  ├─ Call LLM via provider service
  ├─ Persist assistant response
  ├─ Execute computer tool uses
  ├─ Capture tool results
  ├─ Check token usage for summarization
  ├─ Schedule next iteration via setImmediate
  └─ Loop until task.status != RUNNING
```

**Key Files**:
- `agent/agent.scheduler.ts` - 5-second cron job that dequeues tasks
- `agent/agent.processor.ts` - Core iteration loop with event handlers for takeover/resume/cancel
- `agent/agent.computer-use.ts` - Desktop action execution bridge
- `agent/agent.tools.ts` - Tool definitions for LLM prompting

**Event Handling** (NestJS EventEmitter):
- `task.takeover` - Aborts agent processing, starts input capture for human intervention
- `task.resume` - Resumes agent processing from pause state
- `task.cancel` - Stops all processing and cleans up

### 3. Provider Abstraction Layer

**BytebotAgentService Interface** (all providers implement):

```typescript
interface BytebotAgentService {
  generateMessage(
    systemPrompt: string,
    messages: Message[],
    model: string,
    useTools: boolean,
    signal?: AbortSignal
  ): Promise<BytebotAgentResponse>
}

interface BytebotAgentResponse {
  contentBlocks: MessageContentBlock[]
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}
```

**Implementations**:
- `anthropic/anthropic.service.ts` - Messages API with tool use, thinking blocks, ephemeral cache
- `openai/openai.service.ts` - Chat Completions API with function calling
- `google/google.service.ts` - Gemini generateContent API
- `proxy/proxy.service.ts` - LiteLLM unified proxy backend

**Key Features**:
- Abort signal support for graceful cancellation
- Ephemeral prompt caching (Anthropic) for cost reduction
- Unified message format translation
- Token usage tracking for context management

### 4. Desktop Automation Layer (bytebotd)

**ComputerUseService** executes normalized computer actions:

```
Computer Actions (from LLM tool use)
  ↓
ComputerUseService.action(params)
  ├─ Mouse: move, trace, click, press, drag, scroll
  ├─ Keyboard: type_keys, press_keys, type_text, paste_text
  ├─ Screenshots: screenshot, cursor_position
  ├─ Applications: open/activate via wmctrl
  ├─ Files: read (base64), write (base64)
  └─ Wait: delay execution
  ↓
NutService [nut-js bindings]
  ├─ Mouse events (absolute positioning)
  ├─ Keyboard events (key codes via uiohook)
  └─ Display capture (screendump → PNG)
  ↓
System commands (privileged)
  ├─ wmctrl: window management
  ├─ xfce4-terminal, firefox, code, etc.
  └─ File I/O via sudo for /home/user
```

**Input Tracking Pipeline** (uiohook-napi):

```
User Input Events
  ↓
InputTrackingService (debouncing + buffering)
  ├─ Mouse move: 250ms debounce for screenshot
  ├─ Clicks: aggregate burst → single ClickMouseAction
  ├─ Drag: path accumulation → DragMouseAction
  ├─ Scroll: direction grouping → ScrollAction
  ├─ Keys: printable chars → buffer + 500ms → TypeTextAction
  │       non-printable → TypeKeysAction
  └─ Screenshot: attached to click/drag actions
  ↓
InputTrackingGateway.emitAction()
  ↓
Agent receives UserAction content blocks
```

### 5. Real-time Communication

**WebSocket Gateway** (bytebot-agent):

```typescript
@WebSocketGateway()
class TasksGateway {
  emitTaskUpdate(taskId, task)       // task_updated event
  emitNewMessage(taskId, message)    // new_message event
  emitTaskCreated(task)              // task_created broadcast
  
  join_task(taskId)                  // Subscribe to task room
  leave_task(taskId)                 // Unsubscribe
}
```

**Socket.IO Rooms**: `task_${taskId}` for task-scoped updates

### 6. Frontend Architecture (bytebot-ui)

**Next.js App Structure**:
```
/app
  /api - No backend routes (proxied to agent)
  /desktop - Desktop viewer page
  /tasks - Task management dashboard
  page.tsx - Main dashboard
```

**Express Server Bridge** (`server.ts`):
- HTTP proxy → bytebot-agent:9991
- WebSocket proxy → bytebot-agent:9991
- noVNC proxy → bytebotd:9990/websockify
- Selective upgrade routing for Socket.IO vs VNC

**Key Components**:
- `desktop-container.tsx` - Switches between VNC stream (live) and screenshot viewer (playback)
- `useWebSocket.ts` - Socket.IO client hook with join/reconnection logic
- Task list, creation, and message stream views

## Communication Patterns

### Task Creation & Execution Flow

```
1. REST: POST /tasks (create task)
   → Task stored in Postgres with PENDING status
   → File attachments saved as base64 in File table
   → Socket.IO: broadcast task_created

2. Scheduler (5s cron)
   → Find highest-priority task
   → Write files to /home/user/Desktop
   → Set status → RUNNING
   → Call agentProcessor.processTask()

3. Agent Iteration
   → Build message context (summaries + new messages)
   → Stream LLM call with tools enabled
   → Parse tool calls
   → Execute computer actions (via REST to bytebotd)
   → Store results as ToolResult content blocks
   → Socket.IO: emit new_message to UI
   → Check token usage, summarize if needed
   → Schedule next iteration

4. Human Takeover
   → UI: POST /tasks/:id/takeover
   → Task status → NEEDS_HELP
   → Agent aborts current iteration
   → Input capture starts
   → User actions captured as UserAction blocks
   → UI: POST /tasks/:id/resume to restart agent
```

### Agent ↔ Desktop Communication

```
Agent (bytebot-agent:9991)
  ├─ REST POST http://bytebotd:9990/computer-use/action
  │   └─ Body: { action: "click_mouse", coordinates: {...} }
  │   └─ Response: { image: "base64..." } or { success: true }
  │
  └─ WebSocket (SSE for Claude Code)
      └─ http://bytebotd:9990/mcp
      └─ Model Context Protocol tool definitions
```

### UI ↔ Agent Communication

```
UI (bytebot-ui:9992)
  ├─ Express proxy routes all requests
  │   ├─ HTTP: /tasks/* → http://bytebot-agent:9991/tasks/*
  │   ├─ GET /tasks/models → agent model discovery
  │   └─ POST /tasks/:id/takeover|resume|cancel
  │
  └─ Socket.IO WebSocket
      ├─ join_task(taskId)
      ├─ Listen: task_updated, new_message
      └─ UI updates in real-time
```

## Message Content Block Types

Bytebot uses Anthropic's content block format as the canonical internal representation:

```typescript
// Text & Media
TextContentBlock: { type: 'text', text: string }
ImageContentBlock: { type: 'image', source: { type: 'base64', media_type: 'image/png', data: string } }
DocumentContentBlock: { type: 'document', source: { type: 'base64', media_type: string, data: string }, name?: string }

// AI Reasoning
ThinkingContentBlock: { type: 'thinking', thinking: string, signature: string }
RedactedThinkingContentBlock: { type: 'redacted_thinking', data: string }

// Tool Execution
ToolUseContentBlock: { type: 'tool_use', id: string, name: string, input: Record<string, any> }
ToolResultContentBlock: { type: 'tool_result', tool_use_id: string, content: MessageContentBlock[], is_error?: boolean }

// Human Actions
UserActionContentBlock: { type: 'user_action', content: (ImageContentBlock | ComputerToolUseContentBlock)[] }
```

## Environmental Configuration

### Required Environment Variables

```bash
# LLM Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...

# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/bytebotdb

# Service URLs
BYTEBOT_DESKTOP_BASE_URL=http://bytebot-desktop:9990
BYTEBOT_AGENT_BASE_URL=http://bytebot-agent:9991
BYTEBOT_DESKTOP_VNC_URL=http://bytebot-desktop:9990/websockify

# Optional: LiteLLM Proxy
BYTEBOT_LLM_PROXY_URL=http://bytebot-llm-proxy:8000

# Optional: Analytics
BYTEBOT_ANALYTICS_ENDPOINT=https://analytics.example.com/event
```

### Port Mapping

| Service | Port | Purpose |
|---------|------|---------|
| bytebot-agent | 9991 | NestJS API + Socket.IO |
| bytebotd | 9990 | Desktop daemon + noVNC + MCP |
| bytebot-ui | 9992 | Next.js frontend |
| postgres | 5432 | Database |
| bytebot-llm-proxy | 8000 | LiteLLM unified gateway |

## Deployment Models

### Docker Compose (Development/Testing)

```bash
docker-compose -f docker/docker-compose.yml up
# Includes: postgres, bytebot-agent, bytebotd, bytebot-ui
```

### Claude Code Variant

```bash
docker-compose -f docker/docker-compose-claude-code.yml up
# Uses bytebot-agent-cc for MCP-based execution
```

### Kubernetes (Production)

Helm charts available for multi-instance deployments with:
- Persistent volumes for postgres
- Service mesh integration
- Resource limits and requests
- Health checks and probes

## Key Architectural Patterns

### 1. Non-blocking Task Processing

The agent processor uses `setImmediate()` to schedule iterations non-blocking:
- Allows other tasks to be processed
- Prevents blocking the event loop
- Enables concurrent task execution

### 2. Token-Aware Context Compression

```
Message accumulation → 75% context window → Summarization
  ↓
Summary attached to old messages
  ↓
Next iteration: [summary_text] + [new_messages]
```

Keeps LLM context within bounds while preserving conversation history.

### 3. Event-Driven Control Flow

NestJS EventEmitter enables loose coupling:
- `task.takeover`: triggers agent abort + input capture start
- `task.resume`: triggers agent restart + input capture stop
- `task.cancel`: triggers cleanup

### 4. Provider Abstraction

Single `BytebotAgentService` interface abstracts provider differences:
- Token counting varies (handled per-provider)
- Tool formats unified (all → Anthropic content blocks)
- Response parsing normalized (all → BytebotAgentResponse)

### 5. Debounced Input Aggregation

User input buffering reduces noise:
- Consecutive clicks grouped by 250ms window
- Typing buffered for 500ms before emission
- Screenshot deferred 250ms after mouse movement
- Prevents 100s of events per second

### 6. Message Format Convergence

All message types normalize to Anthropic's format:
- LLM responses → convert to blocks
- User actions → convert to blocks
- Tool results → standardized blocks
- Enables format-agnostic storage & replay

## Development Workflow

### Local Development Setup

```bash
# Install shared types
cd packages/shared && npm install && npm run build

# Install agent dependencies
cd ../bytebot-agent && npm install

# Run Prisma migrations
npm run prisma:dev

# Start agent in watch mode
npm run start:dev

# In another terminal, start UI
cd ../bytebot-ui && npm run dev

# In another terminal, start desktop daemon
cd ../bytebotd && npm run start:dev
```

### Adding a New LLM Provider

1. Create `src/{provider}/{provider}.service.ts` implementing `BytebotAgentService`
2. Create `src/{provider}/{provider}.tools.ts` with tool definitions
3. Create `src/{provider}/{provider}.module.ts` and import in `app.module.ts`
4. Add provider API key handling to `tasks.controller.ts` model discovery

### Key Files for Debugging

- **Task execution**: `bytebot-agent/src/agent/agent.processor.ts`
- **Desktop actions**: `bytebotd/src/computer-use/computer-use.service.ts`
- **Input tracking**: `bytebotd/src/input-tracking/input-tracking.service.ts`
- **Message persistence**: `bytebot-agent/src/messages/messages.service.ts`
- **WebSocket updates**: `bytebot-agent/src/tasks/tasks.gateway.ts`

## Performance Considerations

### Context Window Management
- Default assumed 200k tokens if not specified
- Summarization triggered at 75% threshold
- Hierarchical summaries for very long conversations

### Input Debouncing
- Prevents 1000s of events per second from overwhelming the system
- Configurable debounce windows (see `input-tracking.service.ts`)

### Database Indexing
- Task status, priority for scheduler queries
- Message task_id for efficient retrieval
- Summary task_id for context loading

### Caching
- Anthropic ephemeral cache on system prompt + tools
- Reduces token cost for repeated tool definitions

## Troubleshooting

### Common Issues

1. **Agent not processing tasks**
   - Check DATABASE_URL is reachable
   - Verify LLM provider keys are set
   - Check task status in Postgres (should be RUNNING)

2. **Desktop actions failing**
   - Ensure bytebotd is running: `curl http://localhost:9990/health`
   - Check BYTEBOT_DESKTOP_BASE_URL is correct in agent
   - Verify desktop display: `DISPLAY=:0 xdotool getactivewindow`

3. **WebSocket updates not reaching UI**
   - Check Socket.IO connection: browser DevTools → Network → WS
   - Verify task is joined: `socket.emit('join_task', taskId)`
   - Check gateway emits: `agentProcessor.emitNewMessage()`

4. **Input capture not working**
   - Verify uiohook permissions (may need sudo)
   - Check input-tracking service logging
   - Restart desktop daemon

## Future Enhancements

- Multi-task execution (parallel task processing)
- Persistent session replay and debugging
- Fine-tuned model support
- Custom tool plugins
- Distributed deployment with task sharding
