# Bytebot MCP Server 使用指南

## 概述

Bytebot MCP Server 是一个基于 Model Context Protocol (MCP) 的桌面自动化服务，通过 SSE (Server-Sent Events) 协议为 Claude Code 提供完整的计算机控制能力。

**服务信息**：
- **端点地址**: http://localhost:9990/mcp
- **协议类型**: SSE (Server-Sent Events)
- **服务进程**: bytebotd (Desktop Daemon)
- **端口**: 9990
- **工具数量**: 16 个 computer use tools

---

## 一、在 Claude Code 中配置使用

### 1.1 配置文件说明

项目根目录已包含以下配置文件：

#### `.mcp.json` - MCP 服务器定义
```json
{
  "mcpServers": {
    "bytebot": {
      "type": "sse",
      "url": "http://localhost:9990/mcp"
    }
  }
}
```

#### `.claude/settings.local.json` - Claude Code 启用配置
```json
{
  "enabledMcpjsonServers": [
    "bytebot"
  ],
  "enableAllProjectMcpServers": true
}
```

### 1.2 启动 MCP Server

**前置要求**：
- Node.js 环境
- 已安装依赖

**启动步骤**：

```bash
# 1. 构建 shared 包（如果未构建）
cd packages/shared
npm install && npm run build

# 2. 安装 bytebotd 依赖
cd ../bytebotd
npm install

# 3. 启动 bytebotd 服务
npm run start:dev
```

**验证服务状态**：
```bash
# 检查服务是否运行
curl http://localhost:9990/mcp

# 如果返回 SSE 连接，说明服务正常
```

### 1.3 在 Claude Code 中使用

启动 bytebotd 服务后，MCP tools 会自动加载到 Claude Code 中，你可以直接使用：

**示例对话**：
```
User: 帮我截个屏
Claude: [调用 computer_screenshot tool]

User: 移动鼠标到坐标 (500, 300)
Claude: [调用 computer_move_mouse tool]

User: 在屏幕上点击坐标 (800, 400)
Claude: [调用 computer_click_mouse tool]

User: 打开 Firefox 浏览器
Claude: [调用 computer_application tool with application="firefox"]
```

---

## 二、MCP Server 接口说明

### 2.1 鼠标控制工具

#### `computer_move_mouse` - 移动鼠标
**描述**: 将鼠标光标移动到指定坐标

**参数**:
```typescript
{
  coordinates: {
    x: number  // X 坐标
    y: number  // Y 坐标
  }
}
```

**示例**:
```json
{
  "coordinates": { "x": 500, "y": 300 }
}
```

**返回**:
```json
{
  "content": [{ "type": "text", "text": "mouse moved" }]
}
```

---

#### `computer_trace_mouse` - 鼠标轨迹移动
**描述**: 沿指定路径移动鼠标光标

**参数**:
```typescript
{
  path: Array<{
    x: number  // X 坐标
    y: number  // Y 坐标
  }>,
  holdKeys?: string[]  // 可选：移动时按住的键
}
```

**示例**:
```json
{
  "path": [
    { "x": 100, "y": 100 },
    { "x": 200, "y": 150 },
    { "x": 300, "y": 200 }
  ],
  "holdKeys": ["LeftShift"]
}
```

---

#### `computer_click_mouse` - 鼠标点击
**描述**: 在指定坐标或当前位置执行鼠标点击

**参数**:
```typescript
{
  coordinates?: {      // 可选：点击坐标，不提供则在当前位置点击
    x: number
    y: number
  },
  button: "left" | "right" | "middle",  // 鼠标按钮
  holdKeys?: string[],                  // 可选：点击时按住的键
  clickCount: number                    // 点击次数（2 = 双击）
}
```

**示例**:
```json
{
  "coordinates": { "x": 800, "y": 400 },
  "button": "left",
  "clickCount": 1
}
```

---

#### `computer_press_mouse` - 鼠标按下/释放
**描述**: 在指定坐标按下或释放鼠标按钮

**参数**:
```typescript
{
  coordinates?: {
    x: number
    y: number
  },
  button: "left" | "right" | "middle",
  press: "down" | "up"  // "down" = 按下, "up" = 释放
}
```

**示例**:
```json
{
  "coordinates": { "x": 500, "y": 300 },
  "button": "left",
  "press": "down"
}
```

---

#### `computer_drag_mouse` - 鼠标拖拽
**描述**: 从起点沿路径拖拽鼠标（按住按钮）

**参数**:
```typescript
{
  path: Array<{
    x: number  // 路径点坐标
    y: number
  }>,  // 第一个坐标是起点
  button: "left" | "right" | "middle",
  holdKeys?: string[]
}
```

**示例**:
```json
{
  "path": [
    { "x": 100, "y": 100 },
    { "x": 300, "y": 300 }
  ],
  "button": "left"
}
```

