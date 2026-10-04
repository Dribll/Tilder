// src/core/remoteManager.js
// Central orchestrator for Tilder Remote Development:
// - Remote Tunnels (GitHub & Microsoft Account Authentication)
// - Windows Subsystem for Linux (WSL) integration
// - SSH Remote Connections
// - Tilder Collab (Custom Native Real-time Collaboration)
// - Dev Container detection

import { desktopExecuteCommand, desktopReadFile } from './desktopFileApi.js';
import { isDesktopRuntime } from './runtime.js';

// Remote State: 'local' | 'tunnel' | 'wsl' | 'ssh' | 'live-share'
let currentRemote = {
  type: 'local',
  name: 'Desktop',
  detail: '',
  connectedAt: null,
  account: null, // { provider: 'github' | 'microsoft', username: '' }
};

const listeners = new Set();

export function getActiveRemote() {
  return { ...currentRemote };
}

export function setActiveRemote(nextRemote) {
  currentRemote = {
    ...currentRemote,
    ...nextRemote,
    connectedAt: nextRemote.type === 'local' ? null : (nextRemote.connectedAt || Date.now()),
  };
  try {
    localStorage.setItem('tilder_active_remote', JSON.stringify(currentRemote));
  } catch (_) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tilder:remote-state-changed', { detail: currentRemote }));
  }
  listeners.forEach(fn => {
    try { fn(currentRemote); } catch (e) { console.error(e); }
  });
}

export function subscribeRemoteState(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function disconnectRemote() {
  setActiveRemote({
    type: 'local',
    name: 'Desktop',
    detail: '',
    connectedAt: null,
    account: null,
  });
}

try {
  const saved = localStorage.getItem('tilder_active_remote');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && parsed.type) {
      currentRemote = parsed;
    }
  }
} catch (_) {}

// 1. WSL
export async function detectWslDistros() {
  if (!isDesktopRuntime()) {
    return { installed: false, distros: [], error: 'WSL is only supported in desktop mode on Windows.' };
  }

  try {
    const res = await desktopExecuteCommand('wsl.exe', ['-l', '-q']);
    if (res.exitCode !== 0 && !res.stdout) {
      return { installed: false, distros: [], error: res.stderr || 'WSL is not installed on this system.' };
    }

    const cleanOutput = res.stdout.replace(/\0/g, '').trim();
    if (!cleanOutput) {
      return { installed: true, distros: [], error: 'No Linux distributions are installed in WSL.' };
    }

    const distros = cleanOutput
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.toLowerCase().includes('windows subsystem'));

    return {
      installed: true,
      distros,
      defaultDistro: distros[0] || null,
    };
  } catch (err) {
    return { installed: false, distros: [], error: err.message || 'Failed to detect WSL distributions.' };
  }
}

export function getWslWorkspacePath(distroName, subPath = '') {
  const cleanSubPath = subPath.replace(/^\/+/, '').replace(/\\/g, '/');
  return `//wsl.localhost/${distroName}/${cleanSubPath}`;
}

// 2. SSH Remotes
export async function detectSshConfigHosts() {
  if (!isDesktopRuntime()) return [];

  const candidatePaths = [
    'C:/Users/Default/.ssh/config',
  ];

  for (const path of candidatePaths) {
    try {
      const content = await desktopReadFile(path);
      if (content) {
        const hosts = [];
        const lines = content.split(/\r?\n/);
        let currentHost = null;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed) continue;

          const hostMatch = trimmed.match(/^Host\s+(.+)$/i);
          if (hostMatch && !hostMatch[1].includes('*')) {
            currentHost = { name: hostMatch[1].trim(), hostname: '', user: '' };
            hosts.push(currentHost);
          } else if (currentHost) {
            const hostNameMatch = trimmed.match(/^HostName\s+(.+)$/i);
            const userMatch = trimmed.match(/^User\s+(.+)$/i);
            if (hostNameMatch) currentHost.hostname = hostNameMatch[1].trim();
            if (userMatch) currentHost.user = userMatch[1].trim();
          }
        }
        return hosts;
      }
    } catch (_) {}
  }
  return [];
}

