import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

let streamIdCounter = 0;
function nextStreamId() {
  return `s${Date.now()}_${++streamIdCounter}`;
}

/** Check if arduino-cli is available. Returns path string or null. */
export async function getElectronicsCliPath() {
  try {
    return await invoke('get_electronics_cli_path');
  } catch {
    return null;
  }
}

/** Download arduino-cli into app data dir. Returns path on success. */
export async function downloadElectronicsCli() {
  return await invoke('download_electronics_cli');
}

/** Initialize arduino-cli indexes (run once after install). */
export async function electronicsInit() {
  return await invoke('electronics_init');
}

/** Run a command and return all output at once. */
async function runCli(args) {
  return await invoke('run_electronics_cli', { args });
}

/**
 * Run a command with real-time streaming.
 * @param {string[]} args
 * @param {(line: {type: string, data: string}) => void} onLine
 * @returns {Promise<number>} exit code
 */
export function runCliStream(args, onLine) {
  return new Promise(async (resolve, reject) => {
    const streamId = nextStreamId();
    const eventName = `arduino-stream-${streamId}`;

    let unlisten;
    unlisten = await listen(eventName, (event) => {
      const payload = event.payload;
      onLine(payload);
      if (payload.type === 'done' || payload.type === 'error') {
        unlisten?.();
        resolve(payload.code ?? (payload.type === 'done' ? 0 : -1));
      }
    });

    try {
      await invoke('run_electronics_cli_stream', { args, streamId });
    } catch (e) {
      unlisten?.();
      reject(e);
    }
  });
}

export async function getConnectedPorts() {
  try {
    const output = await runCli(['board', 'list', '--format', 'json']);
    const parsed = JSON.parse(output);
    // arduino-cli v0.35+ returns { detected_ports: [...] }
    return parsed?.detected_ports || parsed || [];
  } catch {
    return [];
  }
}

export async function searchLibraries(query) {
  try {
    const output = await runCli(['lib', 'search', query, '--format', 'json']);
    const parsed = JSON.parse(output);
    return parsed?.libraries || [];
  } catch (e) {
    console.error("searchLibraries error:", e);
    throw e;
  }
}

export async function installLibrary(libName, onLine) {
  return runCliStream(['lib', 'install', libName], onLine);
}

export async function uninstallLibrary(libName) {
  return runCli(['lib', 'uninstall', libName]);
}

export async function getInstalledLibraries() {
  try {
    const output = await runCli(['lib', 'list', '--format', 'json']);
    const parsed = JSON.parse(output);
    return parsed?.installed_libraries || [];
  } catch {
    return [];
  }
}

export async function getAllBoards() {
  try {
    const output = await runCli(['board', 'listall', '--format', 'json']);
    const parsed = JSON.parse(output);
    return parsed?.boards || [];
  } catch {
    return [];
  }
}

export async function getInstalledCores() {
  try {
    const output = await runCli(['core', 'list', '--format', 'json']);
    const parsed = JSON.parse(output);
    return parsed?.platforms || [];
  } catch {
    return [];
  }
}

export async function installCore(coreId, onLine) {
  return runCliStream(['core', 'install', coreId], onLine);
}

export async function compileSketch(sketchPath, fqbn, onLine) {
  return runCliStream(['compile', '-b', fqbn, '--verbose', sketchPath], onLine);
}

export async function uploadSketch(sketchPath, fqbn, port, onLine) {
  return runCliStream(['upload', '-b', fqbn, '-p', port, '--verbose', sketchPath], onLine);
}

/**
 * Start serial monitor streaming.
 * @param {string} port 
 * @param {number} baud 
 * @param {(line: {type: string, data: string}) => void} onData 
 * @returns {Promise<() => void>} unlisten function to stop
 */
export async function startSerialMonitor(port, baud, onData) {
  const streamId = nextStreamId();
  const eventName = `serial-stream-${streamId}`;

  const unlisten = await listen(eventName, (event) => {
    onData(event.payload);
  });

  await invoke('serial_monitor_start', { port, baud, streamId });

  return unlisten;
}
