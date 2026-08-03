import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import https from 'https';

const TILDER_LSP_DIR = path.join(os.homedir(), '.tilder', 'lsps');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const isWin = os.platform() === 'win32';
    const child = spawn(command, args, { cwd, shell: isWin, windowsHide: true });
    
    let output = '';
    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with code ${code}: ${output}`));
      }
    });
    child.on('error', reject);
  });
}

export async function downloadLsp(languageId) {
  ensureDir(TILDER_LSP_DIR);
  
  const isWin = os.platform() === 'win32';
  const binExt = isWin ? '.cmd' : '';
  const exeExt = isWin ? '.exe' : '';
  
  let lspPath = '';

  switch (languageId) {
    case 'javascript':
    case 'typescript':
    case 'javascriptreact':
    case 'typescriptreact':
      await runCommand('npm', ['install', '--prefix', TILDER_LSP_DIR, 'typescript-language-server', 'typescript'], TILDER_LSP_DIR);
      lspPath = path.join(TILDER_LSP_DIR, 'node_modules', '.bin', `typescript-language-server${binExt}`);
      break;
      
    case 'python':
      // Requires Python to be installed.
      const pythonCmd = isWin ? 'python' : 'python3';
      await runCommand(pythonCmd, ['-m', 'pip', 'install', '--target', path.join(TILDER_LSP_DIR, 'python-lsp'), 'python-lsp-server'], TILDER_LSP_DIR);
      lspPath = path.join(TILDER_LSP_DIR, 'python-lsp', 'bin', `pylsp${exeExt}`);
      break;
      
    case 'rust':
      const arch = process.arch === 'x64' ? 'x86_64' : 'aarch64';
      const osName = isWin ? 'pc-windows-msvc' : process.platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-gnu';
      const rustAnalyzerUrl = `https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-${arch}-${osName}.gz`;
      
      const zipPath = path.join(TILDER_LSP_DIR, 'rust-analyzer.gz');
      const binPath = path.join(TILDER_LSP_DIR, `rust-analyzer${exeExt}`);
      
      await downloadFile(rustAnalyzerUrl, zipPath);
      // We need to gunzip it. We can use Node's zlib.
      const zlib = await import('zlib');
      const readStream = fs.createReadStream(zipPath);
      const writeStream = fs.createWriteStream(binPath);
      const gunzip = zlib.createGunzip();
      
      await new Promise((resolve, reject) => {
        readStream.pipe(gunzip).pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });
      
      if (!isWin) fs.chmodSync(binPath, 0o755);
      fs.unlinkSync(zipPath);
      lspPath = binPath;
      break;
      
    case 'html':
    case 'css':
    case 'json':
      throw new Error(`Language Server for '${languageId}' must be manually installed (e.g. npm install -g vscode-langservers-extracted).`);

    case 'java':
      // Java JDTLS is complex. Fallback to generic message.
      throw new Error("Java Language Server (JDTLS) must be manually installed for now.");
      
    case 'c':
    case 'cpp':
      throw new Error("C/C++ Language Server (clangd) must be manually installed for now.");

    default:
      throw new Error(`Auto-downloading LSP for language '${languageId}' is not yet supported. Please install it manually.`);
  }

  return lspPath;
}

export function getDownloadedLspPath(languageId) {
  const isWin = os.platform() === 'win32';
  const binExt = isWin ? '.cmd' : '';
  const exeExt = isWin ? '.exe' : '';
  
  switch (languageId) {
    case 'javascript':
    case 'typescript':
    case 'javascriptreact':
    case 'typescriptreact':
      const tsPath = path.join(TILDER_LSP_DIR, 'node_modules', '.bin', `typescript-language-server${binExt}`);
      return fs.existsSync(tsPath) ? tsPath : null;
    case 'python':
      const pyPath = path.join(TILDER_LSP_DIR, 'python-lsp', 'bin', `pylsp${exeExt}`);
      return fs.existsSync(pyPath) ? pyPath : null;
    case 'rust':
      const rustPath = path.join(TILDER_LSP_DIR, `rust-analyzer${exeExt}`);
      return fs.existsSync(rustPath) ? rustPath : null;

  }
  return null;
}
