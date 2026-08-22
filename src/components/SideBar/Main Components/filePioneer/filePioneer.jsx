import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import OutlineView from '../OutlineView/OutlineView.jsx';
import TimelineView from '../TimelineView/TimelineView.jsx';
import { resolveFileIcon, resolveFolderIcon } from '../../../../core/iconTheme.js';
import { revealInExplorer, desktopCopyPath } from '../../../../core/desktopFileApi.js';
import { isDesktopRuntime } from '../../../../core/runtime.js';
import { soundEngine } from '../../../../core/SoundEngine.js';
import ContextMenu from '../../../ContextMenu/ContextMenu.jsx';
import TrashView from '../TrashView/TrashView.jsx';

/* ─────────────────────── Chevron SVG ─────────────────────── */
function ChevronRight({ open }) {
  return (
    <svg
      className={`fp-chevron${open ? ' fp-chevron--open' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─────────────────────── Inline Input Row ─────────────────────── */
function InlineInput({ type, depth, onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);
  const cancelledRef = useRef(false);
  const mountedAtRef = useRef(0);
  const isFile = type === 'file';
  const iconData = isFile ? resolveFileIcon(name) : resolveFolderIcon(name);
  const Icon = isFile ? iconData.Icon : (iconData.OpenIcon || iconData.Icon);

  useEffect(() => {
    cancelledRef.current = false;
    mountedAtRef.current = Date.now();
    // Use rAF + timeout to ensure the element is in the DOM before focusing
    const raf = requestAnimationFrame(() => {
      setTimeout(() => {
        if (inputRef.current && !cancelledRef.current) {
          inputRef.current.focus();
        }
      }, 30);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function commit() {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    const val = name.trim();
    if (val) {
      onSubmit(val);
    } else {
      onCancel();
    }
  }

  function cancel() {
    if (cancelledRef.current) return;
    cancelledRef.current = true;
    onCancel();
  }

  function handleBlur() {
    if (cancelledRef.current) return;
    // Guard: if the input was mounted less than 300ms ago, re-focus instead of committing.
    // This prevents the toolbar button click from stealing focus and immediately destroying the input.
    if (Date.now() - mountedAtRef.current < 300) {
      requestAnimationFrame(() => {
        if (inputRef.current && !cancelledRef.current) {
          inputRef.current.focus();
        }
      });
      return;
    }
    commit();
  }

  return (
    <div
      className="fp-inline-input-row"
      style={{ paddingLeft: `${depth * 16 + 8}px`, height: '22px', display: 'flex', alignItems: 'center' }}
    >
      <span className="fp-inline-input-icon" style={{ color: iconData.color }}>
        <Icon />
      </span>
      <input
        ref={inputRef}
        className="fp-inline-input"
        value={name}
        placeholder={isFile ? 'filename.ext' : 'folder-name'}
        spellCheck={false}
        autoComplete="off"
        onChange={e => setName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
      />
    </div>
  );
}

/* ─────────────────────── Single Tree Node (react-window v2 row renderer) ─────────────────────── */
function TreeNode({ index, style, ariaAttributes, flatNodes, selectedPath, activeTabPath, pendingAction, dragState, callbacks, multiSelected, showMeta, markers, enableCheckboxes }) {
  const item = flatNodes[index];

  if (item.isInlineInput) {
    return (
      <div style={style}>
        <InlineInput
          type={item.type}
          depth={item.depth}
          onSubmit={item.onSubmit}
          onCancel={item.onCancel}
        />
      </div>
    );
  }

  const { node, depth } = item;
  const isFolder = node.type === 'folder';
  const isSelected = selectedPath === node.path;
  const isActive = activeTabPath === node.path;
  const isRenaming = pendingAction?.mode === 'rename' && pendingAction.path === node.path;
  const draggingPaths = dragState.dragging ? (Array.isArray(dragState.dragging) ? dragState.dragging : [dragState.dragging]) : [];
  const isDropTarget = isFolder && dragState.dropTarget === node.path && !draggingPaths.includes(node.path);

  const folderVisual = isFolder ? resolveFolderIcon(node.name) : null;
  const fileVisual = !isFolder ? resolveFileIcon(node.name) : null;

  const [renameVal, setRenameVal] = useState(node.name);
  const renameRef = useRef(null);
  const renameCancelRef = useRef(false);

  useEffect(() => {
    setRenameVal(node.name);
  }, [node.name]);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameCancelRef.current = false;
      renameRef.current.focus();
      const dot = renameRef.current.value.lastIndexOf('.');
      if (dot > 0) renameRef.current.setSelectionRange(0, dot);
      else renameRef.current.select();
    }
  }, [isRenaming]);

  function commitRename() {
    if (renameCancelRef.current) return;
    const val = renameVal.trim();
    if (!val || val === node.name) {
      callbacks.cancelPending();
      return;
    }
    callbacks.submitRename(node.path, val);
  }

  function cancelRename() {
    renameCancelRef.current = true;
    setRenameVal(node.name);
    callbacks.cancelPending();
  }

  async function handleClick(e) {
    e.stopPropagation();
    soundEngine.playClick();
    callbacks.selectNode(node.path, { multi: e.ctrlKey || e.metaKey, range: e.shiftKey });
    if (isFolder) {
      // Use a simple timestamp to prevent rapid double-click toggling
      // without relying on e.detail which might be unreliable in some environments.
      const now = Date.now();
      if (!node._lastToggle || now - node._lastToggle > 300) {
        node._lastToggle = now;
        await callbacks.toggleFolder(node.path);
      }
    } else if (e.detail === 2) {
      callbacks.openFile(node, { preview: false });
    } else {
      callbacks.openFile(node, { preview: true });
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    } else if (e.key === 'ArrowRight' && isFolder && !node.open) {
      e.preventDefault();
      callbacks.toggleFolder(node.path);
    } else if (e.key === 'ArrowLeft' && isFolder && node.open) {
      e.preventDefault();
      callbacks.toggleFolder(node.path);
    } else if (e.key === 'F2') {
      e.preventDefault();
      callbacks.startRename(node);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      callbacks.deleteNode(node);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = e.key === 'ArrowDown' ? index + 1 : index - 1;
      const nextItem = flatNodes[nextIdx];
      if (nextItem && !nextItem.isInlineInput) {
        callbacks.selectNode(nextItem.node.path, { multi: false, range: false });
      }
    }
  }

  const rowClass = [
    'fp-node',
    isSelected ? 'fp-node--selected' : '',
    isActive ? 'fp-node--active' : '',
    isDropTarget ? 'fp-node--drop-target' : '',
    multiSelected?.has(node.path) ? 'fp-node--multi-selected' : '',
    draggingPaths.includes(node.path) ? 'fp-node--dragging' : '',
  ].filter(Boolean).join(' ');

  const indentPx = depth * 16 + 8;
  const isMultiSel = multiSelected?.has(node.path);

  return (
      <div
        className={rowClass}
        tabIndex={0}
        style={{ paddingLeft: `${indentPx}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        data-path={node.path}
        data-type={node.type}
        onMouseDown={e => callbacks.handleNodeMouseDown(e, node)}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          if (!isMultiSel) callbacks.selectNode(node.path);
          callbacks.openContextMenu(e, node);
        }}
      >
        <div className="fp-node-main">
          {/* Multi-select checkbox */}
          {enableCheckboxes && multiSelected && (
            <div className={`fp-node-checkbox${isMultiSel ? ' fp-node-checkbox--checked' : ''}`}
                 onClick={e => { e.stopPropagation(); callbacks.toggleMultiSelect(node.path); }}>
              {isMultiSel && <span><i className="fa-solid fa-check" /></span>}
            </div>
          )}

          {/* Chevron — only for folders */}
          <span className="fp-node-chevron" aria-hidden="true">
            {isFolder ? <ChevronRight open={!!node.open} /> : null}
          </span>

          {/* File/Folder icon */}
          {isFolder ? (
            <span className="fp-node-icon" style={{ color: folderVisual.color }}>
              {node.loading
                ? <span><i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 13 }} /></span>
                : (node.open && folderVisual.OpenIcon)
                  ? <folderVisual.OpenIcon className="fp-icon-svg" />
                  : <folderVisual.Icon className="fp-icon-svg" />}
            </span>
          ) : (
            <span className="fp-node-icon" style={{ color: fileVisual.color }}>
              <fileVisual.Icon className="fp-icon-svg" />
            </span>
          )}

          {/* Name or rename input */}
          {isRenaming ? (
            <input
              ref={renameRef}
              className="fp-rename-input"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onClick={e => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
              }}
            />
          ) : (
            <>
              <span className="fp-node-name" style={{
                color: (markers && markers[node.path]?.errors > 0) ? '#f48771' : ((markers && markers[node.path]?.warnings > 0) ? '#cca700' : 'inherit')
              }}>{node.name}</span>
              {markers && markers[node.path] && (markers[node.path].errors > 0 || markers[node.path].warnings > 0) && (
                <span className="fp-node-markers" style={{ display: 'flex', gap: '4px', marginLeft: '6px', fontSize: '9px', fontWeight: 'bold' }}>
                  {markers[node.path].errors > 0 && (
                    <span className="fp-marker-error" style={{ background: '#f48771', color: '#1e1e1e', padding: '1px 4px', borderRadius: '4px' }}>
                      {markers[node.path].errors}
                    </span>
                  )}
                  {markers[node.path].warnings > 0 && (
                    <span className="fp-marker-warn" style={{ background: '#cca700', color: '#1e1e1e', padding: '1px 4px', borderRadius: '4px' }}>
                      {markers[node.path].warnings}
                    </span>
                  )}
                </span>
              )}
            </>
          )}

          {/* Hover action buttons */}
          {!isRenaming && (
            <div className="fp-node-actions" onClick={e => e.stopPropagation()}>
              {isFolder && (
                <>
                  <button
                    type="button"
                    className="fp-action-btn"
                    title="New File"
                    onClick={() => callbacks.startCreate(node.path, 'file')}
                  >
                    <span><i className="fa-regular fa-file" /></span>
                  </button>
                  <button
                    type="button"
                    className="fp-action-btn"
                    title="New Folder"
                    onClick={() => callbacks.startCreate(node.path, 'folder')}
                  >
                    <span><i className="fa-solid fa-folder-plus" /></span>
                  </button>
                </>
              )}
              <button
                type="button"
                className="fp-action-btn"
                title="Rename"
                onClick={() => callbacks.startRename(node)}
              >
                <span><i className="fa-solid fa-pen" /></span>
              </button>
              <button
                type="button"
                className="fp-action-btn fp-action-btn--danger"
                title="Delete"
                onClick={() => callbacks.deleteNode(node)}
              >
                <span><i className="fa-solid fa-trash" /></span>
              </button>
            </div>
          )}
        </div>
        
        {/* File Metadata Row */}
        {showMeta && !isFolder && (
          <div className="fp-node-meta">
            <span className="fp-meta-size">{node.size != null ? formatSize(node.size) : '---'}</span>
            <span className="fp-meta-date">{node.modified ? new Date(node.modified).toLocaleDateString() : '---'}</span>
          </div>
        )}
      </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ─────────────────────── Open Editors Item ─────────────────────── */
