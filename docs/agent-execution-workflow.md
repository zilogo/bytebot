# Agent Execution Workflow

This document provides a detailed explanation of how the Bytebot agent executes tasks, including the complete code flow from task creation to completion.

## Table of Contents

- [Overview](#overview)
- [Architecture Components](#architecture-components)
- [Execution Flow](#execution-flow)
- [Code Walkthrough](#code-walkthrough)
- [Event System](#event-system)
- [Context Management](#context-management)
- [Desktop Integration](#desktop-integration)
- [Error Handling](#error-handling)

## Overview

The Bytebot agent uses a **scheduler-processor architecture** with an **event-driven, non-blocking execution model**. The system is designed to:

1. Process tasks asynchronously without blocking the event loop
2. Support human takeover and resume capabilities
3. Manage context with token-aware summarization
4. Execute desktop actions via computer use tools
5. Handle multiple AI providers (Anthropic, OpenAI, Google, LiteLLM)

## Architecture Components

### 1. AgentScheduler
**File:** `packages/bytebot-agent/src/agent/agent.scheduler.ts`

- **Purpose:** Discovers and queues tasks for execution
- **Trigger:** Cron job every 5 seconds
- **Responsibilities:**
  - Check for scheduled tasks that are ready to run
  - Find the next highest-priority task
  - Write uploaded files to desktop
  - Hand off to AgentProcessor

### 2. AgentProcessor
**File:** `packages/bytebot-agent/src/agent/agent.processor.ts`

- **Purpose:** Core execution engine for task processing
- **Model:** Non-blocking iteration loop using `setImmediate()`
- **Responsibilities:**
  - Manage task execution lifecycle
  - Call LLM providers with context
  - Execute tool calls (computer use, task management)
  - Handle summarization when approaching token limits
  - Respond to control events (takeover, resume, cancel)

### 3. TasksService
**File:** `packages/bytebot-agent/src/tasks/tasks.service.ts`

- **Purpose:** Task CRUD operations and state management
- **Key Methods:**
  - `create()`: Create new tasks with initial messages
  - `findNextTask()`: Priority-based task selection
  - `update()`: Update task status and metadata
  - `takeOver()`, `resume()`, `cancel()`: Control operations

### 4. MessagesService
**File:** `packages/bytebot-agent/src/messages/messages.service.ts`

- **Purpose:** Message persistence and retrieval
- **Message Format:** Anthropic content blocks (standardized across providers)
- **Key Methods:**
  - `create()`: Save assistant/user messages
  - `findUnsummarized()`: Get messages not yet summarized

### 5. SummariesService
**File:** `packages/bytebot-agent/src/summaries/summaries.service.ts`

- **Purpose:** Hierarchical context compression
- **Trigger:** When token usage exceeds 75% of context window
- **Benefits:** Allows long-running tasks to continue beyond context limits

## Execution Flow

### High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Task Creation                             │
│  POST /tasks → TasksService.create() → Save to DB               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AgentScheduler (Every 5s)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. Check if processor is busy                            │   │
│  │ 2. Find next task (priority-based)                       │   │
│  │ 3. Write files to desktop if attached                    │   │
│  │ 4. Mark task as RUNNING                                  │   │
│  │ 5. Call agentProcessor.processTask(taskId)              │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentProcessor                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ processTask(taskId)                                      │   │
│  │   - Set isProcessing = true                              │   │
│  │   - Create AbortController                               │   │
│  │   - Kick off runIteration(taskId)                        │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Iteration Loop                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ runIteration(taskId) - Repeats until task complete       │   │
│  │                                                           │   │
│  │ 1. Check task status (exit if not RUNNING)               │   │
│  │ 2. Load context (summary + unsummarized messages)        │   │
│  │ 3. Call LLM provider with system prompt + messages       │   │
│  │ 4. Save assistant message to DB                          │   │
│  │ 5. Check token usage → summarize if > 75%                │   │
│  │ 6. Execute tool calls:                                   │   │
│  │    - computer_use → Desktop actions                      │   │
│  │    - create_task → Spawn new tasks                       │   │
│  │    - set_task_status → Update status                     │   │
│  │ 7. Save tool results as user messages                    │   │
│  │ 8. Update task status if completed/needs_help            │   │
│  │ 9. setImmediate(() => runIteration(taskId))             │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Task Complete  │
                    │ isProcessing = │
                    │     false      │
                    └────────────────┘
```

### Detailed Step-by-Step Flow

#### Phase 1: Task Discovery (Scheduler)

**Location:** `agent.scheduler.ts:22-62`

```typescript
@Cron(CronExpression.EVERY_5_SECONDS)
async handleCron() {
  // Step 1: Handle scheduled tasks
  const scheduledTasks = await this.tasksService.findScheduledTasks();
  for (const scheduledTask of scheduledTasks) {
    if (scheduledTask.scheduledFor < now) {
      await this.tasksService.update(scheduledTask.id, { queuedAt: now });
    }
  }

  // Step 2: Check if processor is busy
  if (this.agentProcessor.isRunning()) {
    return; // Skip this cycle
  }

  // Step 3: Find highest priority task
  const task = await this.tasksService.findNextTask();

  if (task) {
    // Step 4: Write uploaded files to desktop
    if (task.files.length > 0) {
      for (const file of task.files) {
        await writeFile({
          path: `/home/user/Desktop/${file.name}`,
          content: file.data, // base64 encoded
        });
      }
    }

    // Step 5: Mark as RUNNING and start processing
    await this.tasksService.update(task.id, {
      status: TaskStatus.RUNNING,
      executedAt: new Date(),
    });

    this.agentProcessor.processTask(task.id);
  }
}
```

**Task Selection Logic** (`tasks.service.ts:131-156`):

```typescript
async findNextTask(): Promise<Task | null> {
  return await this.prisma.task.findFirst({
    where: {
      status: { in: [TaskStatus.RUNNING, TaskStatus.PENDING] }
    },
    orderBy: [
      { executedAt: 'asc' },    // 1. Resume running tasks first
      { priority: 'desc' },     // 2. HIGH > MEDIUM > LOW
      { queuedAt: 'asc' },      // 3. Earlier queued tasks
      { createdAt: 'asc' }      // 4. Older tasks
    ],
    include: { files: true }
  });
}
```

#### Phase 2: Task Initialization (Processor)

**Location:** `agent.processor.ts:114-128`

```typescript
processTask(taskId: string) {
  this.logger.log(`Starting processing for task ID: ${taskId}`);

  // Guard: Only one task at a time
  if (this.isProcessing) {
    this.logger.warn('AgentProcessor is already processing another task');
    return;
  }

  // Set state
  this.isProcessing = true;
  this.currentTaskId = taskId;
  this.abortController = new AbortController();

  // Kick off first iteration without blocking
  // Using void to explicitly ignore the promise
  void this.runIteration(taskId);
}
```

**Key Design Decision:** Using `void this.runIteration(taskId)` instead of `await` allows the scheduler to return immediately, keeping the event loop responsive.

#### Phase 3: Iteration Loop (Core Processing)

**Location:** `agent.processor.ts:134-403`

```typescript
private async runIteration(taskId: string): Promise<void> {
  if (!this.isProcessing) {
    return; // Processor was stopped
  }

  try {
    // ==========================================
    // STEP 1: Check Task Status
    // ==========================================
    const task = await this.tasksService.findById(taskId);

    if (task.status !== TaskStatus.RUNNING) {
      this.logger.log(
        `Task processing completed for task ID: ${taskId} with status: ${task.status}`
      );
      this.isProcessing = false;
      this.currentTaskId = null;
      return;
    }

    // Refresh abort controller for this iteration
    this.abortController = new AbortController();

    // ==========================================
    // STEP 2: Load Context
    // ==========================================
    const latestSummary = await this.summariesService.findLatest(taskId);
    const unsummarizedMessages = await this.messagesService.findUnsummarized(taskId);

    // Build message array: [summary (if exists), ...messages]
    const messages = [
      ...(latestSummary
        ? [{
            role: Role.USER,
            content: [{
              type: MessageContentType.Text,
              text: latestSummary.content,
            }],
          }]
        : []),
      ...unsummarizedMessages,
    ];

    this.logger.debug(
      `Sending ${messages.length} messages to LLM for processing`
    );

    // ==========================================
    // STEP 3: Call LLM Provider
    // ==========================================
    const model = task.model as BytebotAgentModel;
    const service = this.services[model.provider]; // anthropic, openai, google, proxy

    if (!service) {
      await this.tasksService.update(taskId, { status: TaskStatus.FAILED });
      this.isProcessing = false;
      return;
    }

    const agentResponse = await service.generateMessage(
      AGENT_SYSTEM_PROMPT,      // System prompt with computer use tools
      messages,                 // Conversation history
      model.name,               // Model name (e.g., "claude-3-5-sonnet-20241022")
      true,                     // Enable tools
      this.abortController.signal // For cancellation
    );

    const messageContentBlocks = agentResponse.contentBlocks;

    // ==========================================
    // STEP 4: Save Assistant Message
    // ==========================================
    if (messageContentBlocks.length === 0) {
      await this.tasksService.update(taskId, { status: TaskStatus.FAILED });
      this.isProcessing = false;
      return;
    }

    await this.messagesService.create({
      content: messageContentBlocks,
      role: Role.ASSISTANT,
      taskId,
    });

    // ==========================================
    // STEP 5: Check for Summarization
    // ==========================================
    const contextWindow = model.contextWindow || 200000;
    const contextThreshold = contextWindow * 0.75;
    const shouldSummarize =
      agentResponse.tokenUsage.totalTokens >= contextThreshold;

    if (shouldSummarize) {
      // Generate summary using LLM
      const summaryResponse = await service.generateMessage(
        SUMMARIZATION_SYSTEM_PROMPT,
        [
          ...messages,
          {
            role: Role.USER,
            content: [{
              type: MessageContentType.Text,
              text: 'Respond with a summary of the messages above.',
            }],
          },
        ],
        model.name,
        false, // No tools for summarization
        this.abortController.signal
      );

      // Extract text from summary
      const summaryContent = summaryResponse.contentBlocks
        .filter(block => block.type === MessageContentType.Text)
        .map(block => block.text)
        .join('\n');

      // Save summary
      const summary = await this.summariesService.create({
        content: summaryContent,
        taskId,
      });

      // Link messages to summary
      await this.messagesService.attachSummary(
        taskId,
        summary.id,
        messages.map(m => m.id)
      );

      this.logger.log(
        `Generated summary for task ${taskId} due to token usage ` +
        `(${agentResponse.tokenUsage.totalTokens}/${contextWindow})`
      );
    }

    // ==========================================
    // STEP 6: Execute Tool Calls
    // ==========================================
    const generatedToolResults = [];
    let setTaskStatusToolUseBlock = null;

    for (const block of messageContentBlocks) {
      // Computer Use Tool (mouse, keyboard, screenshots, etc.)
      if (isComputerToolUseContentBlock(block)) {
        const result = await handleComputerToolUse(block, this.logger);
        generatedToolResults.push(result);
      }

      // Create Task Tool (spawn new tasks)
      if (isCreateTaskToolUseBlock(block)) {
        await this.tasksService.create({
          description: block.input.description,
          type: block.input.type?.toUpperCase() as TaskType,
          priority: block.input.priority?.toUpperCase() as TaskPriority,
          createdBy: Role.ASSISTANT,
          scheduledFor: block.input.scheduledFor
            ? new Date(block.input.scheduledFor)
            : undefined,
          model: task.model,
        });

        generatedToolResults.push({
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          content: [{
            type: MessageContentType.Text,
            text: 'The task has been created',
          }],
        });
      }

      // Set Task Status Tool (complete or request help)
      if (isSetTaskStatusToolUseBlock(block)) {
        setTaskStatusToolUseBlock = block;

        generatedToolResults.push({
          type: MessageContentType.ToolResult,
          tool_use_id: block.id,
          is_error: block.input.status === 'failed',
          content: [{
            type: MessageContentType.Text,
            text: block.input.description,
          }],
        });
      }
    }

    // ==========================================
    // STEP 7: Save Tool Results
    // ==========================================
    if (generatedToolResults.length > 0) {
      await this.messagesService.create({
        content: generatedToolResults,
        role: Role.USER,
        taskId,
      });
    }

    // ==========================================
    // STEP 8: Update Task Status
    // ==========================================
    if (setTaskStatusToolUseBlock) {
      switch (setTaskStatusToolUseBlock.input.status) {
        case 'completed':
          await this.tasksService.update(taskId, {
            status: TaskStatus.COMPLETED,
            completedAt: new Date(),
          });
          break;
        case 'needs_help':
          await this.tasksService.update(taskId, {
            status: TaskStatus.NEEDS_HELP,
          });
          break;
      }
    }

    // ==========================================
    // STEP 9: Schedule Next Iteration
    // ==========================================
    if (this.isProcessing) {
      // Use setImmediate to yield to event loop
      // This allows takeover/resume/cancel events to be processed
      setImmediate(() => this.runIteration(taskId));
    }

  } catch (error: any) {
    if (error?.name === 'BytebotAgentInterrupt') {
      this.logger.warn(`Processing aborted for task ID: ${taskId}`);
    } else {
      this.logger.error(
        `Error during task processing for task ID: ${taskId}`,
        error.stack
      );
      await this.tasksService.update(taskId, { status: TaskStatus.FAILED });
      this.isProcessing = false;
      this.currentTaskId = null;
    }
  }
}
```

## Code Walkthrough

### Message Format Standardization

All providers (Anthropic, OpenAI, Google) convert their responses to the **Anthropic content block format**:

```typescript
// Shared type definition
type MessageContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock;

interface TextContentBlock {
  type: 'text';
  text: string;
}

interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: MessageContentBlock[];
  is_error?: boolean;
}
```

**Why?** This allows the processor to handle all providers uniformly without provider-specific logic.

### Computer Tool Execution

**Location:** `packages/bytebot-agent/src/agent/agent.computer-use.ts`

When the LLM returns a `computer_use` tool call, it's executed against bytebotd:

```typescript
export async function handleComputerToolUse(
  block: ComputerToolUseContentBlock,
  logger: Logger
): Promise<ToolResultContentBlock> {
  const { action, coordinate, text } = block.input;

  // Make HTTP request to desktop daemon
  const response = await fetch(
    `${process.env.BYTEBOT_DESKTOP_BASE_URL}/computer-use`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, coordinate, text }),
    }
  );

  const result = await response.json();

  return {
    type: MessageContentType.ToolResult,
    tool_use_id: block.id,
    content: result.screenshot
      ? [{
          type: MessageContentType.Image,
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: result.screenshot,
          },
        }]
      : [{
          type: MessageContentType.Text,
          text: result.output || 'Action completed',
        }],
  };
}
```

**Supported Actions:**
- `screenshot` - Capture current screen state
- `mouse_move` - Move cursor to coordinates
- `left_click` - Click at current position
- `left_click_drag` - Click and drag
- `right_click` - Right-click menu
- `middle_click` - Middle mouse button
- `double_click` - Double-click
- `type` - Type text (keyboard input)
- `key` - Press special keys (Enter, Tab, etc.)
- `cursor_position` - Get current cursor coordinates

### Provider Abstraction

Each provider implements the `BytebotAgentService` interface:

```typescript
interface BytebotAgentService {
  generateMessage(
    systemPrompt: string,
    messages: Message[],
    modelName: string,
    enableTools: boolean,
    abortSignal?: AbortSignal
  ): Promise<BytebotAgentResponse>;
}
```

**Implementations:**
- `AnthropicService` - Direct SDK integration
- `OpenAIService` - Converts to/from OpenAI format
- `GoogleService` - Converts to/from Gemini format
- `ProxyService` - Routes through LiteLLM proxy

The processor selects the service based on `task.model.provider`:

```typescript
const service = this.services[model.provider];
const agentResponse = await service.generateMessage(...);
```

## Event System

The agent uses NestJS EventEmitter2 for control flow:

### Event: `task.takeover`

**Trigger:** User clicks "Take Over" button or task status → `NEEDS_HELP`

**Handler:** `agent.processor.ts:84-95`

```typescript
@OnEvent('task.takeover')
handleTaskTakeover({ taskId }: { taskId: string }) {
  this.logger.log(`Task takeover event received for task ID: ${taskId}`);

  // Abort any in-flight LLM calls
  if (this.currentTaskId === taskId && this.isProcessing) {
    this.abortController?.abort();
  }

  // Start capturing user input
  this.inputCaptureService.start(taskId);
}
```

**Effect:**
1. Aborts current LLM request
2. Starts input tracking on bytebotd
3. User actions are captured and saved as messages
4. Agent iteration stops naturally on next status check

### Event: `task.resume`

**Trigger:** User clicks "Resume" button

**Handler:** `agent.processor.ts:97-105`

```typescript
@OnEvent('task.resume')
handleTaskResume({ taskId }: { taskId: string }) {
  if (this.currentTaskId === taskId && this.isProcessing) {
    this.logger.log(`Task resume event received for task ID: ${taskId}`);

    // Create new abort controller
    this.abortController = new AbortController();

    // Resume iterations
    void this.runIteration(taskId);
  }
}
```

**Effect:**
1. Stops input tracking
2. Creates fresh abort controller
3. Resumes iteration loop with new context (including captured user actions)

### Event: `task.cancel`

**Trigger:** User clicks "Cancel" button or deletes task

**Handler:** `agent.processor.ts:107-112`

```typescript
@OnEvent('task.cancel')
async handleTaskCancel({ taskId }: { taskId: string }) {
  this.logger.log(`Task cancel event received for task ID: ${taskId}`);
  await this.stopProcessing();
}

async stopProcessing(): Promise<void> {
  this.abortController?.abort();
  await this.inputCaptureService.stop();
  this.isProcessing = false;
  this.currentTaskId = null;
}
```

**Effect:**
1. Aborts LLM requests
2. Stops input tracking
3. Clears processor state
4. Task marked as `CANCELLED` by TasksService

## Context Management

### Hierarchical Summarization

**Problem:** Long-running tasks exceed LLM context windows (200k tokens for Claude).

**Solution:** When token usage hits 75% threshold, create a summary of all messages and replace them with a single summary message.

**Implementation:**

1. **Trigger Check** (`agent.processor.ts:233-238`):
```typescript
const contextWindow = model.contextWindow || 200000;
const contextThreshold = contextWindow * 0.75;
const shouldSummarize =
  agentResponse.tokenUsage.totalTokens >= contextThreshold;
```

2. **Generate Summary** (`agent.processor.ts:240-264`):
```typescript
const summaryResponse = await service.generateMessage(
  SUMMARIZATION_SYSTEM_PROMPT,
  [
    ...messages,
    {
      role: Role.USER,
      content: [{
        type: MessageContentType.Text,
        text: 'Respond with a summary of the messages above.',
      }],
    },
  ],
  model.name,
  false, // No tools
  this.abortController.signal
);
```

3. **Save and Link** (`agent.processor.ts:279-288`):
```typescript
const summary = await this.summariesService.create({
  content: summaryContent,
  taskId,
});

await this.messagesService.attachSummary(
  taskId,
  summary.id,
  messages.map(m => m.id)
);
```

4. **Load for Next Iteration** (`agent.processor.ts:157-180`):
```typescript
const latestSummary = await this.summariesService.findLatest(taskId);
const unsummarizedMessages = await this.messagesService.findUnsummarized(taskId);

const messages = [
  ...(latestSummary ? [{ /* summary as user message */ }] : []),
  ...unsummarizedMessages,
];
```

### Database Schema

**Task:**
```sql
CREATE TABLE "Task" (
  id            TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  status        TEXT NOT NULL, -- PENDING, RUNNING, COMPLETED, FAILED, NEEDS_HELP, CANCELLED
  priority      TEXT NOT NULL, -- HIGH, MEDIUM, LOW
  type          TEXT NOT NULL, -- IMMEDIATE, SCHEDULED
  model         JSONB,         -- { provider: "anthropic", name: "claude-3-5-sonnet", contextWindow: 200000 }
  createdBy     TEXT NOT NULL, -- USER, ASSISTANT
  control       TEXT,          -- USER, ASSISTANT (who has control)
  createdAt     TIMESTAMP,
  queuedAt      TIMESTAMP,
  executedAt    TIMESTAMP,
  completedAt   TIMESTAMP,
  scheduledFor  TIMESTAMP
);
```

**Message:**
```sql
CREATE TABLE "Message" (
  id         TEXT PRIMARY KEY,
  content    JSONB NOT NULL,  -- Array of MessageContentBlock
  role       TEXT NOT NULL,   -- USER, ASSISTANT
  taskId     TEXT REFERENCES "Task"(id),
  summaryId  TEXT REFERENCES "Summary"(id),  -- NULL if not summarized
  createdAt  TIMESTAMP,
  updatedAt  TIMESTAMP
);
```

**Summary:**
```sql
CREATE TABLE "Summary" (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,   -- Compressed summary text
  taskId     TEXT REFERENCES "Task"(id),
  createdAt  TIMESTAMP,
  updatedAt  TIMESTAMP
);
```

**File:**
```sql
CREATE TABLE "File" (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,   -- MIME type
  size       INTEGER,
  data       TEXT NOT NULL,   -- base64 encoded
  taskId     TEXT REFERENCES "Task"(id),
  createdAt  TIMESTAMP
);
```

## Desktop Integration

### Bytebotd API

**Base URL:** `http://localhost:9990` (configured via `BYTEBOT_DESKTOP_BASE_URL`)

**Computer Use Endpoint:**
```http
POST /computer-use
Content-Type: application/json

{
  "action": "screenshot" | "mouse_move" | "left_click" | "type" | "key",
  "coordinate": [x, y],  // For mouse actions
  "text": "string"       // For type/key actions
}
```

**Response:**
```json
{
  "screenshot": "base64_encoded_png",  // If action produces screenshot
  "output": "string"                    // Text output for other actions
}
```

### Input Tracking

**Location:** `packages/bytebot-agent/src/agent/input-capture.service.ts`

When a user takes over a task, bytebotd tracks their actions:

1. **Start Tracking:**
```typescript
await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/input-tracking/start`, {
  method: 'POST'
});
```

2. **Bytebotd emits events via WebSocket:**
```typescript
// User clicks at (500, 300)
socket.emit('input-action', {
  action: 'left_click',
  coordinate: [500, 300]
});
```

3. **InputCaptureService aggregates and debounces:**
- Mouse clicks: 250ms debounce
- Typing: 500ms debounce, batches characters

4. **Creates user messages:**
```typescript
await this.messagesService.create({
  content: [{
    type: MessageContentType.ToolResult,
    tool_use_id: 'user_action',
    content: [{
      type: MessageContentType.Text,
      text: 'User clicked at (500, 300)',
    }],
  }],
  role: Role.USER,
  taskId,
});
```

5. **Agent learns from user actions** on next iteration.

## Error Handling

### LLM Request Abortion

When a takeover or cancel event occurs:

```typescript
this.abortController?.abort();
```

The provider services handle `AbortSignal`:

```typescript
const response = await anthropic.messages.create(
  { /* params */ },
  { signal: abortSignal }
);
```

If aborted, throws `BytebotAgentInterrupt` error, caught in iteration loop:

```typescript
catch (error: any) {
  if (error?.name === 'BytebotAgentInterrupt') {
    this.logger.warn(`Processing aborted for task ID: ${taskId}`);
    // Don't mark as failed, just stop processing
  } else {
    // Real error - mark task as failed
    await this.tasksService.update(taskId, { status: TaskStatus.FAILED });
    this.isProcessing = false;
  }
}
```

### Non-Blocking Error Recovery

Using `setImmediate()` prevents a single iteration error from crashing the entire processor:

```typescript
setImmediate(() => this.runIteration(taskId));
```

Even if an iteration throws, the next scheduled iteration will:
1. Check task status
2. Exit cleanly if task was marked as failed
3. Continue if task is still running

### Database Transaction Safety

Task creation uses a transaction to ensure atomicity:

```typescript
const task = await this.prisma.$transaction(async (prisma) => {
  // Create task
  const task = await prisma.task.create({ /* data */ });

  // Save files
  await Promise.all(filePromises);

  // Create initial message
  await prisma.message.create({ /* data */ });

  return task;
});
```

If any step fails, the entire task creation is rolled back.

## Performance Considerations

### Why `setImmediate()`?

```typescript
// ❌ BAD: Blocks event loop
while (task.status === TaskStatus.RUNNING) {
  await processIteration();
}

// ✅ GOOD: Yields to event loop
function runIteration() {
  await processIteration();
  if (this.isProcessing) {
    setImmediate(() => this.runIteration(taskId));
  }
}
```

**Benefits:**
1. Event loop can process takeover/resume/cancel events
2. WebSocket messages are handled in real-time
3. HTTP requests don't time out
4. UI stays responsive

### Input Debouncing

**Problem:** User typing generates hundreds of events per second.

**Solution:** Aggregate events with debouncing:

```typescript
// Clicks: 250ms debounce
if (action === 'left_click') {
  clearTimeout(this.clickDebounceTimer);
  this.clickDebounceTimer = setTimeout(() => {
    this.flushClickActions();
  }, 250);
}

// Typing: 500ms debounce + character batching
if (action === 'type') {
  this.typingBuffer += text;
  clearTimeout(this.typingDebounceTimer);
  this.typingDebounceTimer = setTimeout(() => {
    this.flushTypingActions();
  }, 500);
}
```

**Result:** Reduces messages from 1000s to 10s per takeover session.

## Configuration

### Environment Variables

**Agent (`bytebot-agent`):**
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/bytebot

# AI Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...

# Desktop daemon URL
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990

# LiteLLM proxy (optional)
LITELLM_BASE_URL=http://localhost:4000
LITELLM_API_KEY=sk-...
```

### System Prompts

**Agent System Prompt** (`agent.constants.ts`):
```typescript
export const AGENT_SYSTEM_PROMPT = `
You are a helpful AI assistant with access to a Linux desktop.
You can use the computer_use tool to interact with applications.

Available tools:
- computer_use: Control mouse, keyboard, take screenshots
- create_task: Spawn new tasks for later execution
- set_task_status: Mark task as completed or request help

Guidelines:
- Take screenshots frequently to understand the current state
- Be methodical and verify each action succeeded
- If stuck, use set_task_status with status="needs_help"
- When complete, use set_task_status with status="completed"
`;
```

**Summarization System Prompt** (`agent.constants.ts`):
```typescript
export const SUMMARIZATION_SYSTEM_PROMPT = `
Create a concise summary of the conversation above.
Focus on:
- The original task goal
- Actions taken so far
- Current progress and state
- Any important context for continuing the task

Keep the summary under 500 words.
`;
```

## Debugging

### Enable Debug Logging

```bash
# Set log level to debug
LOG_LEVEL=debug npm run start:dev
```

### Key Log Messages

```
[AgentScheduler] Found existing task with ID: abc123, status RUNNING. Resuming.
[AgentProcessor] Starting processing for task ID: abc123
[AgentProcessor] Processing iteration for task ID: abc123
[AgentProcessor] Sending 5 messages to LLM for processing
[AgentProcessor] Received 3 content blocks from LLM
[AgentProcessor] Token usage for task abc123: 45234/200000 (22%)
[AgentProcessor] Task takeover event received for task ID: abc123
[InputCaptureService] Started capturing input for task abc123
[AgentProcessor] Task resume event received for task ID: abc123
```

### Common Issues

**Issue:** Agent not picking up tasks
- Check: `AgentScheduler.handleCron()` running every 5 seconds?
- Check: Task status is `PENDING` or `RUNNING`?
- Check: `isProcessing` is false?

**Issue:** Task stuck in RUNNING
- Check: Any errors in logs?
- Check: LLM API key valid?
- Check: Desktop daemon reachable at `BYTEBOT_DESKTOP_BASE_URL`?

**Issue:** Context window errors
- Check: Summarization triggering at 75%?
- Check: `model.contextWindow` set correctly?
- Increase summarization frequency (lower threshold)

## Summary

The Bytebot agent execution workflow is a sophisticated, event-driven system that:

1. **Discovers tasks** via a 5-second scheduler
2. **Processes tasks** in a non-blocking iteration loop
3. **Manages context** with hierarchical summarization
4. **Controls desktop** via computer use tools
5. **Handles interruptions** through event-driven takeover/resume
6. **Supports multiple LLM providers** with a unified interface

Key architectural decisions:
- **Non-blocking**: `setImmediate()` keeps event loop responsive
- **Event-driven**: Takeover/resume/cancel via EventEmitter2
- **Provider-agnostic**: Standardized message format across all LLMs
- **Token-aware**: Automatic summarization prevents context overflow
- **Transactional**: Database operations maintain consistency

This design enables long-running, autonomous tasks while maintaining human control and system responsiveness.
