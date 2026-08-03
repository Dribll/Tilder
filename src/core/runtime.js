export function isDesktopRuntime() {
  if (typeof window === 'undefined') {
    return false;
  }

  const runtimeMode = String(window.__TILDER_RUNTIME_MODE__ || '').trim().toLowerCase();
  if (runtimeMode === 'desktop-local' || runtimeMode === 'desktop') {
    return true;
  }

  const protocol = String(window.location?.protocol || '').toLowerCase();
  const hostname = String(window.location?.hostname || '').toLowerCase();

  if (protocol.startsWith('tauri:') || hostname === 'tauri.localhost') {
    return true;
  }

  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.TAURI_ENV_PLATFORM) {
    return true;
  }

  return Boolean(window.isTauri || window.__TAURI__ || window.__TAURI_INTERNALS__ || window.__TAURI_IPC__);
}