function OpenEditorItem({ tab, isActive, onActivate, onClose }) {
  const visual = resolveFileIcon(tab.name);
  const badge = tab.isUntitled ? 'NEW' : tab.dirty ? '●' : null;

  return (
    <div className={`fp-open-editor${isActive ? ' fp-open-editor--active' : ''}`}>
      <button type="button" className="fp-open-editor-main" onClick={onActivate}>
        <span className="fp-open-editor-icon" style={{ color: visual.color }}>
          <visual.Icon />
        </span>
        <span className="fp-open-editor-name">{tab.name}</span>
        {badge && <span className="fp-open-editor-badge">{badge}</span>}
      </button>
      <button type="button" className="fp-open-editor-close" title="Close" onClick={onClose}>
        <span><i className="fa-solid fa-xmark" /></span>
      </button>
    </div>
  );
}

/* ─────────────────────── Favorite Item ─────────────────────── */
function FavoriteItem({ path, isActive, onActivate, onRemove }) {
  const name = path.split('/').pop() || path;
  const visual = resolveFileIcon(name);

  return (
    <div className={`fp-open-editor${isActive ? ' fp-open-editor--active' : ''}`}>
      <button type="button" className="fp-open-editor-main" onClick={onActivate} title={path}>
        <span className="fp-open-editor-icon" style={{ color: visual.color }}>
          <visual.Icon />
        </span>
        <span className="fp-open-editor-name">{name}</span>
      </button>
      <button type="button" className="fp-open-editor-close" title="Remove from Favorites" onClick={onRemove}>
        <span><i className="fa-solid fa-xmark" /></span>
      </button>
    </div>
  );
}

