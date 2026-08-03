import express from 'express';
import http from 'node:http';
import os from 'node:os';
import { Server } from 'socket.io';
import * as pty from 'node-pty';
import { runLocalFile, runWorkspaceFile, syncWorkspaceMirror } from './localRunner.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.TILDER_TERMINAL_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const port = Number(process.env.TILDER_TERMINAL_PORT || 3210);
const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
const shellArgs = os.platform() === 'win32' ? ['-NoLogo'] : [];
const shellCwd = process.env.TILDER_TERMINAL_CWD || process.cwd();
const runnerBaseUrl = process.env.TILDER_RUNNER_URL || 'https://ce.judge0.com';

app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_request, response) => {
  try {
    const shells = await detectAvailableShells();
    response.json({
      ok: true,
      shell,
      cwd: shellCwd,
      profiles: shells.map(s => ({ id: s.path, label: s.name, path: s.path })),
      defaultProfileId: shell,
    });
  } catch (error) {
    response.status(500).json({ message: 'Failed to detect shells.' });
  }
});

async function detectAvailableShells() {
  const isWin = os.platform() === 'win32';
  const shells = [];

  if (isWin) {
    const commonPaths = [
      { name: 'PowerShell 7', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' },
      { name: 'PowerShell 7 (x86)', path: 'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe' },
      { name: 'Windows PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
      { name: 'Command Prompt', path: 'C:\\Windows\\System32\\cmd.exe' },
      { name: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe' },
      { name: 'Git Bash (User)', path: `${os.homedir()}\\AppData\\Local\\Programs\\Git\\bin\\bash.exe` },
    ];

    const fs = await import('node:fs/promises');
    for (const item of commonPaths) {
      try {
        await fs.access(item.path);
        shells.push(item);
      } catch {
        // Skip if not found
      }
    }

    if (!shells.some(s => s.name === 'Command Prompt')) {
      shells.push({ name: 'Command Prompt', path: 'cmd.exe' });
    }
    if (!shells.some(s => s.name === 'Windows PowerShell')) {
      shells.push({ name: 'Windows PowerShell', path: 'powershell.exe' });
    }
  } else {
    shells.push({ name: 'Default Shell', path: process.env.SHELL || '/bin/bash' });
  }

  return shells;
}

app.get('/api/terminal/shells', async (_request, response) => {
  try {
    const shells = await detectAvailableShells();
    response.json(shells);
  } catch (error) {
    response.status(500).json({ message: 'Failed to detect shells.' });
  }
});

app.get('/api/runner/languages', async (_request, response) => {
  try {
    const upstream = await fetch(`${runnerBaseUrl}/languages`);
    const data = await upstream.json();
    response.status(upstream.status).json(data);
  } catch {
    response.status(500).json({ message: 'Failed to load runner languages.' });
  }
});

app.post('/api/runner/run', async (request, response) => {
  try {
    const upstream = await fetch(`${runnerBaseUrl}/submissions?base64_encoded=false&wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body),
    });
    const data = await upstream.json();
    response.status(upstream.status).json(data);
  } catch {
    response.status(500).json({ message: 'Failed to run code.' });
  }
});

app.post('/api/terminal/run-file', async (request, response) => {
  try {
    const payload = request.body || {};
    const result = payload.relativePath
      ? await runWorkspaceFile(payload)
      : await runLocalFile(payload);
    response.json(result);
  } catch (error) {
    response.status(500).json({
      supported: true,
      ok: false,
      stderr: error instanceof Error ? error.message : 'Failed to execute local runner.',
    });
  }
});

app.post('/api/terminal/workspace-root', async (request, response) => {
  try {
    const result = await syncWorkspaceMirror(request.body || {});
    response.json(result);
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to sync workspace root.',
    });
  }
});

io.on('connection', (socket) => {
  const cols = Number(socket.handshake.query.cols || 120);
  const rows = Number(socket.handshake.query.rows || 30);
  const requestedShell = socket.handshake.query.shell;
  const targetShell = requestedShell || shell;
  const targetArgs = targetShell.includes('cmd.exe') ? ['/k'] : shellArgs;
  let activeShellCwd = '';

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(targetShell, targetArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: shellCwd,
      env: process.env,
    });
  } catch (error) {
    socket.emit('terminal:error', error instanceof Error ? error.message : 'Unable to start the terminal shell.');
    socket.disconnect(true);
    return;
  }

  ptyProcess.onData((data) => {
    socket.emit('terminal:output', data);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    socket.emit('terminal:error', `Terminal exited with code ${exitCode}${signal ? ` (${signal})` : ''}.`);
  });

  socket.on('terminal:input', (data) => {
    ptyProcess.write(data);
  });

  socket.on('terminal:resize', ({ cols: nextCols, rows: nextRows }) => {
    if (!nextCols || !nextRows) {
      return;
    }

    ptyProcess.resize(Number(nextCols), Number(nextRows));
  });

  socket.on('terminal:set-cwd', (nextPath) => {
    if (!nextPath) {
      return;
    }

    const normalizedNextPath = String(nextPath).trim();
    if (!normalizedNextPath || normalizedNextPath === activeShellCwd) {
      return;
    }

    activeShellCwd = normalizedNextPath;

    const lowerShell = targetShell.toLowerCase();
    if (lowerShell.includes('powershell') || lowerShell.includes('pwsh')) {
      const escapedPath = normalizedNextPath.replace(/'/g, "''");
      ptyProcess.write(`Set-Location -LiteralPath '${escapedPath}'\r`);
      return;
    }

    if (lowerShell.includes('cmd.exe')) {
      ptyProcess.write(`cd /d "${normalizedNextPath}"\r`);
      return;
    }

    const escapedPath = normalizedNextPath.replace(/"/g, '\\"');
    ptyProcess.write(`cd "${escapedPath}"\r`);
  });

  socket.on('disconnect', () => {
    ptyProcess.kill();
  });
});

server.listen(port, () => {
  console.log(`Tilder terminal bridge running on http://localhost:${port}`);
});
