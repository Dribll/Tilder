import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isDesktopRuntime } from './runtime.js';

/**
 * Checks for available updates.
 * @param {boolean} silent If true, doesn't throw errors on failure (e.g., auto-check on startup)
 * @returns {Promise<import('@tauri-apps/plugin-updater').Update | null>} The update object if an update is available, null otherwise.
 */
export async function checkForUpdates(silent = false) {
  if (!isDesktopRuntime()) {
    return null;
  }

  try {
    const update = await check();
    if (update && update.available) {
      return update;
    }
    return null;
  } catch (error) {
    if (!silent) {
      throw error;
    }
    console.error('Failed to check for updates (silent):', error);
    return null;
  }
}

/**
 * Downloads and installs the update, then relaunches the app.
 * @param {import('@tauri-apps/plugin-updater').Update} update The update object returned by checkForUpdates
 * @param {function(number)} onProgress Optional callback to receive download progress length
 */
export async function installUpdate(update, onProgress) {
  if (!update || !isDesktopRuntime()) {
    throw new Error('Update is not available or not running in desktop mode.');
  }

  let downloadedBytes = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        downloadedBytes = 0;
        break;
      case 'Progress':
        downloadedBytes += event.data.chunkLength;
        if (onProgress) {
          onProgress(downloadedBytes, event.data.contentLength);
        }
        break;
      case 'Finished':
        console.log('Update installation finished.');
        break;
      default:
        break;
    }
  });

  await relaunch();
}
