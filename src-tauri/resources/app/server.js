import 'dotenv/config';
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import si from 'systeminformation';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import * as pty from 'node-pty';
import simpleGit from 'simple-git';
import { runLocalFile, runWorkspaceFile, syncWorkspaceMirror } from './localRunner.js';
import {
  createMarketplacePublisher,
  createMarketplacePublisherToken,
  createMarketplaceSubmission,
  getMarketplacePublisher,
  listMarketplaceOwnedPublishers,
  listMarketplaceSubmissions,
  listMarketplacePublishers,
  listPublicMarketplace,
  publishMarketplacePackage,
  reviewMarketplaceSubmission,
  validateMarketplacePackage,
} from './server/extensionsMarketplace.js';
import { createLspBroker } from './server/lsp/broker.js';
import { getAllEditorLanguages, getLspAdapter, NATIVE_EDITOR_LANGUAGES } from './server/lsp/registry.js';
import { downloadLsp, getDownloadedLspPath } from './server/lsp/downloader.js';
import { createDapBroker } from './server/dap/broker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);




// Global Crash Logger to catch and inspect any hidden backend sidecar crashes
process.on('uncaughtException', (err) => {
  try {
    const appRootDir = process.env.TILDER_APP_ROOT || fileURLToPath(new URL('.', import.meta.url));
    const dataDir = process.env.TILDER_DATA_DIR || path.join(appRootDir, 'data');
    if (!fsSync.existsSync(dataDir)) {
      fsSync.mkdirSync(dataDir, { recursive: true });
    }
    const logPath = path.join(dataDir, 'node-error.log');
    fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] Uncaught Exception:\n${err.stack || err}\n\n`);
  } catch {}
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  try {
    const appRootDir = process.env.TILDER_APP_ROOT || fileURLToPath(new URL('.', import.meta.url));
    const dataDir = process.env.TILDER_DATA_DIR || path.join(appRootDir, 'data');
    if (!fsSync.existsSync(dataDir)) {
      fsSync.mkdirSync(dataDir, { recursive: true });
    }
    const logPath = path.join(dataDir, 'node-error.log');
    fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] Unhandled Rejection at: ${promise}\nReason:\n${reason?.stack || reason}\n\n`);
  } catch {}
});

const appRootDir = process.env.TILDER_APP_ROOT || __dirname;
const distPath = process.env.TILDER_DIST_DIR || path.join(appRootDir, 'dist');
const dataDir = process.env.TILDER_DATA_DIR || path.join(appRootDir, 'data');
let localNodeBinDir = path.join(appRootDir, 'node_modules', '.bin');
try {
  let current = appRootDir;
  while (true) {
    const candidate = path.join(current, 'node_modules', '.bin');
    if (fsSync.existsSync(candidate)) {
      localNodeBinDir = candidate;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
} catch {
  // Ignore error
}
const extendedCommandPath = [localNodeBinDir, process.env.PATH || ''].filter(Boolean).join(path.delimiter);
const syncStorePath = path.join(dataDir, 'sync-store.json');
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || '').trim().replace(/\/$/, '');
const configuredCorsOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
const allowedCorsOrigins = new Set([
  frontendBaseUrl,
  ...configuredCorsOrigins,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
  'app://localhost',
].filter(Boolean));

const app = express();
app.set('trust proxy', true);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      callback(null, isAllowedCorsOrigin(origin));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
const lspNamespace = io.of('/lsp');
const dapNamespace = io.of('/dap');

const port = Number(process.env.PORT || 3210);
const windowsDefaultShell = String(process.env.TILDER_TERMINAL_SHELL || '').trim();
const shellCwd = process.env.TILDER_TERMINAL_CWD || appRootDir;
const runnerBaseUrl = process.env.TILDER_RUNNER_URL || 'https://ce.judge0.com';
function locateGitOnWindows() {
  if (process.env.GIT_BINARY) {
    return process.env.GIT_BINARY;
  }
  const isWin = os.platform() === 'win32';
  if (!isWin) {
    return 'git';
  }

  // Check if standard 'git' command works in environment PATH
  try {
    execSync('git --version', { stdio: 'ignore' });
    return 'git';
  } catch (e) {
    // Standard git not in PATH
  }

  const userProfile = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const candidates = [
    path.join(programFiles, 'Git', 'cmd', 'git.exe'),
    path.join(programFiles, 'Git', 'bin', 'git.exe'),
    path.join(programFilesX86, 'Git', 'cmd', 'git.exe'),
    path.join(programFilesX86, 'Git', 'bin', 'git.exe'),
    path.join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'),
    path.join(localAppData, 'Programs', 'Git', 'bin', 'git.exe'),
  ];

  // Check typical GitHub Desktop locations dynamically
  const githubDesktopDir = path.join(localAppData, 'GitHubDesktop');
  if (fsSync.existsSync(githubDesktopDir)) {
    try {
      const subdirs = fsSync.readdirSync(githubDesktopDir);
      // find app-* folders
      const appDirs = subdirs
        .filter(name => name.startsWith('app-'))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })); // latest first
      for (const appDir of appDirs) {
        const gitPath = path.join(githubDesktopDir, appDir, 'resources', 'app', 'git', 'cmd', 'git.exe');
        if (fsSync.existsSync(gitPath)) {
          candidates.push(gitPath);
        }
        const gitPathMingw = path.join(githubDesktopDir, appDir, 'resources', 'app', 'git', 'mingw64', 'bin', 'git.exe');
        if (fsSync.existsSync(gitPathMingw)) {
          candidates.push(gitPathMingw);
        }
      }
    } catch (err) {
      // ignore
    }
  }

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'git'; // fallback
}

const gitBinary = locateGitOnWindows();
const githubSyncRepoName = process.env.TILDER_GITHUB_SYNC_REPO || 'tilder-settings-sync';
const githubSyncFilePath = process.env.TILDER_GITHUB_SYNC_FILE || 'settings-sync.json';
const SCM_GENERATED_SEGMENTS = new Set([
  '.git',
  '.next',
  '.nuxt',
  '.parcel-cache',
  '.svelte-kit',
  '.turbo',
  '.vercel',
  '.vite',
  '__pycache__',
  'bin',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'tmp',
]);
const SCM_STATUS_LABELS = {
  ' ': '',
  '!': 'Ignored',
  '?': 'Untracked',
  A: 'Added',
  C: 'Copied',
  D: 'Deleted',
  M: 'Modified',
  R: 'Renamed',
  U: 'Conflicted',
};
const sessionCookieName = 'tilder.sid';
const sessionPayloadCookieName = 'tilder.session';
const sessionSecretMaterial =
  process.env.TILDER_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.GITHUB_CLIENT_SECRET ||
  process.env.MICROSOFT_CLIENT_SECRET ||
  'tilder-session-secret';
const sessionEncryptionKey = crypto.createHash('sha256').update(String(sessionSecretMaterial)).digest();
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;
const defaultSyncPreferences = {
  syncSettings: true,
  syncLayout: true,
  syncShortcuts: true,
};
const sessionsPath = path.join(dataDir, 'sessions.json');
let sessionsMap = new Map();

// Load persisted sessions from disk on startup
try {
  if (!fsSync.existsSync(dataDir)) {
    fsSync.mkdirSync(dataDir, { recursive: true });
  }
  if (fsSync.existsSync(sessionsPath)) {
    const fileContent = fsSync.readFileSync(sessionsPath, 'utf8');
    const parsed = JSON.parse(fileContent);
    sessionsMap = new Map(Object.entries(parsed));
  }
} catch (err) {
  console.error('[Session Store] Failed to load sessions from disk:', err);
}

const sessions = {
  get(key) {
    return sessionsMap.get(key);
  },
  set(key, value) {
    sessionsMap.set(key, value);
    try {
      const obj = Object.fromEntries(sessionsMap.entries());
      fsSync.writeFileSync(sessionsPath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error('[Session Store] Failed to write sessions to disk:', err);
    }
    return this;
  },
  delete(key) {
    const deleted = sessionsMap.delete(key);
    if (deleted) {
      try {
        const obj = Object.fromEntries(sessionsMap.entries());
        fsSync.writeFileSync(sessionsPath, JSON.stringify(obj, null, 2), 'utf8');
      } catch (err) {
        console.error('[Session Store] Failed to write sessions to disk:', err);
      }
    }
    return deleted;
  }
};
const oauthStates = new Map();
const desktopAuthSessions = new Map();
const remoteWorkspaceSessions = new Map();
const remoteWorkspaceSessionTtlMs = 1000 * 60 * 60;
const extensionsAssetDir = path.join(dataDir, 'extensions-assets');
const extensionAdminIdentities = new Set(
  String(process.env.TILDER_EXTENSION_ADMINS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const providerConfig = {
  github: {
    label: 'GitHub',
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['read:user', 'user:email', 'repo'],
  },
  microsoft: {
    label: 'Microsoft',
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read'],
  },
};

const commandResolutionCache = new Map();
const commandResolutionTtlMs = 30_000;
let terminalProfilesCache = null;
let terminalProfilesCacheCheckedAt = 0;
const commonWindowsCommandLocations = {
  clangd: ['C:\\Program Files\\LLVM\\bin\\clangd.exe'],
  gopls: [path.join(os.homedir(), 'go', 'bin', 'gopls.exe')],
  'rust-analyzer': [path.join(os.homedir(), '.cargo', 'bin', 'rust-analyzer.exe')],
  fsautocomplete: [path.join(os.homedir(), '.dotnet', 'tools', 'fsautocomplete.exe')],
  'cmake-language-server': [path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts', 'cmake-language-server.exe')],
  fortls: [path.join(os.homedir(), 'AppData', 'Roaming', 'Python', 'Python314', 'Scripts', 'fortls.exe')],
  'lua-language-server': [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'lua-language-server.exe'),
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'Microsoft',
      'WinGet',
      'Packages',
      'LuaLS.lua-language-server_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'bin',
      'lua-language-server.exe'
    ),
  ],
  pwsh: [
    'C:\\Program Files\\WindowsApps\\Microsoft.PowerShell_7.6.1.0_x64__8wekyb3d8bbwe\\pwsh.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'pwsh.exe'),
  ],
  'wt.exe': [path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe')],
  wt: [path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe')],
};

app.use(express.json({ limit: '4mb' }));
app.use((request, response, next) => {
  applyCorsHeaders(request, response);

  if (request.method === 'OPTIONS') {
    response.status(isAllowedCorsOrigin(request.get('origin')) ? 204 : 403).end();
    return;
  }

  next();
});

function parseCookieHeader(raw = '') {
  return String(raw || '').split(';').reduce((bucket, entry) => {
    const [key, ...valueParts] = entry.trim().split('=');
    if (!key) {
      return bucket;
    }

    bucket[key] = decodeURIComponent(valueParts.join('=') || '');
    return bucket;
  }, {});
}

function parseCookies(request) {
  return parseCookieHeader(request.headers.cookie || '');
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value || '').trim()).origin;
  } catch {
    return '';
  }
}

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return true;
  }

  // Direct match first (handles non-http schemes like app://, tauri:// where URL.origin returns 'null')
  if (allowedCorsOrigins.has(origin.trim().replace(/\/$/, ''))) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  try {
    const url = new URL(normalizedOrigin);
    if (isLoopbackHostname(url.hostname)) {
      return true;
    }
  } catch {}

  if (allowedCorsOrigins.has(normalizedOrigin)) {
    return true;
  }

  const normalizedPublicBaseUrl = normalizeOrigin(publicBaseUrl);
  if (normalizedPublicBaseUrl && normalizedOrigin === normalizedPublicBaseUrl) {
    return true;
  }

  return false;
}

function applyCorsHeaders(request, response) {
  const origin = request.get('origin');
  if (!origin || !isAllowedCorsOrigin(origin)) {
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-tilder-session-id');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Vary', 'Origin');
}

function isLoopbackAddress(ip) {
  const address = String(ip || '').trim().toLowerCase().replace(/^::ffff:/, '');
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === 'localhost' ||
    address.startsWith('fe80:')
  );
}

function isLoopbackHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  return ['127.0.0.1', '::1', 'localhost', 'tauri.localhost'].includes(h) || h.endsWith('.localhost');
}

function getRuntimeModeFromValue(value, socket = null) {
  if (socket) {
    const address = socket.handshake?.address || socket.request?.connection?.remoteAddress || '';
    if (isLoopbackAddress(address)) {
      return 'desktop-local';
    }
  }

  try {
    if (!value) {
      return 'desktop-local';
    }
    const candidate = String(value || '').includes('://') ? String(value) : `http://${String(value || '').trim()}`;
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    
    if (
      isLoopbackHostname(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname === 'tauri.localhost'
    ) {
      return 'desktop-local';
    }
    return 'hosted-web';
  } catch {
    return 'desktop-local';
  }
}

function getRuntimeMode(request) {
  const remoteIp = request.ip || request.socket?.remoteAddress || '';
  if (isLoopbackAddress(remoteIp)) {
    return 'desktop-local';
  }

  const protocol = request.get('x-forwarded-proto') || request.protocol || 'http';
  return getRuntimeModeFromValue(`${protocol}://${request.get('host')}`);
}

function normalizeWorkspaceRoot(workspaceRoot) {
  const candidate = String(workspaceRoot || '').trim();
  if (!candidate) {
    return shellCwd;
  }

  return path.isAbsolute(candidate) ? candidate : shellCwd;
}

function pruneRemoteWorkspaceSessions() {
  const now = Date.now();

  for (const [sessionId, session] of remoteWorkspaceSessions.entries()) {
    if (now - Number(session.updatedAt || 0) <= remoteWorkspaceSessionTtlMs) {
      continue;
    }

    remoteWorkspaceSessions.delete(sessionId);
  }
}

async function upsertRemoteWorkspaceSession(ownerSessionId, payload, existingSessionId = '') {
  pruneRemoteWorkspaceSessions();

  const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
  const snapshot = {
    rootName: String(normalizedPayload.rootName || 'workspace'),
    entries: Array.isArray(normalizedPayload.entries) ? normalizedPayload.entries : [],
  };

  let sessionId = String(existingSessionId || '').trim();
  let existingSession = sessionId ? remoteWorkspaceSessions.get(sessionId) : null;

  if (existingSession && existingSession.ownerSessionId !== ownerSessionId) {
    throw new Error('That remote workspace session does not belong to the current user.');
  }

  if (!existingSession) {
    sessionId = crypto.randomUUID();
  }

  const mirror = await syncWorkspaceMirror({
    rootName: `remote-${sessionId}-${snapshot.rootName}`,
    entries: snapshot.entries,
    preserveGit: true,
  });

  const nextSession = {
    id: sessionId,
    ownerSessionId,
    rootName: snapshot.rootName,
    entriesCount: snapshot.entries.length,
    workspaceRoot: mirror.cwd,
    updatedAt: Date.now(),
  };

  remoteWorkspaceSessions.set(sessionId, nextSession);
  return nextSession;
}

function getRemoteWorkspaceSession(ownerSessionId, sessionId) {
  pruneRemoteWorkspaceSessions();

  const candidateId = String(sessionId || '').trim();
  if (!candidateId) {
    return null;
  }

  const session = remoteWorkspaceSessions.get(candidateId);
  if (!session) {
    return null;
  }

  // Hosted-web LSP sockets can arrive without the original session cookie on some
  // cross-origin/browser configurations. In that case, the opaque workspace-session
  // id itself acts as the capability to resume the mirrored workspace.
  if (ownerSessionId && session.ownerSessionId !== ownerSessionId) {
    return null;
  }

  session.updatedAt = Date.now();
  return session;
}

function resolveCommandCheckTool() {
  return os.platform() === 'win32'
    ? { command: 'where.exe', args: [] }
    : { command: 'which', args: [] };
}

function resolveCommandOnPath(commandName) {
  const cacheKey = String(commandName || '').trim();
  if (!cacheKey) {
    return Promise.resolve('');
  }

  const cached = commandResolutionCache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < commandResolutionTtlMs) {
    return Promise.resolve(cached.result);
  }

  const checker = resolveCommandCheckTool();

  return new Promise((resolve) => {
    const child = spawn(checker.command, [...checker.args, cacheKey], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      env: {
        ...process.env,
        PATH: extendedCommandPath,
      },
    });

    let stdout = '';
    const timeout = setTimeout(() => {
      child.kill();
    }, 3000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.on('error', () => {
      clearTimeout(timeout);
      commandResolutionCache.set(cacheKey, { checkedAt: Date.now(), result: '' });
      resolve('');
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      let result = '';
      if (code === 0) {
        const matches = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        if (os.platform() === 'win32') {
          const preferred =
            matches.find((entry) => /\.(cmd|exe|bat)$/i.test(entry)) ||
            matches[0] ||
            '';
          result = preferred;
        } else {
          result = matches[0] || '';
        }
      }
      commandResolutionCache.set(cacheKey, { checkedAt: Date.now(), result });
      resolve(result);
    });
  });
}

async function resolveInstalledCommand(commands = []) {
  for (const commandName of commands) {
    if (os.platform() === 'win32') {
      const knownLocations = commonWindowsCommandLocations[String(commandName || '').trim().toLowerCase()] || [];
      for (const candidate of knownLocations) {
        if (!candidate) {
          continue;
        }

        try {
          await fs.access(candidate);
          return candidate;
        } catch {
          // Keep searching.
        }
      }
    }

    const resolved = await resolveCommandOnPath(commandName);
    if (resolved) {
      return resolved;
    }
  }

  return '';
}

