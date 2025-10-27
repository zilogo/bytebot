# Bytebot Claude Code Agent 验证指南

## 前提条件

确保您已完成以下配置:

1. **环境变量文件** (`docker/.env`)
   - ANTHROPIC_API_KEY 已设置
   - ANTHROPIC_BASE_URL 已配置
   - BYTEBOT_DESKTOP_BASE_URL=http://bytebot-desktop:9990

2. **代码修复已应用**
   - agent.processor.ts 已移除 bypassPermissions
   - Dockerfile 已添加非 root 用户配置

## 方法 1: 使用当前运行的容器 (最快)

### 步骤 1: 检查容器状态

```bash
cd /Users/leizhao/Projects/agent/bytebot
docker-compose -f docker/docker-compose-claude-code.yml ps
```

应该看到所有容器都在运行 (Up)。

### 步骤 2: 创建测试任务

```bash
curl -X POST "http://localhost:9991/api/tasks" \
    -H "Content-Type: application/json" \
    -d '{
      "description": "请打开终端并执行 echo hello world",
      "model": {
        "provider": "anthropic",
        "name": "claude-code",
        "title": "Claude Code",
        "contextWindow": 200000
      }
    }'
```

您会收到一个 JSON 响应,包含任务 ID。

### 步骤 3: 检查任务状态

```bash
# 替换 YOUR_TASK_ID 为上一步返回的 id
curl -s "http://localhost:9991/api/tasks/YOUR_TASK_ID" | jq .
```

等待几秒后再次查询,状态应该从 PENDING → RUNNING → COMPLETED。

### 步骤 4: 查看任务消息

```bash
curl -s "http://localhost:9991/api/tasks/YOUR_TASK_ID/messages" | jq .
```

应该能看到用户消息和助手的回复。

### 步骤 5: 访问 UI

打开浏览器访问:
```
http://localhost:9992
```

您可以在 UI 中查看任务执行情况和 VNC 桌面。

## 方法 2: 完全重启验证 (推荐)

### 步骤 1: 停止所有容器

```bash
cd /Users/leizhao/Projects/agent/bytebot
docker-compose -f docker/docker-compose-claude-code.yml down
```

### 步骤 2: 重新启动服务

```bash
docker-compose -f docker/docker-compose-claude-code.yml up -d
```

### 步骤 3: 查看日志确认启动成功

```bash
# 查看 agent 日志
docker-compose -f docker/docker-compose-claude-code.yml logs -f bytebot-agent-cc

# 等待看到 "Nest application successfully started"
# 按 Ctrl+C 停止查看日志
```

### 步骤 4: 创建测试任务并验证

按照方法 1 的步骤 2-5 执行。

## 方法 3: 完全重建验证 (网络恢复后)

当 Docker Hub 网络恢复后,执行完全重建:

### 步骤 1: 停止并删除容器

```bash
cd /Users/leizhao/Projects/agent/bytebot
docker-compose -f docker/docker-compose-claude-code.yml down -v
```

### 步骤 2: 重新构建镜像

```bash
docker-compose -f docker/docker-compose-claude-code.yml build --no-cache
```

这将使用非 root 用户构建新镜像。

### 步骤 3: 启动服务

```bash
docker-compose -f docker/docker-compose-claude-code.yml up -d
```

### 步骤 4: 验证非 root 用户

```bash
docker-compose -f docker/docker-compose-claude-code.yml exec bytebot-agent-cc whoami
```

应该显示 `nodejs` 而不是 `root`。

### 步骤 5: 创建测试任务并验证

按照方法 1 的步骤 2-5 执行。

## 测试用例

### 测试用例 1: 简单文本响应

```bash
curl -X POST "http://localhost:9991/api/tasks" \
    -H "Content-Type: application/json" \
    -d '{
      "description": "请回复: Hello from Bytebot!",
      "model": {"provider": "anthropic", "name": "claude-code", "title": "Claude Code", "contextWindow": 200000}
    }'
```

预期: 状态 COMPLETED, 助手回复 "Hello from Bytebot!" 或类似内容。

### 测试用例 2: 桌面操作

```bash
curl -X POST "http://localhost:9991/api/tasks" \
    -H "Content-Type: application/json" \
    -d '{
      "description": "请打开终端,执行 ls 命令,并告诉我看到了什么文件",
      "model": {"provider": "anthropic", "name": "claude-code", "title": "Claude Code", "contextWindow": 200000}
    }'
```

预期: 状态 COMPLETED, 助手会使用 computer tools 操作桌面并返回文件列表。

### 测试用例 3: MCP 工具调用

```bash
curl -X POST "http://localhost:9991/api/tasks" \
    -H "Content-Type: application/json" \
    -d '{
      "description": "请截取当前桌面的屏幕截图",
      "model": {"provider": "anthropic", "name": "claude-code", "title": "Claude Code", "contextWindow": 200000}
    }'
```

预期: 状态 COMPLETED, 助手会调用 computer_screenshot 工具。

## 故障排查

### 问题: 任务状态为 FAILED

```bash
# 查看详细错误日志
docker-compose -f docker/docker-compose-claude-code.yml logs --tail=100 bytebot-agent-cc
```

常见原因:
- ANTHROPIC_API_KEY 未设置或无效
- MCP 服务器连接失败 (检查 bytebot-desktop 容器状态)
- permissionMode 配置问题 (应该已移除)

### 问题: 容器无法启动

```bash
# 查看所有容器状态
docker-compose -f docker/docker-compose-claude-code.yml ps

# 查看特定容器日志
docker-compose -f docker/docker-compose-claude-code.yml logs bytebot-agent-cc
docker-compose -f docker/docker-compose-claude-code.yml logs bytebot-desktop
```

### 问题: 端口冲突

确保端口未被占用:
```bash
lsof -i :9990  # bytebotd
lsof -i :9991  # bytebot-agent-cc
lsof -i :9992  # bytebot-ui
lsof -i :5432  # postgres
```

## 验证清单

- [ ] 所有容器正常运行
- [ ] 环境变量正确配置
- [ ] API 可以创建任务
- [ ] 任务可以成功完成
- [ ] 可以通过 API 查看任务消息
- [ ] UI 可以正常访问
- [ ] VNC 桌面可以查看
- [ ] MCP 工具调用正常工作

## 配置文件位置

- **环境变量**: `docker/.env`
- **Docker Compose**: `docker/docker-compose-claude-code.yml`
- **Agent 代码**: `packages/bytebot-agent-cc/src/agent/agent.processor.ts`
- **Dockerfile**: `packages/bytebot-agent-cc/Dockerfile`

## 成功标志

✅ 任务状态从 PENDING → RUNNING → COMPLETED
✅ 可以在消息中看到助手的回复
✅ 日志中没有 "Claude Code process exited with code 1" 错误
✅ MCP 工具调用正常执行

## 下一步

成功验证后,您可以:
1. 尝试更复杂的任务
2. 通过 UI 创建和管理任务
3. 观察 VNC 中的实时桌面操作
4. 集成到您的工作流程中
