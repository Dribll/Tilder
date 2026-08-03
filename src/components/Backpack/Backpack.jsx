import React, { useState, useCallback, useRef, useEffect } from 'react';

const BACKPACK_STORAGE_KEY = 'tilder-backpack-snippets';

function loadSnippets() {
  try {
    return JSON.parse(localStorage.getItem(BACKPACK_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveSnippets(snippets) {
  try {
    localStorage.setItem(BACKPACK_STORAGE_KEY, JSON.stringify(snippets));
  } catch {}
}

function truncatePreview(text, maxLen = 120) {
  const single = String(text || '').replace(/\s+/g, ' ').trim();
  return single.length > maxLen ? single.slice(0, maxLen) + '…' : single;
}

export default function Backpack({ ariaExpandedDisplayBackpack, onInsertSnippet, onSaveSelection, snippets = [], onChange }) {
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const dropZoneRef = useRef(null);

  const persist = useCallback((next) => {
    if (onChange) {
      onChange(next);
    } else {
      saveSnippets(next);
    }
  }, [onChange]);

  // Helper to add a snippet from text
  const addSnippetFromText = useCallback((text) => {
    if (!text || !text.trim()) return false;
    const lineCount = text.split('\n').length;
    const newSnippet = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `Snippet ${snippets.length + 1}`,
      code: text,
      language: '',
      createdAt: Date.now(),
      lines: lineCount,
    };
    persist([newSnippet, ...snippets]);
    return true;
  }, [snippets, persist]);

  
  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snippets, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "backpack.json");
    dlAnchorElem.click();
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (Array.isArray(parsed)) {
            persist(parsed);
          }
        } catch (err) {
          console.error("Invalid backpack JSON", err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // 💾 Save Selection button handler 💾
  function handleSaveSelection() {
    if (!onSaveSelection) return;
    const text = onSaveSelection();
    if (!text) return;
    addSnippetFromText(text);
  }

  // ── Listen for global Monaco drag events ────────────────────────────────
  // Monaco uses its own internal drag. We listen at the document level to 
  // catch text being dragged over the backpack panel.
  useEffect(() => {
    function handleGlobalDragOver(e) {
      if (!dropZoneRef.current) return;
      const rect = dropZoneRef.current.getBoundingClientRect();
      const isOver = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );
      if (isOver) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDropZoneActive(true);
      }
    }

    function handleGlobalDrop(e) {
      if (!dropZoneRef.current) return;
      const rect = dropZoneRef.current.getBoundingClientRect();
      const isOver = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );
      if (isOver) {
        e.preventDefault();
        const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
        addSnippetFromText(text);
        setDropZoneActive(false);
      }
    }

    function handleGlobalDragEnd() {
      setDropZoneActive(false);
    }

    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('drop', handleGlobalDrop);
    document.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('drop', handleGlobalDrop);
      document.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, [addSnippetFromText]);

  // ── Drop zone: accept text dragged from Monaco ──────────────────────────
  function handleDropZoneDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropZoneActive(true);
  }

  function handleDropZoneDragLeave(e) {
    if (!dropZoneRef.current?.contains(e.relatedTarget)) {
      setDropZoneActive(false);
    }
  }

  function handleDropZoneDrop(e) {
    e.preventDefault();
    setDropZoneActive(false);
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
    addSnippetFromText(text);
  }

  // ── Snippet drag-out: back into editor ──────────────────────────────────
  function handleSnippetDragStart(e, snippet) {
    e.dataTransfer.setData('text/plain', snippet.code);
    e.dataTransfer.effectAllowed = 'copy';
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  function deleteSnippet(id) {
    persist(snippets.filter((s) => s.id !== id));
  }

  // ── Rename ──────────────────────────────────────────────────────────────
  function startRename(snippet) {
    setRenamingId(snippet.id);
    setRenameValue(snippet.name);
  }

  function commitRename(id) {
    const trimmed = renameValue.trim();
    if (trimmed) {
      persist(snippets.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
    }
    setRenamingId(null);
  }

  // ── Reorder: drag within list ───────────────────────────────────────────
  const dragSrcIndex = useRef(null);

  function handleItemDragStart(e, index) {
    dragSrcIndex.current = index;
    e.dataTransfer.effectAllowed = 'all';
    // Also set text so you can still drag-out to editor
    e.dataTransfer.setData('text/plain', snippets[index].code);
  }

  function handleItemDragOver(e, index) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleItemDrop(e, targetIndex) {
    e.preventDefault();
    const src = dragSrcIndex.current;
    if (src === null || src === targetIndex) {
      setDragOverIndex(null);
      return;
    }
    const next = [...snippets];
    const [moved] = next.splice(src, 1);
    next.splice(targetIndex, 0, moved);
    persist(next);
    dragSrcIndex.current = null;
    setDragOverIndex(null);
  }

  if (ariaExpandedDisplayBackpack === 'none') return null;

  return (
    <div 
      className={`backpack-panel ${dropZoneActive ? 'dropzone-active' : ''}`} 
      style={{ display: ariaExpandedDisplayBackpack }}
      ref={dropZoneRef}
      onDragOver={handleDropZoneDragOver}
      onDragLeave={handleDropZoneDragLeave}
      onDrop={handleDropZoneDrop}
    >
      {/* Header */}
      <div className="backpack-header">
        <div className="backpack-header-title">
          <i className="fa-solid fa-bag-shopping" style={{ color: '#a89dff', fontSize: 14 }} />
          <span>Backpack</span>
          <span className="backpack-count">{snippets.length}</span>
        </div>
        <span className="backpack-subtitle">Select code, then click save or drag here.</span>
      </div>

      {/* Save Selection Button */}
      <div style={{ padding: '6px 12px 2px', display: 'flex', gap: '4px' }}>
        <button
          type="button"
          onClick={handleImport}
          title="Import backpack.json"
          style={{
            padding: '6px',
            border: '1px dashed rgba(168, 157, 255, 0.35)',
            borderRadius: 6,
            background: 'rgba(168, 157, 255, 0.08)',
            color: 'rgba(230, 235, 255, 0.75)',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-file-import" style={{ fontSize: 12 }} />
        </button>
        <button
          type="button"
          onClick={handleExport}
          title="Export backpack.json"
          style={{
            padding: '6px',
            border: '1px dashed rgba(168, 157, 255, 0.35)',
            borderRadius: 6,
            background: 'rgba(168, 157, 255, 0.08)',
            color: 'rgba(230, 235, 255, 0.75)',
            cursor: 'pointer'
          }}
        >
          <i className="fa-solid fa-file-export" style={{ fontSize: 12 }} />
        </button>
        <button
          type="button"
          className="backpack-save-selection-btn"
          onClick={handleSaveSelection}
          title="Save the current editor selection to Backpack"
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px dashed rgba(168, 157, 255, 0.35)',
            borderRadius: 6,
            background: 'rgba(168, 157, 255, 0.08)',
            color: 'rgba(230, 235, 255, 0.75)',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(168, 157, 255, 0.18)';
            e.currentTarget.style.borderColor = 'rgba(168, 157, 255, 0.55)';
            e.currentTarget.style.color = '#e6ebff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(168, 157, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(168, 157, 255, 0.35)';
            e.currentTarget.style.color = 'rgba(230, 235, 255, 0.75)';
          }}
        >
          <i className="fa-solid fa-plus" style={{ fontSize: 10 }} />
          Save Selection to Backpack
        </button>
      </div>

      {/* Drop zone visual indicator (always shows when dragging over) */}
      {dropZoneActive && (
        <div className="backpack-dropzone active">
          <i className="fa-solid fa-plus-circle" style={{ fontSize: 20, opacity: 0.6 }} />
          <span>Release to save snippet</span>
        </div>
      )}

      {/* Snippets list */}
      <div className="backpack-list">
        {snippets.length === 0 && (
          <div className="backpack-empty">
            <i className="fa-solid fa-inbox" style={{ fontSize: 28, opacity: 0.3 }} />
            <span>Your backpack is empty.</span>
            <span style={{ fontSize: 11, opacity: 0.5 }}>Select code in the editor, then click "Save Selection" above.</span>
          </div>
        )}

        {snippets.map((snippet, index) => (
          <div
            key={snippet.id}
            className={`backpack-item ${dragOverIndex === index ? 'drag-over' : ''}`}
            draggable
            onDragStart={(e) => handleItemDragStart(e, index)}
            onDragOver={(e) => handleItemDragOver(e, index)}
            onDrop={(e) => handleItemDrop(e, index)}
            onDragEnd={() => setDragOverIndex(null)}
          >
            <div className="backpack-item-header">
              {renamingId === snippet.id ? (
                <input
                  autoFocus
                  className="backpack-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(snippet.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(snippet.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <span
                  className="backpack-item-name"
                  onDoubleClick={() => startRename(snippet)}
                  title="Double-click to rename"
                >
                  {snippet.name}
                </span>
              )}
              <div className="backpack-item-actions">
                <button
                  type="button"
                  title="Insert snippet at cursor"
                  className="backpack-action-btn success"
                  style={{ color: '#a89dff' }}
                  onClick={() => onInsertSnippet?.(snippet.code)}
                >
                  <i className="fa-solid fa-paste" style={{ fontSize: 10 }} />
                </button>
                <button
                  type="button"
                  title="Rename snippet"
                  className="backpack-action-btn"
                  onClick={() => startRename(snippet)}
                >
                  <i className="fa-solid fa-pencil" style={{ fontSize: 10 }} />
                </button>
                <button
                  type="button"
                  title="Delete snippet"
                  className="backpack-action-btn danger"
                  onClick={() => deleteSnippet(snippet.id)}
                >
                  <i className="fa-solid fa-trash" style={{ fontSize: 10 }} />
                </button>
              </div>
            </div>
            <div className="backpack-item-meta">
              <span>{snippet.lines} line{snippet.lines !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span>drag to use</span>
            </div>
            <pre
              className="backpack-item-preview"
              onDoubleClick={() => onInsertSnippet?.(snippet.code)}
              title="Double-click to insert at cursor"
            >
              {truncatePreview(snippet.code)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
