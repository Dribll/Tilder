import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const monitorSourceDir = path.join(projectRoot, 'TilderMonitorService');
const targetExePath = path.join(projectRoot, 'src-tauri', 'windows', 'monitor_bin', 'TilderMonitorService.exe');

function getLatestMtime(dir) {
  let latest = 0;
  if (!fs.existsSync(dir)) return latest;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'bin' || entry.name === 'obj' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, getLatestMtime(fullPath));
    } else {
      const stat = fs.statSync(fullPath);
      latest = Math.max(latest, stat.mtimeMs);
    }
  }
  return latest;
}

function shouldBuild() {
  if (process.argv.includes('--force')) return true;
  if (!fs.existsSync(targetExePath)) return true;

  const exeStat = fs.statSync(targetExePath);
  const latestSourceMtime = getLatestMtime(monitorSourceDir);

  return latestSourceMtime > exeStat.mtimeMs;
}

if (shouldBuild()) {
  console.log('[build:monitor] Changes detected or binary missing. Publishing TilderMonitorService...');
  execSync(
    'dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ../src-tauri/windows/monitor_bin',
    { cwd: monitorSourceDir, stdio: 'inherit' }
  );
  console.log('[build:monitor] Completed successfully.');
} else {
  console.log('[build:monitor] Up to date (binary matches sources). Skipping dotnet publish.');
}