/* ─────────────────────── Empty State ─────────────────────── */
function EmptyState({ onOpenFolder, onAddFolder, onNewFile, onNewFolder }) {
  return (
    <div className="fp-empty">
      <div className="fp-empty-card">
        <div className="fp-empty-icon">
          <span><i className="fa-regular fa-folder-open" /></span>
        </div>
        <h3 className="fp-empty-title">No Folder Opened</h3>
        <p className="fp-empty-desc">Open a project folder or create a new file to start editing.</p>
        <div className="fp-empty-actions">
          <button type="button" className="fp-empty-btn fp-empty-btn--primary" onClick={onOpenFolder}>
            <span><i className="fa-regular fa-folder-open" /></span> Open Folder
          </button>
          <button type="button" className="fp-empty-btn fp-empty-btn--secondary" onClick={onAddFolder}>
            <span><i className="fa-solid fa-folder-tree" /></span> Add Folder
          </button>
          <button type="button" className="fp-empty-btn fp-empty-btn--secondary" onClick={onNewFile}>
            <span><i className="fa-regular fa-file" /></span> New File
          </button>
          <button type="button" className="fp-empty-btn fp-empty-btn--secondary" onClick={onNewFolder}>
            <span><i className="fa-solid fa-folder-plus" /></span> New Folder
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─────────────────────── Main FilePioneer Export ─────────────────────── */
export default function FilePioneer({
  workspace,
  workspaceVersion,
  refresh,
  openFile,
  createUntitledFile,
  closeTab,
  forceCloseTab,
  activeTabId,
  ariaExpandedisplayfilepioneer,
  triggerOpenFolder,
  createFolderRequestNonce,
  createFileRequestNonce,
  renameRequestNonce,
  confirmDelete,
  pushNotification,
  enableCheckboxes = true,
  revealActiveFile,
  revealNonce,
  copyPath,
  copyRelativePath,
  openToSide,
  handleOpenInTerminal,
  onExplainWithAI,
  settings,
  updateSetting,
  openSearchPanel,
  compareSource,
  onSelectForCompare,
  onCompareWithSelected,
}) {
  const [pendingAction, setPendingAction] = useState(null); // { mode:'create'|'rename', parentPath, type, path, realPath }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, node }
  const searchInputRef = useRef(null);
  const [dragState, setDragStateRaw] = useState({ dragging: null, dropTarget: null });
  const [dragGhostPos, setDragGhostPos] = useState(null);
  const [search, setSearch] = useState('');
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [trashExpanded, setTrashExpanded] = useState(false);
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [clipboard, setClipboard] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  
  const [multiSelected, setMultiSelected] = useState(new Set());
  const [showMeta, setShowMeta] = useState(false);

  const scrollRef = useRef(null);

  // Listen for external OS file/folder drops (emitted by Tauri's built-in
  // WRY IDropTarget handler).
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let unlisten = null;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('tauri://drag-drop', async (event) => {
        // Tauri payload: { paths: string[], position: {x,y} }
        // Note: position is in physical pixels, convert to logical client pixels
        const { paths, position } = event.payload || {};
        if (!paths || !paths.length) return;

        let targetDir = 'root';
        if (position) {
          const clientX = position.x / window.devicePixelRatio;
          const clientY = position.y / window.devicePixelRatio;
          const elem = document.elementFromPoint(clientX, clientY);
          const nodeEl = elem?.closest('[data-path]');
          if (nodeEl) {
            targetDir = nodeEl.getAttribute('data-path');
          }
        }

        let targetNode = workspace?.findNode?.(targetDir);
        if (targetNode && targetNode.type !== 'folder') {
          targetDir = workspace?.findParentPath?.(targetDir) || 'root';
        }

        let parentNativePath = targetDir === 'root'
          ? workspace?.roots?.[0]?.systemPath
          : workspace?.findNode?.(targetDir)?.nativePath;

        if (parentNativePath) {
          const cleanParent = parentNativePath.replace(/\\/g, '/').replace(/\/$/, '');
          for (const srcPath of paths) {
            const name = srcPath.replace(/\\/g, '/').split('/').pop();
            try {
              await desktopCopyPath(srcPath, cleanParent + '/' + name);
            } catch (err) {
              pushNotification?.(`Copy failed: ${err}`, 'error');
            }
          }
          if (workspace?.adapter === 'tauri') {
            await workspace.reloadTree?.();
          }
          refresh();
        }
      }).then(u => { unlisten = u; });
    });
    return () => { if (unlisten) unlisten(); };
  }, [workspace, refresh]);
  const handleNativeDrop = async (e, targetDir) => {
    // Ask Rust for the native OS paths captured by our custom IDropTarget.
    // WebView2 doesn't set File.path, so we need this side-channel.
    let tauriPaths = [];
    if (isDesktopRuntime()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        tauriPaths = await invoke('get_last_dropped_paths') ?? [];
      } catch (_) {}
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const isAltCopy = e.altKey;
      let hadFolderDrop = false;

      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        // Prefer the native Tauri-supplied path; fall back to Electron-style
        // file.path if somehow available (non-WebView2 environments).
        const sourcePath = tauriPaths[i] ?? file.path ?? null;
        if (sourcePath && workspace.adapter === 'tauri') {
          // Check if this is a folder drop onto root – add as new workspace root
          const isFolder = file.type === '' && !file.name.includes('.');
          if (isFolder && targetDir === 'root') {
            hadFolderDrop = true;
            try {
              await workspace.addFolderToWorkspace?.(sourcePath, file.name);
            } catch (err) {
              pushNotification?.(`Cannot add folder: ${err.message}`, 'error');
            }
            continue;
          }

          let parentNativePath = '';
          if (targetDir === 'root') {
            parentNativePath = workspace.roots[0]?.systemPath;
          } else {
            parentNativePath = workspace.findNode(targetDir)?.nativePath;
          }

          if (parentNativePath) {
            const cleanParent = parentNativePath.replace(/\\/g, '/').replace(/\/$/, '');
            const dest = cleanParent + '/' + file.name;
            try {
              await desktopCopyPath(sourcePath, dest);
            } catch (err) {
              pushNotification?.(`Copy failed: ${err}`, 'error');
            }
          } else {
            pushNotification?.(`Cannot determine target folder`, 'error');
          }
        } else {
          try {
            const text = await file.text();
            const node = workspace.createDraftNode(targetDir, file.name, 'file');
            if (node) { node.content = text; }
          } catch (err) {}
        }
      }
      if (workspace.adapter === 'tauri') {
        await workspace.reloadTree();
      }
      refresh();
      return true;
    }
    // Even if no files in dataTransfer, check if Tauri gave us paths (some OS
    // configurations don't populate dataTransfer.files for folder drops).
    const tauriPathsOnly = tauriPaths;
    if (tauriPathsOnly.length > 0 && workspace.adapter === 'tauri') {
      let parentNativePath = targetDir === 'root'
        ? workspace.roots[0]?.systemPath
        : workspace.findNode(targetDir)?.nativePath;
      if (parentNativePath) {
        const cleanParent = parentNativePath.replace(/\\/g, '/').replace(/\/$/, '');
        for (const srcPath of tauriPathsOnly) {
          const name = srcPath.replace(/\\/g, '/').split('/').pop();
          try {
            await desktopCopyPath(srcPath, cleanParent + '/' + name);
          } catch (err) {
            pushNotification?.(`Copy failed: ${err}`, 'error');
          }
        }
        await workspace.reloadTree();
        refresh();
        return true;
      }
    }
    return false;
  };
  const savedScroll = useRef(0);
  const treeContainerRef = useRef(null);
  const typingBufferRef = useRef('');
  const typingTimeoutRef = useRef(null);

  function handleTreeKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Only capture single characters, ignore special keys like ArrowDown
    if (e.key.length === 1 && !e.repeat) {
      typingBufferRef.current += e.key.toLowerCase();
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        typingBufferRef.current = '';
      }, 700);

      const searchStr = typingBufferRef.current;
      const match = flatNodes.find(n => !n.isInlineInput && n.node.name.toLowerCase().startsWith(searchStr));
      if (match) {
        workspace.setSelectedNode(match.node.path);
        refresh();
        const idx = flatNodes.indexOf(match);
        if (idx !== -1 && treeContainerRef.current) {
          const el = treeContainerRef.current.children[idx];
          el?.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }


  /* ── Derived tree data ── */
  // workspaceVersion is used in ALL useMemos below to force recompute on every tree mutation
  const treeRoots = useMemo(() => workspace.tree || [], [workspace.tree, workspaceVersion]);
  const isSingleRoot = treeRoots.length === 1 && treeRoots[0]?.type === 'folder';
  // In single-root mode, show root folder's children directly (VS Code style)
  const displayNodes = useMemo(
    () => (isSingleRoot ? (treeRoots[0]?.children || []) : treeRoots),
    [isSingleRoot, treeRoots, workspaceVersion]
  );
  const sectionLabel = isSingleRoot ? (treeRoots[0]?.name || 'FILES').toUpperCase() : 'FILES';
  const selectedPath = workspace.selectedNodePath;
  const tabs = workspace.tabs || [];
  const favorites = settings?.explorer?.favorites || [];

  // Whether we have any real tree content to show
  const hasTreeContent = treeRoots.length > 0;

  /* ── Search filtering (Fuzzy Search) ── */
  const filteredNodes = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      function stripTrash(nodes) {
        return (nodes || [])
          .filter(n => n?.name && !n.name.includes('.tildertrash_'))
          .map(n => n.type === 'folder' && n.children ? { ...n, children: stripTrash(n.children) } : n);
      }
      return stripTrash(displayNodes);
    }

    function scoreMatch(name, q) {
      if (!name) return 0;
      const n = name.toLowerCase();
      if (n === q) return 200;
      if (n.includes(q)) return 100;
      let score = 0, qi = 0;
      for (let i = 0; i < n.length && qi < q.length; i++) {
        if (n[i] === q[qi]) { score += 10; qi++; }
      }
      return qi === q.length ? score : 0;
    }

    function filterNode(node) {
      if (!node?.name || node.name.includes('.tildertrash_')) return null;
      const s = scoreMatch(node.name, term);
      if (node.type === 'folder' && node.children) {
        const kids = node.children.map(filterNode).filter(Boolean);
        kids.sort((a, b) => (b.score || 0) - (a.score || 0));
        if (s > 0 || kids.length > 0) {
          return { ...node, children: kids, open: true, score: s };
        }
        return null;
      }
      return s > 0 ? { ...node, score: s } : null;
    }

    const res = displayNodes.map(filterNode).filter(Boolean);
    res.sort((a, b) => (b.score || 0) - (a.score || 0));
    return res;
  }, [displayNodes, search, workspaceVersion]);

  /* ── Flat Tree Generation for Virtualization ── */
  const flatNodes = useMemo(() => {
    const list = [];
    
    if (pendingAction?.mode === 'create' && pendingAction.parentPath === 'root') {
      list.push({ isInlineInput: true, type: pendingAction.type, depth: 0, onSubmit: submitCreate, onCancel: cancelPending });
    }

    function flatten(nodes, depth) {
      for (const node of nodes) {
        if (pendingAction?.mode === 'create' && pendingAction.parentPath === node.path) {
          list.push({ isInlineInput: true, type: pendingAction.type, depth, onSubmit: submitCreate, onCancel: cancelPending });
        }
        list.push({ node, depth, isInlineInput: false });
        if (node.type === 'folder' && node.open && node.children) {
          flatten(node.children, depth + 1);
        }
      }
    }
    flatten(filteredNodes, 0);
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes, pendingAction, workspaceVersion]);

  // Scroll the selected item into view when selection changes.
  useEffect(() => {
    if (!treeContainerRef.current || !selectedPath) return;
    const el = treeContainerRef.current.querySelector('.fp-node--selected');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, revealNonce]);

  /* ── Helpers ── */
  function resolveParentForCreate() {
    if (!treeRoots.length) return null;
    const sel = workspace.findNode(selectedPath);
    if (!sel) return 'root';
    if (sel.type === 'folder') return sel.path === treeRoots[0]?.path ? 'root' : sel.path;
    return sel.parentPath === treeRoots[0]?.path ? 'root' : (sel.parentPath || 'root');
  }

  function expandPathInWorkspace(path) {
    if (!path) return;
    const segments = path === 'root' ? ['root'] : ['root', ...path.split('/').map((_, i, arr) => arr.slice(0, i + 1).join('/'))];
    segments.forEach(seg => {
      workspace.expandedPaths?.add(seg);
      const n = workspace.findNode(seg);
      if (n) n.open = true;
    });
  }

  /* ── Pending action management ── */
  function startCreate(uiParentPath, type) {
    // Ensure the folder is open before creating inside it
    const n = uiParentPath === 'root' ? treeRoots[0] : workspace.findNode(uiParentPath);
    if (n?.type === 'folder') n.open = true;

    setPendingAction({ mode: 'create', parentPath: uiParentPath, type });
    refresh();
  }

  function startRename(node) {
    workspace.setSelectedNode(node.path);
    setPendingAction({ mode: 'rename', path: node.path });
  }

  function cancelPending() {
    setPendingAction(null);
  }

  async function submitCreate(name) {
    if (!pendingAction || pendingAction.mode !== 'create') return;
    const target = pendingAction.realPath || pendingAction.parentPath || 'root';
    try {
      if (pendingAction.type === 'file') {
        await workspace.createFile(target, name);
      } else {
        await workspace.createFolder(target, name);
      }
    } catch (err) {
      console.error('Failed to create file/folder:', err);
      pushNotification?.(err?.message || 'Could not create item.', 'error');
    } finally {
      setPendingAction(null);
      refresh();
    }
  }

  async function submitRename(path, newName) {
    try {
      await workspace.renameNode(path, newName);
    } catch (err) {
      console.error('Failed to rename:', err);
      pushNotification?.(err?.message || 'Could not rename item.', 'error');
    } finally {
      setPendingAction(null);
      refresh();
    }
  }

  /* ── Nonce-based external triggers ── */
  useEffect(() => {
    if (!createFileRequestNonce) return;
    if (!treeRoots.length) {
      // No tree: delegate to App.jsx createUntitledFile which shows a prompt dialog
      createUntitledFile?.();
      return;
    }
    const p = resolveParentForCreate() || (treeRoots[0]?.path ?? 'root');
    startCreate(p, 'file');
  }, [createFileRequestNonce]);

  useEffect(() => {
    if (!createFolderRequestNonce) return;
    if (!treeRoots.length) {
      // For folder, start inline create with a draft root
      startCreate('root', 'folder');
      return;
    }
    const p = resolveParentForCreate() || (treeRoots[0]?.path ?? 'root');
    startCreate(p, 'folder');
  }, [createFolderRequestNonce]);

  useEffect(() => {
    if (!renameRequestNonce) return;
    const path = workspace.selectedNodePath;
    if (!path || path === 'root') return;
    const n = workspace.findNode(path);
    if (n) startRename(n);
  }, [renameRequestNonce]);

  /* ── Drag state helpers ── */
  function setDragging(val) { setDragStateRaw(s => ({ ...s, dragging: val })); }
  function setDropTarget(val) { setDragStateRaw(s => ({ ...s, dropTarget: val })); }

  /* ── Delete ── */
  async function deleteNode(node) {
    const isMultiSel = multiSelected.has(node.path) && multiSelected.size > 1;
    const nodes = isMultiSel ? Array.from(multiSelected).map(p => workspace.findNode(p)).filter(Boolean) : [node];
    
    const ok = await confirmDelete(isMultiSel ? nodes : node);
    if (!ok) return;

    // Close tabs associated with this node or its children to prevent auto-save from recreating the file
    if (workspace.tabs) {
      workspace.tabs.forEach(t => {
        if (t.path && nodes.some(n => t.path === n.path || t.path.startsWith(n.path + '/'))) {
          workspace.closeTab(t.id);
          if (forceCloseTab) forceCloseTab(t.id);
          else closeTab?.(t.id);
        }
      });
    }

    const trashEntries = [];
    try {
      for (const n of nodes) {
        const trashName = `${n.name}.tildertrash_${Date.now()}`;
        const parentPath = workspace.findParentPath?.(n.path) || 'root';
        const tPath = parentPath === 'root' ? trashName : `${parentPath}/${trashName}`;
        try {
          await workspace.renameNode(n.path, trashName);
          trashEntries.push({ nodeName: n.name, trashPath: tPath, originalPath: n.path });
        } catch (err) {
          await workspace.deleteNode(n.path);
        }
      }
      refresh();
    } catch (err) {
      console.error('Could not delete items:', err);
      pushNotification?.('Could not delete items.', 'error');
      return;
    }

    // Register each trashed item in the undo stack
    for (const entry of trashEntries) {
      const undoId = Date.now() + Math.random();
      const timer = setTimeout(() => {
        setUndoStack(prev => prev.filter(u => u.id !== undoId));
        refresh();
      }, 5000);
      setUndoStack(prev => [...prev, { id: undoId, nodeName: entry.nodeName, trashPath: entry.trashPath, originalPath: entry.originalPath, timer }]);
    }

    pushNotification?.(
      trashEntries.length > 1
        ? `Deleted ${trashEntries.length} items. Restore from Trash.`
        : `Deleted "${nodes[0].name}". Restore from Trash.`,
      'warning'
    );
  }

  async function undoLastDelete() {
    if (!undoStack.length) return;
    
    const last = undoStack[undoStack.length - 1];
    clearTimeout(last.timer);
    
    setUndoStack(prev => prev.slice(0, -1));

    try {
      await workspace.renameNode(last.trashPath, last.nodeName);
      refresh();
      pushNotification?.(`Restored "${last.nodeName}".`, 'info');
    } catch (err) {
      console.error('Could not undo:', err);
      pushNotification?.('Could not undo deletion.', 'error');
    }
  }

  async function handlePaste() {
    if (!clipboard || !clipboard.nodes || clipboard.nodes.length === 0) return;
    const n = workspace.findNode(selectedPath);
    const targetPath = (n?.type === 'folder' || selectedPath === 'root') ? selectedPath : (workspace.findParentPath?.(selectedPath) || 'root');

    if (clipboard.action === 'cut') {
      await moveNodes(clipboard.nodes.map(node => node.path), targetPath);
      setClipboard(null);
    } else {
      for (const node of clipboard.nodes) {
        const dup = await workspace.duplicateNode(node.path);
        if (dup && workspace.findParentPath?.(dup.path) !== targetPath) {
          await workspace.moveNode(dup.path, targetPath);
        }
      }
      refresh();
    }
  }

  const getSelectedNodes = (defaultNodePath) => {
    const isMulti = multiSelected.has(defaultNodePath) && multiSelected.size > 1;
    return isMulti ? Array.from(multiSelected).map(p => workspace.findNode(p)).filter(Boolean) : [workspace.findNode(defaultNodePath)].filter(Boolean);
  };

  useEffect(() => {
    function handleKeyboard(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          undoLastDelete();
        }
      }
      // Cut/Copy/Paste keyboard shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        const nodes = getSelectedNodes(selectedPath).filter(n => n.path !== 'root');
        if (nodes.length > 0) {
          setClipboard({ nodes, action: 'cut' });
          pushNotification?.(`Cut ${nodes.length > 1 ? nodes.length + ' items' : '"' + nodes[0].name + '"'}.`, 'info');
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const nodes = getSelectedNodes(selectedPath).filter(n => n.path !== 'root');
        if (nodes.length > 0) {
          setClipboard({ nodes, action: 'copy' });
          pushNotification?.(`Copied ${nodes.length > 1 ? nodes.length + ' items' : '"' + nodes[0].name + '"'}.`, 'info');
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard) {
          handlePaste();
        }
      }
    }
    const el = document.getElementById('filepioneerarea');
    el?.addEventListener('keydown', handleKeyboard);
    return () => el?.removeEventListener('keydown', handleKeyboard);
  }, [undoStack, clipboard, selectedPath, multiSelected]);

  /* ── Move / Duplicate ── */
  async function moveNodes(srcPaths, destPath) {
    const paths = Array.isArray(srcPaths) ? srcPaths : [srcPaths];
    const moved = await workspace.moveNodes(paths, destPath);
    if (moved && moved.length > 0) { 
      pushNotification?.(`Moved ${moved.length > 1 ? moved.length + ' items' : moved[0].name}.`, 'info'); 
      refresh(); 
    } else pushNotification?.('Could not move item(s) here.', 'warning');
  }

  async function duplicateNode(path) {
    const paths = getSelectedNodes(path).map(n => n.path);
    const dups = await workspace.duplicateNodes(paths);
    if (dups && dups.length > 0) { 
      pushNotification?.(`Duplicated ${dups.length > 1 ? dups.length + ' items' : dups[0].name}.`, 'info'); 
      refresh(); 
    } else pushNotification?.('Could not duplicate item(s).', 'warning');
  }

  async function duplicateAndMoveNodes(srcPaths, destPath) {
    const paths = Array.isArray(srcPaths) ? srcPaths : [srcPaths];
    const dups = await workspace.duplicateNodes(paths);
    if (dups && dups.length > 0) {
      for (const dup of dups) {
        if (workspace.findParentPath?.(dup.path) !== destPath) {
          await workspace.moveNode(dup.path, destPath);
        }
      }
      pushNotification?.(`Copied ${dups.length > 1 ? dups.length + ' items' : dups[0].name}.`, 'info');
      refresh();
    } else pushNotification?.('Could not copy item(s) here.', 'warning');
  }

  /* ❖ Toggle folder (async to lazy-load) ❖ */
  async function toggleFolder(path) {
    soundEngine.playPop();
    await workspace.toggleFolder(path);
    refresh();
  }

  /* ── Select node ── */
  function selectNode(path, opts) {
    workspace.setSelectedNode(path, opts);
    refresh();
  }

  /* ── Open file ── */
  async function openFileNode(node, opts) {
    await openFile(node, opts);
    refresh();
  }

  /* ── Context menu ── */
  function openContextMenu(e, node) {
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  }

  async function handleContextAction(action) {
    const node = contextMenu?.node;
    const path = node?.path || 'root';
    const n = path === 'root' ? null : workspace.findNode(path);
    setContextMenu(null);

    switch (action) {
      case 'new-file':
        startCreate(n?.type === 'folder' ? path : workspace.findParentPath?.(path) || path, 'file');
        return;
      case 'new-folder':
        startCreate(n?.type === 'folder' ? path : workspace.findParentPath?.(path) || path, 'folder');
        return;
      case 'rename':
        if (n) startRename(n);
        return;
      case 'delete':
        if (n) await deleteNode(n);
        return;
      case 'cut': {
        const nodes = getSelectedNodes(path).filter(n => n.path !== 'root');
        if (nodes.length > 0) {
          setClipboard({ nodes, action: 'cut' });
          pushNotification?.(`Cut ${nodes.length > 1 ? nodes.length + ' items' : '"' + nodes[0].name + '"'}.`, 'info');
        }
        return;
      }
      case 'add-favorite':
        if (n && updateSetting) {
          updateSetting('explorer.favorites', [...favorites, n.path]);
        }
        return;
      case 'remove-favorite':
        if (n && updateSetting) {
          updateSetting('explorer.favorites', favorites.filter(p => p !== n.path));
        }
        return;
      case 'find-in-folder':
        if (n && openSearchPanel) {
          openSearchPanel({ mode: 'content', query: '', filesToInclude: n.path });
        }
        return;
      case 'copy': {
        const nodes = getSelectedNodes(path).filter(n => n.path !== 'root');
        if (nodes.length > 0) {
          setClipboard({ nodes, action: 'copy' });
          pushNotification?.(`Copied ${nodes.length > 1 ? nodes.length + ' items' : '"' + nodes[0].name + '"'}.`, 'info');
        }
        return;
      }
      case 'paste':
        await handlePaste();
        return;
      case 'duplicate': {
        const nodes = getSelectedNodes(path).filter(n => n.path !== 'root');
        if (nodes.length > 0) {
          await workspace.duplicateNodes(nodes.map(n => n.path));
          refresh();
        } else if (n) {
          await workspace.duplicateNode(n.path);
          refresh();
        }
        return;
      }
      case 'open-to-side':
        if (n?.type === 'file') openToSide?.(path);
        return;
      case 'copy-path':
        await copyPath?.();
        return;
      case 'copy-relative-path':
        await copyRelativePath?.();
        return;
      case 'reveal-in-explorer':
        await workspace.revealNodeInExplorer(path);
        return;
      case 'open-in-terminal':
        handleOpenInTerminal?.(path);
        return;
      case 'reveal-active-file':
        revealActiveFile?.();
        return;
      case 'open-folder':
        triggerOpenFolder?.();
        return;
      case 'add-folder':
        workspace.addFolderToWorkspace?.().then(refresh);
        return;
      case 'explain-ai':
        onExplainWithAI?.(path);
        return;
      case 'select-for-compare': {
        const tabObj = workspace.tabs?.find(t => t.path === n?.path) || (n ? { id: n.path, name: n.name, path: n.path, content: n.content ?? '', language: workspace.getLanguage?.(n.name) ?? 'plaintext' } : null);
        if (tabObj) onSelectForCompare?.(tabObj);
        else pushNotification?.('Open this file in editor before comparing.', 'warning');
        return;
      }
      case 'compare-with-selected': {
        const tabObj = workspace.tabs?.find(t => t.path === n?.path) || (n ? { id: n.path, name: n.name, path: n.path, content: n.content ?? '', language: workspace.getLanguage?.(n.name) ?? 'plaintext' } : null);
        if (tabObj) onCompareWithSelected?.(tabObj);
        else pushNotification?.('Open this file in editor before comparing.', 'warning');
        return;
      }
      default:
        pushNotification?.('Action not yet available.', 'warning');
    }
  }

  /* ── Toolbar actions ── */
  function handleNewFile() {
    cancelPending();
    if (!treeRoots.length) {
      // Empty workspace → show prompt dialog via App.jsx
      createUntitledFile?.();
      return;
    }
    const p = resolveParentForCreate();
    startCreate(p || (treeRoots[0]?.path ?? 'root'), 'file');
  }

  function handleNewFolder() {
    cancelPending();
    if (!treeRoots.length) {
      // Empty workspace → create draft root and start inline folder creation
      startCreate('root', 'folder');
      return;
    }
    const p = resolveParentForCreate();
    startCreate(p || (treeRoots[0]?.path ?? 'root'), 'folder');
  }

  function handleOpenFolderClick() {
    cancelPending();
    triggerOpenFolder?.();
  }

  function handleAddFolderClick() {
    cancelPending();
    workspace.addFolderToWorkspace?.().then(refresh);
  }

  async function handleRefresh() {
    await workspace.reloadTree?.();
    refresh();
  }

  function handleCollapseAll() {
    workspace.collapseAll?.();
    refresh();
  }

  /* ── Multi-select ── */
  function toggleMultiSelect(path) {
    setMultiSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleNodeMouseDown(e, node) {
    // Only drag with left click, and not if renaming
    if (e.button !== 0 || pendingAction?.mode === 'rename') return;
    
    const startX = e.clientX;
    const startY = e.clientY;
    let dragInitiated = false;
    let dragPaths = [];
    let localDropTarget = null;
    
    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      
      if (!dragInitiated && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        dragInitiated = true;
        const isMultiSel = multiSelected?.has(node.path);
        dragPaths = (isMultiSel && multiSelected.size > 1) ? Array.from(multiSelected) : [node.path];
        setDragging(dragPaths);
      }
      
      if (dragInitiated) {
        setDragGhostPos({ x: moveEvent.clientX + 10, y: moveEvent.clientY + 10 });
        
        // Find elements under cursor to set dropTarget
        const elem = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        const nodeEl = elem?.closest('[data-path]');
        if (nodeEl) {
          const targetPath = nodeEl.getAttribute('data-path');
          const targetType = nodeEl.getAttribute('data-type');
          if (targetType === 'folder' || targetPath === 'root') {
            // Check if invalid drop onto self or subfolders
            const isInvalid = dragPaths.some(p => p === targetPath || targetPath.startsWith(`${p}/`));
            if (!isInvalid) {
              localDropTarget = targetPath;
              setDropTarget(targetPath);
              return;
            }
          }
        }
        localDropTarget = null;
        setDropTarget(null);
      }
    };
    
    const handleMouseUp = async (upEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      
      if (dragInitiated) {
        const currentTarget = localDropTarget;
        if (currentTarget) {
          const validPaths = dragPaths.filter(p => p !== currentTarget && !currentTarget.startsWith(`${p}/`));
          if (validPaths.length > 0) {
            if (upEvent.altKey) {
              await duplicateAndMoveNodes(validPaths, currentTarget);
            } else {
              await moveNodes(validPaths, currentTarget);
            }
          }
        }
        setDragging(null);
        setDropTarget(null);
        setDragGhostPos(null);
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function clearMultiSelect() {
    setMultiSelected(new Set());
  }

  /* ── Callbacks object ── */
  const callbacks = useMemo(() => ({
    selectNode,
    openFile: openFileNode,
    toggleFolder,
    startCreate,
    startRename,
    cancelPending,
    submitCreate,
    submitRename,
    deleteNode,
    moveNodes,
    duplicateNode,
    duplicateAndMoveNodes,
    openContextMenu,
    setDragging,
    setDropTarget,
    toggleMultiSelect,
    handleNativeDrop,
    handleNodeMouseDown,
  }), [workspace, refresh, pendingAction, multiSelected, undoStack, clipboard, selectedPath]);

  /* ── Context menu derived state ── */
  const ctxNode = contextMenu?.node;
  const canCreateInside = ctxNode?.type === 'folder' || ctxNode?.path === 'root' || !ctxNode;
  const canRenameDelete = ctxNode?.path && ctxNode.path !== 'root';

  // Determine whether to show tree section (either we have content, or there's a pending create action that created a draft root)
  const showTreeSection = hasTreeContent || (pendingAction?.mode === 'create');

  /* ─────────────── RENDER ─────────────── */
  return (
    <div 
      id="filepioneerarea" 
      className={`fp-shell sidebarscontent d-${ariaExpandedisplayfilepioneer}`}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (!e.ctrlKey && !e.altKey && !e.metaKey && /^[a-zA-Z0-9]$/.test(e.key)) {
          if (document.activeElement?.tagName !== 'INPUT' && searchInputRef.current) {
            searchInputRef.current.focus();
          }
        }
      }}
    >

      {/* Header */}
      <div className="fp-header">
        <p className="fp-eyebrow">Explorer</p>

        {/* Toolbar */}
        <div className="fp-toolbar">
          <button type="button" className="fp-toolbar-btn" title="New File" onClick={handleNewFile}>
            <span><i className="fa-regular fa-file" /></span>
          </button>
          <button type="button" className="fp-toolbar-btn" title="New Folder" onClick={handleNewFolder}>
            <span><i className="fa-solid fa-folder-plus" /></span>
          </button>
          <button type="button" className="fp-toolbar-btn" title="Add Folder to Workspace" onClick={handleAddFolderClick}>
            <span><i className="fa-solid fa-folder-tree" /></span>
          </button>
          <button type="button" className="fp-toolbar-btn" title="Open Folder" onClick={handleOpenFolderClick}>
            <span><i className="fa-regular fa-folder-open" /></span>
          </button>
          {hasTreeContent && (
            <>
              <button type="button" className="fp-toolbar-btn" title="Refresh" onClick={handleRefresh}>
                <span><i className="fa-solid fa-rotate-right" /></span>
              </button>
              <button type="button" className="fp-toolbar-btn" title="Collapse All" onClick={handleCollapseAll}>
                <span><i className="fa-solid fa-angles-up" /></span>
              </button>
            </>
          )}
          {undoStack.length > 0 && (
            <button type="button" className="fp-toolbar-btn" title={`Undo Delete (${undoStack.length})`} onClick={undoLastDelete}
              style={{ color: '#ffb300' }}>
              <span><i className="fa-solid fa-rotate-left" /></span>
            </button>
          )}
          {multiSelected.size > 0 && (
            <button type="button" className="fp-toolbar-btn fp-multi-clear-btn" title={`Clear Selection (${multiSelected.size})`} onClick={clearMultiSelect}>
              <span><i className="fa-solid fa-square-minus" style={{ color: '#ff5252' }} /></span>
            </button>
          )}
          <button type="button" className={`fp-toolbar-btn ${showMeta ? 'active' : ''}`} title="Toggle Metadata" onClick={() => setShowMeta(v => !v)}>
            <span><i className="fa-solid fa-circle-info" /></span>
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="fp-search-bar">
        <span><i className="fa-solid fa-magnifying-glass fp-search-icon" /></span>
        <input
          ref={searchInputRef}
          type="text"
          className="fp-search-input"
          placeholder="Search files..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="fp-search-clear" onClick={() => setSearch('')}>
            <span><i className="fa-solid fa-xmark" /></span>
          </button>
        )}
      </div>

      {/* Workspace Trust Banner */}
      {workspace.isTrusted === false && (
        <div style={{
          background: 'rgba(255, 171, 0, 0.12)',
          borderBottom: '1px solid rgba(255, 171, 0, 0.25)',
          padding: '8px 12px',
          fontSize: '11px',
          color: '#ffd54f',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span><i className="fa-solid fa-shield-halved" style={{ color: '#ffb300' }} /></span>
            <span style={{ fontWeight: 600 }}>Restricted Mode</span>
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.75)', lineHeight: '1.3' }}>
            Some features like terminal scripts and debuggers are disabled.
          </div>
          <button
            type="button"
            onClick={() => {
              workspace.isTrusted = true;
              const rootPath = workspace.rootSystemPath || workspace.rootName || 'workspace';
              const trustedWorkspaces = JSON.parse(localStorage.getItem('trustedWorkspaces') || '{}');
              trustedWorkspaces[rootPath] = true;
              localStorage.setItem('trustedWorkspaces', JSON.stringify(trustedWorkspaces));
              refresh();
              pushNotification?.('Workspace trusted.', 'info');
            }}
            style={{
              background: '#ffb300',
              color: '#120b29',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontWeight: 700,
              fontSize: '10px',
              cursor: 'pointer',
              alignSelf: 'flex-start'
            }}
          >
            Trust Workspace
          </button>
        </div>
      )}

      {/* Favorites section */}
      {favorites.length > 0 && (
        <div className="fp-section">
          <div 
            className="fp-section-label" 
            style={{ cursor: 'pointer' }}
            onClick={() => setFavoritesExpanded(!favoritesExpanded)}
          >
            <span><i className={`fa-solid fa-chevron-${favoritesExpanded ? 'down' : 'right'}`} style={{ marginRight: '8px', fontSize: '10px', width: '12px', textAlign: 'center' }}></i></span>
            FAVORITES
          </div>
          {favoritesExpanded && (
            <div className="fp-open-editors">
              {favorites.map(favPath => (
                <FavoriteItem
                  key={favPath}
                  path={favPath}
                  isActive={activeTabId === favPath}
                  onActivate={() => openFile(favPath)}
                  onRemove={() => {
                    if (updateSetting) {
                      updateSetting('explorer.favorites', favorites.filter(p => p !== favPath));
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Open Editors section */}
      {tabs.length > 0 && (
        <div className="fp-section">
          <div className="fp-section-label">OPEN EDITORS</div>
          <div className="fp-open-editors">
            {tabs.map(tab => (
              <OpenEditorItem
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onActivate={() => { workspace.setActiveTab(tab.id); refresh(); }}
                onClose={() => closeTab(tab.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* File Tree or Empty State */}
      {!showTreeSection ? (
        <EmptyState
          onOpenFolder={triggerOpenFolder}
          onAddFolder={() => workspace.addFolderToWorkspace?.().then(refresh)}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
        />
      ) : (
        <div
          className="fp-tree-section fp-trees-container"
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            paddingBottom: 0,
            flex: 1,
            minHeight: 0
          }}
        >
          {/* Section label */}
          <div className="fp-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{sectionLabel}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button"
                className="fp-header-action" 
                title="Add Folder to Workspace" 
                onClick={(e) => { e.stopPropagation(); workspace.addFolderBrowser(); }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
              >
                <span><i className="fa-solid fa-folder-plus"></i></span>
              </button>
            </div>
          </div>

          {/* Virtualized file tree */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
            onDragEnter={e => e.preventDefault()}
            onDragOver={e => {
              e.preventDefault();
              setDropTarget('root');
            }}
            onDrop={async e => {
              e.preventDefault();
              if (await handleNativeDrop(e, 'root')) return;
              
              let dragPaths = dragState.dragging;
              if (!dragPaths) {
                const json = e.dataTransfer.getData('application/json');
                if (json) {
                  try { dragPaths = JSON.parse(json); } catch(err) {}
                }
                if (!dragPaths) {
                  const text = e.dataTransfer.getData('text/plain');
                  if (text) dragPaths = [text];
                }
              }
              if (!Array.isArray(dragPaths)) dragPaths = dragPaths ? [dragPaths] : [];
              
              setDragging(null); setDropTarget(null);
              const validPaths = dragPaths.filter(p => p && p !== 'root');
              if (validPaths.length > 0) await moveNodes(validPaths, treeRoots[0]?.path || 'root');
            }}
            onClick={e => {
              if (e.target.closest('.fp-node, .fp-inline-input-row')) return;
              workspace.setSelectedNode('root');
              refresh();
            }}
            onContextMenu={e => {
              if (e.target.closest('.fp-node, .fp-inline-input-row')) return;
              e.preventDefault();
              workspace.setSelectedNode('root');
              openContextMenu(e, { path: 'root', type: 'folder', name: sectionLabel, isRoot: true });
            }}
          >
                {/* Plain scrollable tree — replaces react-window for stability */}
                <div
                  ref={treeContainerRef}
                  className="fp-tree-list"
                  onKeyDown={handleTreeKeyDown}
                  style={{ overflowX: 'hidden', overflowY: 'auto', flex: 1 }}
                >
                  {flatNodes.map((item, index) => {
                    const key = item.isInlineInput
                      ? `inline-${item.type}-${item.depth}-${index}`
                      : item.node.path;
                    if (item.isInlineInput) {
                      return (
                        <div key={key}>
                          <InlineInput
                            type={item.type}
                            depth={item.depth}
                            onSubmit={item.onSubmit}
                            onCancel={item.onCancel}
                          />
                        </div>
                      );
                    }
                    return (
                      <TreeNode
                        key={key}
                        index={index}
                        style={{}}
                        ariaAttributes={{ 'aria-posinset': index + 1, 'aria-setsize': flatNodes.length, role: 'listitem' }}
                        flatNodes={flatNodes}
                        selectedPath={selectedPath}
                        activeTabPath={tabs.find(t => t.id === activeTabId)?.path}
                        pendingAction={pendingAction}
                        dragState={dragState}
                        callbacks={callbacks}
                        enableCheckboxes={enableCheckboxes}
                        multiSelected={multiSelected}
                        showMeta={showMeta}
                        markers={workspace.markers}
                      />
                    );
                  })}
                </div>
          </div>

          {/* Show a hint when tree is empty but we have a root */}
          {filteredNodes.length === 0 && !pendingAction && (
            <div style={{
                padding: '12px 16px',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '11px',
                textAlign: 'center',
                fontStyle: 'italic'
              }}>
                {search ? 'No matching files found.' : 'This folder is empty.'}
              </div>
            )}


          {/* ── Outline Section (collapsible, separated) ── */}
          <div
            className="fp-section-label"
            style={{
              cursor: 'pointer',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.5px',
              flexShrink: 0
            }}
            onClick={() => setOutlineExpanded(!outlineExpanded)}
          >
            <span><i className={`fa-solid fa-chevron-${outlineExpanded ? 'down' : 'right'}`} style={{ marginRight: '8px', fontSize: '10px', width: '12px', textAlign: 'center' }}></i></span>
            OUTLINE
          </div>
          {outlineExpanded && (
            <div style={{
              height: '160px',
              minHeight: '100px',
              maxHeight: '220px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0
            }}>
              <OutlineView workspace={workspace} ariaExpandedisplayoutline={true} />
              <TimelineView workspace={workspace} ariaExpandedisplaytimeline={true} />
            </div>
          )}
          {/* ── Trash Section (collapsible, separated) ── */}
          <div
            className="fp-section-label"
            style={{
              cursor: 'pointer',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.5px',
              flexShrink: 0
            }}
            onClick={() => setTrashExpanded(!trashExpanded)}
          >
            <span><i className={`fa-solid fa-chevron-${trashExpanded ? 'down' : 'right'}`} style={{ marginRight: '8px', fontSize: '10px', width: '12px', textAlign: 'center' }}></i></span>
            TRASH
          </div>
          {trashExpanded && (
            <div style={{
              height: '160px',
              minHeight: '100px',
              maxHeight: '220px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0
            }}>
              <TrashView workspace={workspace} ariaExpanded="flex" refreshWorkspace={refresh} />
            </div>
          )}
        </div>
      )}

      {/* Drag Ghost */}
      {dragGhostPos && dragState.dragging && (
        <div
          style={{
            position: 'fixed',
            left: dragGhostPos.x,
            top: dragGhostPos.y,
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'var(--vscode-editor-background, #1e1e1e)',
            color: 'var(--vscode-editor-foreground, #cccccc)',
            padding: '4px 8px',
            border: '1px solid var(--vscode-widget-border, #454545)',
            borderRadius: '4px',
            fontSize: '11px',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          {dragState.dragging.length > 1 ? `${dragState.dragging.length} items` : dragState.dragging[0].split('/').pop()}
        </div>
      )}

      {/* Context menu portal */}
      {contextMenu && (() => {
        const items = [];
        if (canCreateInside) {
          items.push({ label: 'New File', icon: 'fa-regular fa-file', onClick: () => handleContextAction('new-file') });
          items.push({ label: 'New Folder', icon: 'fa-solid fa-folder-plus', onClick: () => handleContextAction('new-folder') });
          items.push({ separator: true });
        }
        if (contextMenu.node?.type === 'file') {
          items.push({ label: 'Open to the Side', icon: 'fa-solid fa-columns', onClick: () => handleContextAction('open-to-side') });
        }
        if (contextMenu.node?.type === 'folder') {
          items.push({ label: 'Find in Folder...', icon: 'fa-solid fa-magnifying-glass', onClick: () => handleContextAction('find-in-folder') });
        }
        if (contextMenu.node?.path && contextMenu.node?.path !== 'root') {
          if (favorites.includes(contextMenu.node.path)) {
            items.push({ label: 'Remove from Favorites', icon: 'fa-solid fa-star', onClick: () => handleContextAction('remove-favorite') });
          } else {
            items.push({ label: 'Add to Favorites', icon: 'fa-regular fa-star', onClick: () => handleContextAction('add-favorite') });
          }
          items.push({ separator: true });
        }
        if (canRenameDelete) {
          items.push({ label: 'Rename', icon: 'fa-solid fa-pen', onClick: () => handleContextAction('rename'), shortcut: 'F2' });
          items.push({ label: 'Duplicate', icon: 'fa-regular fa-copy', onClick: () => handleContextAction('duplicate') });
          items.push({ label: 'Delete', icon: 'fa-solid fa-trash', danger: true, onClick: () => handleContextAction('delete'), shortcut: 'Del' });
          items.push({ separator: true });
        }
        if (contextMenu.node?.path !== 'root') {
          items.push({ label: 'Copy Path', icon: 'fa-regular fa-clipboard', onClick: () => handleContextAction('copy-path') });
          items.push({ label: 'Copy Relative Path', icon: 'fa-solid fa-link', onClick: () => handleContextAction('copy-relative-path') });
          if (workspace.adapter === 'tauri') {
            items.push({ separator: true });
            items.push({ label: 'Reveal in File Explorer', icon: 'fa-solid fa-arrow-up-right-from-square', onClick: () => handleContextAction('reveal-in-explorer') });
          }
          items.push({ label: 'Open in Integrated Terminal', icon: 'fa-solid fa-terminal', onClick: () => handleContextAction('open-in-terminal') });
          items.push({ separator: true });
        }
        items.push({ label: 'Reveal Active File', icon: 'fa-solid fa-crosshairs', onClick: () => handleContextAction('reveal-active-file') });
        if (contextMenu.node?.path === 'root') {
          items.push({ label: 'Open Folder', icon: 'fa-regular fa-folder-open', onClick: () => handleContextAction('open-folder') });
          items.push({ label: 'Add Folder to Workspace', icon: 'fa-solid fa-folder-tree', onClick: () => handleContextAction('add-folder') });
        }
        
        items.push({ separator: true });
        items.push({ label: 'Explain with AI', icon: 'fa-solid fa-wand-magic-sparkles', onClick: () => handleContextAction('explain-ai') });
        items.push({ separator: true });
        if (contextMenu.node?.type === 'file') {
          if (compareSource) {
            items.push({ label: `Compare with "${compareSource.name}"`, icon: 'fa-solid fa-left-right', onClick: () => handleContextAction('compare-with-selected') });
          }
          items.push({ label: 'Select for Compare', icon: 'fa-regular fa-clone', onClick: () => handleContextAction('select-for-compare') });
          items.push({ separator: true });
        }

        if (canRenameDelete) {
          items.push({ label: 'Cut', icon: 'fa-solid fa-scissors', onClick: () => handleContextAction('cut'), shortcut: 'Ctrl+X' });
          items.push({ label: 'Copy', icon: 'fa-regular fa-copy', onClick: () => handleContextAction('copy'), shortcut: 'Ctrl+C' });
        }
        items.push({ label: 'Paste', icon: 'fa-solid fa-paste', onClick: () => handleContextAction('paste'), shortcut: 'Ctrl+V', disabled: !clipboard });

        return (
          <ContextMenu
            x={Math.min(contextMenu.x, window.innerWidth - 210)}
            y={Math.min(contextMenu.y, window.innerHeight - 320)}
            items={items}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}
    </div>
  );
}
