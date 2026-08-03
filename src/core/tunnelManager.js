// src/core/tunnelManager.js
// Tiny helper to manage ngrok tunnels for Tilder.
// It spawns ngrok as a child process, captures the public URL, and provides stop functionality.
// The ngrok auth token is injected at build time via Vite's define (process.env.NGROK_AUTHTOKEN).

import { spawn } from 'child_process';
import path from 'path';

let tunnelIdCounter = 0;
const activeTunnels = new Map(); // id -> { process, url, status }

/** Ensure ngrok binary is available. The npm package ships an executable, so no extra install needed. */
export function ensureNgrokAvailable() {
  // The ngrok npm package provides a binary; we just import it to guarantee it is bundled.
  // No runtime action required.
  return true;
}

/** Start an ngrok HTTP tunnel.
 * @param {number} port - Local port to expose.
 * @param {string} description - Human readable description (stored for UI).
 * @param {'public'|'private'} visibility - If 'private', we hide the URL from UI but still keep the tunnel.
 * @returns {{id:string, process:ChildProcess}} The tunnel identifier and process handle.
 */
export function startTunnel(port, description, visibility = 'public') {
  const id = `ngrok-${++tunnelIdCounter}`;
  const args = ['http', `${port}`, '--log', 'stdout'];
  const token = process.env.NGROK_AUTHTOKEN;
  if (token) {
    args.push('--authtoken', token);
  }
  // In private mode we just hide the URL later; ngrok itself does not have a private flag.
  const ngrokPath = path.resolve('node_modules', '.bin', process.platform === 'win32' ? 'ngrok.cmd' : 'ngrok');
  const proc = spawn(ngrokPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  const tunnel = { id, process: proc, url: null, status: 'connecting', description, visibility };
  activeTunnels.set(id, tunnel);

  const stdoutListener = (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[^\s]+/);
    if (match && !tunnel.url) {
      tunnel.url = match[0];
      tunnel.status = 'active';
    }
  };
  const stderrListener = (data) => {
    // Capture errors – mark tunnel as error and store message.
    tunnel.status = 'error';
    tunnel.errorMessage = data.toString();
  };

  proc.stdout.on('data', stdoutListener);
  proc.stderr.on('data', stderrListener);
  proc.on('exit', (code, signal) => {
    if (tunnel.status !== 'active') {
      tunnel.status = 'error';
      tunnel.errorMessage = `ngrok exited with code ${code ?? signal}`;
    }
    activeTunnels.delete(id);
  });

  return { id, process: proc };
}

/** Stop a previously started tunnel by its id. */
export function stopTunnel(id) {
  const tunnel = activeTunnels.get(id);
  if (tunnel && tunnel.process) {
    tunnel.process.kill();
    activeTunnels.delete(id);
  }
}

/** Retrieve current tunnel info (used by UI). */
export function getTunnelInfo(id) {
  return activeTunnels.get(id) || null;
}

export default { ensureNgrokAvailable, startTunnel, stopTunnel, getTunnelInfo };
