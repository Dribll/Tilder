import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const isDev = process.argv.includes('--dev');
console.log(`[build:desktop] Starting desktop build in ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'} mode...`);

// Step 1: Incremental Monitor Build
// (already handled by predesktop:dev / predesktop:build npm hooks — skip if run standalone)
if (!process.env.npm_lifecycle_event?.startsWith('desktop:')) {
  console.log('\n[build:desktop] Step 1/3: Checking monitor service...');
  execSync('node scripts/build-monitor-if-needed.mjs', { cwd: projectRoot, stdio: 'inherit' });
} else {
  console.log('\n[build:desktop] Step 1/3: Monitor already built by pre-hook. ✓');
}

// Step 2: Vite Build
console.log('\n[build:desktop] Step 2/3: Building frontend with Vite...');
execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });

// Step 3: Fast Runtime Preparation
console.log('\n[build:desktop] Step 3/3: Staging Tauri runtime assets...');
const devFlag = isDev ? ' --dev' : '';
execSync(`node scripts/prepare-tauri-runtime.mjs${devFlag}`, { cwd: projectRoot, stdio: 'inherit' });

console.log('\n[build:desktop] All desktop runtime assets ready! ✨');
