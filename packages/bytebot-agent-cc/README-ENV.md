# bytebot-agent-cc 环境变量配置指南

本文档说明如何在 `bytebot-agent-cc` 目录下配置 Anthropic API 相关的环境变量。

## 快速配置（3 步完成）

### 1️⃣ 创建 .env 文件

```bash
cd packages/bytebot-agent-cc
cp .env.example .env
```

### 2️⃣ 编辑 .env 文件

使用你喜欢的编辑器打开 `.env` 文件：

```bash
# 使用 vim
vim .env

# 或使用 nano
nano .env

# 或使用 VS Code
code .env
```

### 3️⃣ 设置必要的环境变量

```bash
# 必填：Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here

# 可选：自定义 Base URL（如果不设置，默认使用官方 API）
ANTHROPIC_BASE_URL=http://your-proxy.example.com/v1

# 必填：数据库连接
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb

# 必填：Desktop 服务地址
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990

# 可选：分析端点
BYTEBOT_ANALYTICS_ENDPOINT=
```

## 完整配置示例

### 场景 1: 使用 Anthropic 官方 API（默认）

```bash
# .env 文件内容
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990
BYTEBOT_ANALYTICS_ENDPOINT=

# 不需要设置 ANTHROPIC_BASE_URL，SDK 会自动使用官方地址
```

### 场景 2: 使用自定义代理服务器

```bash
# .env 文件内容
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb
ANTHROPIC_API_KEY=your-proxy-api-key
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990
ANTHROPIC_BASE_URL=http://18.143.44.170:4000/api
BYTEBOT_ANALYTICS_ENDPOINT=
```

### 场景 3: 使用 LiteLLM 本地代理

```bash
# .env 文件内容
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb
ANTHROPIC_API_KEY=sk-litellm-master-key
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990
ANTHROPIC_BASE_URL=http://localhost:8000/v1
BYTEBOT_ANALYTICS_ENDPOINT=
```

### 场景 4: 使用 OpenRouter

```bash
# .env 文件内容
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb
ANTHROPIC_API_KEY=sk-or-v1-xxxxxxxxxxxxx
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
BYTEBOT_ANALYTICS_ENDPOINT=
```

## 配置方法详解

### 方法 1: .env 文件（推荐 - 本地开发）

NestJS 会通过 `@nestjs/config` 自动加载 `.env` 文件。

**优点**:
- 配置集中管理
- 不会污染系统环境
- 易于在不同环境切换
- `.gitignore` 已包含 `.env`，不会意外提交敏感信息

**步骤**:
```bash
# 1. 复制示例文件
cp .env.example .env

# 2. 编辑配置
vim .env

# 3. 启动服务（会自动加载 .env）
npm run start:dev
```

### 方法 2: 命令行环境变量（临时测试）

直接在启动命令前设置环境变量：

```bash
# Linux/macOS
ANTHROPIC_API_KEY=sk-ant-xxx \
ANTHROPIC_BASE_URL=http://localhost:8000/v1 \
npm run start:dev

# 或者使用 export（当前 shell 会话有效）
export ANTHROPIC_API_KEY=sk-ant-xxx
export ANTHROPIC_BASE_URL=http://localhost:8000/v1
npm run start:dev
```

**Windows (PowerShell)**:
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-xxx"
$env:ANTHROPIC_BASE_URL="http://localhost:8000/v1"
npm run start:dev
```

**Windows (CMD)**:
```cmd
set ANTHROPIC_API_KEY=sk-ant-xxx
set ANTHROPIC_BASE_URL=http://localhost:8000/v1
npm run start:dev
```

### 方法 3: 系统环境变量（持久化）

将环境变量添加到系统配置文件：

**Linux/macOS (bash)**:
```bash
# 编辑 ~/.bashrc 或 ~/.bash_profile
echo 'export ANTHROPIC_API_KEY=sk-ant-xxx' >> ~/.bashrc
echo 'export ANTHROPIC_BASE_URL=http://localhost:8000/v1' >> ~/.bashrc
source ~/.bashrc
```

**Linux/macOS (zsh)**:
```bash
# 编辑 ~/.zshrc
echo 'export ANTHROPIC_API_KEY=sk-ant-xxx' >> ~/.zshrc
echo 'export ANTHROPIC_BASE_URL=http://localhost:8000/v1' >> ~/.zshrc
source ~/.zshrc
```

**Windows (系统环境变量)**:
1. 右键"此电脑" → 属性 → 高级系统设置
2. 环境变量 → 新建用户变量
3. 添加 `ANTHROPIC_API_KEY` 和 `ANTHROPIC_BASE_URL`

### 方法 4: IDE 配置（VS Code / WebStorm）

**VS Code - launch.json**:

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug bytebot-agent-cc",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "start:debug"],
      "cwd": "${workspaceFolder}/packages/bytebot-agent-cc",
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-xxx",
        "ANTHROPIC_BASE_URL": "http://localhost:8000/v1",
        "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/bytebotdb",
        "BYTEBOT_DESKTOP_BASE_URL": "http://localhost:9990"
      },
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    }
  ]
}
```

