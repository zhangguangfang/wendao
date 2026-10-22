@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto portable
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 goto portable
node scripts\start-local.mjs
if errorlevel 1 pause
exit /b
:portable
if not exist "打开缓缓.html" (
  echo 没有找到离线预览文件。请安装 Node.js 22.12 或更新版本后运行 npm ci 和 npm run build。
  pause
  exit /b 1
)
echo 正在打开缓缓离线预览。请将文件保留在固定位置，以免浏览器无法找到原来的记录。
start "" "%~dp0打开缓缓.html"