function quotePowerShellLiteral(value) {
  return String(value || '').replace(/'/g, "''");
}

function createWindowsTerminalProfile(id, label, commands, args = [], extras = {}) {
  return {
    id,
    label,
    commands: Array.isArray(commands) ? commands : [commands],
    args,
    kind: 'windows-shell',
    ...extras,
  };
}

async function resolveTerminalProfiles() {
  const cacheStillFresh = terminalProfilesCache && Date.now() - terminalProfilesCacheCheckedAt < commandResolutionTtlMs;
  if (cacheStillFresh) {
    return terminalProfilesCache;
  }

  const commandPrompt = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
  const configured = windowsDefaultShell
    ? createWindowsTerminalProfile('configured', 'Configured Shell', [windowsDefaultShell], [])
    : null;

  const candidates =
    os.platform() === 'win32'
      ? [
          configured,
          createWindowsTerminalProfile('pwsh', 'PowerShell 7', ['pwsh.exe', 'pwsh', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'], ['-NoLogo']),
          createWindowsTerminalProfile('powershell', 'Windows PowerShell', ['powershell.exe', 'powershell', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'], ['-NoLogo']),
          createWindowsTerminalProfile('cmd', 'Command Prompt', [commandPrompt, 'cmd.exe', 'C:\\Windows\\System32\\cmd.exe'], [], {
            setCwdCommand: (nextPath) => `cd /d "${String(nextPath || '').replace(/"/g, '\\"')}"\r`,
          }),
          createWindowsTerminalProfile(
            'git-bash',
            'Git Bash',
            [
              'C:\\Program Files\\Git\\bin\\bash.exe',
              'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
              'bash.exe',
            ],
            ['--login', '-i'],
            {
              setCwdCommand: (nextPath) =>
                `cd "${String(nextPath || '').replace(/\\/g, '/').replace(/"/g, '\\"')}"\r`,
            }
          ),
        ].filter(Boolean)
      : [
          createWindowsTerminalProfile('shell', 'System Shell', [process.env.SHELL || 'bash'], [], {
            setCwdCommand: (nextPath) =>
              `cd "${String(nextPath || '').replace(/"/g, '\\"')}"\r`,
          }),
        ];

  const resolvedProfiles = [];
  for (const profile of candidates) {
    let resolvedShell = '';
    for (const commandName of profile.commands) {
      if (!commandName) {
        continue;
      }

      if (path.isAbsolute(commandName)) {
        try {
          await fs.access(commandName);
          resolvedShell = commandName;
          break;
        } catch {
          // Try the next candidate.
        }
        continue;
      }

      resolvedShell = await resolveCommandOnPath(commandName);
      if (resolvedShell) {
        break;
      }
    }

    if (!resolvedShell) {
      continue;
    }

    resolvedProfiles.push({
      id: profile.id,
      label: profile.label,
      shell: resolvedShell,
      args: profile.args || [],
      kind: profile.kind || 'shell',
      setCwdCommand:
        profile.setCwdCommand ||
        ((nextPath) =>
          resolvedShell.toLowerCase().includes('powershell') || resolvedShell.toLowerCase().includes('pwsh')
            ? `Set-Location -LiteralPath '${quotePowerShellLiteral(nextPath)}'\r`
            : `cd "${String(nextPath || '').replace(/"/g, '\\"')}"\r`),
    });
  }

  const defaultProfile =
    resolvedProfiles.find((profile) => profile.id === 'pwsh') ||
    resolvedProfiles.find((profile) => profile.id === 'powershell') ||
    resolvedProfiles.find((profile) => profile.id === 'cmd') ||
    resolvedProfiles[0] ||
    null;

  terminalProfilesCacheCheckedAt = Date.now();
  terminalProfilesCache = {
    profiles: resolvedProfiles,
    defaultProfileId: defaultProfile?.id || '',
  };
  return terminalProfilesCache;
}

async function buildEditorCapabilities(runtimeMode) {
  const localRuntime = runtimeMode === 'desktop-local';
  const nativeLanguageIds = new Set(NATIVE_EDITOR_LANGUAGES.map((language) => language.id));
  const languages = {};
  const summary = {
    totalLanguages: 0,
    nativeLanguages: 0,
    lspLanguages: 0,
    basicLanguages: 0,
    installedLspLanguages: 0,
    bundledLspLanguages: 0,
    externalLspLanguages: 0,
    richIntelliSenseLanguages: 0,
  };

  for (const language of getAllEditorLanguages()) {
    summary.totalLanguages += 1;

    if (nativeLanguageIds.has(language.id)) {
      summary.nativeLanguages += 1;
      summary.richIntelliSenseLanguages += 1;
      languages[language.id] = {
        languageId: language.id,
        providerType: 'native',
        available: true,
        runtimeMode,
        supportLevel: language.supportLevel,
        family: language.family || '',
        aliases: language.aliases || [],
        extensions: language.extensions || [],
        detail: language.detail || 'Native Monaco language service.',
      };
      continue;
    }

    if (language.supportLevel === 'lsp') {
      summary.lspLanguages += 1;
      if (language.bundled) {
        summary.bundledLspLanguages += 1;
      } else {
        summary.externalLspLanguages += 1;
      }

      const adapter = getLspAdapter(language.id);
      const serverCommands = adapter?.commands?.length
        ? adapter.commands
        : Array.isArray(language.serverCommands)
          ? language.serverCommands
          : [];
      const installedCommand = await resolveInstalledCommand(serverCommands);
      const serverLabel = adapter?.serverLabel || language.serverLabel || language.id;
      const installCommands = serverCommands.join(' or ') || '';
      if (installedCommand) {
        summary.installedLspLanguages += 1;
        summary.richIntelliSenseLanguages += 1;
      }

      languages[language.id] = {
        languageId: language.id,
        providerType: 'lsp',
        available: Boolean(installedCommand),
        runtimeMode,
        supportLevel: language.supportLevel,
        family: language.family || '',
        aliases: language.aliases || [],
        extensions: language.extensions || [],
        bundled: Boolean(language.bundled),
        serverPackage: language.serverPackage || '',
        installHint: language.installHint || '',
        installCommand: language.installCommand || '',
        installCommandWindows: language.installCommandWindows || '',
        command: installedCommand || serverCommands[0] || '',
        serverLabel,
        detail:
          installedCommand
            ? localRuntime
              ? `${serverLabel} is available on this machine.`
              : `${serverLabel} is available on the Tilder backend.`
            : `Syntax support is active. ${serverLabel}${installCommands ? ` (${installCommands})` : ''} is not installed on the Tilder backend yet.`,
      };
      continue;
    }

    summary.basicLanguages += 1;
    languages[language.id] = {
      languageId: language.id,
      providerType: 'basic',
      available: true,
      runtimeMode,
      supportLevel: language.supportLevel,
      family: language.family || '',
      aliases: language.aliases || [],
      extensions: language.extensions || [],
      detail: language.detail || 'Syntax highlighting and basic editor features.',
    };
  }

  return {
    runtimeMode,
    lspBridge: {
      path: '/lsp',
      available: true,
      transport: 'socket.io',
    },
    summary,
    languages,
  };
}

function parseLspMessages(buffer, onMessage) {
  let offset = 0;

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n', offset, 'utf8');
    if (headerEnd === -1) {
      break;
    }

    const headerText = buffer.slice(offset, headerEnd).toString('utf8');
    const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      offset = headerEnd + 4;
      continue;
    }

    const contentLength = Number(contentLengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;

    if (buffer.length < bodyEnd) {
      break;
    }

    const payload = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    try {
      onMessage(JSON.parse(payload));
    } catch {
      // Ignore malformed language server payloads.
    }

    offset = bodyEnd;
  }

  return buffer.slice(offset);
}

function encodeLspMessage(payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function quoteWindowsShellArg(value) {
  const normalized = String(value ?? '');
  if (!normalized) {
    return '""';
  }

  if (!/[\s"&()^|<>]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '\\"')}"`;
}

function emitLspStatus(session, payload) {
  lspNamespace.to(session.room).emit('lsp:status', payload);
}

function spawnLspProcess(command, args, workspaceRoot) {
  if (command === 'jdtls' || command.endsWith('jdtls.bat') || command.endsWith('jdtls.sh') || command.endsWith('jdtls.cmd')) {
    const dataDir = path.join(os.tmpdir(), 'tilder-jdtls', String(workspaceRoot || '').replace(/[:\\/]+/g, '-'));
    args = [...args, '-data', dataDir];
  }

  const sharedOptions = {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      PATH: extendedCommandPath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  };

  if (os.platform() === 'win32' && /\.(cmd|bat)$/i.test(String(command || ''))) {
    const commandLine = [quoteWindowsShellArg(command), ...args.map(quoteWindowsShellArg)].join(' ');
    return spawn(commandLine, [], {
      ...sharedOptions,
      shell: true,
    });
  }

  return spawn(command, args, {
    ...sharedOptions,
  });
}

const lspBroker = createLspBroker({
  normalizeWorkspaceRoot,
  resolveInstalledCommand,
  getDownloadedLspPath,
  downloadLsp,
  emitStatus: emitLspStatus,
  namespace: lspNamespace,
  spawnProcess: spawnLspProcess,
  parseMessages: parseLspMessages,
  encodeMessage: encodeLspMessage,
});

function resolveSessionFromSocket(socket) {
  const cookies = parseCookieHeader(socket.request?.headers?.cookie || '');
  let sessionId = cookies[sessionCookieName];
  let session = sessionId ? sessions.get(sessionId) : null;

  if (!session) {
    session = decodeSessionPayload(cookies[sessionPayloadCookieName]);
    if (session) {
      sessionId = session.id;
      sessions.set(sessionId, session);
    }
  }

  if (!session) {
    return null;
  }

  session.updatedAt = Date.now();
  return session;
}

function buildBaseUrl(request) {
  const protocol = request.get('x-forwarded-proto') || request.protocol || 'http';
  const requestOrigin = `${protocol}://${request.get('host')}`;

  if (publicBaseUrl) {
    try {
      const configuredUrl = new URL(publicBaseUrl);
      const requestUrl = new URL(requestOrigin);
      const loopbackHosts = new Set(['localhost', '127.0.0.1']);
      const configuredIsLoopback = loopbackHosts.has(configuredUrl.hostname);
      const requestIsLoopback = loopbackHosts.has(requestUrl.hostname);

      if (configuredIsLoopback && !requestIsLoopback) {
        return requestOrigin;
      }

      return configuredUrl.origin;
    } catch {
      return publicBaseUrl;
    }
  }

  return requestOrigin;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4 || 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64');
}

function sanitizePersistedAccount(account) {
  if (!account || typeof account !== 'object' || !account.id) {
    return null;
  }

  const avatarUrl =
    typeof account.avatarUrl === 'string' && !account.avatarUrl.startsWith('data:') && account.avatarUrl.length < 2048
      ? account.avatarUrl
      : '';

  return {
    id: String(account.id),
    username: typeof account.username === 'string' ? account.username : '',
    displayName: typeof account.displayName === 'string' ? account.displayName : '',
    email: typeof account.email === 'string' ? account.email : '',
    avatarUrl,
    accessToken: typeof account.accessToken === 'string' ? account.accessToken : '',
    refreshToken: typeof account.refreshToken === 'string' ? account.refreshToken : '',
    connectedAt: typeof account.connectedAt === 'string' ? account.connectedAt : null,
  };
}

function snapshotSession(session) {
  return {
    id: String(session.id || crypto.randomUUID()),
    createdAt: Number(session.createdAt || Date.now()),
    updatedAt: Number(session.updatedAt || Date.now()),
    accounts: Object.fromEntries(
      Object.entries(session.accounts || {})
        .map(([provider, account]) => [provider, sanitizePersistedAccount(account)])
        .filter(([, account]) => Boolean(account))
    ),
    syncProvider: typeof session.syncProvider === 'string' ? session.syncProvider : null,
    syncPreferences: {
      ...defaultSyncPreferences,
      ...(session.syncPreferences || {}),
    },
  };
}

function createSessionRecord(seed = {}) {
  const snapshot = snapshotSession(seed);
  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    accounts: snapshot.accounts,
    syncProvider: snapshot.syncProvider,
    syncPreferences: snapshot.syncPreferences,
  };
}

function encodeSessionPayload(session) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sessionEncryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(snapshotSession(session)), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${base64UrlEncode(iv)}.${base64UrlEncode(authTag)}.${base64UrlEncode(encrypted)}`;
}

function decodeSessionPayload(rawValue) {
  if (!rawValue) {
    return null;
  }

  try {
    const [ivPart, authTagPart, dataPart] = String(rawValue).split('.');
    if (!ivPart || !authTagPart || !dataPart) {
      return null;
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionEncryptionKey, base64UrlDecode(ivPart));
    decipher.setAuthTag(base64UrlDecode(authTagPart));
    const decrypted = Buffer.concat([decipher.update(base64UrlDecode(dataPart)), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (Date.now() - Number(parsed.updatedAt || 0) > sessionTtlMs) {
      return null;
    }

    return createSessionRecord(parsed);
  } catch {
    return null;
  }
}

function getSessionCookieSuffix(request) {
  const protocol = request.get('x-forwarded-proto') || request.protocol || 'http';
  if (protocol === 'https') {
    return `Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${Math.floor(sessionTtlMs / 1000)}`;
  }

  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(sessionTtlMs / 1000)}`;
}

function writeSessionCookies(request, response, session) {
  const suffix = getSessionCookieSuffix(request);
  response.setHeader('Set-Cookie', [
    `${sessionCookieName}=${encodeURIComponent(session.id)}; ${suffix}`,
    `${sessionPayloadCookieName}=${encodeURIComponent(encodeSessionPayload(session))}; ${suffix}`,
  ]);
}

function ensureSessionRecord(request, response) {
  const cookies = parseCookies(request);
  let sessionId = request.headers['x-tilder-session-id'] || cookies[sessionCookieName];
  let session = sessionId ? sessions.get(sessionId) : null;

  if (!session) {
    session = decodeSessionPayload(cookies[sessionPayloadCookieName]);
    if (session) {
      sessionId = session.id;
      sessions.set(sessionId, session);
    }
  }

  if (!session) {
    sessionId = crypto.randomUUID();
    session = createSessionRecord({
      id: sessionId,
      accounts: {},
      syncProvider: null,
      syncPreferences: { ...defaultSyncPreferences },
    });
    sessions.set(sessionId, session);
  }

  session.updatedAt = Date.now();
  request.session = session;
  return session;
}

function sanitizeAccount(account) {
  if (!account) {
    return null;
  }

  return {
    id: account.id,
    username: account.username || '',
    displayName: account.displayName || '',
    email: account.email || '',
    avatarUrl: account.avatarUrl || '',
    connectedAt: account.connectedAt || null,
  };
}

function getConfiguredProviders() {
  return {
    github: Boolean(providerConfig.github.clientId && providerConfig.github.clientSecret),
    microsoft: Boolean(providerConfig.microsoft.clientId && providerConfig.microsoft.clientSecret),
  };
}

function sanitizeSession(session) {
  return {
    sessionId: session.id,
    providers: getConfiguredProviders(),
    accounts: Object.fromEntries(
      Object.entries(session.accounts || {})
        .filter(([, account]) => Boolean(account))
        .map(([provider, account]) => [provider, sanitizeAccount(account)])
    ),
    syncProvider: session.syncProvider || null,
    syncPreferences: {
      ...defaultSyncPreferences,
      ...(session.syncPreferences || {}),
    },
  };
}

function getExtensionActor(session) {
  const github = sanitizeAccount(session?.accounts?.github);
  if (github) {
    return {
      id: github.id,
      username: github.username,
      displayName: github.displayName,
      email: github.email,
      provider: 'github',
    };
  }

  const microsoft = sanitizeAccount(session?.accounts?.microsoft);
  if (microsoft) {
    return {
      id: microsoft.id,
      username: microsoft.username,
      displayName: microsoft.displayName,
      email: microsoft.email,
      provider: 'microsoft',
    };
  }

  return {
    id: '',
    username: '',
    displayName: '',
    email: '',
    provider: '',
  };
}

function isExtensionAdmin(request) {
  if (getRuntimeMode(request) === 'desktop-local') {
    return true;
  }

  if (!extensionAdminIdentities.size) {
    return false;
  }

  const actor = getExtensionActor(request.session);
  return [actor.username, actor.email, actor.displayName]
    .filter(Boolean)
    .some((value) => extensionAdminIdentities.has(String(value).trim().toLowerCase()));
}

function getBearerToken(request) {
  const header = String(request.get('authorization') || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return header.slice(7).trim();
}

async function readSyncStore() {
  try {
    const raw = await fs.readFile(syncStorePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { users: {} };
  } catch {
    return { users: {} };
  }
}

async function writeSyncStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(syncStorePath, JSON.stringify(store, null, 2), 'utf8');
}

function getSyncProviderAccount(session) {
  const provider = session.syncProvider;
  const account = provider ? session.accounts?.[provider] : null;
  return provider && account ? { provider, account } : null;
}

function getSyncUserKey(session) {
  const providerAccount = getSyncProviderAccount(session);
  const provider = providerAccount?.provider;
  const account = providerAccount?.account;
  if (!provider || !account?.id) {
    return null;
  }

  return `${provider}:${account.id}`;
}

function getGitHubSyncHeaders(account) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${account.accessToken}`,
    'User-Agent': 'Tilder',
    'Content-Type': 'application/json',
  };
}

async function ensureGitHubSyncRepo(account) {
  const repoUrl = `https://api.github.com/repos/${account.username}/${githubSyncRepoName}`;
  const response = await fetch(repoUrl, {
    headers: getGitHubSyncHeaders(account),
  });

  if (response.ok) {
    return;
  }

  if (response.status !== 404) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to verify GitHub sync repository.');
  }

  const createResponse = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: getGitHubSyncHeaders(account),
    body: JSON.stringify({
      name: githubSyncRepoName,
      description: 'Tilder settings sync storage',
      homepage: 'https://tildercode.onrender.com',
      private: true,
      auto_init: true,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to create GitHub sync repository.');
  }
}

async function pullGitHubSyncState(account) {
  const fileUrl = `https://api.github.com/repos/${account.username}/${githubSyncRepoName}/contents/${githubSyncFilePath}`;
  const response = await fetch(fileUrl, {
    headers: getGitHubSyncHeaders(account),
  });

  if (response.status === 404) {
    return { state: null, updatedAt: null };
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to load synced settings from GitHub.');
  }

  const payload = await response.json();
  const content = Buffer.from(String(payload.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  const parsed = JSON.parse(content || '{}');

  return {
    state: parsed?.state || null,
    updatedAt: parsed?.updatedAt || null,
  };
}

async function pushGitHubSyncState(account, state) {
  await ensureGitHubSyncRepo(account);

  const fileUrl = `https://api.github.com/repos/${account.username}/${githubSyncRepoName}/contents/${githubSyncFilePath}`;
  const existingResponse = await fetch(fileUrl, {
    headers: getGitHubSyncHeaders(account),
  });

  let sha = '';
  if (existingResponse.ok) {
    const existing = await existingResponse.json();
    sha = existing.sha || '';
  } else if (existingResponse.status !== 404) {
    const error = await existingResponse.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to inspect GitHub sync file.');
  }

  const updatedAt = new Date().toISOString();
  const body = {
    message: `Update Tilder settings sync (${updatedAt})`,
    content: Buffer.from(
      JSON.stringify(
        {
          version: 1,
          updatedAt,
          state: state || null,
        },
        null,
        2
      ),
      'utf8'
    ).toString('base64'),
  };

  if (sha) {
    body.sha = sha;
  }

  const updateResponse = await fetch(fileUrl, {
    method: 'PUT',
    headers: getGitHubSyncHeaders(account),
    body: JSON.stringify(body),
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to write synced settings to GitHub.');
  }

  return { updatedAt };
}

function createPopupResponse({ baseUrl, success, provider, message }) {
  const payload = JSON.stringify({
    type: 'tilder:oauth-complete',
    success,
    provider,
    message,
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Tilder OAuth</title>
    <style>
      body {
        margin: 0;
        font-family: Segoe UI, Arial, sans-serif;
        background: #11131b;
        color: #edf0ff;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }
      .tilder-oauth-card {
        width: min(420px, calc(100vw - 40px));
        background: #1b1f2c;
        border: 1px solid #363d6b;
        border-radius: 16px;
        padding: 28px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
      }
      .tilder-oauth-title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 10px;
      }
      .tilder-oauth-copy {
        color: #b9c1ef;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="tilder-oauth-card">
      <div class="tilder-oauth-title">${success ? 'Connected' : 'Connection failed'}</div>
      <div class="tilder-oauth-copy">${message}</div>
    </div>
    <script>
      const payload = ${payload};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, ${JSON.stringify(baseUrl)});
        }
      } catch {}
      setTimeout(() => window.close(), 220);
    </script>
  </body>
</html>`;
}

function createRedirectResponse({ baseUrl, success, provider, message }) {
  const redirectUrl = new URL(baseUrl);
  redirectUrl.searchParams.set('tilder_oauth_status', success ? 'success' : 'error');
  redirectUrl.searchParams.set('tilder_oauth_provider', provider);
  if (message) {
    redirectUrl.searchParams.set('tilder_oauth_message', message);
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Tilder OAuth</title>
    <meta http-equiv="refresh" content="0;url=${redirectUrl.toString()}" />
  </head>
  <body>
    <script>
      window.location.replace(${JSON.stringify(redirectUrl.toString())});
    </script>
  </body>
</html>`;
}

function createOAuthCompletionResponse({ baseUrl, success, provider, message, flow }) {
  if (flow === 'desktop') {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Tilder OAuth</title>
    <style>
      body {
        margin: 0;
        font-family: Segoe UI, Arial, sans-serif;
        background: #11131b;
        color: #edf0ff;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }
      .tilder-oauth-card {
        width: min(420px, calc(100vw - 40px));
        background: #1b1f2c;
        border: 1px solid #363d6b;
        border-radius: 16px;
        padding: 28px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
      }
      .tilder-oauth-title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 10px;
      }
      .tilder-oauth-copy {
        color: #b9c1ef;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="tilder-oauth-card">
      <div class="tilder-oauth-title">${success ? 'Connected' : 'Connection failed'}</div>
      <div class="tilder-oauth-copy">${message}</div>
    </div>
  </body>
</html>`;
  }

  if (flow === 'redirect') {
    return createRedirectResponse({ baseUrl, success, provider, message });
  }

  return createPopupResponse({ baseUrl, success, provider, message });
}

function ensureProviderReady(provider) {
  const config = providerConfig[provider];
  if (!config) {
    throw new Error('Unknown OAuth provider.');
  }

  if (!getConfiguredProviders()[provider]) {
    throw new Error(`${config.label} OAuth is not configured on the server.`);
  }

  return config;
}

function buildRedirectUri(request, provider) {
  return `${buildBaseUrl(request)}/api/auth/${provider}/callback`;
}

async function exchangeGitHubCode({ code, redirectUri }) {
  const response = await fetch(providerConfig.github.tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: providerConfig.github.clientId,
      client_secret: providerConfig.github.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || 'GitHub token exchange failed.');
  }

  const [profileResponse, emailResponse] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.access_token}`,
        'User-Agent': 'Tilder',
      },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token.access_token}`,
        'User-Agent': 'Tilder',
      },
    }),
  ]);

  const profile = await profileResponse.json();
  const emails = await emailResponse.json().catch(() => []);
  if (!profileResponse.ok) {
    throw new Error(profile.message || 'Unable to load GitHub profile.');
  }

  const primaryEmail = Array.isArray(emails)
    ? emails.find((entry) => entry.primary)?.email || emails[0]?.email || profile.email || ''
    : profile.email || '';

  return {
    id: String(profile.id),
    username: profile.login,
    displayName: profile.name || profile.login,
    email: primaryEmail,
    avatarUrl: profile.avatar_url || '',
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    connectedAt: new Date().toISOString(),
  };
}

async function exchangeMicrosoftCode({ code, redirectUri }) {
  const tenantId = providerConfig.microsoft.tenantId;
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: providerConfig.microsoft.clientId,
    client_secret: providerConfig.microsoft.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: providerConfig.microsoft.scopes.join(' '),
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || 'Microsoft token exchange failed.');
  }

  const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
    },
  });
  const profile = await profileResponse.json();
  if (!profileResponse.ok) {
    throw new Error(profile.error?.message || 'Unable to load Microsoft profile.');
  }

  let avatarUrl = '';
  try {
    const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photos/48x48/$value', {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });

    if (photoResponse.ok) {
      const contentType = photoResponse.headers.get('content-type') || 'image/jpeg';
      const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
      avatarUrl = `data:${contentType};base64,${photoBuffer.toString('base64')}`;
    }
  } catch {
    avatarUrl = '';
  }

  return {
    id: String(profile.id),
    username: profile.userPrincipalName || profile.mail || profile.displayName,
    displayName: profile.displayName || profile.userPrincipalName || 'Microsoft User',
    email: profile.mail || profile.userPrincipalName || '',
    avatarUrl,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || '',
    connectedAt: new Date().toISOString(),
  };
}

async function mirrorWorkspace(payload = {}, preserveGit = true) {
  const snapshot = payload && typeof payload === 'object' ? payload : {};
  return syncWorkspaceMirror({
    rootName: snapshot.rootName || 'workspace',
    entries: Array.isArray(snapshot.entries) ? snapshot.entries : [],
    preserveGit,
  });
}

async function ensureGitIdentity(git, session) {
  const primaryAccount =
    session.accounts?.github ||
    session.accounts?.microsoft ||
    Object.values(session.accounts || {}).find(Boolean) ||
    null;
  const userName = primaryAccount?.displayName || primaryAccount?.username || 'Tilder User';
  const userEmail = primaryAccount?.email || 'tilder@local';

  await git.raw(['config', 'user.name', userName]);
  await git.raw(['config', 'user.email', userEmail]);
}

function shouldSkipScmSnapshotPath(relativePath = '') {
  const normalized = String(relativePath || '')
    .replace(/^root\/?/, '')
    .replace(/^\/+/, '')
    .trim();

  if (!normalized) {
    return false;
  }

  if (normalized === '.git' || normalized.startsWith('.git/') || normalized.includes('/.git/')) {
    return true;
  }

  return normalized.split('/').some((segment) => SCM_GENERATED_SEGMENTS.has(segment));
}

function normalizeScmTargetPath(cwd, rawPath) {
  const normalized = String(rawPath || '')
    .trim()
    .replace(/^root\/?/, '')
    .replace(/^\/+/, '');

  if (!normalized) {
    throw new Error('Select a file first.');
  }

  const resolved = path.resolve(cwd, normalized);
  const relative = path.relative(cwd, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid file path.');
  }

  return relative.split(path.sep).join('/');
}

function formatScmStatusCode(code) {
  const normalized = typeof code === 'string' ? code : ' ';
  return SCM_STATUS_LABELS[normalized] || 'Changed';
}

function toScmFileEntry(entry) {
  const index = entry?.index || ' ';
  const workingDir = entry?.working_dir || ' ';
  const isStaged = index.trim() !== '';
  const hasWorkingTreeChanges = workingDir.trim() !== '';
  const isUntracked = index === '?' || workingDir === '?';

  return {
    path: entry?.path || '',
    index,
    workingDir,
    stagedLabel: formatScmStatusCode(index),
    workingTreeLabel: formatScmStatusCode(workingDir),
    isStaged,
    hasWorkingTreeChanges,
    isUntracked,
    canStage: !isStaged || hasWorkingTreeChanges || isUntracked,
    canUnstage: isStaged,
    canDiscard: hasWorkingTreeChanges || isUntracked,
  };
}

async function collectWorkspaceSnapshotFromMirror(cwd, rootName = 'workspace') {
  const entries = [];

  async function visit(directoryPath, relativePath = '') {
    const children = await fs.readdir(directoryPath, { withFileTypes: true });
    children.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    for (const child of children) {
      const childRelativePath = relativePath ? `${relativePath}/${child.name}` : child.name;
      if (shouldSkipScmSnapshotPath(childRelativePath)) {
        continue;
      }

      const childAbsolutePath = path.join(directoryPath, child.name);
      if (child.isDirectory()) {
        entries.push({ path: childRelativePath, type: 'folder' });
        await visit(childAbsolutePath, childRelativePath);
        continue;
      }

      let content = '';
      try {
        content = await fs.readFile(childAbsolutePath, 'utf8');
      } catch {
        content = '';
      }

      entries.push({
        path: childRelativePath,
        type: 'file',
        content,
      });
    }
  }

  await visit(cwd);
  return {
    rootName,
    entries,
  };
}

async function readScmFileSnapshot(cwd, relativePath) {
  const absolutePath = path.join(cwd, relativePath);

  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      return { path: relativePath, deleted: true };
    }

    let content = '';
    try {
      content = await fs.readFile(absolutePath, 'utf8');
    } catch {
      content = '';
    }

    return {
      path: relativePath,
      deleted: false,
      content,
    };
  } catch {
    return {
      path: relativePath,
      deleted: true,
    };
  }
}

function buildUntrackedDiff(relativePath, content = '') {
  const normalizedContent = String(content || '').replace(/\r\n/g, '\n');
  const lines = normalizedContent === '' ? [] : normalizedContent.split('\n');
  const hunkLines = lines.map((line) => `+${line}`).join('\n');
  const hunkHeader = `@@ -0,0 +1,${lines.length || 0} @@`;

  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    `--- /dev/null`,
    `+++ b/${relativePath}`,
    hunkHeader,
    hunkLines,
  ]
    .filter(Boolean)
    .join('\n');
}

async function openScmRepo(payload, session, options = {}) {
  const { allowMissingGit = false, allowUninitialized = false } = options;
  const { cwd } = await mirrorWorkspace(payload, true);
  const git = simpleGit({ baseDir: cwd, binary: gitBinary });
  let initialized = false;

  try {
    initialized = await git.checkIsRepo();
  } catch (error) {
    if (String(error instanceof Error ? error.message : error).includes('ENOENT')) {
      if (allowMissingGit) {
        return {
          available: false,
          initialized: false,
          cwd,
          git,
        };
      }

      throw new Error('Git is not available on the server. Install Git or set GIT_BINARY.');
    }

    throw error;
  }

  if (!initialized && !allowUninitialized) {
    throw new Error('Initialize Git first.');
  }

  if (initialized) {
    await ensureGitIdentity(git, session);
  }

  return {
    available: true,
    initialized,
    cwd,
    git,
  };
}

async function collectScmStatusFromRepo(git, cwd) {
  const [status, branchSummary, log] = await Promise.all([
    git.status(),
    git.branchLocal(),
    git.log({ maxCount: 8 }).catch(() => ({ all: [] })),
  ]);

  return {
    available: true,
    initialized: true,
    cwd,
    branch: branchSummary.current || status.current || 'main',
    branches: (branchSummary.all || []).filter(Boolean),
    ahead: status.ahead,
    behind: status.behind,
    stagedCount: status.staged.length,
    changedCount: status.modified.length + status.not_added.length + status.created.length + status.deleted.length + status.renamed.length,
    files: status.files.map((entry) => toScmFileEntry(entry)),
    recentCommits: (log.all || []).map((entry) => ({
      hash: entry.hash,
      message: entry.message,
      author_name: entry.author_name,
      date: entry.date,
    })),
  };
}

async function collectScmStatus(payload, session) {
  const context = await openScmRepo(payload, session, {
    allowMissingGit: true,
    allowUninitialized: true,
  });

  if (!context.available) {
    return {
      available: false,
      initialized: false,
      cwd: context.cwd,
      branch: null,
      branches: [],
      files: [],
      stagedCount: 0,
      changedCount: 0,
      recentCommits: [],
      message: 'Git is not available on the server. Install Git or set GIT_BINARY.',
    };
  }

  if (!context.initialized) {
    return {
      available: true,
      initialized: false,
      cwd: context.cwd,
      branch: null,
      branches: [],
      files: [],
      stagedCount: 0,
      changedCount: 0,
      recentCommits: [],
    };
  }

  return collectScmStatusFromRepo(context.git, context.cwd);
}

app.use((request, response, next) => {
  ensureSessionRecord(request, response);

  let sessionCommitted = false;
  const commitSession = () => {
    if (sessionCommitted || response.headersSent || !request.session) {
      return;
    }

    sessions.set(request.session.id, request.session);

    writeSessionCookies(request, response, request.session);
    sessionCommitted = true;
  };

  const originalJson = response.json.bind(response);
  const originalSend = response.send.bind(response);
  const originalRedirect = response.redirect.bind(response);

  response.json = function patchedJson(...args) {
    commitSession();
    return originalJson(...args);
  };

  response.send = function patchedSend(...args) {
    commitSession();
    return originalSend(...args);
  };

  response.redirect = function patchedRedirect(...args) {
    commitSession();
    return originalRedirect(...args);
  };

  next();
});

app.get('/api/editor/capabilities', async (request, response) => {
  try {
    response.json(await buildEditorCapabilities(getRuntimeMode(request)));
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to load editor capabilities.',
    });
  }
});

app.get('/api/extensions/marketplace', async (_request, response) => {
  try {
    response.json(await listPublicMarketplace(dataDir));
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to load the extension marketplace.',
    });
  }
});

app.get('/api/extensions/publishers', async (_request, response) => {
  try {
    response.json(await listMarketplacePublishers(dataDir));
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to load extension publishers.',
    });
  }
});

app.get('/api/extensions/publishers/me', async (request, response) => {
  try {
    response.json(await listMarketplaceOwnedPublishers(dataDir, getExtensionActor(request.session)));
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to load your publishers.',
    });
  }
});

app.get('/api/extensions/publishers/:publisherId', async (request, response) => {
  try {
    response.json(await getMarketplacePublisher(dataDir, request.params.publisherId));
  } catch (error) {
    response.status(404).json({
      message: error instanceof Error ? error.message : 'Publisher not found.',
    });
  }
});

app.post('/api/extensions/publishers', async (request, response) => {
  try {
    const result = await createMarketplacePublisher(dataDir, request.body || {}, getExtensionActor(request.session));
    response.status(201).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to create publisher.',
    });
  }
});

app.post('/api/extensions/publishers/:publisherId/tokens', async (request, response) => {
  try {
    const result = await createMarketplacePublisherToken(
      dataDir,
      request.params.publisherId,
      request.body || {},
      getExtensionActor(request.session),
      isExtensionAdmin(request)
    );
    response.status(201).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    response.status(403).json({
      message: error instanceof Error ? error.message : 'Unable to create publisher token.',
    });
  }
});

app.post('/api/extensions/packages/validate', async (request, response) => {
  try {
    const result = await validateMarketplacePackage(dataDir, request.body || {});
    response.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to validate extension package.',
    });
  }
});

app.post('/api/extensions/publish', async (request, response) => {
  try {
    const result = await publishMarketplacePackage(dataDir, request.body || {}, getExtensionActor(request.session), {
      token: getBearerToken(request),
      adminBypass: isExtensionAdmin(request),
    });
    response.status(201).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to publish extension package.',
    });
  }
});

app.post('/api/extensions/submissions', async (request, response) => {
  try {
    const submission = await createMarketplaceSubmission(dataDir, request.body || {}, getExtensionActor(request.session));
    response.status(201).json({
      ok: true,
      submission,
      message: 'Extension submission received and is now waiting for review.',
    });
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to create extension submission.',
    });
  }
});

app.get('/api/extensions/submissions', async (request, response) => {
  if (!isExtensionAdmin(request)) {
    response.status(403).json({ message: 'Extension review access is restricted to Tilder admins.' });
    return;
  }

  try {
    response.json({
      submissions: await listMarketplaceSubmissions(dataDir),
    });
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to load extension submissions.',
    });
  }
});

app.post('/api/extensions/submissions/:submissionId/review', async (request, response) => {
  if (!isExtensionAdmin(request)) {
    response.status(403).json({ message: 'Extension review access is restricted to Tilder admins.' });
    return;
  }

  try {
    const submission = await reviewMarketplaceSubmission(
      dataDir,
      request.params.submissionId,
      request.body || {},
      getExtensionActor(request.session)
    );
    response.json({
      ok: true,
      submission,
    });
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to review extension submission.',
    });
  }
});

app.post('/api/editor/workspace-session', async (request, response) => {
  try {
    const nextSession = await upsertRemoteWorkspaceSession(
      request.session.id,
      request.body || {},
      request.body?.sessionId || ''
    );

    response.json({
      sessionId: nextSession.id,
      workspaceRoot: nextSession.workspaceRoot,
      rootName: nextSession.rootName,
      entriesCount: nextSession.entriesCount,
      updatedAt: nextSession.updatedAt,
    });
  } catch (error) {
    response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to create remote workspace session.',
    });
  }
});

app.get('/api/editor/workspace-session/:sessionId', (request, response) => {
  const session = getRemoteWorkspaceSession(request.session.id, request.params.sessionId);
  if (!session) {
    response.status(404).json({ message: 'Remote workspace session not found.' });
    return;
  }

  response.json({
    sessionId: session.id,
    workspaceRoot: session.workspaceRoot,
    rootName: session.rootName,
    entriesCount: session.entriesCount,
    updatedAt: session.updatedAt,
  });
});

app.get('/api/auth/session', (request, response) => {
  response.json(sanitizeSession(request.session));
});

app.post('/api/auth/logout', (request, response) => {
  const provider = request.body?.provider;
  if (provider && request.session.accounts?.[provider]) {
    delete request.session.accounts[provider];
    if (request.session.syncProvider === provider) {
      request.session.syncProvider = null;
    }
  } else if (!provider) {
    request.session.accounts = {};
    request.session.syncProvider = null;
  }

  response.json(sanitizeSession(request.session));
});

app.get('/api/auth/:provider/start', (request, response) => {
  try {
    const provider = request.params.provider;
    const config = ensureProviderReady(provider);
    const state = crypto.randomUUID();
    const redirectUri = buildRedirectUri(request, provider);
    oauthStates.set(state, {
      provider,
      sessionId: request.session.id,
      clientOrigin: String(request.query.client_origin || '').trim(),
      flow: String(request.query.flow || '').trim() === 'redirect' ? 'redirect' : 'popup',
      createdAt: Date.now(),
    });

    if (provider === 'github') {
      const url = new URL(config.authorizeUrl);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', config.scopes.join(' '));
      url.searchParams.set('state', state);
      response.redirect(url.toString());
      return;
    }

    const url = new URL(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('state', state);
    response.redirect(url.toString());
  } catch (error) {
    response.status(400).send(String(error instanceof Error ? error.message : 'OAuth start failed.'));
  }
});

app.post('/api/auth/desktop/start', (request, response) => {
  try {
    const provider = String(request.body?.provider || '').trim();
    const config = ensureProviderReady(provider);
    const state = `${crypto.randomUUID()}_port_${port}`;
    const desktopSessionId = crypto.randomUUID();
    const redirectUri = buildRedirectUri(request, provider);

    desktopAuthSessions.set(desktopSessionId, {
      id: desktopSessionId,
      provider,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      message: '',
      account: null,
    });

    oauthStates.set(state, {
      provider,
      sessionId: null,
      clientOrigin: String(request.body?.client_origin || request.query.client_origin || '').trim() || buildBaseUrl(request),
      desktopSessionId,
      flow: 'desktop',
      createdAt: Date.now(),
    });

    let authorizeUrl = '';

    if (provider === 'github') {
      const url = new URL(config.authorizeUrl);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', config.scopes.join(' '));
      url.searchParams.set('state', state);
      authorizeUrl = url.toString();
    } else {
      const url = new URL(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_mode', 'query');
      url.searchParams.set('scope', config.scopes.join(' '));
      url.searchParams.set('state', state);
      authorizeUrl = url.toString();
    }

    response.json({
      ok: true,
      provider,
      desktopSessionId,
      authorizeUrl,
    });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to start desktop sign-in.' });
  }
});

app.get('/api/auth/desktop/status', (request, response) => {
  const desktopSessionId = String(request.query.desktopSessionId || '').trim();
  if (!desktopSessionId) {
    response.status(400).json({ message: 'Missing desktop session id.' });
    return;
  }

  const desktopSession = desktopAuthSessions.get(desktopSessionId);
  if (!desktopSession) {
    response.status(404).json({ message: 'Desktop sign-in session expired.' });
    return;
  }

  desktopSession.updatedAt = Date.now();

  if (desktopSession.status === 'pending') {
    response.json({ status: 'pending' });
    return;
  }

  if (desktopSession.status === 'error') {
    desktopAuthSessions.delete(desktopSessionId);
    response.json({
      status: 'error',
      message: desktopSession.message || 'Authentication failed.',
    });
    return;
  }

  if (desktopSession.status === 'authorized' && desktopSession.account) {
    request.session.accounts[desktopSession.provider] = desktopSession.account;
    if (!request.session.syncProvider) {
      request.session.syncProvider = desktopSession.provider;
    }

    const session = sanitizeSession(request.session);
    desktopAuthSessions.delete(desktopSessionId);
    response.json({
      status: 'complete',
      provider: desktopSession.provider,
      session,
    });
    return;
  }

  response.json({ status: 'pending' });
});

app.get('/api/auth/:provider/callback', async (request, response) => {
  const provider = request.params.provider;
  const state = String(request.query.state || '');
  const code = String(request.query.code || '');
  const error = String(request.query.error || '');

  // Decode local port delegation if from desktop app and received on the cloud/Render server
  const portMatch = state.match(/_port_(\d+)$/);
  const isLocalRequest = String(request.get('host') || '').toLowerCase().includes('localhost') || 
                         String(request.get('host') || '').toLowerCase().includes('127.0.0.1');
  if (portMatch && !isLocalRequest) {
    const localPort = portMatch[1];
    const localUrl = `http://127.0.0.1:${localPort}/api/auth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}&error=${encodeURIComponent(error)}`;
    response.redirect(localUrl);
    return;
  }

  const oauthRequest = oauthStates.get(state);
  oauthStates.delete(state);
  const clientOrigin = oauthRequest?.clientOrigin || buildBaseUrl(request);
  const flow = oauthRequest?.flow === 'desktop' ? 'desktop' : oauthRequest?.flow === 'redirect' ? 'redirect' : 'popup';
  const desktopSession = oauthRequest?.desktopSessionId ? desktopAuthSessions.get(oauthRequest.desktopSessionId) : null;

  if (error) {
    if (flow === 'desktop' && desktopSession) {
      desktopSession.status = 'error';
      desktopSession.updatedAt = Date.now();
      desktopSession.message = `The ${provider} sign-in flow was cancelled or rejected.`;
    }

    response.status(400).send(
      createOAuthCompletionResponse({
        baseUrl: clientOrigin,
        success: false,
        provider,
        message: `The ${provider} sign-in flow was cancelled or rejected.`,
        flow,
      })
    );
    return;
  }

  const hasMatchingSession =
    flow === 'desktop'
      ? Boolean(desktopSession)
      : Boolean(oauthRequest && oauthRequest.sessionId === request.session.id);

  if (!oauthRequest || oauthRequest.provider !== provider || !hasMatchingSession) {
    if (flow === 'desktop' && desktopSession) {
      desktopSession.status = 'error';
      desktopSession.updatedAt = Date.now();
      desktopSession.message = 'This sign-in session is no longer valid. Please try again from Tilder.';
    }

    response.status(400).send(
      createOAuthCompletionResponse({
        baseUrl: clientOrigin,
        success: false,
        provider,
        message: 'This sign-in session is no longer valid. Please try again from Tilder.',
        flow,
      })
    );
    return;
  }

  try {
    const redirectUri = buildRedirectUri(request, provider);
    const account =
      provider === 'github'
        ? await exchangeGitHubCode({ code, redirectUri })
        : await exchangeMicrosoftCode({ code, redirectUri });

    if (flow === 'desktop' && desktopSession) {
      desktopSession.status = 'authorized';
      desktopSession.updatedAt = Date.now();
      desktopSession.account = account;
      desktopSession.message = `${providerConfig[provider].label} connected. Return to Tilder.`;
    } else {
      request.session.accounts[provider] = account;
      if (!request.session.syncProvider) {
        request.session.syncProvider = provider;
      }
    }

    response.send(
      createOAuthCompletionResponse({
        baseUrl: clientOrigin,
        success: true,
        provider,
        message: `${providerConfig[provider].label} is now connected. You can return to Tilder.`,
        flow,
      })
    );
  } catch (caughtError) {
    if (flow === 'desktop' && desktopSession) {
      desktopSession.status = 'error';
      desktopSession.updatedAt = Date.now();
      desktopSession.message = caughtError instanceof Error ? caughtError.message : 'Sign-in failed.';
    }

    response.status(500).send(
      createOAuthCompletionResponse({
        baseUrl: clientOrigin,
        success: false,
        provider,
        message: caughtError instanceof Error ? caughtError.message : 'Sign-in failed.',
        flow,
      })
    );
  }
});

app.post('/api/sync/preferences', async (request, response) => {
  const nextPreferences = request.body?.syncPreferences;
  const nextProvider = request.body?.syncProvider;

  if (nextProvider !== undefined) {
    if (nextProvider && !request.session.accounts?.[nextProvider]) {
      response.status(400).json({ message: 'That provider is not connected.' });
      return;
    }

    request.session.syncProvider = nextProvider || null;
  }

  if (nextPreferences && typeof nextPreferences === 'object') {
    request.session.syncPreferences = {
      ...defaultSyncPreferences,
      ...request.session.syncPreferences,
      ...nextPreferences,
    };
  }

  response.json(sanitizeSession(request.session));
});

app.get('/api/sync/pull', async (request, response) => {
  const userKey = getSyncUserKey(request.session);
  if (!userKey) {
    response.status(400).json({ message: 'Connect a sync provider first.' });
    return;
  }

  try {
    const providerAccount = getSyncProviderAccount(request.session);

    if (providerAccount?.provider === 'github' && providerAccount.account?.accessToken && providerAccount.account?.username) {
      const result = await pullGitHubSyncState(providerAccount.account);
      response.json({
        session: sanitizeSession(request.session),
        state: result.state,
        updatedAt: result.updatedAt,
      });
      return;
    }

    const store = await readSyncStore();
    response.json({
      session: sanitizeSession(request.session),
      state: store.users?.[userKey]?.state || null,
      updatedAt: store.users?.[userKey]?.updatedAt || null,
    });
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to pull synced state.' });
  }
});

app.post('/api/sync/push', async (request, response) => {
  const userKey = getSyncUserKey(request.session);
  if (!userKey) {
    response.status(400).json({ message: 'Connect a sync provider first.' });
    return;
  }

  try {
    const providerAccount = getSyncProviderAccount(request.session);

    if (providerAccount?.provider === 'github' && providerAccount.account?.accessToken && providerAccount.account?.username) {
      const result = await pushGitHubSyncState(providerAccount.account, request.body?.state || null);
      response.json({
        ok: true,
        session: sanitizeSession(request.session),
        updatedAt: result.updatedAt,
      });
      return;
    }

    const store = await readSyncStore();
    const provider = request.session.syncProvider;
    store.users[userKey] = {
      provider,
      profile: sanitizeAccount(request.session.accounts?.[provider]),
      updatedAt: new Date().toISOString(),
      state: request.body?.state || null,
    };
    await writeSyncStore(store);

    response.json({
      ok: true,
      session: sanitizeSession(request.session),
      updatedAt: store.users[userKey].updatedAt,
    });
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to push synced state.' });
  }
});

app.get('/api/backpack/local', async (request, response) => {
  const customPath = request.query.path || path.join(dataDir, 'backpack.json');
  try {
    const data = await fs.readFile(customPath, 'utf8');
    response.json({ snippets: JSON.parse(data) });
  } catch {
    response.json({ snippets: [] });
  }
});

app.post('/api/backpack/local', async (request, response) => {
  const customPath = request.body.path || path.join(dataDir, 'backpack.json');
  try {
    await fs.writeFile(customPath, JSON.stringify(request.body.snippets || [], null, 2), 'utf8');
    response.json({ success: true });
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to save local backpack.' });
  }
});

app.get('/api/github/repos', async (request, response) => {
  const account = request.session.accounts?.github;
  if (!account?.accessToken) {
    response.status(400).json({ message: 'Connect GitHub first.' });
    return;
  }

  try {
    const upstream = await fetch('https://api.github.com/user/repos?sort=updated&per_page=30', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${account.accessToken}`,
        'User-Agent': 'Tilder',
      },
    });
    const repos = await upstream.json();
    if (!upstream.ok) {
      response.status(upstream.status).json({ message: repos.message || 'Unable to load repositories.' });
      return;
    }

    response.json({
      repositories: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        url: repo.html_url,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        description: repo.description || '',
      })),
    });
  } catch {
    response.status(500).json({ message: 'Failed to load GitHub repositories.' });
  }
});

app.post('/api/github/repos', async (request, response) => {
  const account = request.session.accounts?.github;
  if (!account?.accessToken) {
    response.status(400).json({ message: 'Connect GitHub first.' });
    return;
  }

  const name = String(request.body?.name || '').trim();
  const description = String(request.body?.description || '').trim();
  const isPrivate = request.body?.private !== false;

  if (!name) {
    response.status(400).json({ message: 'Enter a repository name.' });
    return;
  }

  try {
    const upstream = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${account.accessToken}`,
        'User-Agent': 'Tilder',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description,
        private: isPrivate,
        auto_init: true,
      }),
    });
    const repo = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      response.status(upstream.status).json({ message: repo.message || 'Unable to create GitHub repository.' });
      return;
    }

    response.json({
      repository: {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        url: repo.html_url,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        description: repo.description || '',
      },
    });
  } catch {
    response.status(500).json({ message: 'Failed to create GitHub repository.' });
  }
});

app.post('/api/scm/status', async (request, response) => {
  try {
    const status = await collectScmStatus(request.body || {}, request.session);
    response.json(status);
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to read source control state.' });
  }
});

app.post('/api/scm/init', async (request, response) => {
  try {
    const { cwd } = await mirrorWorkspace(request.body || {}, true);
    const git = simpleGit({ baseDir: cwd, binary: gitBinary });
    if (!(await git.checkIsRepo())) {
      await git.init();
    }
    await ensureGitIdentity(git, request.session);
    response.json(await collectScmStatusFromRepo(git, cwd));
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'Unable to initialize repository.' });
  }
});

