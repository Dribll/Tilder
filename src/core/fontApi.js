import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './runtime.js';

export async function fetchSystemFonts() {
  if (!isDesktopRuntime()) {
    return [];
  }

  try {
    const fonts = await invoke('list_system_fonts');
    return Array.isArray(fonts) ? fonts : [];
  } catch {
    return [];
  }
}
