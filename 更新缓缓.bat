@echo off
chcp 65001 >nul
rem The entire block is parsed before updating this batch file.
(
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-local.ps1" -Target "%~dp0."
  pause
  exit /b
)