app.post('/api/scm/stage', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    await git.add(['-A']);
    response.json(await collectScmStatusFromRepo(git, cwd));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to stage changes.';
    response.status(message === 'Initialize Git first.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/stage-file', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    const target = normalizeScmTargetPath(cwd, request.body?.path);
    await git.add(['--', target]);
    response.json(await collectScmStatusFromRepo(git, cwd));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to stage file.';
    response.status(message === 'Initialize Git first.' || message === 'Select a file first.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/unstage-file', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    const target = normalizeScmTargetPath(cwd, request.body?.path);
    await git.raw(['restore', '--staged', '--', target]).catch(() => git.raw(['reset', 'HEAD', '--', target]));
    response.json(await collectScmStatusFromRepo(git, cwd));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to unstage file.';
    response.status(message === 'Initialize Git first.' || message === 'Select a file first.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/discard-file', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    const target = normalizeScmTargetPath(cwd, request.body?.path);
    const statusBeforeDiscard = await git.status();
    const fileEntry = statusBeforeDiscard.files.find((entry) => entry.path === target);
    const isUntracked = fileEntry?.index === '?' || fileEntry?.working_dir === '?';

    if (isUntracked) {
      await git.raw(['clean', '-f', '--', target]);
    } else {
      await git.raw(['restore', '--worktree', '--', target]).catch(() => git.checkout(['--', target]));
    }

    response.json({
      ...(await collectScmStatusFromRepo(git, cwd)),
      updatedFile: await readScmFileSnapshot(cwd, target),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to discard file changes.';
    response.status(message === 'Initialize Git first.' || message === 'Select a file first.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/diff-file', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    const target = normalizeScmTargetPath(cwd, request.body?.path);
    const status = await git.status();
    const fileEntry = status.files.find((entry) => entry.path === target);
    const stagedDiff = await git.diff(['--cached', '--', target]).catch(() => '');
    let workingTreeDiff = await git.diff(['--', target]).catch(() => '');

    if (!workingTreeDiff && (fileEntry?.index === '?' || fileEntry?.working_dir === '?')) {
      const snapshot = await readScmFileSnapshot(cwd, target);
      if (!snapshot.deleted) {
        workingTreeDiff = buildUntrackedDiff(target, snapshot.content);
      }
    }

    response.json({
      path: target,
      stagedDiff,
      workingTreeDiff,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load file diff.';
    response.status(message === 'Initialize Git first.' || message === 'Select a file first.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/commit', async (request, response) => {
  try {
    const message = String(request.body?.message || '').trim();
    if (!message) {
      response.status(400).json({ message: 'Enter a commit message.' });
      return;
    }

    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    await git.add(['-A']);
    await git.commit(message);
    response.json(await collectScmStatusFromRepo(git, cwd));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create commit.';
    response.status(message === 'Initialize Git first.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/create-branch', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    const branch = String(request.body?.branch || '').trim();
    if (!branch) {
      response.status(400).json({ message: 'Enter a branch name.' });
      return;
    }

    await git.raw(['check-ref-format', '--branch', branch]);
    const branchSummary = await git.branchLocal();
    if ((branchSummary.all || []).includes(branch)) {
      response.status(400).json({ message: `Branch "${branch}" already exists.` });
      return;
    }

    await git.checkoutLocalBranch(branch);
    response.json(await collectScmStatusFromRepo(git, cwd));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create branch.';
    response.status(message === 'Initialize Git first.' || message === 'Enter a branch name.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/checkout-branch', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    const branch = String(request.body?.branch || '').trim();
    if (!branch) {
      response.status(400).json({ message: 'Choose a branch first.' });
      return;
    }

    await git.checkout(branch);
    response.json({
      ...(await collectScmStatusFromRepo(git, cwd)),
      workspaceSnapshot: await collectWorkspaceSnapshotFromMirror(cwd, request.body?.rootName || 'workspace'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to switch branches.';
    response.status(message === 'Initialize Git first.' || message === 'Choose a branch first.' ? 400 : 500).json({ message });
  }
});

app.post('/api/scm/sync', async (request, response) => {
  try {
    const { cwd, git } = await openScmRepo(request.body || {}, request.session);
    await git.pull();
    await git.push();
    response.json({
      ...(await collectScmStatusFromRepo(git, cwd)),
      workspaceSnapshot: await collectWorkspaceSnapshotFromMirror(cwd, request.body?.rootName || 'workspace'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync (push/pull) with remote.';
    response.status(500).json({ message });
  }
});

app.get('/api/terminal/health', async (_request, response) => {
  const terminalProfiles = await resolveTerminalProfiles();
  const defaultProfile = terminalProfiles.profiles.find((profile) => profile.id === terminalProfiles.defaultProfileId) || null;
  response.json({
    ok: true,
    shell: defaultProfile?.shell || process.env.SHELL || 'bash',
    cwd: shellCwd,
    profiles: terminalProfiles.profiles.map((profile) => ({
      id: profile.id,
      label: profile.label,
      shell: profile.shell,
      kind: profile.kind,
    })),
    defaultProfileId: terminalProfiles.defaultProfileId,
  });
});

app.post('/api/terminal/open-native', async (request, response) => {
  try {
    const terminalProfiles = await resolveTerminalProfiles();
    const requestedProfileId = String(request.body?.profileId || '').trim();
    const requestedCwd = normalizeWorkspaceRoot(request.body?.cwd || shellCwd);
    const activeProfile =
      terminalProfiles.profiles.find((profile) => profile.id === requestedProfileId) ||
      terminalProfiles.profiles.find((profile) => profile.id === terminalProfiles.defaultProfileId) ||
      terminalProfiles.profiles[0] ||
      null;

    if (!activeProfile) {
      response.status(400).json({ message: 'No supported terminal profiles are available on this machine.' });
      return;
    }

    const windowsTerminalPath = await resolveInstalledCommand(['wt.exe', 'wt']);
    if (windowsTerminalPath) {
      const nativeTerminalProcess = spawn(
        windowsTerminalPath,
        ['-d', requestedCwd, activeProfile.shell, ...(activeProfile.args || [])],
        {
          cwd: requestedCwd,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }
      );
      nativeTerminalProcess.unref();

      response.json({
        ok: true,
        mode: 'windows-terminal',
        profileId: activeProfile.id,
      });
      return;
    }

    const fallbackProcess = spawn(
      process.env.ComSpec || 'cmd.exe',
      ['/c', 'start', '""', activeProfile.shell, ...(activeProfile.args || [])],
      {
        cwd: requestedCwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    fallbackProcess.unref();

    response.json({
      ok: true,
      mode: 'external-shell',
      profileId: activeProfile.id,
    });
  } catch (error) {
    response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to open a native terminal window.',
    });
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

// HTTP Basic Auth Proxy for Private Tunnels
function createSecureProxy(targetPort, username, password, targetHost = '127.0.0.1') {
  const proxyServer = http.createServer((req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="Tilder Private Forwarded Port"',
        'Content-Type': 'text/plain',
      });
      res.end('Authentication required. Username: tilder, Password: tilder');
      return;
    }

    try {
      const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
      const user = auth[0];
      const pass = auth[1];

      if (user !== username || pass !== password) {
        res.writeHead(401, {
          'WWW-Authenticate': 'Basic realm="Tilder Private Forwarded Port"',
          'Content-Type': 'text/plain',
        });
        res.end('Invalid credentials.');
        return;
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request: Invalid auth header.');
      return;
    }

    const options = {
      hostname: targetHost,
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: req.headers
    };

    delete options.headers['authorization'];

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Proxy error: ${err.message}`);
    });

    req.pipe(proxyReq);
  });

  return new Promise((resolve) => {
    proxyServer.listen(0, '127.0.0.1', () => {
      const port = proxyServer.address().port;
      resolve({ server: proxyServer, port });
    });
  });
}

// System Stats Telemetry
let lastCpuStats = null;
function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  if (!lastCpuStats) {
    lastCpuStats = { totalIdle, totalTick };
    return 0;
  }
  
  const idleDifference = totalIdle - lastCpuStats.totalIdle;
  const tickDifference = totalTick - lastCpuStats.totalTick;
  lastCpuStats = { totalIdle, totalTick };
  
  if (tickDifference === 0) return 0;
  return 100 - Math.floor((idleDifference / tickDifference) * 100);
}

// ── Tilder Custom System Monitor ──────────────────────────────────────────
// Reads real-time stats from the background service at C:\ProgramData\Tilder\monitor.json
// The service runs as SYSTEM via a Scheduled Task created during NSIS installation.
// If no scheduled task is running (e.g. during development), server.js auto-starts
// the monitor as a child process. CPU/GPU usage and GPU temp work without admin;
// CPU temp requires the SYSTEM-level scheduled task.

let monitorProcess = null;

// CPU/GPU telemetry is written by the C# Windows Service (TilderMonitorService)
// installed via NSIS hooks.
function readMonitorData() {
  try {
    const monitorPath = path.join(
      process.env.ProgramData || 'C:\\ProgramData', 'Tilder', 'monitor.json'
    );
    if (fsSync.existsSync(monitorPath)) {
      let raw = fsSync.readFileSync(monitorPath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
      }
      const data = JSON.parse(raw);
      // Validate that the file is recent (less than 10 seconds old)
      const stat = fsSync.statSync(monitorPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < 10000) {
        return data;
      }
    }
  } catch (e) {
    // Silently fall back to systeminformation defaults
  }
  return null;
}

// The background monitor service runs independently. We just read the json file.
setTimeout(() => {
  try {
    const existing = readMonitorData();
    if (existing) {
      console.log('[Monitor] Monitor data detected from Windows Service.');
    } else {
      console.log('[Monitor] No active monitor data found yet. Starting fallback PowerShell monitor...');
      const scriptPath = path.join(__dirname, 'tilder_monitor_service.ps1');
      if (fsSync.existsSync(scriptPath)) {
        const { spawn } = require('child_process');
        monitorProcess = spawn('powershell.exe', [
          '-ExecutionPolicy', 'Bypass',
          '-WindowStyle', 'Hidden',
          '-File', scriptPath
        ], { detached: false, stdio: 'ignore' });
        
        process.on('exit', () => {
          if (monitorProcess) monitorProcess.kill();
        });
      }
    }
  } catch (err) {
    console.error('[Monitor] Error checking monitor data:', err);
  }
}, 2000);

app.get('/api/system/stats', async (request, response) => {
  try {
    // Read the background monitor data (CPU/GPU usage & temps)
    const monitor = readMonitorData();

    const [cpuData, currentLoad, memData, graphics] = await Promise.all([
      si.cpu(),
      si.currentLoad(),
      si.mem(),
      si.graphics(),
    ]);

    // CPU usage: prefer monitor service (uses % Processor Utility = Task Manager),
    // fall back to systeminformation
    const cpuUsage = (monitor && monitor.cpuUsage != null && monitor.cpuUsage >= 0)
      ? monitor.cpuUsage
      : Math.round(currentLoad.currentLoad);

    // CPU temperature: from background service (WMI thermal zone, needs SYSTEM)
    const cpuTemp = (monitor && monitor.cpuTemp != null) ? monitor.cpuTemp : null;

    // GPU usage: from background service (GPU Engine perf counters)
    const gpuUsage = (monitor && monitor.gpuUsage != null && monitor.gpuUsage >= 0)
      ? monitor.gpuUsage
      : 0;

    // GPU temperature: from background service (nvidia-smi)
    const gpuTemp = (monitor && monitor.gpuTemp != null) ? monitor.gpuTemp : null;

    response.json({
      cpu: {
        usage: cpuUsage,
        cores: cpuData.cores,
        physicalCores: cpuData.physicalCores,
        model: `${cpuData.manufacturer} ${cpuData.brand}`,
        speed: cpuData.speed,
        speedMax: cpuData.speedMax,
        temperature: cpuTemp,
        loadHistory: currentLoad.cpus.map(c => Math.round(c.load))
      },
      memory: {
        total: memData.total,
        free: memData.free,
        used: memData.used,
        active: memData.active,
        available: memData.available,
        buffers: memData.buffers,
        cached: memData.cached,
        percentage: Math.round((memData.active / memData.total) * 100),
      },
      gpu: graphics.controllers.map(gpu => ({
        model: gpu.model,
        vendor: gpu.vendor,
        vram: gpu.vram,
        vramDynamic: gpu.vramDynamic,
        utilizationGpu: gpuUsage,
        utilizationMemory: gpu.utilizationMemory,
        temperature: gpuTemp,
      })),
      platform: os.platform(),
      arch: os.arch(),
      uptime: os.uptime(),
      loadAvg: os.loadavg(),
    });
  } catch (err) {
    console.error('Failed to gather system stats:', err);
    response.status(500).json({ message: 'Internal server error fetching stats' });
  }
});

app.post('/api/open-link', (request, response) => {
  const url = String(request.body?.url || '').trim();
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    response.status(400).json({ message: 'Invalid URL.' });
    return;
  }
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    response.json({ ok: true });
  } catch (err) {
    response.status(500).json({ message: err.message });
  }
});

// Port Forwarding System using Cloudflare Quick Tunnels
const activeTunnels = new Map();

// Startup Cleanup: Kill any orphaned cloudflared processes from previous crashes
setTimeout(() => {
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /IM cloudflared.exe /T /F', { stdio: 'ignore' });
      console.log('[PortForwarder] Cleaned up orphaned cloudflared.exe processes.');
    } catch (e) {
      // Ignored: No process found
    }
  } else {
    try {
      execSync('pkill -9 cloudflared', { stdio: 'ignore' });
      console.log('[PortForwarder] Cleaned up orphaned cloudflared processes.');
    } catch (e) {}
  }
}, 1000);

app.get('/api/ports', (request, response) => {
  const portsArray = Array.from(activeTunnels.values()).map(t => ({
    port: t.port,
    description: t.description,
    visibility: t.visibility,
    status: t.status,
    url: t.url,
  }));
  response.json(portsArray);
});

app.post('/api/ports', async (request, response) => {
  const port = parseInt(request.body?.port, 10);
  const description = String(request.body?.description || `Port ${port}`).trim();
  const visibility = String(request.body?.visibility || 'public').trim();

  if (!port || port < 1 || port > 65535) {
    response.status(400).json({ message: 'Invalid port number.' });
    return;
  }

  let existingTunnel = activeTunnels.get(port);

  // If tunnel exists and we only updated description/visibility, update metadata without restart
  if (existingTunnel) {
    if (existingTunnel.visibility === visibility) {
      existingTunnel.description = description;
      response.json({
        port: existingTunnel.port,
        description: existingTunnel.description,
        visibility: existingTunnel.visibility,
        status: existingTunnel.status,
        url: existingTunnel.url,
      });
      return;
    } else {
      // Visibility changed: stop the old tunnel and let a new one start
      if (existingTunnel.process) {
        try {
          if (process.platform === 'win32') {
            execSync(`taskkill /pid ${existingTunnel.process.pid} /T /F`, { stdio: 'ignore' });
          } else {
            existingTunnel.process.kill('SIGKILL');
          }
        } catch (e) {}
      }
      if (existingTunnel.proxyServer) {
        try {
          existingTunnel.proxyServer.close();
        } catch (e) {}
      }
      activeTunnels.delete(port);
    }
  }

  const tunnelInfo = {
    port,
    description,
    visibility,
    status: 'connecting',
    url: null,
    process: null,
    proxyServer: null,
    error: null,
  };

  activeTunnels.set(port, tunnelInfo);

  // Verification step: Ensure an application is actually listening on the requested port
  const checkPortHelper = (host) => new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.once('error', () => { s.destroy(); resolve(false); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.connect(port, host);
  });

  const checkPort = async () => {
    if (await checkPortHelper('127.0.0.1')) return '127.0.0.1';
    if (await checkPortHelper('::1')) return '::1';
    return null;
  };

  try {
    const activeHost = await checkPort();
    if (!activeHost) {
      activeTunnels.delete(port);
      response.status(400).json({ message: `No local application is running on port ${port}. Please start your app first.` });
      return;
    }

    let targetPort = port;
    let targetHost = activeHost;

    if (visibility === 'private') {
      // Proxy binds to 127.0.0.1 by default
      const { server, port: proxyPort } = await createSecureProxy(port, 'tilder', 'tilder', activeHost);
      tunnelInfo.proxyServer = server;
      targetPort = proxyPort;
      targetHost = '127.0.0.1';
      // Append credentials notice to description if not already there, to help user log in
      if (!description.includes('User: tilder')) {
        tunnelInfo.description = `${description} (User: tilder, Pass: tilder)`;
      }
    }

    // Format IPv6 address with brackets for URL
    const urlHost = targetHost === '::1' ? '[::1]' : targetHost;
    
    // Spawn cloudflared quick tunnel using npx pointing to targetPort
    const cmdArgs = ['--yes', 'cloudflared', 'tunnel', '--url', `http://${urlHost}:${targetPort}`];
    const proc = spawn('npx', cmdArgs, {
      shell: true,
      windowsHide: true,
    });

    tunnelInfo.process = proc;

    let outputBuffer = '';

    const handleData = (chunk) => {
      const dataStr = chunk.toString();
      outputBuffer += dataStr;
      
      if (outputBuffer.length > 10000) {
        outputBuffer = outputBuffer.slice(-10000);
      }

      if (outputBuffer.includes('https://') && outputBuffer.includes('.trycloudflare.com')) {
        const match = outputBuffer.match(/https:\/\/[^\s\r\n]+\.trycloudflare\.com/);
        if (match && tunnelInfo.status === 'connecting') {
          tunnelInfo.status = 'active';
          tunnelInfo.url = match[0];
          console.log(`[PortForwarder] Cloudflare quick tunnel active for port ${port}: ${tunnelInfo.url}`);
        }
      }
    };

    proc.stdout.on('data', handleData);
    proc.stderr.on('data', handleData);

    proc.on('error', (err) => {
      console.error(`[PortForwarder] Failed to spawn cloudflared for port ${port}:`, err);
      tunnelInfo.status = 'error';
      tunnelInfo.error = err.message;
    });

    proc.on('exit', (code, signal) => {
      console.log(`[PortForwarder] Tunnel process for port ${port} exited with code ${code} (signal: ${signal})`);
      if (activeTunnels.get(port) === tunnelInfo) {
        tunnelInfo.status = 'error';
        tunnelInfo.url = null;
        tunnelInfo.process = null;
        if (tunnelInfo.proxyServer) {
          try {
            tunnelInfo.proxyServer.close();
          } catch (e) {}
        }
      }
    });

  } catch (error) {
    console.error(`[PortForwarder] Exception spawning tunnel for port ${port}:`, error);
    tunnelInfo.status = 'error';
    tunnelInfo.error = error.message;
  }

  response.json({
    port: tunnelInfo.port,
    description: tunnelInfo.description,
    visibility: tunnelInfo.visibility,
    status: tunnelInfo.status,
    url: tunnelInfo.url,
  });
});

app.delete('/api/ports/:port', (request, response) => {
  const port = parseInt(request.params.port, 10);
  if (!port) {
    response.status(400).json({ message: 'Invalid port parameter.' });
    return;
  }

  const tunnel = activeTunnels.get(port);
  if (tunnel) {
    if (tunnel.process) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${tunnel.process.pid} /T /F`, { stdio: 'ignore' });
        } else {
          tunnel.process.kill('SIGKILL');
        }
      } catch (err) {
        console.error(`[PortForwarder] Error killing tunnel process for port ${port}:`, err);
      }
    }
    if (tunnel.proxyServer) {
      try {
        tunnel.proxyServer.close();
      } catch (err) {}
    }
    activeTunnels.delete(port);
    response.json({ success: true });
  } else {
    response.status(404).json({ message: 'Tunnel not found.' });
  }
});

const cleanupTunnels = () => {
  for (const [port, tunnel] of activeTunnels.entries()) {
    if (tunnel.process) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${tunnel.process.pid} /T /F`, { stdio: 'ignore' });
        } else {
          tunnel.process.kill('SIGKILL');
        }
      } catch (err) {
        // ignore
      }
    }
    if (tunnel.proxyServer) {
      try {
        tunnel.proxyServer.close();
      } catch (err) {}
    }
  }
};

process.on('exit', cleanupTunnels);
process.on('SIGINT', () => {
  cleanupTunnels();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanupTunnels();
  process.exit(0);
});

io.on('connection', async (socket) => {
  const cols = Number(socket.handshake.query.cols || 120);
  const rows = Number(socket.handshake.query.rows || 30);
  const requestedProfileId = String(socket.handshake.query.profileId || '').trim();
  const requestedWorkspaceRoot = normalizeWorkspaceRoot(
    socket.handshake.query.workspaceRoot || socket.handshake.query.cwd || shellCwd
  );
  let activeShellCwd = '';
  const terminalProfiles = await resolveTerminalProfiles();
  const activeProfile =
    terminalProfiles.profiles.find((profile) => profile.id === requestedProfileId) ||
    terminalProfiles.profiles.find((profile) => profile.id === terminalProfiles.defaultProfileId) ||
    terminalProfiles.profiles[0] ||
    null;

  if (!activeProfile) {
    socket.emit('terminal:error', 'No supported terminal profiles are available on this machine.');
    socket.disconnect(true);
    return;
  }

  let ptyProcess;
  try {
      ptyProcess = pty.spawn(activeProfile.shell, activeProfile.args || [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: requestedWorkspaceRoot || shellCwd,
        env: process.env,
        ...(os.platform() === 'win32'
          ? {
            useConpty: true,
            useConptyDll: true,
            conptyInheritCursor: false,
          }
        : {}),
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
    ptyProcess.write(activeProfile.setCwdCommand(normalizedNextPath));
  });

  socket.on('disconnect', () => {
    ptyProcess.kill();
  });
});

lspNamespace.on('connection', async (socket) => {
  const host = socket.handshake.headers.host || '';
  const runtimeMode = getRuntimeModeFromValue(host, socket);
  const languageId = String(socket.handshake.query.languageId || '').trim();
  const requestedWorkspaceRoot = normalizeWorkspaceRoot(socket.handshake.query.workspaceRoot || shellCwd);
  const remoteWorkspaceSessionId = String(socket.handshake.query.sessionId || '').trim();
  const ownerSession = resolveSessionFromSocket(socket);
  const adapter = languageId ? getLspAdapter(languageId) : null;

  console.log(`[LSP Connection] New client connection request:`, {
    languageId,
    runtimeMode,
    requestedWorkspaceRoot,
    remoteWorkspaceSessionId,
    host,
    address: socket.handshake.address || socket.request?.connection?.remoteAddress || ''
  });

  if (!languageId || !adapter) {
    console.error(`[LSP Connection] Unsupported language or adapter missing for languageId: ${languageId}`);
    socket.emit('lsp:status', {
      status: 'unsupported',
      languageId,
      message: 'No local language server is configured for this language.',
    });
    socket.disconnect(true);
    return;
  }

  let session = null;

  try {
    const remoteWorkspaceSession = remoteWorkspaceSessionId
      ? getRemoteWorkspaceSession(ownerSession?.id || '', remoteWorkspaceSessionId) ||
        getRemoteWorkspaceSession('', remoteWorkspaceSessionId)
      : null;
    const workspaceRoot =
      remoteWorkspaceSession?.workspaceRoot || (runtimeMode === 'desktop-local' ? requestedWorkspaceRoot : '');

    console.log(`[LSP Connection] Resolved workspaceRoot: "${workspaceRoot}"`);

    if (!workspaceRoot) {
      console.error(`[LSP Connection] Workspace root is empty or unavailable.`);
      socket.emit('lsp:status', {
        status: 'unavailable',
        languageId,
        message:
          runtimeMode === 'desktop-local'
            ? 'Create and sync a workspace mirror before using IntelliSense for this file.'
            : 'Create and sync a remote workspace session before using hosted IntelliSense.',
      });
      socket.disconnect(true);
      return;
    }

    console.log(`[LSP Connection] Ensuring broker session for languageId: ${languageId} in workspaceRoot: ${workspaceRoot}`);
    session = await lspBroker.ensureSession(languageId, workspaceRoot, adapter);
    console.log(`[LSP Connection] Successfully established session. Attaching client socket.`);
    lspBroker.attachSocket(socket, session);
  } catch (error) {
    console.error(`[LSP Connection] Error during socket initialization:`, error);
    socket.emit('lsp:status', {
      status: 'error',
      languageId,
      message: error instanceof Error ? error.message : 'Unable to start the local language server.',
    });
    socket.disconnect(true);
    return;
  }
});

const dapBroker = createDapBroker({
  normalizeWorkspaceRoot,
  resolveInstalledCommand,
  emitStatus: (session, payload) => dapNamespace.to(session.room).emit('dap:status', payload),
  namespace: dapNamespace,
  spawnProcess: spawnLspProcess,
  parseMessages: parseLspMessages,
  encodeMessage: encodeLspMessage,
});

dapNamespace.on('connection', async (socket) => {
  const sessionId = String(socket.handshake.query.sessionId || '').trim();
  const requestedWorkspaceRoot = normalizeWorkspaceRoot(socket.handshake.query.workspaceRoot || shellCwd);
  const runtime = String(socket.handshake.query.runtime || '').trim();
  
  if (!sessionId) {
    socket.disconnect(true);
    return;
  }

  try {
    let adapter, launchArgs;
    
    switch (runtime) {
      case 'cpp':
        adapter = {
          serverLabel: 'C/C++ Debugger (cppdbg)',
          commands: ['OpenDebugAD7.exe', 'OpenDebugAD7', 'lldb-vscode', 'lldb-vscode.exe'],
        };
        launchArgs = [];
        break;
      case 'rust':
        adapter = {
          serverLabel: 'Rust Debugger (lldb-vscode)',
          commands: ['lldb-vscode', 'lldb-vscode.exe', 'rust-lldb'],
        };
        launchArgs = [];
        break;
      case 'java':
        adapter = {
          serverLabel: 'Java Debugger',
          commands: ['java'],
        };
        launchArgs = ['-jar', 'java-debug-adapter.jar'];
        break;
      case 'python':
      default:
        adapter = {
          serverLabel: 'Python Debugger (debugpy)',
          commands: ['python', 'python3'],
        };
        launchArgs = ['-m', 'debugpy.adapter'];
        break;
    }
    
    const session = await dapBroker.startSession(sessionId, requestedWorkspaceRoot, adapter, launchArgs);
    dapBroker.attachSocket(socket, session);
  } catch (error) {
    socket.emit('dap:status', {
      status: 'error',
      sessionId,
      message: error instanceof Error ? error.message : 'Unable to start debug adapter.',
    });
    socket.disconnect(true);
  }
});

app.use('/extensions-assets', express.static(extensionsAssetDir));
app.use(express.static(distPath));

app.use((_request, response) => {
  response.sendFile(path.join(distPath, 'index.html'));
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${port} is already in use. Assuming background service is running.`);
    process.exit(0);
  }
});

server.listen(port, () => {
  console.log(`Tilder server running on http://localhost:${port}`);
});



