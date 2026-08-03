import { EDITOR_LANGUAGE_REGISTRY } from '../../shared/editor/languageRegistry.js';
import {
  desktopCopyPath,
  desktopCreateFile,
  desktopCreateFolder,
  desktopDeletePath,
  desktopMovePath,
  desktopPickFile,
  desktopPickFolder,
  desktopPickSavePath,
  desktopReadDir,
  desktopReadFile,
  desktopReadTree,
  desktopWriteFile,
  desktopWriteWorkspace,
  trackJumpListItem,
} from './desktopFileApi.js';
import { isDesktopRuntime } from './runtime.js';

function sortNodes(nodes) {
  return [...nodes].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'folder' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

const exactFileLanguageMap = new Map();
const extensionLanguageMap = new Map();
const GENERATED_SYNC_SEGMENTS = new Set([
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

EDITOR_LANGUAGE_REGISTRY.forEach((language) => {
  (language.extensions || []).forEach((entry) => {
    const normalized = String(entry || '').toLowerCase();
    if (!normalized) {
      return;
    }

    if (normalized.startsWith('.')) {
      extensionLanguageMap.set(normalized, language.id);
      return;
    }

    exactFileLanguageMap.set(normalized, language.id);
  });
});

function joinPath(parentPath, name) {
  if (!parentPath || parentPath === 'root') {
    return name;
  }

  return `${parentPath}/${name}`;
}

function toRelativeWorkspacePath(rootPath = '', absolutePath = '') {
  const normalizedRoot = String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedAbsolute = String(absolutePath || '').replace(/\\/g, '/');
  if (!normalizedRoot) {
    return normalizeCreatePath(normalizedAbsolute);
  }

  const loweredRoot = normalizedRoot.toLowerCase();
  const loweredAbsolute = normalizedAbsolute.toLowerCase();
  if (!loweredAbsolute.startsWith(loweredRoot)) {
    return normalizeCreatePath(normalizedAbsolute);
  }

  const trimmed = normalizedAbsolute.slice(normalizedRoot.length).replace(/^\/+/, '');
  return normalizeCreatePath(trimmed);
}

function toAbsoluteWorkspacePath(rootPath = '', relativePath = '') {
  const normalizedRoot = String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedRelative = normalizeCreatePath(relativePath);
  if (!normalizedRelative || normalizedRelative === 'root') {
    return normalizedRoot;
  }

  return normalizedRoot ? `${normalizedRoot}/${normalizedRelative}` : normalizedRelative;
}

function normalizeCreatePath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^root\/?/, '')
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function parentPathOf(path = '') {
  const normalized = normalizeCreatePath(path);
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('/') : 'root';
}

function resolveCreatePath(parentPath, entryPath) {
  const parent = normalizeCreatePath(parentPath);
  const entry = normalizeCreatePath(entryPath);
  if (!entry) {
    return '';
  }

  return parent ? `${parent}/${entry}` : entry;
}

function resolveFileCreatePaths(parentPath, name) {
  const entries = String(name || '')
    .split('&')
    .map(normalizeCreatePath)
    .filter(Boolean);

  if (!entries.length) {
    return [];
  }

  const firstEntry = entries[0];
  const firstParent = parentPathOf(firstEntry);
  const sharedParent = firstParent === 'root' ? '' : firstParent;

  return entries.map((entry, index) => {
    const shouldShareFirstParent = index > 0 && sharedParent && !entry.includes('/');
    return resolveCreatePath(parentPath, shouldShareFirstParent ? `${sharedParent}/${entry}` : entry);
  });
}

function cloneNode(node) {
  return {
    ...node,
    children: node.children ? node.children.map(cloneNode) : undefined,
  };
}

function isBinaryFileName(name = '') {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return [
    '7z',
    'avi',
    'bmp',
    'class',
    'dll',
    'eot',
    'exe',
    'gif',
    'gz',
    'ico',
    'jar',
    'jpeg',
    'jpg',
    'lock',
    'map',
    'mov',
    'mp3',
    'mp4',
    'o',
    'otf',
    'pdf',
    'png',
    'pyc',
    'so',
    'tar',
    'ttf',
    'wav',
    'webm',
    'webp',
    'woff',
    'woff2',
    'zip',
  ].includes(extension);
}

function extensionFromName(name = '') {
  const normalized = String(name || '').trim().toLowerCase();
  const index = normalized.lastIndexOf('.');
  return index === -1 ? '' : normalized.slice(index + 1);
}

function inferBinaryMimeType(name = '') {
  const extension = extensionFromName(name);
  const map = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'video/webm',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
  };
  return map[extension] || 'application/octet-stream';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value = '') {
  const normalized = String(value || '').replace(/\s+/g, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function shouldSkipSyncPath(nodePath = '', options = {}) {
  const normalized = String(nodePath || '')
    .replace(/^root\/?/, '')
    .replace(/^\/+/, '')
    .trim();

  if (!normalized) {
    return false;
  }

  if (normalized === '.git' || normalized.startsWith('.git/') || normalized.includes('/.git/')) {
    return true;
  }

  if (options.includeGeneratedDirectories) {
    return false;
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments.some((segment) => GENERATED_SYNC_SEGMENTS.has(segment));
}

const workspace = {
  adapter: isDesktopRuntime() ? 'tauri' : 'browser',
  roots: [], // Array of { id, handle, systemPath, name, tree }
  tree: [], // Flattened or multi-root tree structure
  rootHandle: null,
  rootSystemPath: '',
  rootName: '',
  tabs: [],
  activeTabId: null,
  selectedNodePath: null,
  selectedPaths: new Set(),
  expandedPaths: new Set(['root']),
  untitledCounter: 1,

  getLanguage(name = '') {
    const normalizedName = String(name || '').trim().toLowerCase();
    if (!normalizedName) {
      return 'plaintext';
    }

    if (normalizedName === '.env' || normalizedName.startsWith('.env.')) {
      return 'ini';
    }

    if (normalizedName === 'dockerfile' || normalizedName.startsWith('dockerfile.')) {
      return 'dockerfile';
    }

    if (normalizedName === 'makefile' || normalizedName === 'gnumakefile') {
      return 'makefile';
    }

    if (normalizedName === 'cmakelists.txt') {
      return 'cmake';
    }

    if (normalizedName === 'jenkinsfile') {
      return 'groovy';
    }

    if (normalizedName === 'gemfile') {
      return 'ruby';
    }

    if (normalizedName === 'procfile') {
      return 'shell';
    }

    if (exactFileLanguageMap.has(normalizedName)) {
      return exactFileLanguageMap.get(normalizedName) || 'plaintext';
    }

    const lastDotIndex = normalizedName.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      const extension = normalizedName.slice(lastDotIndex);
      if (extensionLanguageMap.has(extension)) {
        return extensionLanguageMap.get(extension) || 'plaintext';
      }

    }

    return 'plaintext';
  },

  hasRealWorkspace() {
    return this.roots.length > 0;
  },

  isDesktopWorkspace() {
    return this.adapter === 'tauri' && this.roots.some(r => !!r.systemPath);
  },

  getRoots() {
    return this.roots;
  },

  getRootNode() {
    return this.tree[0] || null;
  },

  syncWorkspacePointers() {
    const primaryRoot = this.roots[0] || null;

    if (!primaryRoot) {
      this.rootHandle = null;
      this.rootSystemPath = '';
      this.rootName = '';
      return;
    }

    this.rootHandle = primaryRoot.handle || null;
    this.rootSystemPath = primaryRoot.systemPath || '';
    this.rootName = primaryRoot.name || '';
  },

  /**
   * Resolve a workspace path to an absolute system path, supporting multi-root.
   * If the path already starts with one of the root system paths, return it directly.
   * Otherwise, fall back to joining with the primary rootSystemPath.
   */
  resolveAbsolutePath(workspacePath) {
    const normalized = String(workspacePath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized || normalized === 'root') {
      return this.rootSystemPath || '';
    }

    // Check if this path is already absolute (starts with a root's system path)
    for (const root of this.roots) {
      const rootSys = (root.systemPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
      if (rootSys && (normalized === rootSys || normalized.startsWith(rootSys + '/'))) {
        return normalized;
      }
    }

    // Check for Windows drive-letter absolute paths (e.g. C:/...)
    if (/^[A-Za-z]:[\/]/.test(normalized)) {
      return normalized;
    }

    // Relative path: join with primary root
    return toAbsoluteWorkspacePath(this.rootSystemPath, normalized);
  },

  resetWorkspaceView(options = {}) {
    const {
      keepTabs = true,
      selectedPath = null,
      expandedPaths = null,
    } = options;

    this.syncWorkspacePointers();

    if (!keepTabs) {
      this.tabs = [];
      this.activeTabId = null;
    } else if (!this.tabs.some((tab) => tab.id === this.activeTabId)) {
      this.activeTabId = this.tabs[this.tabs.length - 1]?.id || null;
    }

    if (expandedPaths instanceof Set) {
      this.expandedPaths = new Set(expandedPaths);
    } else if (this.roots.length > 0) {
      this.expandedPaths = new Set(['root']);
    } else {
      this.expandedPaths = new Set();
    }

    if (this.roots.length > 0) {
      const rootNode = this.getRootNode();
      if (rootNode) {
        rootNode.open = true;
      }
    }

    this.selectedNodePath = selectedPath;
    this.selectedPaths = new Set(selectedPath && selectedPath !== 'root' ? [selectedPath] : []);
  },

  ensureDraftRoot() {
    if (this.roots.length > 0) {
      return null;
    }

    let root = this.getRootNode();
    if (!root) {
      root = {
        id: 'root',
        path: 'root',
        name: 'Untitled Workspace',
        type: 'folder',
        open: true,
        isDraft: true,
        isLoaded: true,
        children: [],
      };
      this.tree = [root];
    }

    this.rootHandle = null;
    this.rootSystemPath = '';
    this.rootName = root.name;
    this.expandedPaths.add('root');
    return root;
  },

  getStructureSnapshot() {
    const root = this.getRootNode();
    if (!root) {
      return null;
    }

    const entries = [];

    function visit(node) {
      if (node.path !== 'root') {
        entries.push({
          path: node.path,
          type: node.type,
        });
      }

      node.children?.forEach(visit);
    }

    visit(root);

    return {
      rootName: this.rootName || root.name || 'workspace',
      entries,
    };
  },

  async getSyncPayload(options = {}) {
    let root = this.getRootNode();
    if (!root) {
      root = this.ensureDraftRoot();
    }
    if (!root) {
      return null;
    }

    const entries = [];

    const visit = async (node) => {
      if (node.path !== 'root') {
        if (shouldSkipSyncPath(node.path, options)) {
          return;
        }

        if (node.type === 'folder') {
          entries.push({
            path: node.path,
            type: node.type,
          });
        } else {
          const openedTab = this.tabs.find((entry) => entry.path === node.path);
          let content = openedTab?.content;

          if (content == null && node.isDraft) {
            content = node.content || '';
          }

          if (content == null && !isBinaryFileName(node.name)) {
            try {
              content = (await this.readFile(node)).content;
            } catch {
              content = '';
            }
          }

          entries.push({
            path: node.path,
            type: node.type,
            content: typeof content === 'string' ? content : '',
          });
        }
      }

      for (const child of node.children || []) {
        await visit(child);
      }
    };

    await visit(root);

    // Append any active/open tabs that are untitled so they are mirrored physically
    for (const tab of this.tabs || []) {
      if (tab.isUntitled) {
        const tabPath = tab.name || tab.path;
        if (!entries.some((e) => e.path === tabPath)) {
          entries.push({
            path: tabPath,
            type: 'file',
            content: tab.content || '',
          });
        }
      }
    }

    return {
      rootName: this.rootName || root.name || 'workspace',
      entries,
    };
  },

  async verifyPermission(handle, readWrite = false) {
    if (!handle?.queryPermission || !handle?.requestPermission) {
      return true;
    }

    const options = readWrite ? { mode: 'readwrite' } : {};
    return (await handle.queryPermission(options)) === 'granted';
  },

  normalizeTabs() {
    const availablePaths = new Set();

    const collectPaths = (nodes) => {
      nodes.forEach((node) => {
        availablePaths.add(node.path);
        if (node.children?.length) {
          collectPaths(node.children);
        }
      });
    };

    collectPaths(this.tree);

    this.tabs = this.tabs.filter((tab) => {
      return tab.external || tab.isUntitled || tab.isDraft || availablePaths.has(tab.path);
    });

    if (!this.tabs.length) {
      this.activeTabId = null;
      return;
    }

    if (!this.tabs.some((tab) => tab.id === this.activeTabId)) {
      this.activeTabId = this.tabs[this.tabs.length - 1].id;
    }
  },

  mapDesktopTreeNode(entry, parentPath = 'root', rootSystemPath = '', isLoaded = false) {
    const relativePath = toRelativeWorkspacePath(rootSystemPath || this.roots[0]?.systemPath, entry.path);
    const nodePath = relativePath || 'root';
    if (entry.type === 'folder') {
      const mappedChildren = entry.children
        ? sortNodes((entry.children || []).map((child) => this.mapDesktopTreeNode(child, nodePath, rootSystemPath, true)))
        : [];

      return {
        id: nodePath,
        path: nodePath,
        name: entry.name,
        type: 'folder',
        nativePath: entry.path,
        open: this.expandedPaths.has(nodePath) || nodePath === 'root',
        parentPath,
        children: mappedChildren,
        isLoaded: isLoaded || !!entry.children,
      };
    }

    return {
      id: nodePath,
      path: nodePath,
      name: entry.name,
      type: 'file',
      nativePath: entry.path,
      parentPath,
      isDraft: false,
    };
  },

  async openFolderBrowser() {
    if (this.adapter === 'tauri') {
      const selection = await desktopPickFolder();
      if (!selection?.path) {
        return;
      }
      const selectionPath = selection.path.replace(/\\/g, '/');
      trackJumpListItem('workspace', selectionPath);

      const previousTabs = this.tabs.filter((tab) => tab.external || tab.isUntitled);
      this.roots = [{
        id: selectionPath,
        handle: { kind: 'desktop-root', name: selection.name },
        systemPath: selectionPath,
        name: selection.name
      }];
      trackJumpListItem('workspace', selectionPath);
      this.tabs = previousTabs;
      this.resetWorkspaceView({ keepTabs: true, selectedPath: 'root' });
      await this.reloadTree();
      return;
    }

    const dirHandle = await window.showDirectoryPicker();
    await this.verifyPermission(dirHandle, true);
    const previousTabs = this.tabs.filter((tab) => tab.external || tab.isUntitled);
    this.roots = [{
      id: dirHandle.name,
      handle: dirHandle,
      systemPath: '',
      name: dirHandle.name
    }];
    this.tabs = previousTabs;
    this.resetWorkspaceView({ keepTabs: true, selectedPath: 'root' });
    await this.reloadTree();
  },

  async addFolderToWorkspace() {
    if (this.adapter === 'tauri') {
      const selection = await desktopPickFolder();
      if (!selection?.path) return;
      
      const normalizedPath = selection.path.replace(/\\/g, '/').replace(/\/+$/, '');
      trackJumpListItem('workspace', normalizedPath);
      
      // Prevent adding a folder that is already inside an existing root
      // Or adding a folder that contains an existing root
      for (const root of this.roots) {
        const rootPath = root.systemPath.replace(/\\/g, '/').replace(/\/+$/, '');
        if (normalizedPath === rootPath) return;
        if (normalizedPath.startsWith(rootPath + '/')) {
          throw new Error(`The folder "${selection.name}" is already a subfolder of "${root.name}".`);
        }
        if (rootPath.startsWith(normalizedPath + '/')) {
          throw new Error(`The folder "${selection.name}" contains the existing root "${root.name}".`);
        }
      }

      this.roots.push({
        id: normalizedPath,
        handle: { kind: 'desktop-root', name: selection.name },
        systemPath: normalizedPath,
        name: selection.name
      });
      this.selectedNodePath = this.selectedNodePath || 'root';
      this.selectedPaths = new Set(this.selectedNodePath !== 'root' ? [this.selectedNodePath] : []);
      this.resetWorkspaceView({ keepTabs: true, selectedPath: this.selectedNodePath });
      await this.reloadTree();
      return;
    }

    const dirHandle = await window.showDirectoryPicker();
    await this.verifyPermission(dirHandle, true);
    if (this.roots.some(r => r.name === dirHandle.name)) return;
    
      this.roots.push({
        id: dirHandle.name,
        handle: dirHandle,
        systemPath: '',
        name: dirHandle.name
      });
      this.selectedNodePath = this.selectedNodePath || 'root';
      this.selectedPaths = new Set(this.selectedNodePath !== 'root' ? [this.selectedNodePath] : []);
      this.resetWorkspaceView({ keepTabs: true, selectedPath: this.selectedNodePath });
      await this.reloadTree();
  },

  async reloadTree() {
    const nextTree = [];
    this.syncWorkspacePointers();
    
    for (const rootConfig of this.roots) {
      if (this.adapter === 'tauri' && rootConfig.systemPath) {
        // Only read the immediate children of the root for performance
        const children = await desktopReadDir(rootConfig.systemPath);
        const rootNode = {
          id: rootConfig.systemPath,
          path: rootConfig.systemPath,
          name: rootConfig.name,
          type: 'folder',
          nativePath: rootConfig.systemPath,
          open: true,
          parentPath: 'root',
          children: children.map(c => this.mapDesktopTreeNode(c, rootConfig.id, rootConfig.systemPath)),
          isDraft: false,
          isLoaded: true
        };
        nextTree.push(rootNode);
      } else if (rootConfig.handle) {
        const rootNode = await this.readDirectory(rootConfig.handle, '', rootConfig.id);
        rootNode.name = rootConfig.name || rootNode.name;
        rootNode.open = true;
        nextTree.push(rootNode);
      }
    }

    this.tree = nextTree;
    this.resetWorkspaceView({
      keepTabs: true,
      selectedPath: this.findNode(this.selectedNodePath) ? this.selectedNodePath : (this.tree[0]?.path || null),
      expandedPaths: this.expandedPaths.size ? this.expandedPaths : new Set(['root']),
    });

    if (this.adapter === 'tauri') {
      const pathsToLoad = [...this.expandedPaths]
        .filter(p => p !== 'root')
        .sort((a, b) => a.split('/').length - b.split('/').length);
      for (const path of pathsToLoad) {
        await this.loadDirectory(path);
      }
    }

    this.reconcileTabsWithTree();
    this.normalizeTabs();
  },

  async loadDirectory(path) {
    const node = this.findNode(path);
    if (!node || node.type !== 'folder' || node.isLoaded) {
      return;
    }

    node.loading = true;
    try {
      if (this.adapter === 'tauri' && node.nativePath) {
        // Desktop (Tauri) — read from native filesystem
        const children = await desktopReadDir(node.nativePath);
        const rootConfig = this.roots.find(r => node.path.startsWith(r.systemPath) || node.nativePath.startsWith(r.systemPath));
        const rootSystemPath = rootConfig?.systemPath || '';
        node.children = children.map(c => this.mapDesktopTreeNode(c, node.path, rootSystemPath));
        node.isLoaded = true;
      } else if (node.handle && node.handle.kind === 'directory') {
        // Web FileSystem Access API — read entries from the directory handle
        const children = [];
        for await (const entry of node.handle.values()) {
          const entryPath = [node.path, entry.name].filter(p => p && p !== 'root').join('/');
          if (entry.kind === 'directory') {
            children.push({
              id: entryPath,
              path: entryPath,
              name: entry.name,
              type: 'folder',
              handle: entry,
              parentPath: node.path,
              open: this.expandedPaths.has(entryPath),
              children: [],
              isLoaded: false,
              isDraft: false,
            });
          } else {
            children.push({
              id: entryPath,
              path: entryPath,
              name: entry.name,
              type: 'file',
              handle: entry,
              parentPath: node.path,
              isDraft: false,
            });
          }
        }
        // Sort: folders first, then files, both alphabetically
        children.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
        node.children = children;
        node.isLoaded = true;
      } else if (node.isDraft || (!node.handle && !node.nativePath)) {
        // Draft / untitled workspace — children are already in memory, just mark loaded
        if (!node.children) node.children = [];
        node.isLoaded = true;
      }
    } catch (err) {
      console.error('loadDirectory failed for', path, err);
    } finally {
      node.loading = false;
    }
  },


  async readDirectory(handle, relativePath = '', idPath = relativePath || 'root') {
    const children = [];

    for await (const entry of handle.values()) {
      const entryPath = joinPath(relativePath, entry.name);

      if (entry.kind === 'directory') {
        const node = await this.readDirectory(entry, entryPath, entryPath);
        node.name = entry.name;
        node.path = entryPath;
        node.id = entryPath;
        node.handle = entry;
        node.type = 'folder';
        node.open = this.expandedPaths.has(entryPath);
        children.push(node);
      } else {
        children.push({
          id: entryPath,
          path: entryPath,
          name: entry.name,
          type: 'file',
          handle: entry,
          parentPath: relativePath || 'root',
          isDraft: false,
        });
      }
    }

    return {
      id: idPath,
      path: relativePath || 'root',
      name: handle.name,
      type: 'folder',
      handle,
      open: this.expandedPaths.has(idPath) || idPath === 'root',
      parentPath: relativePath ? relativePath.split('/').slice(0, -1).join('/') || 'root' : null,
      children: sortNodes(children),
      isDraft: false,
    };
  },

  reconcileTabsWithTree() {
    this.tabs = this.tabs.map((tab) => {
      if (tab.external || (!this.roots.length && tab.isDraft)) {
        return tab;
      }

      const node = this.findNode(tab.path);
      if (!node) {
        return tab;
      }

      return {
        ...tab,
        id: node.path,
        path: node.path,
        name: node.name,
        handle: node.handle || null,
        nativePath: node.nativePath || tab.nativePath || '',
        language: this.getLanguage(node.name),
        isDraft: !!node.isDraft,
      };
    });
  },

  async saveWorkspace() {
    if (this.adapter !== 'tauri') return;
    
    const workspaceData = {
      version: '1.0',
      folders: this.roots.map(r => ({
        path: r.systemPath,
        name: r.name
      }))
    };

    const suggestedName = (this.roots[0]?.name || 'untitled') + '.tilder-workspace';
    const selection = await desktopPickSavePath(suggestedName);
    if (!selection?.path) return;

    await desktopWriteFile(selection.path, JSON.stringify(workspaceData, null, 2), false);
    return selection.path;
  },

  async openWorkspace() {
    if (this.adapter !== 'tauri') return;
    
    const selection = await desktopPickFile();
    if (!selection?.path || !selection.path.endsWith('.tilder-workspace')) {
      return;
    }

    try {
      const data = JSON.parse(selection.content);
      if (Array.isArray(data.folders)) {
        const previousTabs = this.tabs.filter((tab) => tab.external || tab.isUntitled);
        this.roots = data.folders.map(f => ({
          id: f.path,
          handle: { kind: 'desktop-root', name: f.name },
          systemPath: f.path,
          name: f.name
        }));
        this.tabs = previousTabs;
        this.resetWorkspaceView({ keepTabs: true, selectedPath: 'root', expandedPaths: new Set(['root']) });
        await this.reloadTree();
      }
    } catch (e) {
      console.error("Failed to parse workspace file:", e);
    }
  },

  findNode(path, nodes = this.tree) {
    for (const node of nodes) {
      if (node.path === path || node.id === path) {
        return node;
      }

      if (node.children?.length) {
        const nested = this.findNode(path, node.children);
        if (nested) {
          return nested;
        }
      }
    }

    return null;
  },

  async findNodeByHandle(handle, nodes = this.tree) {
    for (const node of nodes) {
      if (node.handle?.isSameEntry && (await node.handle.isSameEntry(handle))) {
        return node;
      }

      if (node.children?.length) {
        const nested = await this.findNodeByHandle(handle, node.children);
        if (nested) {
          return nested;
        }
      }
    }

    return null;
  },

  findParentPath(path) {
    if (!path || path === 'root') {
      return 'root';
    }

    const parts = path.split('/');
    parts.pop();
    return parts.length ? parts.join('/') : 'root';
  },

  setSelectedNode(path, options = {}) {
    const { multi = false, range = false } = options;
    if (multi) {
      if (this.selectedPaths.has(path)) {
        this.selectedPaths.delete(path);
        if (this.selectedNodePath === path) {
          this.selectedNodePath = Array.from(this.selectedPaths).pop() || 'root';
        }
      } else {
        this.selectedPaths.add(path);
        this.selectedNodePath = path;
      }
    } else if (range) {
      // Very basic range: just add to Set and set as primary
      this.selectedPaths.add(path);
      this.selectedNodePath = path;
    } else {
      this.selectedNodePath = path;
      this.selectedPaths = new Set(path !== 'root' ? [path] : []);
    }
  },

  revealNode(path) {
    const nextPath = path || 'root';
    const segments =
      nextPath === 'root'
        ? ['root']
        : ['root', ...nextPath.split('/').map((_, index, parts) => parts.slice(0, index + 1).join('/'))];

    segments.forEach((segment) => {
      this.expandedPaths.add(segment);
      const node = this.findNode(segment);
      if (node?.type === 'folder') {
        node.open = true;
      }
    });

    this.selectedNodePath = nextPath;
  },

  async ensureFolderPath(path) {
    const normalized = String(path || '')
      .replace(/^root\/?/, '')
      .replace(/^\/+/, '')
      .trim();

    if (!normalized || normalized === 'root') {
      return this.rootHandle ? this.getRootNode() : this.ensureDraftRoot();
    }

    const segments = normalized.split('/').filter(Boolean);
    let currentPath = 'root';
    let currentNode = this.rootHandle ? this.getRootNode() : this.ensureDraftRoot();

    for (const segment of segments) {
      const nextPath = joinPath(currentPath, segment);
      let existing = this.findNode(nextPath);
      if (existing?.type === 'folder') {
        existing.open = true;
        this.expandedPaths.add(nextPath);
        currentNode = existing;
        currentPath = nextPath;
        continue;
      }

      if (!this.rootHandle && !this.rootSystemPath) {
        existing = this.createDraftNode(currentPath, segment, 'folder');
      } else if (this.adapter === 'tauri') {
        await desktopCreateFolder(toAbsoluteWorkspacePath(this.rootSystemPath, nextPath));
        this.expandedPaths.add(currentPath);
        this.expandedPaths.add(nextPath);
        await this.reloadTree();
        existing = this.findNode(nextPath);
      } else {
        const parentHandle = currentNode?.handle || this.rootHandle;
        await parentHandle.getDirectoryHandle(segment, { create: true });
        this.expandedPaths.add(currentPath);
        this.expandedPaths.add(nextPath);
        await this.reloadTree();
        existing = this.findNode(nextPath);
      }

      if (!existing) {
        return null;
      }

      existing.open = true;
      this.expandedPaths.add(nextPath);
      currentNode = existing;
      currentPath = nextPath;
    }

    return currentNode;
  },

  async ensureFilePath(path) {
    const normalized = String(path || '')
      .replace(/^root\/?/, '')
      .replace(/^\/+/, '')
      .trim();

    if (!normalized || normalized === 'root') {
      return null;
    }

    const existing = this.findNode(normalized);
    if (existing?.type === 'file') {
      return existing;
    }

    const parentPath = this.findParentPath(normalized);
    const parent = await this.ensureFolderPath(parentPath);
    if (!parent || parent.type !== 'folder') {
      return null;
    }

    const fileName = normalized.split('/').pop();
    if (!fileName) {
      return null;
    }

    if (!this.rootHandle) {
      return this.createDraftNode(parent.path, fileName, 'file');
    }

    await parent.handle.getFileHandle(fileName, { create: true });
    this.expandedPaths.add(parent.path);
    await this.reloadTree();
    return this.findNode(normalized);
  },

  async applyScmFileSnapshot(fileSnapshot) {
    const normalizedPath = String(fileSnapshot?.path || '')
      .replace(/^root\/?/, '')
      .replace(/^\/+/, '')
      .trim();

    if (!normalizedPath) {
      return false;
    }

    if (fileSnapshot?.deleted) {
      if (this.findNode(normalizedPath)) {
        await this.deleteNode(normalizedPath);
      }
      this.selectedNodePath = this.findNode(this.selectedNodePath) ? this.selectedNodePath : 'root';
      this.normalizeTabs();
      return true;
    }

    const node = await this.ensureFilePath(normalizedPath);
    if (!node) {
      return false;
    }

    const nextContent = fileSnapshot?.content ?? '';
    await this.writeFileContent(normalizedPath, nextContent, { persist: false });

    const tab = this.tabs.find((entry) => entry.path === normalizedPath || entry.id === normalizedPath);
    if (tab) {
      tab.savedContent = tab.content ?? '';
      tab.dirty = false;
      tab.name = normalizedPath.split('/').pop() || tab.name;
      tab.language = this.getLanguage(tab.name);
    }

    const refreshedNode = this.findNode(normalizedPath);
    if (refreshedNode && (!this.rootHandle || refreshedNode.isDraft)) {
      refreshedNode.content = nextContent;
    }

    return true;
  },

  async applyScmSnapshot(snapshot) {
    const payload = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const normalizedEntries = Array.isArray(payload.entries)
      ? payload.entries
          .map((entry) => ({
            path: String(entry?.path || '')
              .replace(/^root\/?/, '')
              .replace(/^\/+/, '')
              .trim(),
            type: entry?.type === 'folder' ? 'folder' : 'file',
            content: typeof entry?.content === 'string' ? entry.content : '',
          }))
          .filter((entry) => entry.path)
      : [];
    const nextRootName = payload.rootName || this.rootName || this.getRootNode()?.name || 'workspace';

    if (!this.rootHandle) {
      const nextRoot = {
        id: 'root',
        path: 'root',
        name: nextRootName,
        type: 'folder',
        open: true,
        isDraft: true,
        children: [],
      };
      const nodeMap = new Map([['root', nextRoot]]);
      const fileMap = new Map();
      const sortedEntries = [...normalizedEntries].sort((left, right) => {
        const leftDepth = left.path.split('/').length;
        const rightDepth = right.path.split('/').length;
        if (leftDepth !== rightDepth) {
          return leftDepth - rightDepth;
        }

        if (left.type !== right.type) {
          return left.type === 'folder' ? -1 : 1;
        }

        return left.path.localeCompare(right.path);
      });

      sortedEntries.forEach((entry) => {
        const segments = entry.path.split('/').filter(Boolean);
        const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : 'root';
        const parentNode = nodeMap.get(parentPath);
        if (!parentNode || parentNode.type !== 'folder') {
          return;
        }

        const node = {
          id: entry.path,
          path: entry.path,
          name: segments[segments.length - 1],
          type: entry.type,
          parentPath,
          open: entry.type === 'folder',
          isDraft: true,
          children: entry.type === 'folder' ? [] : undefined,
          content: entry.type === 'file' ? entry.content : undefined,
        };

        parentNode.children.push(node);
        if (entry.type === 'folder') {
          nodeMap.set(entry.path, node);
        } else {
          fileMap.set(entry.path, node);
        }
      });

      const sortDraftTree = (node) => {
        if (!node.children?.length) {
          return;
        }

        node.children = sortNodes(node.children);
        node.children.forEach(sortDraftTree);
      };

      sortDraftTree(nextRoot);
      this.tree = [nextRoot];
      this.rootName = nextRootName;

      this.tabs = this.tabs
        .filter((tab) => tab.external || tab.isUntitled || fileMap.has(tab.path))
        .map((tab) => {
          if (tab.external || tab.isUntitled) {
            return tab;
          }

          const node = fileMap.get(tab.path);
          if (!node) {
            return tab;
          }

          return {
            ...tab,
            id: node.path,
            path: node.path,
            name: node.name,
            handle: null,
            content: node.content || '',
            savedContent: node.content || '',
            language: this.getLanguage(node.name),
            dirty: false,
            isDraft: true,
          };
        });

      const nextExpandedPaths = new Set(['root']);
      this.expandedPaths.forEach((entry) => {
        if (entry === 'root') {
          return;
        }

        const node = this.findNode(entry, [nextRoot]);
        if (node?.type === 'folder') {
          nextExpandedPaths.add(entry);
          node.open = true;
        }
      });

      this.expandedPaths = nextExpandedPaths;
      if (this.selectedNodePath && !this.findNode(this.selectedNodePath)) {
        this.selectedNodePath = 'root';
      }
      this.normalizeTabs();
      return true;
    }

    const desiredFolders = new Set(['root']);
    const desiredFiles = new Map();

    normalizedEntries.forEach((entry) => {
      const segments = entry.path.split('/').filter(Boolean);
      segments.forEach((_, index) => {
        const segmentPath = segments.slice(0, index + 1).join('/');
        if (index < segments.length - 1 || entry.type === 'folder') {
          desiredFolders.add(segmentPath);
        }
      });

      if (entry.type === 'file') {
        desiredFiles.set(entry.path, entry.content);
      }
    });

    const collectNodes = (nodes, output = []) => {
      nodes.forEach((node) => {
        if (node.path !== 'root') {
          output.push(node);
        }
        if (node.children?.length) {
          collectNodes(node.children, output);
        }
      });
      return output;
    };

    const staleNodes = collectNodes(this.tree)
      .filter((node) => {
        if (node.type === 'folder') {
          return !desiredFolders.has(node.path);
        }
        return !desiredFiles.has(node.path);
      })
      .sort((left, right) => right.path.length - left.path.length);

    for (const node of staleNodes) {
      await this.deleteNode(node.path);
    }

    const folderPaths = [...desiredFolders]
      .filter((entry) => entry !== 'root')
      .sort((left, right) => left.split('/').length - right.split('/').length);

    for (const folderPath of folderPaths) {
      await this.ensureFolderPath(folderPath);
    }

    const fileEntries = [...desiredFiles.entries()].sort((left, right) => left[0].localeCompare(right[0]));
    for (const [filePath, content] of fileEntries) {
      await this.ensureFilePath(filePath);
      await this.writeFileContent(filePath, content, { persist: false });
      const tab = this.tabs.find((entry) => entry.path === filePath || entry.id === filePath);
      if (tab) {
        tab.savedContent = tab.content ?? '';
        tab.dirty = false;
      }
    }

    this.rootName = nextRootName;
    await this.reloadTree();
    if (this.selectedNodePath && !this.findNode(this.selectedNodePath)) {
      this.selectedNodePath = 'root';
    }
    return true;
  },

  setActiveTab(id) {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) {
      return;
    }

    this.activeTabId = tab.id;
    this.selectedNodePath = tab.external ? null : tab.path;
  },

  getActiveTab() {
    return this.tabs.find((tab) => tab.id === this.activeTabId) || null;
  },

  getUniqueChildName(parent, desiredName) {
    const existing = new Set((parent.children || []).map((child) => child.name));
    if (!existing.has(desiredName)) {
      return desiredName;
    }

    const parts = desiredName.split('.');
    const extension = parts.length > 1 ? `.${parts.pop()}` : '';
    const base = parts.join('.') || desiredName;
    let index = 1;
    let nextName = `${base}-${index}${extension}`;

    while (existing.has(nextName)) {
      index += 1;
      nextName = `${base}-${index}${extension}`;
    }

    return nextName;
  },

  getDuplicateChildName(parent, node) {
    const parts = node.name.split('.');
    const extension = node.type === 'file' && parts.length > 1 ? `.${parts.pop()}` : '';
    const base = parts.join('.') || node.name;
    return this.getUniqueChildName(parent, `${base}-copy${extension}`);
  },

  sortNodeChildren(parent) {
    if (parent?.children) {
      parent.children = sortNodes(parent.children);
    }
  },

  cloneDraftSubtree(node, parentPath, nextName = node.name) {
    const nextPath = joinPath(parentPath, nextName);
    const cloned = {
      ...cloneNode(node),
      id: nextPath,
      path: nextPath,
      name: nextName,
      parentPath,
      handle: null,
      isDraft: true,
    };

    if (cloned.type === 'folder') {
      cloned.open = false;
      cloned.children = (node.children || []).map((child) => this.cloneDraftSubtree(child, nextPath, child.name));
    }

    return cloned;
  },

  createDraftNode(parentPath, name, type, options = {}) {
    const root = this.ensureDraftRoot();
    let parent = parentPath === 'root' ? root : this.findNode(parentPath);
    if (!parent || parent.type !== 'folder') {
      const parentNode = this.findNode(parentPath);
      if (parentNode?.parentPath) {
        parent = parentNode.parentPath === 'root' ? root : this.findNode(parentNode.parentPath);
      }
    }
    if (!parent || parent.type !== 'folder') {
      parent = root;
    }

    const trimmed = String(name || '').trim();
    if (!trimmed) return null;

    const segments = trimmed.split('/').map(s => s.trim()).filter(Boolean);
    if (!segments.length) return null;

    // Handle nested path creation like "src/components/Header.jsx"
    if (segments.length > 1) {
      let currentParent = parent;
      for (let i = 0; i < segments.length - 1; i++) {
        const segFolder = segments[i];
        let existingFolder = (currentParent.children || []).find(c => c.name === segFolder && c.type === 'folder');
        if (!existingFolder) {
          existingFolder = this.createDraftNode(currentParent.path, segFolder, 'folder', { open: true });
        } else {
          existingFolder.open = true;
          this.expandedPaths.add(existingFolder.path);
        }
        currentParent = existingFolder || currentParent;
      }
      const leafName = segments[segments.length - 1];
      return this.createDraftNode(currentParent.path, leafName, type, options);
    }

    const finalName = this.getUniqueChildName(parent, trimmed);
    const path = joinPath(parent.path, finalName);
    const shouldOpenFolder = type === 'folder' && options.open === true;
    const node = {
      id: path,
      path,
      name: finalName,
      type,
      open: type === 'folder' ? shouldOpenFolder : undefined,
      parentPath: parent.path,
      isDraft: true,
      content: type === 'file' ? '' : undefined,
      children: type === 'folder' ? [] : undefined,
      // Draft folders have their children in memory — mark as loaded immediately
      isLoaded: type === 'folder' ? true : undefined,
    };

    parent.children = [...(parent.children || []), node];
    parent.open = true;
    this.expandedPaths.add(parent.path);
    if (shouldOpenFolder) {
      this.expandedPaths.add(path);
    } else {
      this.expandedPaths.delete(path);
    }
    this.sortNodeChildren(parent);
    return node;
  },

  createUntitledFile(parentPath = 'root', initialName = null, initialContent = '') {
    if (!this.rootHandle && !this.rootSystemPath) {
      const name = initialName || `untitled-${this.untitledCounter}.txt`;
      const node = this.createDraftNode(parentPath, name, 'file');
      if (!initialName) this.untitledCounter += 1;
      if (!node) {
        return null;
      }

      const tab = {
        id: node.path,
        path: node.path,
        name: node.name,
        handle: null,
        content: initialContent,
        savedContent: initialContent,
        language: this.getLanguage(node.name),
        dirty: initialContent ? true : false,
        external: false,
        isUntitled: true,
        isDraft: true,
      };

      this.tabs.push(tab);
      this.activeTabId = tab.id;
      this.selectedNodePath = node.path;
      return tab;
    }

    const id = `untitled:${Date.now()}:${this.untitledCounter}`;
    const name = initialName || `untitled-${this.untitledCounter}.txt`;
    if (!initialName) this.untitledCounter += 1;

    const tab = {
      id,
      path: id,
      name,
      handle: null,
      content: initialContent,
      savedContent: initialContent,
      language: this.getLanguage(name),
      dirty: initialContent ? true : false,
      external: false,
      isUntitled: true,
      isDraft: true,
    };

    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.selectedNodePath = null;
    return tab;
  },

  async readFile(node) {
    if (this.adapter === 'tauri' && node?.nativePath) {
      return desktopReadFile(node.nativePath);
    }

    await this.verifyPermission(node.handle, false);
    const file = await node.handle.getFile();
    if (isBinaryFileName(file.name)) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      return {
        content: bytesToBase64(bytes),
        isBinary: true,
        mimeType: inferBinaryMimeType(file.name),
      };
    }

    return {
      content: await file.text(),
      isBinary: false,
      mimeType: 'text/plain',
    };
  },

  async openExternalFile() {
    if (this.adapter === 'tauri') {
      const selection = await desktopPickFile();
      if (!selection?.path) {
        return null;
      }
      trackJumpListItem('file', selection.path);

      const id = this.rootSystemPath
        ? toRelativeWorkspacePath(this.rootSystemPath, selection.path) || `external:${selection.name}`
        : `external:${selection.path}`;
      const existing = this.tabs.find((tab) => tab.id === id || tab.nativePath === selection.path);

      if (existing) {
        existing.content = selection.content;
        existing.savedContent = selection.content;
        existing.name = selection.name;
        existing.nativePath = selection.path;
        existing.isUntitled = false;
        existing.isDraft = false;
        existing.isBinary = !!selection.isBinary;
        existing.mimeType = selection.mimeType;
        existing.external = !this.rootSystemPath;
        this.activeTabId = existing.id;
        this.selectedNodePath = existing.external ? null : existing.path;
        return existing;
      }

      const tab = {
        id,
        path: this.rootSystemPath ? id : `external:${selection.name}`,
        external: !this.rootSystemPath,
        isUntitled: false,
        isDraft: false,
        name: selection.name,
        nativePath: selection.path,
        content: selection.content,
        savedContent: selection.content,
        language: selection.isBinary ? 'plaintext' : this.getLanguage(selection.name),
        dirty: false,
        isBinary: !!selection.isBinary,
        mimeType: selection.mimeType,
      };

      this.tabs.push(tab);
      this.activeTabId = tab.id;
      this.selectedNodePath = tab.external ? null : tab.path;
      return tab;
    }

    const [handle] = await window.showOpenFilePicker();
    await this.verifyPermission(handle, true);
    const file = await handle.getFile();
    const binary = isBinaryFileName(file.name);
    const content = binary
      ? bytesToBase64(new Uint8Array(await file.arrayBuffer()))
      : await file.text();
    const mimeType = binary ? inferBinaryMimeType(file.name) : 'text/plain';

    if (!this.rootHandle) {
      const root = this.ensureDraftRoot();
      let node = await this.findNodeByHandle(handle);

      if (!node) {
        const finalName = this.getUniqueChildName(root, handle.name);
        const path = joinPath(root.path, finalName);
        node = {
          id: path,
          path,
          name: finalName,
          type: 'file',
          handle,
          parentPath: root.path,
          isDraft: true,
          content,
          isBinary: binary,
          mimeType,
        };
        root.children.push(node);
        root.open = true;
        this.sortNodeChildren(root);
      } else {
        node.handle = handle;
        node.content = content;
      }

      const existingDraftTab = this.tabs.find((tab) => tab.path === node.path);
      if (existingDraftTab) {
        existingDraftTab.name = node.name;
        existingDraftTab.handle = handle;
        existingDraftTab.content = content;
        existingDraftTab.savedContent = content;
        existingDraftTab.language = binary ? 'plaintext' : this.getLanguage(node.name);
        existingDraftTab.dirty = false;
        existingDraftTab.external = false;
        existingDraftTab.isUntitled = false;
        existingDraftTab.isDraft = true;
        existingDraftTab.isBinary = binary;
        existingDraftTab.mimeType = mimeType;
        this.activeTabId = existingDraftTab.id;
        this.selectedNodePath = node.path;
        return existingDraftTab;
      }

      const tab = {
        id: node.path,
        path: node.path,
        external: false,
        isUntitled: false,
        isDraft: true,
        name: node.name,
        handle,
        content,
        savedContent: content,
        language: binary ? 'plaintext' : this.getLanguage(node.name),
        dirty: false,
        isBinary: binary,
        mimeType,
      };

      this.tabs.push(tab);
      this.activeTabId = tab.id;
      this.selectedNodePath = node.path;
      return tab;
    }

    const id = `external:${handle.name}`;
    const existing = this.tabs.find((tab) => tab.id === id);

    if (existing) {
      existing.content = content;
      existing.savedContent = content;
      existing.handle = handle;
      existing.isUntitled = false;
      existing.isDraft = false;
      existing.isBinary = binary;
      existing.mimeType = mimeType;
      this.activeTabId = existing.id;
      this.selectedNodePath = null;
      return existing;
    }

    const tab = {
      id,
      path: id,
      external: true,
      isUntitled: false,
      isDraft: false,
      name: handle.name,
      handle,
      content,
      savedContent: content,
      language: binary ? 'plaintext' : this.getLanguage(handle.name),
      dirty: false,
      isBinary: binary,
      mimeType,
    };

    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.selectedNodePath = null;
    return tab;
  },

  async openFile(nodeOrPath) {
    const node = typeof nodeOrPath === 'string' ? this.findNode(nodeOrPath) : nodeOrPath;

    if (!node || node.type !== 'file') {
      return null;
    }

    const existing = this.tabs.find((tab) => tab.path === node.path);
    if (existing) {
      this.activeTabId = existing.id;
      this.selectedNodePath = node.path;
      return existing;
    }

    const filePayload = node.isDraft
      ? {
          content: node.content || '',
          isBinary: !!node.isBinary,
          mimeType: node.mimeType || inferBinaryMimeType(node.name),
        }
      : await this.readFile(node);
    const tab = {
      id: node.path,
      path: node.path,
      name: node.name,
      handle: node.handle || null,
      nativePath: node.nativePath || '',
      content: filePayload.content,
      savedContent: filePayload.content,
      language: filePayload.isBinary ? 'plaintext' : this.getLanguage(node.name),
      dirty: false,
      external: false,
      isUntitled: !!node.isDraft && !node.handle,
      isDraft: !!node.isDraft,
      isBinary: !!filePayload.isBinary,
      mimeType: filePayload.mimeType || 'application/octet-stream',
    };

    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.selectedNodePath = node.path;
    return tab;
  },

  closeTab(id) {
    const currentIndex = this.tabs.findIndex((tab) => tab.id === id);
    if (currentIndex === -1) {
      return;
    }

    this.tabs.splice(currentIndex, 1);

    if (!this.tabs.length) {
      this.activeTabId = null;
      return;
    }

    if (this.activeTabId === id) {
      const nextIndex = Math.max(0, currentIndex - 1);
      this.activeTabId = this.tabs[nextIndex].id;
      this.selectedNodePath = this.tabs[nextIndex].external ? null : this.tabs[nextIndex].path;
    }
  },

  closeOtherTabs(id) {
    this.tabs = this.tabs.filter((tab) => tab.id === id);
    this.activeTabId = this.tabs[0]?.id || null;
    this.selectedNodePath = this.tabs[0]?.external ? null : this.tabs[0]?.path || null;
  },

  closeAllTabs() {
    this.tabs = [];
    this.activeTabId = null;
    this.selectedNodePath = null;
  },

  updateTabContent(id, content) {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) {
      return;
    }

    tab.content = content ?? '';
    tab.dirty = tab.content !== tab.savedContent;

    if (tab.isDraft) {
      const node = this.findNode(tab.path);
      if (node) {
        node.content = tab.content;
      }
    }
  },

  getDisplayPath(path, { relative = false } = {}) {
    const normalized = String(path || '').trim();
    if (!normalized) {
      return '';
    }

    if (normalized === 'root') {
      return this.rootName || 'root';
    }

    if (normalized.startsWith('external:')) {
      return normalized.replace(/^external:/, '');
    }

    if (relative || !this.rootName) {
      return normalized;
    }

    return `${this.rootName}/${normalized}`;
  },

  async writeFileContent(path, content, options = {}) {
    const nextContent = content ?? '';
    const persist = options.persist !== false;
    const tab = this.tabs.find((entry) => entry.path === path || entry.id === path);

    if (tab) {
      tab.content = nextContent;
      tab.dirty = tab.content !== tab.savedContent;

      if (tab.isDraft) {
        const draftNode = this.findNode(tab.path);
        if (draftNode) {
          draftNode.content = nextContent;
        }
      }

      if (persist && (tab.handle || tab.nativePath) && !tab.isUntitled) {
        await this.saveTab(tab.id);
      }

      return tab;
    }

    const node = this.findNode(path);
    if (!node || node.type !== 'file') {
      return null;
    }

    if ((!this.rootHandle && !this.rootSystemPath) || node.isDraft) {
      node.content = nextContent;
      return node;
    }

    if (this.adapter === 'tauri' && node.nativePath) {
      await desktopWriteFile(node.nativePath, nextContent, false);
      return node;
    }

    await this.verifyPermission(node.handle, true);
    const writable = await node.handle.createWritable();
    await writable.write(nextContent);
    await writable.close();
    return node;
  },

  removeNodeFromTree(path, nodes = this.tree, parentNode = null) {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.path === path) {
        const removed = node;
        nodes.splice(index, 1);
        if (parentNode) {
          parentNode.children = [...nodes];
        } else if (nodes === this.tree) {
          this.tree = [...this.tree];
        }
        return removed;
      }

      if (node.children?.length) {
        const removed = this.removeNodeFromTree(path, node.children, node);
        if (removed) {
          return removed;
        }
      }
    }

    return null;
  },

  updateNodePaths(node, parentPath) {
    node.parentPath = parentPath;
    node.path = joinPath(parentPath, node.name);
    node.id = node.path;

    if (node.children?.length) {
      node.children.forEach((child) => this.updateNodePaths(child, node.path));
    }
  },

  remapTabsForPath(oldPath, nextPath, updates = {}) {
    const restUpdates = { ...updates };
    delete restUpdates.nativePath;
    this.tabs = this.tabs.map((tab) => {
      if (!tab.path.startsWith(oldPath)) {
        return tab;
      }

      const updatedPath = tab.path.replace(oldPath, nextPath);
      const updatedName = updatedPath.split('/').pop();
      const updatedNativePath =
        typeof updates.nativePath === 'string' && tab.nativePath
          ? tab.nativePath.replace(toAbsoluteWorkspacePath(this.rootSystemPath, oldPath), toAbsoluteWorkspacePath(this.rootSystemPath, nextPath))
          : tab.nativePath;

      return {
        ...tab,
        id: updatedPath,
        path: updatedPath,
        name: updatedName,
        language: this.getLanguage(updatedName),
        nativePath: updatedNativePath,
        ...restUpdates,
      };
    });

    if (this.activeTabId?.startsWith(oldPath)) {
      this.activeTabId = this.activeTabId.replace(oldPath, nextPath);
    }

    if (this.selectedNodePath?.startsWith(oldPath)) {
      this.selectedNodePath = this.selectedNodePath.replace(oldPath, nextPath);
    }
  },

  async saveTab(id, options = {}) {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) {
      return false;
    }

    if (this.adapter === 'tauri') {
      const shouldPromptForLocation = options.saveAs || !tab.nativePath;
      if (shouldPromptForLocation) {
        const selection = await desktopPickSavePath(tab.name);
        if (!selection?.path) {
          return false;
        }

        tab.nativePath = selection.path;
        tab.name = selection.name;
        tab.language = this.getLanguage(selection.name);
      }

      await desktopWriteFile(tab.nativePath, tab.content ?? '', !!tab.isBinary);
      tab.savedContent = tab.content ?? '';
      tab.dirty = false;
      tab.isUntitled = false;

      if (this.rootSystemPath) {
        await this.reloadTree();
        const relativePath = toRelativeWorkspacePath(this.rootSystemPath, tab.nativePath);
        const matchingNode = relativePath ? this.findNode(relativePath) : null;

        if (matchingNode) {
          tab.id = matchingNode.path;
          tab.path = matchingNode.path;
          tab.name = matchingNode.name;
          tab.nativePath = matchingNode.nativePath;
          tab.external = false;
          tab.isDraft = false;
          this.selectedNodePath = matchingNode.path;
          const parentPath = this.findParentPath(matchingNode.path);
          if (parentPath) {
            this.expandedPaths.add(parentPath);
          }
          this.reconcileTabsWithTree();
        } else {
          tab.id = `external:${tab.name}`;
          tab.path = tab.id;
          tab.external = true;
          tab.isDraft = false;
          this.selectedNodePath = null;
        }
      } else if (tab.isDraft) {
        const previousPath = tab.path;
        const node = this.findNode(previousPath);

        if (node) {
          node.name = tab.name;
          node.nativePath = tab.nativePath;
          node.content = tab.content ?? '';
          node.isDraft = true;
          this.updateNodePaths(node, this.findParentPath(previousPath));
          this.reconcileTabsWithTree();

          this.tabs = this.tabs.map((entry) => {
            if (!entry.path.startsWith(previousPath)) {
              return entry;
            }

            const updatedPath = entry.path.replace(previousPath, node.path);
            return {
              ...entry,
              id: updatedPath,
              path: updatedPath,
              name: updatedPath.split('/').pop(),
              nativePath: entry.id === id ? tab.nativePath : entry.nativePath,
              language: this.getLanguage(updatedPath.split('/').pop()),
            };
          });

          tab.id = node.path;
          tab.path = node.path;
          tab.external = false;
          tab.isDraft = true;
          this.selectedNodePath = node.path;
          this.activeTabId = node.path;
        } else {
          tab.id = `external:${tab.name}`;
          tab.path = tab.id;
          tab.external = true;
          tab.isDraft = false;
          this.selectedNodePath = null;
          this.activeTabId = tab.id;
        }

        this.normalizeTabs();
      } else {
        tab.id = `external:${tab.name}`;
        tab.path = tab.id;
        tab.external = true;
        tab.isDraft = false;
        this.selectedNodePath = null;
        this.activeTabId = tab.id;
      }

      this.activeTabId = tab.id;
      return true;
    }

    const shouldPromptForLocation = options.saveAs || !tab.handle;
    if (shouldPromptForLocation) {
      const handle = await window.showSaveFilePicker({ suggestedName: tab.name });
      await this.verifyPermission(handle, true);
      tab.handle = handle;
      tab.name = handle.name;
      tab.language = this.getLanguage(handle.name);
    }

    await this.verifyPermission(tab.handle, true);
    const writable = await tab.handle.createWritable();
    if (tab.isBinary) {
      await writable.write(base64ToBytes(tab.content ?? ''));
    } else {
      await writable.write(tab.content ?? '');
    }
    await writable.close();

    tab.savedContent = tab.content ?? '';
    tab.dirty = false;
    tab.isUntitled = false;

    if (this.rootHandle) {
      await this.reloadTree();
      const matchingNode = await this.findNodeByHandle(tab.handle);

      if (matchingNode) {
        tab.id = matchingNode.path;
        tab.path = matchingNode.path;
        tab.name = matchingNode.name;
        tab.handle = matchingNode.handle;
        tab.external = false;
        tab.isDraft = false;
        this.selectedNodePath = matchingNode.path;
        this.reconcileTabsWithTree();
      } else {
        tab.id = `external:${tab.name}`;
        tab.path = tab.id;
        tab.external = true;
        tab.isDraft = false;
        this.selectedNodePath = null;
      }
    } else if (tab.isDraft) {
      const previousPath = tab.path;
      const node = this.findNode(previousPath);

      if (node) {
        node.name = tab.name;
        node.handle = tab.handle;
        node.content = tab.content ?? '';
        node.isDraft = true;
        this.updateNodePaths(node, this.findParentPath(previousPath));
        this.reconcileTabsWithTree();

        this.tabs = this.tabs.map((entry) => {
          if (!entry.path.startsWith(previousPath)) {
            return entry;
          }

          const updatedPath = entry.path.replace(previousPath, node.path);
          return {
            ...entry,
            id: updatedPath,
            path: updatedPath,
            name: updatedPath.split('/').pop(),
            handle: entry.id === id ? tab.handle : entry.handle,
            language: this.getLanguage(updatedPath.split('/').pop()),
          };
        });

        tab.id = node.path;
        tab.path = node.path;
        tab.external = false;
        tab.isDraft = true;
        this.selectedNodePath = node.path;
        this.activeTabId = node.path;
      } else {
        tab.id = `external:${tab.name}`;
        tab.path = tab.id;
        tab.external = true;
        tab.isDraft = false;
        this.selectedNodePath = null;
        this.activeTabId = tab.id;
      }

      this.normalizeTabs();
    } else {
      tab.id = `external:${tab.name}`;
      tab.path = tab.id;
      tab.external = true;
      tab.isDraft = false;
      this.selectedNodePath = null;
      this.activeTabId = tab.id;
    }

    this.activeTabId = tab.id;
    return true;
  },

  async saveWorkspaceAs() {
    const root = this.getRootNode();
    if ((this.rootHandle || this.rootSystemPath) && !root?.isDraft) {
      return false;
    }

    if (!root) {
      return false;
    }

    if (this.adapter === 'tauri') {
      const selection = await desktopPickFolder();
      if (!selection?.path) {
        return false;
      }

      const entries = [];
      const collect = (node, parentPath = '') => {
        for (const child of node.children || []) {
          const childPath = parentPath ? `${parentPath}/${child.name}` : child.name;
          entries.push({
            path: childPath,
            type: child.type,
            content: child.type === 'file' ? child.content || '' : undefined,
            isBinary: child.type === 'file' ? !!child.isBinary : undefined,
          });
          if (child.type === 'folder') {
            collect(child, childPath);
          }
        }
      };

      collect(root);
      await desktopWriteWorkspace(selection.path, entries);

      this.rootHandle = { kind: 'desktop-root', name: selection.name };
      this.rootSystemPath = selection.path;
      this.rootName = selection.name;
      this.roots = [{
        id: selection.path,
        handle: this.rootHandle,
        systemPath: selection.path,
        name: selection.name,
      }];
      this.resetWorkspaceView({ keepTabs: true, selectedPath: 'root' });
      await this.reloadTree();

      this.tabs = this.tabs.map((tab) => {
        if (!tab.isDraft) {
          return tab;
        }

        const node = this.findNode(tab.path);
        if (!node) {
          return {
            ...tab,
            id: `external:${tab.name}`,
            path: `external:${tab.name}`,
            external: true,
            isDraft: false,
            isUntitled: false,
          };
        }

        return {
          ...tab,
          id: node.path,
          path: node.path,
          name: node.name,
          nativePath: node.nativePath,
          external: false,
          isDraft: false,
          isUntitled: false,
        };
      });

      this.normalizeTabs();
      this.activeTabId = this.getActiveTab()?.id || this.tabs[0]?.id || null;
      return true;
    }

    const dirHandle = await window.showDirectoryPicker();
    await this.writeDraftTree(dirHandle, root);

    this.rootHandle = dirHandle;
    this.rootName = dirHandle.name;
    this.resetWorkspaceView({ keepTabs: true, selectedPath: 'root' });
    await this.reloadTree();

    this.tabs = this.tabs.map((tab) => {
      if (!tab.isDraft) {
        return tab;
      }

      const node = this.findNode(tab.path);
      if (!node) {
        return {
          ...tab,
          id: `external:${tab.name}`,
          path: `external:${tab.name}`,
          external: true,
          isDraft: false,
          isUntitled: false,
        };
      }

      return {
        ...tab,
        id: node.path,
        path: node.path,
        name: node.name,
        handle: node.handle,
        external: false,
        isDraft: false,
        isUntitled: false,
      };
    });

    this.normalizeTabs();
    this.activeTabId = this.getActiveTab()?.id || this.tabs[0]?.id || null;
    return true;
  },

  async writeDraftTree(directoryHandle, node) {
    for (const child of node.children || []) {
      if (child.type === 'folder') {
        const nextDir = await directoryHandle.getDirectoryHandle(child.name, { create: true });
        await this.writeDraftTree(nextDir, child);
      } else {
        const fileHandle = await directoryHandle.getFileHandle(child.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(child.content || '');
        await writable.close();
      }
    }
  },

  async createSingleFilePath(path, options = {}) {
    const normalizedPath = normalizeCreatePath(path);
    if (!normalizedPath) {
      return null;
    }

    const parentPath = parentPathOf(normalizedPath);
    const parent = await this.ensureFolderPath(parentPath);
    if (!parent || parent.type !== 'folder') {
      return null;
    }

    const fileName = normalizedPath.split('/').pop();
    if (!fileName) {
      return null;
    }

    if (!this.rootHandle && !this.rootSystemPath) {
      const node = this.createDraftNode(parent.path, fileName, 'file');
      if (node && options.open !== false) {
        await this.openFile(node);
      }
      return node;
    }

    if (this.adapter === 'tauri') {
      const absolutePath = this.resolveAbsolutePath(normalizedPath);
      await desktopCreateFile(absolutePath);
      this.expandedPaths.add(parent.path);
      await this.reloadTree();
      const node = this.findNode(normalizedPath);
      if (node && options.open !== false) {
        await this.openFile(node);
      }
      return node;
    }

    const handle = await parent.handle.getFileHandle(fileName, { create: true });
    this.expandedPaths.add(parent.path);
    await this.reloadTree();
    const node = this.findNode(normalizedPath);
    if (node && options.open !== false) {
      node.handle = handle;
      await this.openFile(node);
    }
    return node;
  },

  async createFile(parentPath, name) {
    const paths = resolveFileCreatePaths(parentPath, name);
    if (!paths.length) {
      return null;
    }

    const createdNodes = [];
    for (const path of paths) {
      const node = await this.createSingleFilePath(path, { open: createdNodes.length === 0 });
      if (node) {
        createdNodes.push(node);
      }
    }

    return createdNodes[0] || null;
  },

  async createFolder(parentPath, name) {
    const normalizedPath = resolveCreatePath(parentPath, name);
    if (!normalizedPath) {
      return null;
    }

    const finalParentPath = parentPathOf(normalizedPath);
    const finalName = normalizedPath.split('/').pop();
    if (!finalName) {
      return null;
    }

    const parent = await this.ensureFolderPath(finalParentPath);
    if (!parent || parent.type !== 'folder') {
      return null;
    }

    if (!this.rootHandle && !this.rootSystemPath) {
      return this.createDraftNode(parent.path, finalName, 'folder', { open: false });
    }

    if (this.adapter === 'tauri') {
      const absolutePath = this.resolveAbsolutePath(normalizedPath);
      await desktopCreateFolder(absolutePath);
      this.expandedPaths.add(parent.path);
      this.expandedPaths.delete(normalizedPath);
      await this.reloadTree();
      const node = this.findNode(normalizedPath);
      if (node) {
        node.open = false;
      }
      return node;
    }

    await parent.handle.getDirectoryHandle(finalName, { create: true });
    this.expandedPaths.add(parent.path);
    this.expandedPaths.delete(normalizedPath);
    await this.reloadTree();
    const node = this.findNode(normalizedPath);
    if (node) {
      node.open = false;
    }
    return node;
  },

  async deleteNode(path) {
    const node = this.findNode(path);
    if (!node || node.path === 'root') {
      return;
    }

    if ((!this.rootHandle && !this.rootSystemPath) || node.isDraft) {
      this.removeNodeFromTree(node.path);
      this.tabs = this.tabs.filter((tab) => tab.external || !tab.path.startsWith(node.path));
      if (this.selectedNodePath?.startsWith(node.path)) {
        this.selectedNodePath = this.findParentPath(node.path);
      }
      if (this.activeTabId && !this.tabs.some((tab) => tab.id === this.activeTabId)) {
        this.activeTabId = this.tabs[this.tabs.length - 1]?.id || null;
      }
      this.normalizeTabs();
      return;
    }

    const parentPath = this.findParentPath(node.path);
    const parent = parentPath === 'root' ? this.getRootNode() : this.findNode(parentPath);
    if (!parent) {
      return;
    }

    if (this.adapter === 'tauri') {
      await desktopDeletePath(node.nativePath || toAbsoluteWorkspacePath(this.rootSystemPath, node.path), node.type === 'folder');
      this.tabs = this.tabs.filter((tab) => tab.external || !tab.path.startsWith(node.path));
      if (this.selectedNodePath?.startsWith(node.path)) {
        this.selectedNodePath = parent.path;
      }
      if (this.activeTabId && !this.tabs.some((tab) => tab.id === this.activeTabId)) {
        this.activeTabId = this.tabs[this.tabs.length - 1]?.id || null;
      }
      this.expandedPaths.delete(node.path);
      await this.reloadTree();
      return;
    }

    await parent.handle.removeEntry(node.name, { recursive: node.type === 'folder' });

    this.tabs = this.tabs.filter((tab) => tab.external || !tab.path.startsWith(node.path));
    if (this.selectedNodePath?.startsWith(node.path)) {
      this.selectedNodePath = parent.path;
    }
    if (this.activeTabId && !this.tabs.some((tab) => tab.id === this.activeTabId)) {
      this.activeTabId = this.tabs[this.tabs.length - 1]?.id || null;
    }
    this.expandedPaths.delete(node.path);
    await this.reloadTree();
  },

  restoreNode(parentPath, snapshot) {
    const parent = parentPath === 'root' ? this.getRootNode() : this.findNode(parentPath);
    if (!parent || parent.type !== 'folder') return null;
    
    // Deep clone to avoid reference issues
    const restored = JSON.parse(JSON.stringify(snapshot));
    delete restored._savedContent;
    
    // Ensure children array exists
    if (!Array.isArray(parent.children)) {
      parent.children = [];
    }
    
    // Check if already exists (prevent duplicates)
    if (parent.children.some(c => c.path === restored.path)) return null;
    
    parent.children.push(restored);
    
    // Sort children: folders first, then alphabetical
    parent.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    
    return restored;
  },

  async duplicateNode(path) {
    const node = this.findNode(path);
    if (!node || node.path === 'root') {
      return null;
    }

    const parentPath = this.findParentPath(node.path);
    const parent = parentPath === 'root' ? this.getRootNode() : this.findNode(parentPath);
    if (!parent || parent.type !== 'folder') {
      return null;
    }

    const duplicateName = this.getDuplicateChildName(parent, node);
    const duplicatePath = joinPath(parent.path, duplicateName);

    if ((!this.rootHandle && !this.rootSystemPath) || node.isDraft) {
      const cloned = this.cloneDraftSubtree(node, parent.path, duplicateName);
      parent.children.push(cloned);
      parent.open = true;
      this.expandedPaths.add(parent.path);
      this.expandedPaths.delete(cloned.path);
      this.sortNodeChildren(parent);
      this.selectedNodePath = cloned.path;
      return cloned;
    }

    if (this.adapter === 'tauri') {
      await desktopCopyPath(node.nativePath || toAbsoluteWorkspacePath(this.rootSystemPath, node.path), toAbsoluteWorkspacePath(this.rootSystemPath, duplicatePath));
      this.expandedPaths.add(parent.path);
      this.expandedPaths.delete(duplicatePath);
      await this.reloadTree();
      const duplicated = this.findNode(duplicatePath);
      if (duplicated) {
        duplicated.open = false;
        this.selectedNodePath = duplicated.path;
      }
      return duplicated;
    }

    if (node.type === 'file') {
      const file = await node.handle.getFile();
      const duplicateHandle = await parent.handle.getFileHandle(duplicateName, { create: true });
      const writable = await duplicateHandle.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();
    } else {
      const duplicateHandle = await parent.handle.getDirectoryHandle(duplicateName, { create: true });
      await this.copyDirectory(node.handle, duplicateHandle);
    }

    this.expandedPaths.add(parent.path);
    this.expandedPaths.delete(duplicatePath);
    await this.reloadTree();
    const duplicated = this.findNode(duplicatePath);
    if (duplicated) {
      duplicated.open = false;
      this.selectedNodePath = duplicated.path;
    }
    return duplicated;
  },

  async moveNode(path, targetParentPath) {
    const node = this.findNode(path);
    const targetParent = targetParentPath === 'root' ? this.getRootNode() : this.findNode(targetParentPath);
    if (!node || node.path === 'root' || !targetParent || targetParent.type !== 'folder') {
      return null;
    }

    if (node.path === targetParent.path || targetParent.path.startsWith(`${node.path}/`)) {
      return null;
    }

    const sourceParentPath = this.findParentPath(node.path);
    if (sourceParentPath === targetParent.path) {
      return node;
    }

    const oldPath = node.path;
    const finalName = this.getUniqueChildName(targetParent, node.name);
    const nextPath = joinPath(targetParent.path, finalName);

    const remapExpandedPaths = () => {
      const affectedExpanded = [...this.expandedPaths].filter((entry) => entry === oldPath || entry.startsWith(`${oldPath}/`));
      affectedExpanded.forEach((entry) => {
        this.expandedPaths.delete(entry);
        this.expandedPaths.add(entry.replace(oldPath, nextPath));
      });
      this.expandedPaths.add(targetParent.path);
    };

    if ((!this.rootHandle && !this.rootSystemPath) || node.isDraft) {
      const moved = this.removeNodeFromTree(oldPath);
      if (!moved) {
        return null;
      }

      moved.name = finalName;
      this.updateNodePaths(moved, targetParent.path);
      targetParent.children = [...(targetParent.children || []), moved];
      targetParent.open = true;
      this.sortNodeChildren(targetParent);
      this.sortNodeChildren(this.findNode(sourceParentPath));
      remapExpandedPaths();
      this.remapTabsForPath(oldPath, moved.path);
      this.selectedNodePath = moved.path;
      return moved;
    }

    if (this.adapter === 'tauri') {
      await desktopMovePath(
        node.nativePath || toAbsoluteWorkspacePath(this.rootSystemPath, oldPath),
        toAbsoluteWorkspacePath(this.rootSystemPath, nextPath)
      );
      remapExpandedPaths();
      this.remapTabsForPath(oldPath, nextPath, {
        nativePath: toAbsoluteWorkspacePath(this.rootSystemPath, nextPath),
      });
      await this.reloadTree();
      this.selectedNodePath = this.findNode(nextPath) ? nextPath : targetParent.path;
      return this.findNode(nextPath);
    }

    const sourceParent = sourceParentPath === 'root' ? this.getRootNode() : this.findNode(sourceParentPath);
    if (!sourceParent?.handle || !targetParent.handle) {
      return null;
    }

    if (node.type === 'file') {
      const file = await node.handle.getFile();
      const targetHandle = await targetParent.handle.getFileHandle(finalName, { create: true });
      const writable = await targetHandle.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();
    } else {
      const targetHandle = await targetParent.handle.getDirectoryHandle(finalName, { create: true });
      await this.copyDirectory(node.handle, targetHandle);
    }

    await sourceParent.handle.removeEntry(node.name, { recursive: node.type === 'folder' });
    remapExpandedPaths();
    this.remapTabsForPath(oldPath, nextPath);
    await this.reloadTree();
    this.selectedNodePath = this.findNode(nextPath) ? nextPath : targetParent.path;
    return this.findNode(nextPath);
  },

  async renameNode(path, newName) {
    const trimmedName = newName?.trim();
    const node = this.findNode(path);
    if (!node || node.path === 'root' || !trimmedName || trimmedName === node.name) {
      return node;
    }

    if (this.adapter === 'tauri' && node.nativePath) {
      const oldPath = node.path;
      const nextPath = joinPath(this.findParentPath(node.path), trimmedName);
      await desktopMovePath(node.nativePath, toAbsoluteWorkspacePath(this.rootSystemPath, nextPath));
      const affectedExpanded = [...this.expandedPaths].filter((entry) => entry === oldPath || entry.startsWith(`${oldPath}/`));
      affectedExpanded.forEach((entry) => {
        this.expandedPaths.delete(entry);
        this.expandedPaths.add(entry.replace(oldPath, nextPath));
      });
      this.remapTabsForPath(oldPath, nextPath, {
        nativePath: toAbsoluteWorkspacePath(this.rootSystemPath, nextPath),
      });
      await this.reloadTree();
      this.selectedNodePath = nextPath;
      this.activeTabId = this.activeTabId?.startsWith(oldPath) ? this.activeTabId.replace(oldPath, nextPath) : this.activeTabId;
      this.reconcileTabsWithTree();
      return this.findNode(nextPath);
    }

    if (!this.rootHandle && node.type === 'file' && node.handle) {
      const oldPath = node.path;
      const linkedTab = this.tabs.find((tab) => tab.path === oldPath);
      const nextHandle = await window.showSaveFilePicker({ suggestedName: trimmedName });
      const writable = await nextHandle.createWritable();
      await writable.write(linkedTab?.content ?? node.content ?? '');
      await writable.close();

      node.name = nextHandle.name;
      node.handle = nextHandle;
      node.content = linkedTab?.content ?? node.content ?? '';
      this.updateNodePaths(node, this.findParentPath(oldPath));
      this.sortNodeChildren(this.findNode(this.findParentPath(node.path)));
      this.remapTabsForPath(oldPath, node.path, {
        handle: nextHandle,
        savedContent: linkedTab?.content ?? node.content ?? '',
      });
      return node;
    }

    if (!this.rootHandle || node.isDraft) {
      const oldPath = node.path;
      node.name = trimmedName;
      this.updateNodePaths(node, this.findParentPath(oldPath));
      this.sortNodeChildren(this.findNode(this.findParentPath(node.path)));
      this.remapTabsForPath(oldPath, node.path);
      return node;
    }

    const parentPath = this.findParentPath(node.path);
    const parent = parentPath === 'root' ? this.getRootNode() : this.findNode(parentPath);
    if (!parent) {
      return node;
    }

    let renamedHandle = null;
    if (node.type === 'file') {
      const file = await node.handle.getFile();
      const content = await file.text();
      renamedHandle = await parent.handle.getFileHandle(trimmedName, { create: true });
      const writable = await renamedHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } else {
      const newDirHandle = await parent.handle.getDirectoryHandle(trimmedName, { create: true });
      await this.copyDirectory(node.handle, newDirHandle);
    }

    await parent.handle.removeEntry(node.name, { recursive: node.type === 'folder' });

    const nextPath = joinPath(parent.path, trimmedName);
    const affectedExpanded = [...this.expandedPaths].filter((entry) => entry === node.path || entry.startsWith(`${node.path}/`));
    affectedExpanded.forEach((entry) => {
      this.expandedPaths.delete(entry);
      this.expandedPaths.add(entry.replace(node.path, nextPath));
    });

    this.tabs = this.tabs.map((tab) => {
      if (tab.external || tab.isDraft || !tab.path.startsWith(node.path)) {
        return tab;
      }

      const updatedPath = tab.path.replace(node.path, nextPath);
      return {
        ...tab,
        id: updatedPath,
        path: updatedPath,
        name: updatedPath.split('/').pop(),
        handle: tab.path === node.path ? renamedHandle : tab.handle,
        language: this.getLanguage(updatedPath.split('/').pop()),
      };
    });

    if (this.activeTabId?.startsWith(node.path)) {
      this.activeTabId = this.activeTabId.replace(node.path, nextPath);
    }

    if (this.selectedNodePath?.startsWith(node.path)) {
      this.selectedNodePath = this.selectedNodePath.replace(node.path, nextPath);
    }

    await this.reloadTree();
    return this.findNode(nextPath);
  },

  async copyDirectory(sourceHandle, destinationHandle) {
    for await (const entry of sourceHandle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const targetFile = await destinationHandle.getFileHandle(entry.name, { create: true });
        const writable = await targetFile.createWritable();
        await writable.write(await file.text());
        await writable.close();
      } else {
        const targetDir = await destinationHandle.getDirectoryHandle(entry.name, { create: true });
        await this.copyDirectory(entry, targetDir);
      }
    }
  },

  async toggleFolder(path) {
    const node = this.findNode(path);
    if (!node || node.type !== 'folder') return;

    const isExpanded = this.expandedPaths.has(path);
    if (isExpanded) {
      // Closing: remove from expanded set and mark node closed
      this.expandedPaths.delete(path);
      node.open = false;
    } else {
      // Opening: add to expanded set, mark open, and lazy-load if needed
      this.expandedPaths.add(path);
      node.open = true;
      if (!node.isLoaded) {
        await this.loadDirectory(path);
      }
    }
  },

  collapseAll() {
    this.expandedPaths = new Set(['root']);
    const root = this.getRootNode();
    if (root) {
      root.open = true;
      root.children?.forEach((child) => {
        if (child.type === 'folder') {
          child.open = false;
        }
      });
    }
  },

  desktopCopyPath,
};

export default workspace;
