#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v node >/dev/null 2>&1 && node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"; then
  exec node scripts/start-local.mjs
fi
if [ ! -f "打开缓缓.html" ]; then
  echo "没有找到离线预览文件。请安装 Node.js 22.12 或更新版本后运行 npm ci 和 npm run build。"
  exit 1
fi
echo "正在打开缓缓离线预览。请将文件保留在固定位置，以便下次找到记录。"
exec open "$PWD/打开缓缓.html"
