# Anthropic Base URL 配置指南

本文档说明如何配置 bytebot-agent-cc 使用不同的 Anthropic API 端点和认证方式。

## 快速开始

### 1. 创建环境变量文件

```bash
cd docker
cp .env.example .env
```

### 2. 编辑 .env 文件

根据你的使用场景选择相应的配置。

## 配置场景

### 场景 1: 直接使用 Anthropic 官方 API（默认）

```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
# ANTHROPIC_BASE_URL 可以不设置，默认为 https://api.anthropic.com
```

**适用于**: 直接使用 Anthropic 官方服务

### 场景 2: 使用 LiteLLM Proxy

LiteLLM 可以统一管理多个 LLM 提供商，提供缓存、负载均衡等功能。

```bash
ANTHROPIC_BASE_URL=http://bytebot-llm-proxy:8000/v1
ANTHROPIC_API_KEY=sk-your-litellm-key
```

**Docker Compose 配置**:
```yaml
# 在 docker-compose-claude-code.yml 中添加 LiteLLM 服务
services:
  bytebot-llm-proxy:
    build:
      context: ../packages/
      dockerfile: bytebot-llm-proxy/Dockerfile
    ports:
      - "8000:8000"
    environment:
      - LITELLM_MASTER_KEY=sk-your-litellm-master-key
    networks:
      - bytebot-network
```

**适用于**: 需要统一管理多个 API、缓存、限流等高级功能

### 场景 3: 使用 OpenRouter

OpenRouter 提供统一接口访问多个 LLM 提供商。

```bash
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1
ANTHROPIC_API_KEY=sk-or-v1-xxxxx
```

**注意事项**:
- OpenRouter 的 API Key 格式为 `sk-or-v1-`
- 需要在 OpenRouter 控制台中添加 credits
- 支持多种 Claude 模型

**适用于**: 需要访问多个 LLM 提供商、需要按量付费、无需管理多个 API Key

### 场景 4: 企业内网代理

企业可能通过内部代理访问外部 API，增加安全控制和审计。

```bash
ANTHROPIC_BASE_URL=https://api-gateway.company.com/anthropic/v1
ANTHROPIC_API_KEY=your-internal-api-key
```

**可能需要的额外配置**:
```yaml
# 在 bytebot-agent-cc 服务中添加
environment:
  - ANTHROPIC_BASE_URL=${ANTHROPIC_BASE_URL}
  - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
  - HTTP_PROXY=http://proxy.company.com:8080  # 如果需要
  - HTTPS_PROXY=http://proxy.company.com:8080 # 如果需要
  - NO_PROXY=localhost,127.0.0.1,bytebot-desktop,postgres
```

**适用于**: 企业环境、需要通过代理访问外网、需要审计日志

### 场景 5: AWS Bedrock（需要兼容层）

AWS Bedrock 提供 Claude 模型，但 API 格式不同，需要使用兼容层（如 LiteLLM）。

```bash
# 方案 A: 使用 LiteLLM 作为适配器
ANTHROPIC_BASE_URL=http://bytebot-llm-proxy:8000/v1
ANTHROPIC_API_KEY=sk-litellm-bedrock

# LiteLLM 配置文件 (litellm-config.yaml)
model_list:
  - model_name: claude-sonnet-4-5
    litellm_params:
      model: bedrock/anthropic.claude-sonnet-4-5-v2
      aws_access_key_id: ${AWS_ACCESS_KEY_ID}
      aws_secret_access_key: ${AWS_SECRET_ACCESS_KEY}
      aws_region_name: us-east-1
```

**适用于**: 使用 AWS 云服务、需要在 AWS 环境中运行、需要 AWS 计费

### 场景 6: Google Vertex AI（需要兼容层）

Google Vertex AI 也提供 Claude 模型，同样需要兼容层。

```bash
# 使用 LiteLLM 作为适配器
ANTHROPIC_BASE_URL=http://bytebot-llm-proxy:8000/v1
ANTHROPIC_API_KEY=sk-litellm-vertex

# LiteLLM 配置文件 (litellm-config.yaml)
model_list:
  - model_name: claude-sonnet-4-5
    litellm_params:
      model: vertex_ai/claude-sonnet-4-5@20250929
      vertex_project: your-gcp-project
      vertex_location: us-central1
      vertex_credentials: ${GOOGLE_APPLICATION_CREDENTIALS}
```

**适用于**: 使用 GCP 云服务、需要在 Google Cloud 中运行、需要 GCP 计费

### 场景 7: 自建兼容 API 服务

如果你有自己实现的兼容 Anthropic API 的服务：

```bash
ANTHROPIC_BASE_URL=http://your-custom-api.example.com/v1
ANTHROPIC_API_KEY=your-custom-key
```

**API 兼容性要求**:
- 需要实现 Anthropic Messages API 格式
- 支持 Tool Use 功能
- 支持流式响应（SSE）
- 端点: `POST /v1/messages`

**适用于**: 自建 LLM 服务、本地部署模型、特殊定制需求

