import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './runtime.js';

function ensureDesktop() {
  if (!isDesktopRuntime()) {
    throw new Error('Desktop file API is only available in the Tilder desktop app.');
  }
}

export async function desktopPickFolder() {
  ensureDesktop();
  return invoke('desktop_pick_folder');
}

export async function desktopPickFile() {
  ensureDesktop();
  return invoke('desktop_pick_file');
}

export async function desktopPickSavePath(suggestedName = '') {
  ensureDesktop();
  return invoke('desktop_pick_save_path', { suggestedName });
}

export async function desktopReadDir(path) {
  ensureDesktop();
  return invoke('desktop_read_dir', { path });
}

export async function desktopReadTree(rootPath) {
  ensureDesktop();
  return invoke('desktop_read_tree', { rootPath, recursive: true });
}

export async function desktopReadFile(filePath) {
  ensureDesktop();
  return invoke('desktop_read_file', { filePath });
}

export async function desktopWriteFile(filePath, content, isBinary = false) {
  ensureDesktop();
  return invoke('desktop_write_file', { filePath, content, isBinary });
}

export async function desktopWriteWorkspace(rootPath, entries) {
  ensureDesktop();
  return invoke('desktop_write_workspace', { rootPath, entries });
}

export async function desktopCreateFile(filePath) {
  ensureDesktop();
  return invoke('desktop_create_file', { filePath });
}

export async function desktopCreateFolder(folderPath) {
  ensureDesktop();
  return invoke('desktop_create_folder', { folderPath });
}

export async function desktopDeletePath(targetPath, recursive = false) {
  ensureDesktop();
  return invoke('desktop_delete_path', { targetPath, recursive });
}

export async function desktopCopyPath(sourcePath, destinationPath) {
  ensureDesktop();
  return invoke('desktop_copy_path', { sourcePath, destinationPath });
}

export async function desktopMovePath(sourcePath, destinationPath) {
  ensureDesktop();
  return invoke('desktop_move_path', { sourcePath, destinationPath });
}

export async function desktopExecuteCommand(command, args = [], cwd = null) {
  ensureDesktop();
  return invoke('desktop_execute_command', { command, args, cwd });
}

export async function revealInExplorer(path) {
  ensureDesktop();
  return invoke('reveal_in_explorer', { path });
}

export async function openDesktopWindow() {
  ensureDesktop();
  return invoke('open_new_window');
}

export async function desktopDetectRuntimes() {
  if (!isDesktopRuntime()) return {};
  try {
    return await invoke('desktop_detect_runtimes');
  } catch (err) {
    console.error('Failed to detect runtimes:', err);
    return {};
  }
}

export async function desktopUpdateJumpList(files, workspaces) {
  if (!isDesktopRuntime()) return;
  try {
    await invoke('desktop_update_jump_list', { files, workspaces });
  } catch (err) {
    console.error('Failed to update jump list:', err);
  }
}

export function trackJumpListItem(type, path) {
  if (!isDesktopRuntime() || !path || path === 'root') return;
  
  try {
    const filesKey = 'tilderRecentFiles';
    const wsKey = 'tilderRecentWorkspaces';
    
    let files = JSON.parse(localStorage.getItem(filesKey) || '[]');
    let workspaces = JSON.parse(localStorage.getItem(wsKey) || '[]');
    
    if (type === 'file') {
      files = [path, ...files.filter(p => p !== path)].slice(0, 10);
      localStorage.setItem(filesKey, JSON.stringify(files));
    } else if (type === 'workspace') {
      workspaces = [path, ...workspaces.filter(p => p !== path)].slice(0, 10);
      localStorage.setItem(wsKey, JSON.stringify(workspaces));
    }
    
    desktopUpdateJumpList(files, workspaces);
  } catch (err) {
    console.error('Failed to track jump list item:', err);
  }
}


