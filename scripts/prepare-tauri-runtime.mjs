import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcTauriDir = path.join(projectRoot, 'src-tauri');
const binariesDir = path.join(srcTauriDir, 'binaries');
const stagedAppDir = path.join(srcTauriDir, 'resources', 'app');
const releaseAppDir = path.join(srcTauriDir, 'target', 'release', 'app');
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
    // Fall back to `rustc -vV` for older toolchains.
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

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
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

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (stats.isDirectory()) {
    await withRetry(() => copyDir(sourcePath, targetPath));
  } else {
    await withRetry(() => fs.copyFile(sourcePath, targetPath));
  }
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(task, retries = 6) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        break;
      }

      await delay(350 * (attempt + 1));
    }
  }

  throw lastError;
}

async function syncStageToReleaseRuntime() {
  const releaseDirExists = await fs.stat(path.dirname(releaseAppDir)).then(() => true).catch(() => false);
  if (!releaseDirExists) {
    return;
  }

  await withRetry(() => fs.rm(releaseAppDir, { recursive: true, force: true }));
  await fs.mkdir(path.dirname(releaseAppDir), { recursive: true });
  await withRetry(() => copyDir(stagedAppDir, releaseAppDir));
  await withRetry(() => fs.copyFile(path.join(projectRoot, 'localRunner.js'), path.join(releaseAppDir, 'localRunner.js')));
}

async function syncStageToDebugRuntime() {
  const debugAppDir = path.join(srcTauriDir, 'target', 'debug', 'app');
  const debugDirExists = await fs.stat(path.dirname(debugAppDir)).then(() => true).catch(() => false);
  if (!debugDirExists) {
    return;
  }

  await withRetry(() => fs.rm(debugAppDir, { recursive: true, force: true }));
  await fs.mkdir(path.dirname(debugAppDir), { recursive: true });
  await withRetry(() => copyDir(stagedAppDir, debugAppDir));
  await withRetry(() => fs.copyFile(path.join(projectRoot, 'localRunner.js'), path.join(debugAppDir, 'localRunner.js')));
  console.log(`Mirrored runtime assets into ${debugAppDir}`);
}

async function main() {
  const targetTriple = resolveTargetTriple();
  const nodeBinaryPath = process.execPath;
  const extension = process.platform === 'win32' ? '.exe' : '';
  const bundledBinaryPath = path.join(binariesDir, `tilder-node-${targetTriple}${extension}`);

  await fs.access(distDir);
  await fs.access(nodeModulesDir);

  await fs.mkdir(binariesDir, { recursive: true });
  await fs.copyFile(nodeBinaryPath, bundledBinaryPath);

  await withRetry(() => fs.rm(stagedAppDir, { recursive: true, force: true }));
  await fs.mkdir(stagedAppDir, { recursive: true });

  await copyIntoStage('server.js');
  await copyIntoStage('server');
  await copyIntoStage('shared');
  await copyIntoStage(path.join('src', 'core', 'extensionsCatalog.js'));
  await copyIntoStage('localRunner.js');
  await copyIntoStage('package.json');
  await copyIntoStage('package-lock.json');
  await copyIntoStage('tilder_monitor_service.ps1');
  await copyIntoStage('dist');

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    console.log('Running in development mode: skipping node_modules copy to save time and prevent watch loops.');
    const devNodeModulesDir = path.join(stagedAppDir, 'node_modules');
    await fs.mkdir(devNodeModulesDir, { recursive: true });
    await fs.writeFile(path.join(devNodeModulesDir, '.placeholder'), 'placeholder for tauri resources check in dev mode');
  } else {
    await copyIntoStage('node_modules');

    // Remove packages with deeply nested paths that exceed Windows MAX_PATH (260 chars)
    // and break the NSIS/MSI installer bundler.
    const deepNestedPackages = [
      path.join(stagedAppDir, 'node_modules', '@vscjava'),
    ];
    for (const pkg of deepNestedPackages) {
      const exists = await fs.stat(pkg).then(() => true).catch(() => false);
      if (exists) {
        await withRetry(() => fs.rm(pkg, { recursive: true, force: true }));
        console.log(`Removed deeply nested package from bundle: ${pkg}`);
      }
    }
  }

  const envPath = path.join(projectRoot, '.env');
  const hasEnvFile = await fs.stat(envPath).then(() => true).catch(() => false);
  if (hasEnvFile) {
    await copyIntoStage('.env');
  }

  await syncStageToReleaseRuntime();
  await syncStageToDebugRuntime();

  console.log(`Prepared Tauri runtime assets in ${stagedAppDir}`);
  console.log(`Mirrored runtime assets into ${releaseAppDir}`);
  console.log(`Copied Node runtime to ${bundledBinaryPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