---

#### `computer_scroll` - 鼠标滚轮
**描述**: 向上、下、左、右滚动鼠标滚轮

**参数**:
```typescript
{
  coordinates?: {
    x: number
    y: number
  },
  direction: "up" | "down" | "left" | "right",
  scrollCount: number,  // 滚动次数
  holdKeys?: string[]
}
```

**示例**:
```json
{
  "direction": "down",
  "scrollCount": 5
}
```

---

### 2.2 键盘控制工具

#### `computer_type_keys` - 按键序列
**描述**: 模拟按键序列，用于快捷键（如 Ctrl+C）

**参数**:
```typescript
{
  keys: string[],  // 按键名称数组
  delay?: number   // 可选：按键之间的延迟（毫秒）
}
```

**有效按键列表**:
```
A-Z, 0-9, F1-F24
LeftControl, RightControl, LeftShift, RightShift
LeftAlt, RightAlt, LeftCmd, RightCmd, LeftWin, RightWin
Enter, Return, Backspace, Delete, Tab, Escape, Space
Up, Down, Left, Right, Home, End, PageUp, PageDown
```

**示例**:
```json
{
  "keys": ["LeftControl", "C"]  // Ctrl+C
}
```

---

#### `computer_press_keys` - 按键按下/释放
**描述**: 按下或释放指定按键（用于按住修饰键）

**参数**:
```typescript
{
  keys: string[],
  press: "down" | "up"  // "down" = 按下, "up" = 释放
}
```

**示例**:
```json
{
  "keys": ["LeftShift"],
  "press": "down"
}
```

---

#### `computer_type_text` - 输入文本
**描述**: 逐字符输入文本字符串（适用于短文本或敏感字段）

**参数**:
```typescript
{
  text: string,   // 要输入的文本
  delay?: number  // 可选：字符之间的延迟（毫秒）
}
```

**使用场景**: 少于 25 字符的文本、密码、敏感表单字段

**示例**:
```json
{
  "text": "Hello World",
  "delay": 50
}
```

---

#### `computer_paste_text` - 粘贴文本
**描述**: 通过剪贴板粘贴文本（适用于长文本）

**参数**:
```typescript
{
  text: string  // 要粘贴的文本
}
```

**使用场景**: 长文本字符串、特殊字符、非标准键盘字符

**示例**:
```json
{
  "text": "这是一段很长的文本内容..."
}
```

---

### 2.3 应用控制工具

#### `computer_application` - 打开/切换应用
**描述**: 打开或切换到指定应用并最大化

**参数**:
```typescript
{
  application: "firefox" | "1password" | "thunderbird" |
               "vscode" | "terminal" | "desktop" | "directory"
}
```

**应用映射**:
- `firefox`: Firefox 浏览器
- `1password`: 1Password 密码管理器
- `thunderbird`: Thunderbird 邮件客户端
- `vscode`: Visual Studio Code
- `terminal`: XFCE 终端
- `desktop`: 显示桌面
- `directory`: 文件管理器

**示例**:
```json
{
  "application": "firefox"
}
```

---

#### `computer_wait` - 等待延迟
**描述**: 暂停执行指定时长

**参数**:
```typescript
{
  duration: number  // 等待时长（毫秒），默认 500ms
}
```

**示例**:
```json
{
  "duration": 1000  // 等待 1 秒
}
```

---

### 2.4 系统操作工具

#### `computer_screenshot` - 截图
**描述**: 捕获当前屏幕截图

**参数**: 无

**返回**:
```json
{
  "content": [{
    "type": "image",
    "data": "base64_encoded_png_data",
    "mimeType": "image/png"
  }]
}
```

**注意**: 返回的图片会自动压缩到 1MB 以下

---

#### `computer_cursor_position` - 获取光标位置
**描述**: 获取当前鼠标光标的 (x, y) 坐标

**参数**: 无

**返回**:
```json
{
  "content": [{
    "type": "text",
    "text": "{\"x\":500,\"y\":300}"
  }]
}
```

---

#### `computer_write_file` - 写入文件
**描述**: 将 base64 编码的数据写入指定路径

**参数**:
```typescript
{
  path: string,  // 文件路径
  data: string   // Base64 编码的文件数据
}
```

**示例**:
```json
{
  "path": "/home/user/Desktop/test.txt",
  "data": "SGVsbG8gV29ybGQ="  // "Hello World" 的 base64
}
```

---

#### `computer_read_file` - 读取文件
**描述**: 从指定路径读取文件，返回 base64 编码的数据

**参数**:
```typescript
{
  path: string  // 文件路径
}
```

**返回**:
```json
{
  "content": [{
    "type": "document",
    "source": {
      "type": "base64",
      "media_type": "application/octet-stream",
      "data": "base64_encoded_data"
    },
    "name": "file",
    "size": 1234
  }]
}
```

