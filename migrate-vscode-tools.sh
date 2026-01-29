#!/bin/bash

# VSCode Tools 项目迁移脚本
# 用途：将更新后的 vscode-tools 迁移到干净的新目录

set -e  # 遇到错误立即退出

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 配置
SOURCE_DIR="/home/yyy/Projects/Platform/vscode-tools"
TARGET_DIR="/home/yyy/Projects/Platform/vscode-tools-v2"

echo -e "${GREEN}=== VSCode Tools 项目迁移工具 ===${NC}"
echo ""

# 检查源目录是否存在
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}错误: 源目录不存在: $SOURCE_DIR${NC}"
    exit 1
fi

# 检查目标目录是否已存在
if [ -d "$TARGET_DIR" ]; then
    echo -e "${YELLOW}警告: 目标目录已存在: $TARGET_DIR${NC}"
    read -p "是否删除并重新创建？(y/N): " confirm
    if [ "$confirm" == "y" ] || [ "$confirm" == "Y" ]; then
        echo "删除旧目录..."
        rm -rf "$TARGET_DIR"
    else
        echo "取消操作"
        exit 0
    fi
fi

echo -e "${GREEN}步骤 1: 创建新目录${NC}"
mkdir -p "$TARGET_DIR"

echo -e "${GREEN}步骤 2: 复制源代码文件${NC}"

# 复制根目录配置文件
echo "  - 复制根目录配置..."
cp "$SOURCE_DIR/package.json" "$TARGET_DIR/"
[ -f "$SOURCE_DIR/package-lock.json" ] && cp "$SOURCE_DIR/package-lock.json" "$TARGET_DIR/"
[ -f "$SOURCE_DIR/pnpm-lock.yaml" ] && cp "$SOURCE_DIR/pnpm-lock.yaml" "$TARGET_DIR/"

# 如果使用 pnpm 但没有 workspace 配置文件，创建它
if [ -f "$SOURCE_DIR/pnpm-lock.yaml" ] && [ ! -f "$SOURCE_DIR/pnpm-workspace.yaml" ]; then
    echo "  - 创建 pnpm-workspace.yaml..."
    echo "packages:" > "$TARGET_DIR/pnpm-workspace.yaml"
    echo "  - 'packages/*'" >> "$TARGET_DIR/pnpm-workspace.yaml"
elif [ -f "$SOURCE_DIR/pnpm-workspace.yaml" ]; then
    cp "$SOURCE_DIR/pnpm-workspace.yaml" "$TARGET_DIR/"
fi

cp "$SOURCE_DIR/biome.json" "$TARGET_DIR/"
cp "$SOURCE_DIR/.gitignore" "$TARGET_DIR/"

# 复制 extension 包
echo "  - 复制 extension 包..."
mkdir -p "$TARGET_DIR/packages/extension/src"
cp "$SOURCE_DIR/packages/extension/package.json" "$TARGET_DIR/packages/extension/"
cp "$SOURCE_DIR/packages/extension/tsconfig.json" "$TARGET_DIR/packages/extension/"
cp "$SOURCE_DIR/packages/extension/rsbuild.config.ts" "$TARGET_DIR/packages/extension/"
cp -r "$SOURCE_DIR/packages/extension/src"/* "$TARGET_DIR/packages/extension/src/"

# 复制 webview-ui 包
echo "  - 复制 webview-ui 包..."
mkdir -p "$TARGET_DIR/packages/webview-ui/src"
cp "$SOURCE_DIR/packages/webview-ui/package.json" "$TARGET_DIR/packages/webview-ui/"
cp "$SOURCE_DIR/packages/webview-ui/tsconfig.json" "$TARGET_DIR/packages/webview-ui/"
cp "$SOURCE_DIR/packages/webview-ui/rsbuild.config.ts" "$TARGET_DIR/packages/webview-ui/"
cp -r "$SOURCE_DIR/packages/webview-ui/src"/* "$TARGET_DIR/packages/webview-ui/src/"

# 复制文档（如果存在）
if [ -d "$SOURCE_DIR/doc" ]; then
    echo "  - 复制文档..."
    mkdir -p "$TARGET_DIR/doc"
    cp -r "$SOURCE_DIR/doc"/* "$TARGET_DIR/doc/" 2>/dev/null || true
fi

# 复制 README（如果存在）
if [ -f "$SOURCE_DIR/README.md" ]; then
    echo "  - 复制 README..."
    cp "$SOURCE_DIR/README.md" "$TARGET_DIR/"
fi

# 复制 .vscode 配置（如果需要）
if [ -d "$SOURCE_DIR/.vscode" ]; then
    echo "  - 复制 .vscode 配置..."
    mkdir -p "$TARGET_DIR/.vscode"
    cp -r "$SOURCE_DIR/.vscode"/* "$TARGET_DIR/.vscode/"
fi

echo -e "${GREEN}步骤 3: 初始化 Git 仓库${NC}"
cd "$TARGET_DIR"
git init
git add .
git commit -m "Initial commit: Clean vscode-tools project

Migrated from: $SOURCE_DIR
Date: $(date)

Features:
- Chat interface with streaming support
- Generator-based API stream
- Tool calling system
- Mode management (code, architect, ask, debug)
- Context collection
- UI components (ToolBlock, ReasoningBlock, etc.)
"

echo -e "${GREEN}步骤 4: 安装依赖${NC}"
# 检测使用哪个包管理器
if command -v pnpm &> /dev/null && [ -f "$SOURCE_DIR/pnpm-lock.yaml" ]; then
    echo "  - 检测到 pnpm，使用 pnpm 安装依赖..."
    pnpm install
elif [ -f "$SOURCE_DIR/pnpm-lock.yaml" ]; then
    echo -e "${YELLOW}  - 警告: 项目使用 pnpm 但未安装，使用 npm 安装...${NC}"
    npm install
else
    echo "  - 使用 npm 安装依赖..."
    npm install
fi

echo -e "${GREEN}步骤 5: 构建项目${NC}"
# 使用对应的包管理器构建
if command -v pnpm &> /dev/null && [ -f "pnpm-lock.yaml" ]; then
    echo "  - 使用 pnpm 构建..."
    pnpm build --filter @vscode-tools/webview-ui
else
    echo "  - 使用 npm 构建..."
    npm run build
fi

echo ""
echo -e "${GREEN}=== 迁移完成！ ===${NC}"
echo ""
echo "新项目位置: $TARGET_DIR"
echo ""
echo "后续步骤："
echo "  1. cd $TARGET_DIR"
echo "  2. 按 F5 在 VSCode 中启动调试"
echo "  3. 测试所有功能是否正常"
echo ""
if [ -f "$TARGET_DIR/pnpm-lock.yaml" ]; then
    echo "项目使用 pnpm，常用命令："
    echo "  pnpm install                                     # 安装依赖"
    echo "  pnpm build --filter @vscode-tools/webview-ui    # 构建 UI"
    echo "  pnpm build --filter @vscode-tools/webview-ui --watch  # 监听模式"
else
    echo "项目使用 npm，常用命令："
    echo "  npm install                                      # 安装依赖"
    echo "  npm run build                                    # 完整构建"
fi
echo ""
echo "如果需要推送到远程仓库："
echo "  git remote add origin <your-repo-url>"
echo "  git push -u origin main"
echo ""
