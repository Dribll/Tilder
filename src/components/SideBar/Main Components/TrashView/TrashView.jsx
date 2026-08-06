import React, { useState, useEffect } from 'react';
import { resolveFileIcon, resolveFolderIcon } from '../../../../core/iconTheme.js';

export default function TrashView({ workspace, ariaExpanded, refreshWorkspace }) {
  const [trashItems, setTrashItems] = useState([]);
  const isVisible = ariaExpanded === 'flex';

  useEffect(() => {
    if (!isVisible || !workspace?.tree) {
      setTrashItems([]);
      return;
    }

    const items = [];

    const traverse = (node) => {
      if (!node) return;
      if (node.name?.includes('.tildertrash_')) {
        items.push(node);
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(traverse);
      }
    };

    if (Array.isArray(workspace.tree)) {
      workspace.tree.forEach(traverse);
    } else {
      traverse(workspace.tree);
    }

    setTrashItems(items);
  }, [isVisible, workspace, workspace?.tree]);

  const handleRestore = async (e, node) => {
    e.stopPropagation();
    if (!node?.name || !node?.path) return;
    const originalName = node.name.split('.tildertrash_')[0];
    if (!originalName) return;

    // Safety check: ensure a file with the original name doesn't already exist in the same location
    const parentPath = workspace.findParentPath?.(node.path) || 'root';
    const parentNode = parentPath === 'root' ? workspace.getRootNode() : workspace.findNode(parentPath);
    const siblings = parentPath === 'root' ? (workspace.tree || []) : (parentNode?.children || []);
    
    if (siblings.some(c => c.name === originalName)) {
      alert(`Cannot restore: a file or folder named "${originalName}" already exists in this location.`);
      return;
    }

    try {
      await workspace.renameNode(node.path, originalName);
    } catch (err) {
      console.error('Restore failed:', err);
    }
    refreshWorkspace?.();
  };

  const handleDelete = async (e, node) => {
    e.stopPropagation();
    if (!node?.path) return;
    try {
      await workspace.deleteNode(node.path);
    } catch (err) {
      console.error('Permanent delete failed:', err);
    }
    refreshWorkspace?.();
  };

  if (!isVisible) return null;

  if (trashItems.length === 0) {
    return (
      <div style={{
        padding: '12px 16px',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '11px',
        textAlign: 'center',
        fontStyle: 'italic'
      }}>
        No recently deleted items.
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {trashItems.map((item) => {
        const originalName = (item.name || '').split('.tildertrash_')[0];
        const isFolder = item.type === 'folder';
        const visual = isFolder ? resolveFolderIcon(originalName) : resolveFileIcon(originalName);
        const Icon = isFolder ? visual.Icon : visual.Icon;

        return (
          <div key={item.path} className="fp-node" style={{ paddingLeft: '8px' }}>
            <span className="fp-node-icon" style={{ color: visual.color }}>
              <Icon className="fp-icon-svg" />
            </span>
            <span className="fp-node-name" style={{ color: 'rgba(255,255,255,0.6)' }} title={originalName}>
              {originalName}
            </span>
            
            <div className="fp-node-actions">
              <button
                type="button"
                className="fp-action-btn"
                title="Restore"
                onClick={(e) => handleRestore(e, item)}
              >
                <i className="fa-solid fa-rotate-left" />
              </button>
              <button
                type="button"
                className="fp-action-btn fp-action-btn--danger"
                title="Delete Forever"
                onClick={(e) => handleDelete(e, item)}
              >
                <i className="fa-solid fa-trash" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
