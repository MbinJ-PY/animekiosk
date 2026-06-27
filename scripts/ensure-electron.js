'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');
const pathFile = path.join(electronDir, 'path.txt');
const versionFile = path.join(distDir, 'version');
const exePath = path.join(distDir, process.platform === 'win32' ? 'electron.exe' : 'electron');

function installedVersion() {
  try {
    return fs.readFileSync(versionFile, 'utf8').replace(/^v/, '').trim();
  } catch {
    return null;
  }
}

function expectedVersion() {
  return require(path.join(electronDir, 'package.json')).version;
}

function isInstalled() {
  const expected = expectedVersion();
  const actual = installedVersion();
  return fs.existsSync(exePath) && fs.existsSync(pathFile) && actual === expected;
}

if (isInstalled()) {
  process.exit(0);
}

console.log('[postinstall] Electron binary missing or outdated — installing …');
console.log(`[postinstall] Expected v${expectedVersion()}, found ${installedVersion() ? 'v' + installedVersion() : 'nothing'}`);

try {
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
  if (fs.existsSync(pathFile)) fs.rmSync(pathFile, { force: true });
} catch (err) {
  console.warn('[postinstall] Could not clean old dist:', err.message);
}

try {
  execSync('node install.js', { cwd: electronDir, stdio: 'inherit', timeout: 300000 });
} catch (err) {
  console.warn('[postinstall] install.js failed, trying manual extraction …');
}

if (isInstalled()) {
  console.log('[postinstall] Electron ready:', installedVersion());
  process.exit(0);
}

const version = expectedVersion();
const cacheRoot = path.join(
  process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local'),
  'electron', 'Cache'
);

function findCachedZip() {
  if (!fs.existsSync(cacheRoot)) return null;
  const target = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  for (const hashDir of fs.readdirSync(cacheRoot)) {
    const zip = path.join(cacheRoot, hashDir, target);
    if (fs.existsSync(zip)) return zip;
  }
  return null;
}

const zip = findCachedZip();
if (!zip) {
  console.error('[postinstall] Download Electron first: npm install');
  console.error('[postinstall] Or run: node node_modules/electron/install.js');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
execSync(`tar -xf "${zip}" -C "${distDir}"`, { stdio: 'inherit' });
fs.writeFileSync(pathFile, process.platform === 'win32' ? 'electron.exe' : 'electron');
console.log('[postinstall] Electron extracted successfully:', installedVersion());
