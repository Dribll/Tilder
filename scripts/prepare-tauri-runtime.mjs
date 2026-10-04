import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcTauriDir = path.join(projectRoot, 'src-tauri');
const binariesDir = path.join(srcTauriDir, 'binaries');
const stagedAppDir = path.join(srcTauriDir, 'resources', 'app');
const releaseAppDir = path.join(srcTauriDir, 'target', 'release', 'app');
const debugAppDir = path.join(srcTauriDir, 'target', 'debug', 'app');
const distDir = path.join(projectRoot, 'dist');
const nodeModulesDir = path.join(projectRoot, 'node_modules');

function resolveTargetTriple() {
  try {
    const triple = execFileSync('rustc', ['--print', 'host-tuple'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (triple) {
      return triple;
    }
  } catch {
    // Fall back to `rustc -vV`
  }

  const rustInfo = execFileSync('rustc', ['-vV'], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const match = rustInfo.match(/^host:\s+(.+)$/m);

  if (!match) {
    throw new Error('Unable to determine the Rust target triple for the Tauri sidecar.');
  }

  return match[1].trim();
}

async function copyFileIfChanged(src, dest) {
  try {
    const [srcStat, destStat] = await Promise.all([
      fs.stat(src),
      fs.stat(dest).catch(() => null)
    ]);
    if (destStat && srcStat.size === destStat.size && Math.abs(srcStat.mtimeMs - destStat.mtimeMs) < 1000) {
      return false; // already identical
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return true;
  } catch (err) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    return true;
  }
}

async function syncDirIncremental(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const [srcEntries, destEntries] = await Promise.all([
    fs.readdir(src, { withFileTypes: true }),
    fs.readdir(dest, { withFileTypes: true }).catch(() => [])
  ]);

  const srcNames = new Set(srcEntries.map((e) => e.name));

  // Remove files/dirs in dest that no longer exist in src
  for (const destEntry of destEntries) {
    if (!srcNames.has(destEntry.name)) {
      const destPath = path.join(dest, destEntry.name);
      await fs.rm(destPath, { recursive: true, force: true }).catch(() => {});
    }
  }

  // Copy updated/new files or recurse
  for (const srcEntry of srcEntries) {
    const srcPath = path.join(src, srcEntry.name);
    const destPath = path.join(dest, srcEntry.name);

    if (srcEntry.isDirectory()) {
      await syncDirIncremental(srcPath, destPath);
    } else {
      await copyFileIfChanged(srcPath, destPath);
    }
  }
}

async function copyIntoStage(sourceRelativePath) {
  const sourcePath = path.join(projectRoot, sourceRelativePath);
  const targetPath = path.join(stagedAppDir, sourceRelativePath);
  const stats = await fs.stat(sourcePath).catch(() => null);

  if (!stats) {
    throw new Error(`Required runtime asset is missing: ${sourceRelativePath}`);
  }

  if (stats.isDirectory()) {
    await syncDirIncremental(sourcePath, targetPath);
  } else {
    await copyFileIfChanged(sourcePath, targetPath);
  }
}

function computeFileHash(filePath) {
  try {
    const content = fsSync.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch {
    return '';
  }
}

function ensureTargetJunction(target, linkPath) {
  const parent = path.dirname(linkPath);
  if (!fsSync.existsSync(parent)) {
    return;
  }

  if (!fsSync.existsSync(linkPath)) {
    try {
      fsSync.symlinkSync(target, linkPath, 'junction');
      console.log(`[prepare-runtime] Linked ${linkPath} -> ${target} (junction)`);
    } catch (err) {
      console.warn(`[prepare-runtime] Could not create junction for ${linkPath}:`, err.message);
    }
  }
}

async function main() {
  const targetTriple = resolveTargetTriple();
  const nodeBinaryPath = process.execPath;
  const extension = process.platform === 'win32' ? '.exe' : '';
  const bundledBinaryPath = path.join(binariesDir, `tilder-node-${targetTriple}${extension}`);

  await fs.access(distDir);
  await fs.access(nodeModulesDir);

  await fs.mkdir(binariesDir, { recursive: true });
  await copyFileIfChanged(nodeBinaryPath, bundledBinaryPath);

  await fs.mkdir(stagedAppDir, { recursive: true });

  // Sync essential files incrementally (only changed files copied)
  await copyIntoStage('server.js');
  await copyIntoStage('server');
  await copyIntoStage('shared');
  await copyIntoStage(path.join('src', 'core', 'extensionsCatalog.js'));
  await copyIntoStage('localRunner.js');
  await copyIntoStage('package.json');
  await copyIntoStage('package-lock.json');
  await copyIntoStage('tilder_monitor_service.ps1');

  const rootEnvPath = path.join(projectRoot, '.env');
  const envExists = fsSync.existsSync(rootEnvPath);
  if (envExists) {
    await copyIntoStage('.env');
  } else {
    await fs.writeFile(path.join(stagedAppDir, '.env'), 'NODE_ENV=production\nPORT=33210\n');
  }

  // Sync dist
  await copyIntoStage('dist');

  const isDev = process.argv.includes('--dev');
  const stagedNodeModulesDir = path.join(stagedAppDir, 'node_modules');
  const hashFile = path.join(stagedAppDir, '.node_modules_synced_hash');
  const lockHash = computeFileHash(path.join(projectRoot, 'package-lock.json'));

  if (isDev) {
    console.log('[prepare-runtime] DEV mode: Fast-linking node_modules...');
    if (!fsSync.existsSync(stagedNodeModulesDir)) {
      try {
        fsSync.symlinkSync(nodeModulesDir, stagedNodeModulesDir, 'junction');
        console.log('[prepare-runtime] Created instant junction for node_modules.');
      } catch {
        await fs.mkdir(stagedNodeModulesDir, { recursive: true });
        await fs.writeFile(path.join(stagedNodeModulesDir, '.placeholder'), 'dev');
      }
    } else {
      console.log('[prepare-runtime] Staged node_modules already ready.');
    }
  } else {
    // Production build mode
    let isJunction = false;
    try {
      isJunction = fsSync.lstatSync(stagedNodeModulesDir).isSymbolicLink();
    } catch {}

    if (isJunction) {
      fsSync.unlinkSync(stagedNodeModulesDir);
    }

    const currentHash = fsSync.existsSync(hashFile) ? fsSync.readFileSync(hashFile, 'utf8').trim() : '';

    if (currentHash === lockHash && fsSync.existsSync(stagedNodeModulesDir)) {
      console.log('[prepare-runtime] Production node_modules are already up to date (hash match). Skipping copy.');
    } else {
      console.log('[prepare-runtime] Staging production node_modules via multi-threaded robocopy...');
      if (process.platform === 'win32') {
        try {
          execSync(
            `robocopy "${nodeModulesDir}" "${stagedNodeModulesDir}" /MIR /MT:16 /NFL /NDO /NJH /NJS /R:1 /W:1 /XD @vscjava`,
            { stdio: 'ignore' }
          );
        } catch (err) {
          // Robocopy returns codes 0-7 for successful sync
          if (err.status && err.status > 7) {
            console.warn('[prepare-runtime] Robocopy non-critical code:', err.status);
          }
        }
      } else {
        await syncDirIncremental(nodeModulesDir, stagedNodeModulesDir);
      }

      // Remove @vscjava if present (exceeds Windows MAX_PATH for NSIS)
      const vscJavaPath = path.join(stagedNodeModulesDir, '@vscjava');
      if (fsSync.existsSync(vscJavaPath)) {
        await fs.rm(vscJavaPath, { recursive: true, force: true }).catch(() => {});
      }

      if (lockHash) {
        fsSync.writeFileSync(hashFile, lockHash, 'utf8');
      }
      console.log('[prepare-runtime] Production node_modules staged.');
    }
  }

  // Link target/release/app and target/debug/app directly to stagedAppDir (instant zero-copy)
  ensureTargetJunction(stagedAppDir, releaseAppDir);
  ensureTargetJunction(stagedAppDir, debugAppDir);

  console.log(`[prepare-runtime] Tauri runtime assets staged in ${stagedAppDir}`);
}

main().catch((error) => {
  console.error('[prepare-runtime] Error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