**WebStorm/IntelliJ IDEA**:
1. Run → Edit Configurations
2. 选择 npm 配置或创建新的
3. Environment variables 中添加配置

## 验证配置

### 1. 检查环境变量是否加载

启动服务后，查看日志输出：

```bash
npm run start:dev
```

应该看到类似输出：
```
Starting bytebot-agent application...
[NestApplication] Nest application successfully started
```

### 2. 测试 API 连接

创建测试任务验证配置：

```bash
curl -X POST http://localhost:9991/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "description": "测试配置: 请回复 hello world",
    "model": {
      "provider": "anthropic",
      "name": "claude-code",
      "title": "Claude Code",
      "contextWindow": 200000
    }
  }'
```

### 3. 检查日志输出

如果配置正确，应该看到：
```
[AgentProcessor] Starting processing for task ID: xxx
[AgentProcessor] Processing iteration for task ID: xxx
```

如果配置错误，会看到错误信息：
```
Error: Invalid API key
Error: Connection refused (检查 BASE_URL)
```

## 常见问题排查

### ❌ 问题 1: API Key 未加载

**症状**:
```
Error: Missing ANTHROPIC_API_KEY environment variable
```

**解决方案**:
```bash
# 检查 .env 文件是否存在
ls -la packages/bytebot-agent-cc/.env

# 检查 .env 文件内容
cat packages/bytebot-agent-cc/.env | grep ANTHROPIC_API_KEY

# 确保没有多余空格
ANTHROPIC_API_KEY=sk-ant-xxx  # ✅ 正确
ANTHROPIC_API_KEY = sk-ant-xxx  # ❌ 错误（有空格）
```

### ❌ 问题 2: Base URL 格式错误

**症状**:
```
Error: Invalid URL
Error: 404 Not Found
```

**解决方案**:
```bash
# 正确格式（注意 /v1 结尾，无尾部斜杠）
ANTHROPIC_BASE_URL=http://localhost:8000/v1  # ✅
ANTHROPIC_BASE_URL=https://api.example.com/v1  # ✅

# 错误格式
ANTHROPIC_BASE_URL=http://localhost:8000  # ❌ 缺少 /v1
ANTHROPIC_BASE_URL=http://localhost:8000/v1/  # ❌ 多余斜杠
```

### ❌ 问题 3: .env 文件未生效

**可能原因**:
1. 文件名错误（应该是 `.env` 不是 `env` 或 `.env.local`）
2. 文件不在正确目录（应该在 `packages/bytebot-agent-cc/` 下）
3. 权限问题

**解决方案**:
```bash
# 检查文件位置和权限
ls -la packages/bytebot-agent-cc/.env

# 确保可读权限
chmod 644 packages/bytebot-agent-cc/.env

# 重启服务
npm run start:dev
```

### ❌ 问题 4: 连接代理服务器失败

**症状**:
```
Error: connect ECONNREFUSED
Error: getaddrinfo ENOTFOUND
```

**解决方案**:
```bash
# 1. 检查代理服务是否运行
curl http://localhost:8000/health
curl http://18.143.44.170:4000/api/health

# 2. 检查防火墙设置
# 3. 如果是远程服务器，确保端口开放
# 4. 检查 URL 是否正确（协议、端口、路径）
```