---

## 三、技术架构

### 3.1 服务实现

**目录结构**:
```
packages/bytebotd/src/mcp/
├── bytebot-mcp.module.ts    # MCP 模块定义
├── computer-use.tools.ts     # Tool 定义和实现
├── compressor.ts             # 图片压缩工具
└── index.ts                  # 导出
```

**关键依赖**:
- `@rekog/mcp-nest`: NestJS MCP 集成
- `@nut-tree-fork/nut-js`: 桌面自动化
- `uiohook-napi`: 输入事件监听
- `sharp`: 图片处理

### 3.2 工作流程

```
Claude Code
    ↓ (MCP Protocol / SSE)
http://localhost:9990/mcp
    ↓
BytebotMcpModule (@rekog/mcp-nest)
    ↓
ComputerUseTools (Tool Definitions)
    ↓
ComputerUseService (Desktop Automation)
    ↓
NutService (@nut-tree-fork/nut-js)
    ↓
Linux X11 / Desktop System
```

### 3.3 服务启动配置

**main.ts** (packages/bytebotd/src/main.ts:28):
```typescript
const server = await app.listen(9990);
```

**bytebot-mcp.module.ts**:
```typescript
McpModule.forRoot({
  name: 'bytebotd',
  version: '0.0.1',
  sseEndpoint: '/mcp',
})
```

---

## 四、使用示例

### 4.1 基础操作示例

**示例 1: 截图并保存**
```
User: 帮我截个屏并保存到桌面
Claude:
1. [调用 computer_screenshot]
2. [调用 computer_write_file with path="/home/user/Desktop/screenshot.png"]
```

**示例 2: 打开浏览器并搜索**
```
User: 打开 Firefox 搜索 "MCP Protocol"
Claude:
1. [调用 computer_application with application="firefox"]
2. [调用 computer_wait with duration=2000]
3. [调用 computer_click_mouse] 点击地址栏
4. [调用 computer_paste_text with text="MCP Protocol"]
5. [调用 computer_type_keys with keys=["Enter"]]
```

**示例 3: 文件操作**
```
User: 读取桌面上的 config.json 文件
Claude:
[调用 computer_read_file with path="/home/user/Desktop/config.json"]
```

### 4.2 复杂工作流示例

**示例: 自动化表单填写**
```
User: 在网页表单中填写我的信息
Claude:
1. [computer_screenshot] 查看当前页面
2. [computer_click_mouse] 点击姓名字段
3. [computer_paste_text] 输入姓名
4. [computer_type_keys with ["Tab"]] 跳转到下一字段
5. [computer_paste_text] 输入邮箱
6. [computer_type_keys with ["Tab"]]
7. [computer_paste_text] 输入电话
8. [computer_click_mouse] 点击提交按钮
```

---

## 五、故障排查

### 5.1 服务无法启动

**问题**: bytebotd 服务启动失败

**解决方案**:
```bash
# 1. 检查端口占用
lsof -i :9990

# 2. 检查依赖安装
cd packages/bytebotd
npm install

# 3. 检查 shared 包是否构建
cd ../shared
npm run build

# 4. 查看详细日志
cd ../bytebotd
npm run start:dev
```

### 5.2 Claude Code 无法连接

**问题**: Claude Code 中看不到 MCP tools

**解决方案**:
1. 确认 bytebotd 服务正在运行（http://localhost:9990/mcp）
2. 检查 `.mcp.json` 配置正确
3. 检查 `.claude/settings.local.json` 中 `enabledMcpjsonServers` 包含 "bytebot"
4. 重启 Claude Code

### 5.3 工具执行失败

**问题**: 工具调用返回错误

**常见原因**:
- **权限问题**: uiohook 可能需要 sudo 权限
- **显示问题**: 确保 DISPLAY 环境变量正确（通常为 `:0`）
- **应用未安装**: 确保目标应用已安装（如 Firefox）

**调试方法**:
```bash
# 检查环境变量
echo $DISPLAY

# 测试 GUI 访问
xdotool getactivewindow

# 查看 bytebotd 日志
# 日志会显示具体错误信息
```

---

## 六、相关文档

- **架构文档**: `/CLAUDE.md` - Bytebot 完整架构说明
- **环境配置**: `/packages/bytebot-agent-cc/README-ENV.md` - 环境变量配置
- **Docker 部署**: `/docker/docker-compose.yml` - 容器化部署
- **MCP 协议**: https://modelcontextprotocol.io/ - MCP 官方文档

---

## 七、许可证

本项目采用 Apache 2.0 许可证开源。

---

**文档版本**: 1.0
**最后更新**: 2025-01-27
**维护者**: Bytebot Team
