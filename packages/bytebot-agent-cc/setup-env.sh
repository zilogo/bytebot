#!/bin/bash

# bytebot-agent-cc 环境变量快速配置脚本
# 用法: ./setup-env.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

echo "================================================"
echo "  Bytebot Agent CC - 环境变量配置向导"
echo "================================================"
echo ""

# 检查是否已存在 .env 文件
if [ -f "$ENV_FILE" ]; then
    echo "⚠️  检测到已存在的 .env 文件"
    read -p "是否要备份并创建新的配置? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        BACKUP_FILE="$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$ENV_FILE" "$BACKUP_FILE"
        echo "✅ 已备份到: $BACKUP_FILE"
    else
        echo "❌ 配置已取消"
        exit 0
    fi
fi

# 复制示例文件
if [ -f "$ENV_EXAMPLE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "✅ 已从 .env.example 创建 .env 文件"
else
    echo "⚠️  未找到 .env.example，创建空白配置文件"
    touch "$ENV_FILE"
fi

echo ""
echo "请选择配置场景:"
echo "1) Anthropic 官方 API (默认)"
echo "2) 自定义代理服务器"
echo "3) LiteLLM 本地代理"
echo "4) OpenRouter"
echo "5) 手动编辑 .env 文件"
echo ""
read -p "请选择 (1-5): " -n 1 -r SCENARIO
echo ""
echo ""

case $SCENARIO in
    1)
        echo "📝 配置场景: Anthropic 官方 API"
        echo ""
        read -p "请输入 ANTHROPIC_API_KEY: " API_KEY

        cat > "$ENV_FILE" <<EOF
# Bytebot Agent CC 配置
# 场景: Anthropic 官方 API

# 数据库连接
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb

# Anthropic API 配置
ANTHROPIC_API_KEY=$API_KEY
# ANTHROPIC_BASE_URL 留空使用官方 API

# Desktop 服务地址
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990

# 分析端点（可选）
BYTEBOT_ANALYTICS_ENDPOINT=
EOF
        ;;

    2)
        echo "📝 配置场景: 自定义代理服务器"
        echo ""
        read -p "请输入 ANTHROPIC_API_KEY: " API_KEY
        read -p "请输入 ANTHROPIC_BASE_URL (例: http://proxy.example.com/v1): " BASE_URL

        cat > "$ENV_FILE" <<EOF
# Bytebot Agent CC 配置
# 场景: 自定义代理服务器

# 数据库连接
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb

# Anthropic API 配置
ANTHROPIC_API_KEY=$API_KEY
ANTHROPIC_BASE_URL=$BASE_URL

# Desktop 服务地址
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990

# 分析端点（可选）
BYTEBOT_ANALYTICS_ENDPOINT=
EOF
        ;;

    3)
        echo "📝 配置场景: LiteLLM 本地代理"
        echo ""
        read -p "请输入 LiteLLM Master Key: " API_KEY
        read -p "请输入 LiteLLM 地址 (默认: http://localhost:8000/v1): " BASE_URL
        BASE_URL=${BASE_URL:-http://localhost:8000/v1}

        cat > "$ENV_FILE" <<EOF
# Bytebot Agent CC 配置
# 场景: LiteLLM 本地代理

# 数据库连接
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb

# Anthropic API 配置 (通过 LiteLLM)
ANTHROPIC_API_KEY=$API_KEY
ANTHROPIC_BASE_URL=$BASE_URL

# Desktop 服务地址
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990

# 分析端点（可选）
BYTEBOT_ANALYTICS_ENDPOINT=
EOF
        ;;

    4)
        echo "📝 配置场景: OpenRouter"
        echo ""
        read -p "请输入 OpenRouter API Key (sk-or-v1-...): " API_KEY

        cat > "$ENV_FILE" <<EOF
# Bytebot Agent CC 配置
# 场景: OpenRouter

# 数据库连接
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bytebotdb

# Anthropic API 配置 (通过 OpenRouter)
ANTHROPIC_API_KEY=$API_KEY
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1

# Desktop 服务地址
BYTEBOT_DESKTOP_BASE_URL=http://localhost:9990

# 分析端点（可选）
BYTEBOT_ANALYTICS_ENDPOINT=
EOF
        ;;

    5)
        echo "📝 跳过自动配置，请手动编辑 .env 文件"
        echo ""
        echo "文件位置: $ENV_FILE"
        ;;

    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

# 设置文件权限（仅所有者可读写）
chmod 600 "$ENV_FILE"

echo ""
echo "================================================"
echo "✅ 配置完成！"
echo "================================================"
echo ""
echo "配置文件位置: $ENV_FILE"
echo "权限设置: -rw------- (600)"
echo ""
echo "查看配置:"
echo "  cat $ENV_FILE"
echo ""
echo "编辑配置:"
echo "  vim $ENV_FILE"
echo "  # 或"
echo "  code $ENV_FILE"
echo ""
echo "启动服务:"
echo "  npm run start:dev"
echo ""
echo "验证配置:"
echo "  npm run start:dev 2>&1 | grep -i 'error\\|success'"
echo ""
echo "================================================"
echo "📚 更多帮助: 查看 README-ENV.md"
echo "================================================"
