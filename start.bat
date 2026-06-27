@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Setting up Electron...
  node scripts\ensure-electron.js
)
npm start