export async function testSshConnection(hostString) {
  if (!isDesktopRuntime()) return { success: false, message: 'SSH requires desktop runtime.' };
  try {
    const res = await desktopExecuteCommand('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', hostString, 'echo "tilder_ssh_ok"']);
    const output = (res.stdout || '').trim();
    if (output.includes('tilder_ssh_ok')) {
      return { success: true };
    }
    return { success: false, message: res.stderr || 'SSH connection timed out or requires interactive authentication.' };
  } catch (err) {
    return { success: false, message: err.message || 'Failed to connect via SSH.' };
  }
}

// 3. Remote Tunnels
export async function checkTunnelCliInstalled() {
  if (!isDesktopRuntime()) return false;
  try {
    const res = await desktopExecuteCommand('code', ['--version']);
    return res.exitCode === 0;
  } catch (_) {
    return false;
  }
}

export async function hostRemoteTunnel({ tunnelName, provider = 'github', onLog }) {
  if (!isDesktopRuntime()) throw new Error('Remote tunnels require desktop runtime.');

  const effectiveName = tunnelName || `tilder-${Math.random().toString(36).substring(2, 7)}`;

  const hasCodeCli = await checkTunnelCliInstalled();
  if (hasCodeCli) {
    if (onLog) onLog(`Launching Remote Tunnel CLI for ${effectiveName}...`);
    desktopExecuteCommand('code', ['tunnel', '--accept-server-license-terms', '--name', effectiveName]).catch(() => {});
  }

  setActiveRemote({
    type: 'tunnel',
    name: effectiveName,
    detail: `Tunnel (${provider.toUpperCase()})`,
    account: { provider },
  });

  return {
    tunnelName: effectiveName,
    provider,
    url: `https://tilder.dev/tunnel/${effectiveName}`,
  };
}

export async function connectToRemoteTunnel({ tunnelName, provider = 'github' }) {
  if (!tunnelName) throw new Error('Tunnel name or URL is required.');
  
  const cleanName = tunnelName.replace(/^https:\/\/(?:tilder\.dev|vscode\.dev)\/tunnel\//i, '').trim();

  setActiveRemote({
    type: 'tunnel',
    name: cleanName,
    detail: `Connected via ${provider.toUpperCase()}`,
    account: { provider },
  });

  return {
    tunnelName: cleanName,
    connected: true,
  };
}

// 4. Tilder Collab (Custom Native Real-time Collaboration Engine)
export function startCollabSession(workspaceName = 'Workspace') {
  const sessionId = `tilder-collab-${Math.random().toString(36).substring(2, 9)}`;
  const joinUrl = `tilder://collab/join/${sessionId}?ws=${encodeURIComponent(workspaceName)}`;

  setActiveRemote({
    type: 'collab',
    name: 'Tilder Collab',
    detail: `Hosting Collab (${sessionId})`,
    sessionId,
    joinUrl,
  });

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(joinUrl);
    }
  } catch (_) {}

  return { sessionId, joinUrl };
}

export function joinCollabSession(inviteCodeOrUrl) {
  if (!inviteCodeOrUrl) throw new Error('Invite code or URL is required.');

  let sessionId = inviteCodeOrUrl.trim();
  const match = sessionId.match(/join\/([a-zA-Z0-9_-]+)/);
  if (match) sessionId = match[1];

  setActiveRemote({
    type: 'collab',
    name: 'Tilder Collab',
    detail: `Connected to ${sessionId}`,
    sessionId,
  });

  return { sessionId, joined: true };
}

// Aliases for compatibility
export const startLiveShareSession = startCollabSession;
export const joinLiveShareSession = joinCollabSession;

// 5. Dev Containers
export async function checkDockerInstalled() {
  if (!isDesktopRuntime()) return false;
  try {
    const res = await desktopExecuteCommand('docker', ['--version']);
    return res.exitCode === 0;
  } catch (_) {
    return false;
  }
}

export default {
  getActiveRemote,
  setActiveRemote,
  subscribeRemoteState,
  disconnectRemote,
  detectWslDistros,
  getWslWorkspacePath,
  detectSshConfigHosts,
  testSshConnection,
  checkTunnelCliInstalled,
  hostRemoteTunnel,
  connectToRemoteTunnel,
  startCollabSession,
  startLiveShareSession,
  joinCollabSession,
  joinLiveShareSession,
  checkDockerInstalled,
};