### ❌ 问题 5: 环境变量被系统变量覆盖

NestJS 的 `@nestjs/config` 加载优先级：
1. 系统环境变量（最高优先级）
2. `.env` 文件
3. 默认值

**解决方案**:
```bash
# 检查是否有系统环境变量干扰
env | grep ANTHROPIC

# 如果有，临时取消
unset ANTHROPIC_API_KEY
unset ANTHROPIC_BASE_URL

# 然后重启服务
npm run start:dev
```

## 环境变量完整列表

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `ANTHROPIC_API_KEY` | ✅ | 无 | Anthropic API 密钥 |
| `ANTHROPIC_BASE_URL` | ❌ | `https://api.anthropic.com` | API 端点地址 |
| `DATABASE_URL` | ✅ | 无 | PostgreSQL 连接字符串 |
| `BYTEBOT_DESKTOP_BASE_URL` | ✅ | 无 | Desktop 服务地址 |
| `BYTEBOT_ANALYTICS_ENDPOINT` | ❌ | 空 | 分析数据上报端点 |
| `PORT` | ❌ | `9991` | 服务监听端口 |
| `ANTHROPIC_MODEL` | ❌ | SDK 默认 | 指定使用的模型 |

## 高级配置

### 配置多个模型

虽然 `bytebot-agent-cc` 主要使用 Claude Code SDK，但你可以通过环境变量切换模型：

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022  # 使用特定版本
```

**注意**: Claude Code SDK 可能不支持所有模型，建议使用默认模型。

### 配置代理（企业环境）

如果你的网络需要通过代理访问外网：

```bash
# .env
HTTP_PROXY=http://proxy.company.com:8080
HTTPS_PROXY=http://proxy.company.com:8080
NO_PROXY=localhost,127.0.0.1,postgres
```

### 配置调试日志

```bash
# .env
DEBUG=anthropic:*  # 启用 Anthropic SDK 调试日志
LOG_LEVEL=debug    # NestJS 日志级别
```

## 安全最佳实践

### 1. 不要提交 .env 文件

`.gitignore` 已经包含了 `.env`，但请确认：

```bash
# 检查 .env 是否被忽略
git status | grep .env

# 如果显示 .env 文件，立即从暂存区移除
git rm --cached packages/bytebot-agent-cc/.env
```

### 2. 使用强密钥

```bash
# ✅ 推荐：使用官方 API Key
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ❌ 不推荐：使用弱密钥或测试密钥
ANTHROPIC_API_KEY=test-key
```

### 3. 定期轮换密钥

1. 在 Anthropic 控制台创建新密钥
2. 更新 `.env` 文件
3. 重启服务
4. 删除旧密钥

### 4. 限制文件权限

```bash
# 确保 .env 文件只有所有者可读
chmod 600 packages/bytebot-agent-cc/.env

# 验证权限
ls -la packages/bytebot-agent-cc/.env
# 应该显示: -rw------- (600)
```

## 生产环境部署

生产环境建议使用密钥管理服务，而不是 `.env` 文件：

### Docker 部署

参考 `docker/docker-compose-claude-code.yml`

### Kubernetes 部署

使用 Secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: bytebot-agent-secrets
type: Opaque
stringData:
  ANTHROPIC_API_KEY: sk-ant-xxx
  ANTHROPIC_BASE_URL: http://proxy:8000/v1
---
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: bytebot-agent-cc
        envFrom:
        - secretRef:
            name: bytebot-agent-secrets
```

## 相关资源

- **主配置文档**: `/docs/anthropic-base-url-configuration.md`
- **Docker 配置**: `/docker/docker-compose-claude-code.yml`
- **示例配置**: `/packages/bytebot-agent-cc/.env.example`
- **Anthropic 官方文档**: https://docs.anthropic.com/
- **NestJS Config 文档**: https://docs.nestjs.com/techniques/configuration

## 需要帮助？

如果配置过程中遇到问题：

1. 检查日志输出：`npm run start:dev`
2. 验证配置文件：`cat .env`
3. 测试网络连接：`curl $ANTHROPIC_BASE_URL`
4. 查看详细文档：`/docs/anthropic-base-url-configuration.md`
