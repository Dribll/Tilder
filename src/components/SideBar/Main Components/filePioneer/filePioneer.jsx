import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { List } from 'react-window';

import OutlineView from '../OutlineView/OutlineView.jsx';
import { resolveFileIcon, resolveFolderIcon } from '../../../../core/iconTheme.js';
import { revealInExplorer } from '../../../../core/desktopFileApi.js';
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
function TreeNode({ index, style, ariaAttributes, flatNodes, selectedPath, activeTabPath, pendingAction, dragState, callbacks, multiSelected, showMeta }) {
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
  const isDropTarget = isFolder && dragState.dropTarget === node.path && dragState.dragging !== node.path;

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
      await callbacks.toggleFolder(node.path);
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
    dragState.dragging === node.path ? 'fp-node--dragging' : '',
  ].filter(Boolean).join(' ');

  const indentPx = depth * 16 + 8;
  const isMultiSel = multiSelected?.has(node.path);

  return (
      <div
        className={rowClass}
        tabIndex={0}
        style={{ ...style, paddingLeft: `${indentPx}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        draggable={!isRenaming}
        onDragStart={e => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', node.path);
          // Create a drag ghost image
          const ghost = document.createElement('div');
          ghost.className = 'fp-drag-ghost';
          const dragCount = (isMultiSel && multiSelected.size > 1) ? multiSelected.size : 1;
          ghost.textContent = dragCount > 1 ? `${dragCount} items` : node.name;
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, -10, -10);
          setTimeout(() => {
            if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          }, 0);
          
          callbacks.setDragging(node.path);
        }}
        onDragEnd={() => callbacks.setDragging(null)}
        onDragOver={e => {
          if (!isFolder) return;
          const src = dragState.dragging;
          if (!src || src === node.path || node.path.startsWith(`${src}/`)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          callbacks.setDropTarget(node.path);
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            callbacks.setDropTarget(null);
          }
        }}
        onDrop={async e => {
          if (!isFolder) return;
          e.preventDefault();
          e.stopPropagation();
          const src = e.dataTransfer.getData('text/plain') || dragState.dragging;
          callbacks.setDragging(null);
          callbacks.setDropTarget(null);
          if (src && src !== node.path && !node.path.startsWith(`${src}/`)) {
            await callbacks.moveNode(src, node.path);
          }
        }}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          if (!isMultiSel) callbacks.selectNode(node.path);
          callbacks.openContextMenu(e, node);
        }}
      >
        <div className="fp-node-main">
          {/* Multi-select checkbox */}
          {multiSelected && (
            <div className={`fp-node-checkbox${isMultiSel ? ' fp-node-checkbox--checked' : ''}`}
                 onClick={e => { e.stopPropagation(); callbacks.toggleMultiSelect(node.path); }}>
              {isMultiSel && <i className="fa-solid fa-check" />}
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
                ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 13 }} />
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
            <span className="fp-node-name">{node.name}</span>
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
                    <i className="fa-regular fa-file" />
                  </button>
                  <button
                    type="button"
                    className="fp-action-btn"
                    title="New Folder"
                    onClick={() => callbacks.startCreate(node.path, 'folder')}
                  >
                    <i className="fa-solid fa-folder-plus" />
                  </button>
                </>
              )}
              <button
                type="button"
                className="fp-action-btn"
                title="Rename"
                onClick={() => callbacks.startRename(node)}
              >
                <i className="fa-solid fa-pen" />
              </button>
              <button
                type="button"
                className="fp-action-btn fp-action-btn--danger"
                title="Delete"
                onClick={() => callbacks.deleteNode(node)}
              >
                <i className="fa-solid fa-trash" />
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
        <i className="fa-solid fa-xmark" />
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
          <i className="fa-regular fa-folder-open" />
        </div>
        <h3 className="fp-empty-title">No Folder Opened</h3>
        <p className="fp-empty-desc">Open a project folder or create a new file to start editing.</p>
        <div className="fp-empty-actions">
          <button type="button" className="fp-empty-btn fp-empty-btn--primary" onClick={onOpenFolder}>
            <i className="fa-regular fa-folder-open" /> Open Folder
          </button>
          <button type="button" className="fp-empty-btn fp-empty-btn--secondary" onClick={onAddFolder}>
            <i className="fa-solid fa-folder-tree" /> Add Folder
          </button>
          <button type="button" className="fp-empty-btn fp-empty-btn--secondary" onClick={onNewFile}>
            <i className="fa-regular fa-file" /> New File
          </button>
          <button type="button" className="fp-empty-btn fp-empty-btn--secondary" onClick={onNewFolder}>
            <i className="fa-solid fa-folder-plus" /> New Folder
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─────────────────────── Main FilePioneer Export ─────────────────────── */
export default function FilePioneer({
  workspace,
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
  revealActiveFile,
  copyPath,
  copyRelativePath,
  openToSide,
  handleOpenInTerminal,
  onExplainWithAI,
}) {
  const [pendingAction, setPendingAction] = useState(null); // { mode:'create'|'rename', parentPath, type, path, realPath }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, node }
  const [dragState, setDragStateRaw] = useState({ dragging: null, dropTarget: null });
  const [search, setSearch] = useState('');
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [trashExpanded, setTrashExpanded] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  
  const [multiSelected, setMultiSelected] = useState(new Set());
  const [showMeta, setShowMeta] = useState(false);

  const scrollRef = useRef(null);
  const savedScroll = useRef(0);
  const listRef = useRef(null);



  /* ── Derived tree data ── */
  const treeRoots = workspace.tree || [];
  const isSingleRoot = treeRoots.length === 1 && treeRoots[0]?.type === 'folder';
  // In single-root mode, show root folder's children directly (VS Code style)
  const displayNodes = isSingleRoot ? (treeRoots[0]?.children || []) : treeRoots;
  const sectionLabel = isSingleRoot ? (treeRoots[0]?.name || 'FILES').toUpperCase() : 'FILES';
  const selectedPath = workspace.selectedNodePath;
  const tabs = workspace.tabs || [];

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
  }, [displayNodes, search]);

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
  }, [filteredNodes, pendingAction]);

  // Scroll the selected item into view using react-window's scrollToRow
  useEffect(() => {
    if (!listRef.current || !selectedPath || !Array.isArray(flatNodes)) return;
    const idx = flatNodes.findIndex(item => !item.isInlineInput && item.node?.path === selectedPath);
    if (idx >= 0) {
      listRef.current.scrollToRow({ index: idx, align: 'smart' });
    }
  // flatNodes is intentionally excluded — we only want to scroll when selection changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);

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
    const ok = await confirmDelete(node);
    if (!ok) return;

    // Close tabs associated with this node or its children to prevent auto-save from recreating the file
    if (workspace.tabs) {
      workspace.tabs.forEach(t => {
        if (t.path && (t.path === node.path || t.path.startsWith(node.path + '/'))) {
          workspace.closeTab(t.id);
          if (forceCloseTab) forceCloseTab(t.id);
          else closeTab?.(t.id);
        }
      });
    }

    // Untitled workspaces don't support safe renaming for external handles without prompting.
    // Bypass soft-delete and permanently delete immediately.
    if (!workspace.rootHandle && !workspace.rootSystemPath) {
      try {
        await workspace.deleteNode(node.path);
        refresh();
        pushNotification?.(`Deleted "${node.name}".`, 'info');
      } catch (err) {
        console.error('Could not delete:', err);
        pushNotification?.('Could not delete item.', 'error');
      }
      return;
    }

    const trashName = `${node.name}.tildertrash_${Date.now()}`;
    const parentPath = workspace.findParentPath?.(node.path) || 'root';
    const trashPath = parentPath === 'root' ? trashName : `${parentPath}/${trashName}`;

    try {
      await workspace.renameNode(node.path, trashName);
      refresh();
    } catch (err) {
      console.error('Could not soft delete:', err);
      pushNotification?.('Could not delete item.', 'error');
      return;
    }

    // Create undo entry
    const undoId = Date.now();
    const timer = setTimeout(async () => {
      setUndoStack(prev => prev.filter(u => u.id !== undoId));
      try {
        await workspace.deleteNode(trashPath);
      } catch(e) { console.error('Failed permanent delete', e); }
      refresh();
    }, 5000);

    setUndoStack(prev => [...prev, { id: undoId, nodeName: node.name, trashPath, originalPath: node.path, timer }]);
    pushNotification?.(`Deleted "${node.name}". Press Ctrl+Z or click Undo to restore.`, 'warning');
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
    if (!clipboard) return;
    const n = workspace.findNode(selectedPath);
    const targetPath = (n?.type === 'folder' || selectedPath === 'root') ? selectedPath : (workspace.findParentPath?.(selectedPath) || 'root');

    if (clipboard.action === 'cut') {
      await moveNode(clipboard.node.path, targetPath);
      setClipboard(null);
    } else {
      const dup = await workspace.duplicateNode(clipboard.node.path);
      if (dup && workspace.findParentPath?.(dup.path) !== targetPath) {
        await workspace.moveNode(dup.path, targetPath);
      }
      refresh();
    }
  }

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
        const sel = workspace.findNode(selectedPath);
        if (sel && sel.path !== 'root') {
          setClipboard({ node: sel, action: 'cut' });
          pushNotification?.(`Cut "${sel.name}".`, 'info');
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const sel = workspace.findNode(selectedPath);
        if (sel && sel.path !== 'root') {
          setClipboard({ node: sel, action: 'copy' });
          pushNotification?.(`Copied "${sel.name}".`, 'info');
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
  }, [undoStack, clipboard, selectedPath]);

  /* ── Move / Duplicate ── */
  async function moveNode(srcPath, destPath) {
    const moved = await workspace.moveNode(srcPath, destPath);
    if (moved) { pushNotification?.(`Moved ${moved.name}.`, 'info'); refresh(); }
    else pushNotification?.('Could not move that item here.', 'warning');
  }

  async function duplicateNode(path) {
    const dup = await workspace.duplicateNode(path);
    if (dup) { pushNotification?.(`Duplicated ${dup.name}.`, 'info'); refresh(); }
    else pushNotification?.('Could not duplicate that item.', 'warning');
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
      case 'cut':
        if (n && path !== 'root') {
          setClipboard({ node: n, action: 'cut' });
          pushNotification?.(`Cut "${n.name}".`, 'info');
        }
        return;
      case 'copy':
        if (n && path !== 'root') {
          setClipboard({ node: n, action: 'copy' });
          pushNotification?.(`Copied "${n.name}".`, 'info');
        }
        return;
      case 'paste':
        await handlePaste();
        return;
      case 'duplicate':
        if (n) await duplicateNode(path);
        return;
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
        if (node?.nativePath) revealInExplorer(node.nativePath);
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
    moveNode,
    duplicateNode,
    openContextMenu,
    setDragging,
    setDropTarget,
    toggleMultiSelect,
  }), [workspace, refresh, pendingAction]);

  /* ── Context menu derived state ── */
  const ctxNode = contextMenu?.node;
  const canCreateInside = ctxNode?.type === 'folder' || ctxNode?.path === 'root' || !ctxNode;
  const canRenameDelete = ctxNode?.path && ctxNode.path !== 'root';

  // Determine whether to show tree section (either we have content, or there's a pending create action that created a draft root)
  const showTreeSection = hasTreeContent || (pendingAction?.mode === 'create');

  /* ─────────────── RENDER ─────────────── */
  return (
    <div id="filepioneerarea" className={`fp-shell sidebarscontent d-${ariaExpandedisplayfilepioneer}`}>

      {/* Header */}
      <div className="fp-header">
        <p className="fp-eyebrow">Explorer</p>

        {/* Toolbar */}
        <div className="fp-toolbar">
          <button type="button" className="fp-toolbar-btn" title="New File" onClick={handleNewFile}>
            <i className="fa-regular fa-file" />
          </button>
          <button type="button" className="fp-toolbar-btn" title="New Folder" onClick={handleNewFolder}>
            <i className="fa-solid fa-folder-plus" />
          </button>
          <button type="button" className="fp-toolbar-btn" title="Add Folder to Workspace" onClick={handleAddFolderClick}>
            <i className="fa-solid fa-folder-tree" />
          </button>
          <button type="button" className="fp-toolbar-btn" title="Open Folder" onClick={handleOpenFolderClick}>
            <i className="fa-regular fa-folder-open" />
          </button>
          {hasTreeContent && (
            <>
              <button type="button" className="fp-toolbar-btn" title="Refresh" onClick={handleRefresh}>
                <i className="fa-solid fa-rotate-right" />
              </button>
              <button type="button" className="fp-toolbar-btn" title="Collapse All" onClick={handleCollapseAll}>
                <i className="fa-solid fa-angles-up" />
              </button>
            </>
          )}
          {undoStack.length > 0 && (
            <button type="button" className="fp-toolbar-btn" title={`Undo Delete (${undoStack.length})`} onClick={undoLastDelete}
              style={{ color: '#ffb300' }}>
              <i className="fa-solid fa-rotate-left" />
            </button>
          )}
          {multiSelected.size > 0 && (
            <button type="button" className="fp-toolbar-btn fp-multi-clear-btn" title={`Clear Selection (${multiSelected.size})`} onClick={clearMultiSelect}>
              <i className="fa-solid fa-square-minus" style={{ color: '#ff5252' }} />
            </button>
          )}
          <button type="button" className={`fp-toolbar-btn ${showMeta ? 'active' : ''}`} title="Toggle Metadata" onClick={() => setShowMeta(v => !v)}>
            <i className="fa-solid fa-circle-info" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="fp-search-bar">
        <i className="fa-solid fa-magnifying-glass fp-search-icon" />
        <input
          type="text"
          className="fp-search-input"
          placeholder="Search files..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="fp-search-clear" onClick={() => setSearch('')}>
            <i className="fa-solid fa-xmark" />
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
            <i className="fa-solid fa-shield-halved" style={{ color: '#ffb300' }} />
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
          <div className="fp-section-label">{sectionLabel}</div>

          {/* Virtualized file tree */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
            onDragOver={e => { if (dragState.dragging) { e.preventDefault(); setDropTarget('root'); } }}
            onDrop={async e => {
              e.preventDefault();
              const src = e.dataTransfer.getData('text/plain') || dragState.dragging;
              setDragging(null); setDropTarget(null);
              if (src) await moveNode(src, treeRoots[0]?.path || 'root');
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
                        <List
                  listRef={listRef}
                  className="fp-tree-list"
                  rowCount={flatNodes.length}
                  rowHeight={32}
                  rowComponent={TreeNode}
                  rowProps={{
                    flatNodes,
                    selectedPath,
                    activeTabPath: activeTabId,
                    pendingAction,
                    dragState,
                    callbacks,
                    multiSelected,
                    showMeta
                  }}
                  style={{ overflowX: 'hidden', flex: 1 }}
                />
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
            <i className={`fa-solid fa-chevron-${outlineExpanded ? 'down' : 'right'}`} style={{ marginRight: '8px', fontSize: '10px', width: '12px', textAlign: 'center' }}></i>
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
            <i className={`fa-solid fa-chevron-${trashExpanded ? 'down' : 'right'}`} style={{ marginRight: '8px', fontSize: '10px', width: '12px', textAlign: 'center' }}></i>
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
        if (canRenameDelete) {
          items.push({ label: 'Rename', icon: 'fa-solid fa-pen', onClick: () => handleContextAction('rename'), shortcut: 'F2' });
          items.push({ label: 'Duplicate', icon: 'fa-regular fa-copy', onClick: () => handleContextAction('duplicate') });
          items.push({ label: 'Delete', icon: 'fa-solid fa-trash', danger: true, onClick: () => handleContextAction('delete'), shortcut: 'Del' });
          items.push({ separator: true });
        }
        if (contextMenu.node?.path !== 'root') {
          items.push({ label: 'Copy Path', icon: 'fa-regular fa-clipboard', onClick: () => handleContextAction('copy-path') });
          items.push({ label: 'Copy Relative Path', icon: 'fa-solid fa-link', onClick: () => handleContextAction('copy-relative-path') });
          items.push({ separator: true });
          items.push({ label: 'Reveal in File Explorer', icon: 'fa-solid fa-arrow-up-right-from-square', onClick: () => handleContextAction('reveal-in-explorer') });
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
