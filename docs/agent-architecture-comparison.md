# Bytebot Agent 架构对比文档

本文档详细对比了 Bytebot 的两种 Agent 实现模式,帮助理解它们的区别、使用场景和技术细节。

## 目录
- [快速对比](#快速对比)
- [桌面操作原理](#桌面操作原理)
- [多模态依赖](#多模态依赖)
- [两种部署模式详解](#两种部署模式详解)
- [MCP使用分析](#mcp使用分析)
- [依赖对比](#依赖对比)
- [部署指南](#部署指南)

---

## 快速对比

| 特性 | bytebot-agent (标准版) | bytebot-agent-cc (Claude Code版) |
|------|----------------------|--------------------------------|
| **支持的LLM** | OpenAI, Claude, Gemini, LiteLLM | 仅 Anthropic Claude |
| **工具调用方式** | 各LLM原生API → HTTP调用desktop | Claude Code SDK → MCP协议 |
| **核心依赖** | `@anthropic-ai/sdk`, `openai`, `@google/genai` | `@anthropic-ai/claude-code` |
| **代码复杂度** | 高(需要手动实现工具调用循环) | 低(SDK封装所有逻辑) |
| **部署文件** | `docker-compose.yml` | `docker-compose-claude-code.yml` |
| **Web UI** | ✅ 完整支持 | ✅ 完整支持 |
| **VNC桌面预览** | ✅ | ✅ |
| **MCP Server** | ❌ 不使用 | ✅ 连接bytebotd的MCP |
| **使用场景** | 通用桌面自动化,多模型支持 | Claude Code集成,MCP工具暴露 |
| **是否同时运行** | ❌ 互斥(端口冲突) | ❌ 互斥(端口冲突) |

---

## 桌面操作原理

### 完整执行链路

```
LLM(多模态) → 视觉推理 → 生成坐标 → 工具调用 → 桌面执行
     ↓              ↓            ↓            ↓           ↓
  看到截图    识别按钮位置   {x:523,y:387}  API请求   nut-js系统调用
```

### 核心技术栈

#### 1. Agent层 (bytebot-agent)
```typescript
// LLM返回工具调用
{
  "type": "tool_use",
  "name": "computer_click_mouse",
  "input": {
    "coordinates": { "x": 500, "y": 300 }  // ← 基于视觉推理得出
  }
}

// Agent解析并执行
await fetch(`${BYTEBOT_DESKTOP_BASE_URL}/computer-use`, {
  method: 'POST',
  body: JSON.stringify({
    action: 'click_mouse',
    coordinates: { x: 500, y: 300 }
  })
});
```

#### 2. Desktop Daemon层 (bytebotd)
```typescript
// packages/bytebotd/src/computer-use/computer-use.service.ts
async action(params: ComputerActionParams) {
  switch (params.action) {
    case 'click_mouse':
      await this.nutService.mouseClick(
        params.coordinates.x,
        params.coordinates.y,
        params.button
      );
      break;
  }
}
```

#### 3. 系统层 (nut-js)
```typescript
// packages/bytebotd/src/nut/nut.service.ts
import { mouse, keyboard } from '@nut-tree-fork/nut-js';

async mouseClick(x: number, y: number, button: string) {
  await mouse.setPosition({ x, y });
  await mouse.click(Button.LEFT);
}
```

### 支持的操作类型

```typescript
// 鼠标操作
'click_mouse'      // 点击
'move_mouse'       // 移动
'press_mouse'      // 按下/释放
'drag_mouse'       // 拖拽
'scroll'           // 滚动

// 键盘操作
'type_text'        // 输入文本
'paste_text'       // 粘贴
'type_keys'        // 按键序列
'press_keys'       // 按下/释放按键

// 屏幕操作
'screenshot'       // 截图
'cursor_position'  // 获取光标位置

// 应用控制
'open_application' // 打开应用
'activate_application' // 激活窗口

// 文件操作
'read_file'        // 读取文件(base64)
'write_file'       // 写入文件(base64)

// 其他
'wait'             // 等待
```

---

## 多模态依赖

### 为什么需要多模态?

**核心原因**: 坐标计算依赖视觉理解

```
目标导向任务: "点击登录按钮"
  ↓
LLM看截图 → 识别"登录按钮"视觉特征 → 计算像素坐标
  ↓
输出: { x: 523, y: 387 }
```

纯文本模型无法:
- ❌ 定位UI元素的像素位置
- ❌ 理解截图内容变化
- ❌ 验证操作是否成功

### 使用场景分类

#### 场景1: 命令式任务 (不需要多模态)

```typescript
// 用户明确指定所有参数
{
  "action": "type_text",
  "text": "Hello World"
}

{
  "action": "click_mouse",
  "coordinates": { "x": 500, "y": 300 }  // 坐标已知
}
```

**优化方案**: 可以使用纯文本LLM甚至不用LLM
```typescript
// 直接API调用
POST /computer-use/action
{
  "action": "type_text",
  "text": "预定义的命令"
}
```

#### 场景2: 目标导向任务 (必须多模态)

```typescript
// 用户描述意图,需要LLM推理
User: "在浏览器中搜索天气"

LLM需要:
1. 看截图识别搜索框位置 → click_mouse {x, y}
2. 输入文字 → type_text "天气"
3. 看截图确认是否成功
4. 如果失败,尝试其他方案
```

#### 场景3: 日志分析反馈 (纯文本LLM即可)

```typescript
// 用户场景: 执行命令 + 分析日志
execute_command("docker deploy app:v2")
  ↓
日志: "ERROR: Port 8080 already in use"
  ↓
LLM分析(纯文本) → 决策: 回滚
  ↓
execute_command("docker rollback app")
```

**成本对比**:
- GPT-4 Vision: $10-30/百万token
- GPT-4o-mini (纯文本): $0.15-0.60/百万token
- **节省90%+成本**

---

## 两种部署模式详解

### 架构图对比

#### 标准模式架构
```
┌─────────────────────────────────────────────────┐
│              bytebot-ui (9992)                  │
│            [Web UI + VNC预览]                   │
└──────────┬───────────────────────┬──────────────┘
           │ HTTP/WebSocket        │ VNC
           ↓                       ↓
    ┌──────────────────┐    ┌─────────────┐
    │  bytebot-agent   │    │  bytebotd   │
    │    (9991)        │───→│   (9990)    │
    │                  │HTTP │             │
    │ - AnthropicSvc   │    │ - nut-js    │
    │ - OpenAISvc      │    │ - VNC       │
    │ - GoogleSvc      │    │ - MCP       │
    │ - ProxySvc       │    └─────────────┘
    └──────────────────┘
           ↓
    ┌──────────────┐
    │  postgres    │
    │   (5432)     │
    └──────────────┘
```

#### Claude Code模式架构
```
┌─────────────────────────────────────────────────┐
│              bytebot-ui (9992)                  │
│            [Web UI + VNC预览]                   │
└──────────┬───────────────────────┬──────────────┘
           │ HTTP/WebSocket        │ VNC
           ↓                       ↓
    ┌──────────────────┐    ┌─────────────┐
    │ bytebot-agent-cc │    │  bytebotd   │
    │    (9991)        │    │   (9990)    │
    │                  │    │             │
    │ Claude Code SDK  │───→│ - nut-js    │
    │ query() function │MCP │ - VNC       │
    │                  │SSE │ - MCP Server│
    └──────────────────┘    └─────────────┘
           ↓                       ↑
    ┌──────────────┐              │
    │  postgres    │              │ MCP
    │   (5432)     │              │ SSE
    └──────────────┘              │
                         ┌────────┴────────┐
                         │ Claude Code CLI │
                         │  (可选外部调用) │
                         └─────────────────┘
```

### 标准模式 (bytebot-agent)

#### 核心特点
- ✅ 支持多LLM (OpenAI/Claude/Gemini/LiteLLM)
- ✅ 手动实现工具调用循环
- ✅ HTTP REST API调用desktop
- ✅ 完整的任务调度、历史记录

#### 执行流程
```typescript
// 1. 选择Provider
const service = this.services[model.provider]; // anthropic/openai/google/proxy

// 2. 调用LLM
const response = await service.generateMessage(
  systemPrompt,
  messages,
  model.name,
  useTools: true
);

// 3. 解析工具调用
for (const block of response.contentBlocks) {
  if (isComputerToolUseContentBlock(block)) {
    // 4. 执行工具(HTTP)
    const result = await handleComputerToolUse(block);
    generatedToolResults.push(result);
  }
}

// 5. 保存结果
await messagesService.create({
  content: generatedToolResults,
  role: Role.USER
});

// 6. 下一轮迭代
setImmediate(() => this.runIteration(taskId));
```

#### Provider抽象层
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

// 实现
- anthropic/anthropic.service.ts
- openai/openai.service.ts
- google/google.service.ts
- proxy/proxy.service.ts
```

### Claude Code模式 (bytebot-agent-cc)

#### 核心特点
- ⚠️ 仅支持 Anthropic Claude
- ✅ SDK封装所有逻辑
- ✅ 通过MCP协议调用工具
- ✅ 代码极简(24个文件,716KB)

#### 执行流程
```typescript
// 一个函数搞定所有!
for await (const message of query({
  prompt: task.description,
  options: {
    abortController: this.abortController,
    appendSystemPrompt: AGENT_SYSTEM_PROMPT,
    permissionMode: 'bypassPermissions',
    mcpServers: {
      desktop: {
        type: 'sse',
        url: `${BYTEBOT_DESKTOP_BASE_URL}/mcp`
      }
    }
  }
})) {
  // SDK内部自动:
  // - 调用Claude API
  // - 发现MCP工具
  // - 执行工具调用
  // - 返回结果

  // 只需保存消息
  switch (message.type) {
    case 'user':
    case 'assistant':
      await messagesService.create({
        content: messageContentBlocks,
        role,
        taskId
      });
      break;
    case 'result':
      if (message.subtype === 'success') {
        await tasksService.update(taskId, {
          status: TaskStatus.COMPLETED
        });
      }
      break;
  }
}
```

#### query() API详解

**函数签名**:
```typescript
async function* query(options: QueryOptions): AsyncGenerator<StreamMessage>
```

**参数**:
```typescript
interface QueryOptions {
  prompt: string;  // 用户任务描述

  options: {
    // 中断控制
    abortController?: AbortController;

    // 系统提示词
    appendSystemPrompt?: string;

    // 权限模式
    permissionMode?: 'bypassPermissions' | 'requestPermissions';

    // MCP服务器配置
    mcpServers?: {
      [serverName: string]: {
        type: 'sse' | 'stdio';
        url?: string;        // SSE端点
        command?: string;    // stdio命令
      }
    }
  }
}
```

**返回值**:
```typescript
type StreamMessage =
  | { type: 'user', message: { content: string | ContentBlock[] } }
  | { type: 'assistant', message: { content: Anthropic.ContentBlock[] } }
  | { type: 'system' }
  | { type: 'result', subtype: 'success' | 'error_max_turns' | 'error_during_execution' }
```

---

## MCP使用分析

### Bytebot的MCP实现

Bytebot **没有使用外部MCP工具**,而是:
1. 自己实现了MCP Server (bytebotd)
2. 在CC版中作为MCP Client连接自己的Server
3. 将REST API包装成MCP协议

### MCP Server实现 (bytebotd)

```typescript
// packages/bytebotd/src/mcp/bytebot-mcp.module.ts
@Module({
  imports: [
    McpModule.forRoot({
      name: 'bytebotd',
      version: '0.0.1',
      sseEndpoint: '/mcp'  // http://bytebotd:9990/mcp
    })
  ]
})
export class BytebotMcpModule {}
```

#### 暴露的MCP工具 (18个)

```typescript
// packages/bytebotd/src/mcp/computer-use.tools.ts
@Injectable()
export class ComputerUseTools {
  @Tool({ name: 'computer_move_mouse', ... })
  async moveMouse({ coordinates }) { ... }

  @Tool({ name: 'computer_click_mouse', ... })
  async clickMouse({ coordinates, button, clickCount }) { ... }

  @Tool({ name: 'computer_type_text', ... })
  async typeText({ text, delay }) { ... }

  @Tool({ name: 'computer_screenshot', ... })
  async screenshot() { ... }

  // ... 共18个工具
}
```

**工具列表**:
| 工具名 | 功能 |
|--------|------|
| computer_move_mouse | 移动鼠标 |
| computer_trace_mouse | 鼠标轨迹 |
| computer_click_mouse | 点击 |
| computer_press_mouse | 按下/释放 |
| computer_drag_mouse | 拖拽 |
| computer_scroll | 滚动 |
| computer_type_keys | 输入按键序列 |
| computer_press_keys | 按下/释放按键 |
| computer_type_text | 输入文本 |
| computer_paste_text | 粘贴 |
| computer_wait | 等待 |
| computer_application | 打开应用 |
| computer_screenshot | 截图 |
| computer_cursor_position | 光标位置 |
| computer_write_file | 写文件 |
| computer_read_file | 读文件 |

### MCP Client使用 (bytebot-agent-cc)

```typescript
// 连接配置
mcpServers: {
  desktop: {
    type: 'sse',
    url: 'http://bytebotd:9990/mcp'
  }
}

// Claude Code SDK自动:
// 1. 连接SSE端点
// 2. 发现可用工具 (mcp__desktop__computer_*)
// 3. 调用工具时自动发送MCP请求
// 4. 返回结果
```

#### 工具名称转换

```typescript
// MCP工具名格式: mcp__desktop__computer_screenshot
// 保存时需要去掉前缀

content = content.filter(
  (block) =>
    block.type !== 'tool_use' ||
    block.name.startsWith('mcp__desktop__')  // 只保留desktop的MCP工具
);

// 去掉前缀
name: block.name.replace('mcp__desktop__', '')
// mcp__desktop__computer_screenshot → computer_screenshot
```

### MCP vs REST API对比

| 特性 | REST API (标准版) | MCP (CC版) |
|------|------------------|-----------|
| 协议 | HTTP POST | SSE (Server-Sent Events) |
| 端点 | `/computer-use` | `/mcp` |
| 工具发现 | 手动定义 | 自动发现 |
| 调用方式 | fetch() | SDK内部处理 |
| 响应 | JSON | MCP消息格式 |

---

## 依赖对比

### 核心依赖分析

#### bytebot-agent (标准版)

```json
{
  "dependencies": {
    // LLM SDKs
    "@anthropic-ai/sdk": "^0.39.0",
    "openai": "^5.8.2",
    "@google/genai": "^1.8.0",

    // NestJS框架
    "@nestjs/common": "^11.0.1",
    "@nestjs/core": "^11.0.1",
    "@nestjs/platform-express": "^11.1.5",
    "@nestjs/config": "^4.0.2",
    "@nestjs/schedule": "^6.0.0",
    "@nestjs/event-emitter": "^3.0.1",

    // WebSocket
    "@nestjs/platform-socket.io": "^11.1.1",
    "@nestjs/websockets": "^11.1.1",
    "socket.io": "^4.8.1",

    // 数据库
    "@prisma/client": "^6.16.1",
    "prisma": "^6.16.1",

    // 工具
    "class-validator": "^0.14.2",
    "class-transformer": "^0.5.1",
    "zod": "^4.0.5"
  }
}
```

**Provider Services**:
- `anthropic/anthropic.service.ts` - Anthropic Messages API
- `openai/openai.service.ts` - OpenAI Chat Completions API
- `google/google.service.ts` - Gemini generateContent API
- `proxy/proxy.service.ts` - LiteLLM unified proxy

#### bytebot-agent-cc (Claude Code版)

```json
{
  "dependencies": {
    // 核心依赖
    "@anthropic-ai/claude-code": "^1.0.105",  // ⭐ 唯一LLM依赖

    // 未使用但保留
    "@anthropic-ai/sdk": "^0.39.0",    // 未使用
    "openai": "^5.8.2",                // 未使用
    "@google/genai": "^1.8.0",         // 未使用

    // NestJS框架(同标准版)
    "@nestjs/common": "^11.0.1",
    "@nestjs/core": "^11.0.1",
    "@nestjs/platform-express": "^11.1.5",
    "@nestjs/config": "^4.0.2",
    "@nestjs/schedule": "^6.0.0",
    "@nestjs/event-emitter": "^3.0.1",

    // WebSocket(同标准版)
    "@nestjs/platform-socket.io": "^11.1.1",
    "@nestjs/websockets": "^11.1.1",
    "socket.io": "^4.8.1",

    // 数据库(同标准版)
    "@prisma/client": "^6.16.1",
    "prisma": "^6.16.1",

    // 工具(同标准版)
    "class-validator": "^0.14.2",
    "class-transformer": "^0.5.1",
    "zod": "^4.0.5"
  }
}
```

**代码统计**:
- 源文件: 24个
- 大小: 716KB
- Provider Services: 0个 (全部由SDK封装)

### bytebotd (Desktop Daemon)

```json
{
  "dependencies": {
    // 桌面自动化核心
    "@nut-tree-fork/nut-js": "^4.3.0",    // 鼠标/键盘控制
    "uiohook-napi": "^1.5.4",             // 输入事件监听

    // MCP Server
    "@rekog/mcp-nest": "^0.3.8",          // NestJS的MCP实现

    // 窗口管理
    "wmctrl": "系统命令",                  // Linux窗口控制

    // 其他
    "@nestjs/common": "^11.0.1",
    "@nestjs/platform-express": "^11.1.5",
    "@nestjs/websockets": "^11.1.1",
    "socket.io": "^4.8.1"
  }
}
```

---

## 部署指南

### 互斥原因

两种模式**不能同时运行**,原因:

1. **使用不同的Docker Compose文件**
```bash
# 标准模式
docker-compose -f docker/docker-compose.yml up

# Claude Code模式
docker-compose -f docker/docker-compose-claude-code.yml up
```

2. **占用相同端口** (9991)
```yaml
# 两个都绑定9991端口
bytebot-agent:
  ports: ["9991:9991"]

bytebot-agent-cc:
  ports: ["9991:9991"]  # 冲突!
```

3. **UI只连接一个agent**
```yaml
# docker-compose.yml
bytebot-ui:
  environment:
    BYTEBOT_AGENT_BASE_URL: http://bytebot-agent:9991

# docker-compose-claude-code.yml
bytebot-ui:
  environment:
    BYTEBOT_AGENT_BASE_URL: http://bytebot-agent-cc:9991
```

4. **共享数据库会冲突**
- 两个scheduler同时抢任务
- 数据一致性问题

### 标准模式部署

```bash
# 1. 配置环境变量
cat > .env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/bytebotdb
EOF

# 2. 启动服务
docker-compose -f docker/docker-compose.yml up -d

# 3. 访问
# Web UI: http://localhost:9992
# Agent API: http://localhost:9991
# VNC: http://localhost:9990
```

**服务列表**:
```
bytebot-agent (9991)      ← 多模型支持
  ↓
bytebotd (9990)           ← 桌面控制 + VNC
  ↓
postgres (5432)           ← 数据库
  ↓
bytebot-ui (9992)         ← Web界面
```

### Claude Code模式部署

```bash
# 1. 配置环境变量 (只需Anthropic)
cat > .env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/bytebotdb
EOF

# 2. 启动服务
docker-compose -f docker/docker-compose-claude-code.yml up -d

# 3. 访问
# Web UI: http://localhost:9992 (可以看到桌面预览)
# MCP端点: http://localhost:9990/mcp (用于Claude Code CLI)
```

**服务列表**:
```
bytebot-agent-cc (9991)   ← 仅Claude + MCP
  ↓
bytebotd (9990)           ← 桌面控制 + VNC + MCP Server
  ↓
postgres (5432)           ← 数据库
  ↓
bytebot-ui (9992)         ← Web界面
```

**可选: Claude Code CLI集成**
```bash
# 在本地安装Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 配置MCP服务器
# ~/.config/claude-code/config.json
{
  "mcpServers": {
    "bytebot": {
      "type": "sse",
      "url": "http://localhost:9990/mcp"
    }
  }
}

# 使用
claude
> 帮我在桌面打开Firefox浏览器
```

### 选择建议

#### 使用标准模式 (推荐大多数场景)

✅ 适合:
- 需要支持多个LLM provider
- 需要完整的任务管理、调度、历史记录
- 通过Web UI操作
- 生产环境部署

❌ 不适合:
- 只想用Claude Code CLI
- 需要将desktop工具暴露为MCP

#### 使用Claude Code模式

✅ 适合:
- 只使用Claude模型
- 想通过Claude Code CLI控制桌面
- 需要MCP协议集成
- 代码简洁性优先

❌ 不适合:
- 需要多模型支持
- OpenAI/Gemini用户

### 性能对比

| 指标 | 标准模式 | CC模式 |
|------|---------|--------|
| 启动时间 | ~5s | ~3s |
| 内存占用 | ~300MB | ~200MB |
| 单次任务延迟 | +100ms (多层抽象) | 基准 |
| 代码维护性 | 中 (需维护多provider) | 高 (SDK封装) |

---

## 最佳实践

### 1. 任务类型选择

```typescript
// 场景判断
if (needVisualReasoning) {
  // 使用多模态模型
  model = 'claude-3-5-sonnet-20241022';  // 或 gpt-4o
} else if (needLogAnalysis) {
  // 使用纯文本模型(节省成本)
  model = 'gpt-4o-mini';  // 或 claude-3-haiku
} else {
  // 直接API调用,不用LLM
  await fetch('/computer-use/action', { ... });
}
```

### 2. 成本优化

```typescript
// 动态选择模型
const detectTaskType = (description: string) => {
  if (description.includes('截图') || description.includes('找到')) {
    return 'VISUAL';  // 需要视觉
  }
  if (description.includes('日志') || description.includes('分析')) {
    return 'TEXT';    // 纯文本
  }
  return 'COMMAND';   // 直接执行
};

const model = taskType === 'VISUAL'
  ? 'claude-3-5-sonnet-20241022'  // $3-15/M tokens
  : 'claude-3-haiku-20240307';     // $0.25-1.25/M tokens
```

### 3. 错误处理

```typescript
// 标准版
try {
  const response = await service.generateMessage(...);
  const toolResults = await executeTools(response);
} catch (error) {
  if (error.name === 'BytebotAgentInterrupt') {
    // 用户中断
  } else {
    // 标记任务失败
    await tasksService.update(taskId, { status: 'FAILED' });
  }
}

// CC版
try {
  for await (const message of query(...)) {
    // 处理消息
  }
} catch (error) {
  if (error.message === 'Claude Code process aborted by user') {
    // 用户中断
  }
}
```

### 4. 监控指标

```typescript
// 关键指标
{
  taskId: string,
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
  tokenUsage: {
    inputTokens: number,
    outputTokens: number,
    totalTokens: number
  },
  duration: number,  // ms
  iterationCount: number,
  errorCount: number
}
```

---

## 常见问题

### Q1: 两个模式可以同时运行吗?

**答**: 不能。原因:
- 端口冲突(都用9991)
- 数据库冲突(scheduler会抢任务)
- UI只能连一个agent

如果真要同时运行,需要:
- 修改其中一个的端口
- 使用不同的数据库
- 禁用其中一个的scheduler

但**不推荐**,因为没有实际意义。

### Q2: CC模式可以看到桌面预览吗?

**答**: 可以!CC模式包含完整的:
- ✅ Web UI (9992端口)
- ✅ VNC桌面预览
- ✅ 任务管理
- ✅ 实时消息流

唯一区别是Agent层的实现,UI层完全相同。

### Q3: 如何切换模式?

```bash
# 停止当前模式
docker-compose -f docker/docker-compose.yml down

# 启动另一个模式
docker-compose -f docker/docker-compose-claude-code.yml up -d

# 数据库数据保留在volume中,任务历史不会丢失
```

### Q4: Claude Code模式可以用OpenAI吗?

**答**: 不能。`@anthropic-ai/claude-code` SDK只支持Anthropic的Claude模型。

如果需要多模型支持,必须使用标准模式。

### Q5: MCP工具可以在标准模式中使用吗?

**答**: 不能直接使用。标准模式通过HTTP REST API调用desktop,不使用MCP协议。

但bytebotd的MCP Server在两种模式下都启动了,理论上可以手动连接。

### Q6: 性能差异大吗?

**答**: 不大。主要差异:
- CC模式启动更快(代码更少)
- 单次任务延迟差异<100ms
- CC模式内存占用更少

对于实际使用,两者性能几乎相同。

---

## 参考资源

### 官方文档
- [Bytebot GitHub](https://github.com/bytebot-ai/bytebot)
- [Claude Code Docs](https://docs.claude.com/en/docs/claude-code/overview)
- [Anthropic API Docs](https://docs.anthropic.com/)

### 相关文件
- `CLAUDE.md` - Bytebot完整架构文档
- `docker/docker-compose.yml` - 标准模式部署
- `docker/docker-compose-claude-code.yml` - CC模式部署
- `packages/bytebot-agent/` - 标准版源码
- `packages/bytebot-agent-cc/` - CC版源码
- `packages/bytebotd/` - Desktop Daemon源码

### 关键代码位置

**标准版**:
- `packages/bytebot-agent/src/agent/agent.processor.ts` - 任务执行核心
- `packages/bytebot-agent/src/agent/agent.computer-use.ts` - 桌面操作
- `packages/bytebot-agent/src/anthropic/anthropic.service.ts` - Anthropic集成
- `packages/bytebot-agent/src/openai/openai.service.ts` - OpenAI集成

**CC版**:
- `packages/bytebot-agent-cc/src/agent/agent.processor.ts` - query()调用
- `packages/bytebot-agent-cc/src/tasks/tasks.controller.ts` - 模型列表

**Desktop**:
- `packages/bytebotd/src/computer-use/computer-use.service.ts` - 操作执行
- `packages/bytebotd/src/nut/nut.service.ts` - nut-js封装
- `packages/bytebotd/src/mcp/computer-use.tools.ts` - MCP工具定义

---

## 更新日志

- **2025-01-16**: 初始版本,基于Bytebot代码分析
- 涵盖标准版和CC版的完整对比
- 包含部署指南、最佳实践、常见问题

---

## 贡献

如有问题或建议,请在项目中提Issue或PR。