## 认证方式详解

### 1. API Key 认证（最常见）

Claude Code SDK 会自动读取 `ANTHROPIC_API_KEY` 环境变量：

```typescript
// SDK 内部自动处理，无需代码修改
process.env.ANTHROPIC_API_KEY  // 自动读取
```

### 2. 代理认证（通过 LiteLLM）

当使用 LiteLLM 时，认证流程：

```
Client (bytebot-agent-cc)
  ↓ ANTHROPIC_API_KEY=sk-litellm-key
LiteLLM Proxy (验证 master key)
  ↓ 使用配置的真实凭证
Real Provider (Anthropic/AWS/GCP)
```

### 3. AWS/GCP 凭证（通过 LiteLLM）

需要传递云服务凭证到 LiteLLM 容器：

```yaml
bytebot-llm-proxy:
  environment:
    - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
    - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    - AWS_REGION_NAME=us-east-1
    # 或者 GCP
    - GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
  volumes:
    - ~/.aws:/root/.aws:ro  # AWS 凭证
    - ~/.config/gcloud:/root/.config/gcloud:ro  # GCP 凭证
```

## 验证配置

### 1. 启动服务

```bash
cd docker
docker-compose -f docker-compose-claude-code.yml up -d
```

### 2. 查看日志

```bash
# 查看 agent-cc 日志
docker logs -f bytebot-agent-cc

# 应该看到类似输出（如果配置正确）:
# [AgentProcessor] AgentProcessor initialized
# [TasksService] Tasks service initialized
```

### 3. 测试 API 连接

创建一个测试任务来验证配置：

```bash
curl -X POST http://localhost:9991/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "description": "测试连接: 请回复 hello",
    "model": {
      "provider": "anthropic",
      "name": "claude-code",
      "title": "Claude Code",
      "contextWindow": 200000
    }
  }'
```

### 4. 检查任务状态

```bash
# 获取任务 ID
TASK_ID=<上面返回的任务 ID>

# 查看任务状态
curl http://localhost:9991/tasks/$TASK_ID
```

## 常见问题

### Q1: 修改 BASE_URL 后无法连接

**检查清单**:
1. URL 格式是否正确（应该以 `/v1` 结尾，如 `https://api.example.com/v1`）
2. 代理服务是否可达（`docker exec bytebot-agent-cc curl $ANTHROPIC_BASE_URL`）
3. API Key 是否对应正确的服务
4. 防火墙/网络策略是否阻止连接

### Q2: LiteLLM 配置不生效

**解决方案**:
1. 检查 `litellm-config.yaml` 格式是否正确
2. 重启 LiteLLM 容器: `docker restart bytebot-llm-proxy`
3. 查看 LiteLLM 日志: `docker logs bytebot-llm-proxy`
4. 验证模型名称匹配

### Q3: AWS Bedrock/Vertex AI 认证失败

**解决方案**:
1. 确认凭证文件正确挂载到容器中
2. 检查 IAM/服务账号权限
3. 验证区域设置（`aws_region_name` / `vertex_location`）
4. 查看 LiteLLM 详细日志

### Q4: 企业代理环境下连接超时

**解决方案**:
1. 设置 HTTP_PROXY/HTTPS_PROXY 环境变量
2. 配置 NO_PROXY 排除内部服务
3. 验证代理服务器地址和端口
4. 检查是否需要代理认证（用户名/密码）

## URL 格式要求

Claude Code SDK 期望的 URL 格式：

```
正确 ✅:
https://api.anthropic.com/v1
http://localhost:8000/v1
https://proxy.example.com/anthropic/v1

错误 ❌:
https://api.anthropic.com (缺少 /v1)
http://localhost:8000 (缺少 /v1)
https://api.anthropic.com/v1/ (多余的尾部斜杠)
```

## 安全建议

1. **不要在代码中硬编码 API Key**
   - 始终使用环境变量
   - 不要提交 `.env` 文件到版本控制

2. **使用密钥管理服务**
   - 生产环境建议使用 AWS Secrets Manager、HashiCorp Vault 等
   - Docker Swarm: 使用 Docker Secrets
   - Kubernetes: 使用 Secrets 对象

3. **限制网络访问**
   - 使用防火墙规则限制出站流量
   - 仅允许必要的 API 端点访问

4. **监控 API 使用**
   - 记录所有 API 调用
   - 设置使用量告警
   - 定期轮换 API Key

## 相关文件

- `docker/docker-compose-claude-code.yml` - Docker Compose 配置
- `docker/.env.example` - 环境变量示例
- `packages/bytebot-agent-cc/src/agent/agent.processor.ts` - 使用 query() 的核心代码
- `packages/bytebot-llm-proxy/litellm-config.yaml` - LiteLLM 配置示例

## 参考资料

- [Anthropic API Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [Claude Code SDK Documentation](https://github.com/anthropics/claude-code)
- [LiteLLM Documentation](https://docs.litellm.ai/)
- [OpenRouter Documentation](https://openrouter.ai/docs)
