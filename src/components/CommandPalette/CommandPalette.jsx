import React, { useEffect, useMemo, useState } from 'react';
import { getSearchPool } from '../../core/searchUtils.js';

export default function CommandPalette({ isOpen, commands, workspace, onClose, onRunCommand }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommandIds, setRecentCommandIds] = useState(() => {
    try {
      const saved = localStorage.getItem('tilderRecentCommands');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const filteredCommands = useMemo(() => {
    const rawQuery = query.trim();
    const isCommandMode = rawQuery.startsWith('>');
    const normalizedQuery = isCommandMode ? rawQuery.slice(1).trim().toLowerCase() : rawQuery.toLowerCase();

    if (!isCommandMode && workspace) {
      const pool = getSearchPool(workspace, 'workspace');
      let fileCommands = pool.map(entry => ({
        id: 'file:' + entry.path,
        type: 'file',
        label: entry.name,
        path: entry.path,
        category: entry.path
      }));

      if (normalizedQuery) {
        fileCommands = fileCommands.filter(c => c.path.toLowerCase().includes(normalizedQuery));
      }

      // Exact matches first
      fileCommands.sort((a, b) => {
        if (a.label.toLowerCase() === normalizedQuery) return -1;
        if (b.label.toLowerCase() === normalizedQuery) return 1;
        return a.label.length - b.label.length;
      });

      return fileCommands.slice(0, 100);
    }

    const rankedCommands = [...commands].sort((left, right) => {
      const leftIndex = recentCommandIds.indexOf(left.id);
      const rightIndex = recentCommandIds.indexOf(right.id);

      if (leftIndex === -1 && rightIndex === -1) {
        return left.label.localeCompare(right.label);
      }

      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      return leftIndex - rightIndex;
    });

    if (!normalizedQuery) {
      return rankedCommands;
    }

    return rankedCommands.filter((command) =>
      [command.label, command.category, command.id, command.bindingLabel || '', ...(command.keywords || [])]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [commands, query, recentCommandIds, workspace]);

  useEffect(() => {
    localStorage.setItem('tilderRecentCommands', JSON.stringify(recentCommandIds.slice(0, 12)));
  }, [recentCommandIds]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(filteredCommands.length - 1, current + 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (event.key === 'Enter' && filteredCommands[selectedIndex]) {
        event.preventDefault();
        onRunCommand(filteredCommands[selectedIndex]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, isOpen, onClose, onRunCommand, selectedIndex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) {
    return null;
  }

  function runCommand(command) {
    setRecentCommandIds((current) => [command.id, ...current.filter((entry) => entry !== command.id)].slice(0, 12));
    onRunCommand(command);
  }

  return (
    <div className="command-palette-overlay" onMouseDown={onClose}>
      <div className="command-palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-palette-input-row">
          <input
            type="text"
            className="command-palette-input"
            placeholder="Search files, run commands (start with >), calculate, etc."
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="command-palette-list">
          {filteredCommands.map((command, index) => (
            <button
              key={command.id}
              type="button"
              className={`command-palette-item ${index === selectedIndex ? 'active' : ''}`}
              onClick={() => runCommand(command)}
            >
              <div className="command-palette-item-main">
                <div className="command-palette-item-label-row">
                  <div className="command-palette-item-label">
                    {command.type === 'file' ? <i className="fa-regular fa-file" style={{marginRight: '8px', opacity: 0.7}}></i> : null}
                    {command.label}
                  </div>
                  {recentCommandIds.includes(command.id) && !query.trim() ? (
                    <span className="command-palette-item-recent">recently used</span>
                  ) : null}
                </div>
                <div className="command-palette-item-meta">
                  {command.type === 'file' ? command.path : command.id}
                </div>
              </div>
              <div className="command-palette-item-side">
                <div className="command-palette-item-category">{command.category}</div>
                {command.bindingLabel ? <div className="command-palette-item-binding">{command.bindingLabel}</div> : null}
              </div>
            </button>
          ))}
          {!filteredCommands.length ? <div className="command-palette-empty">No commands found.</div> : null}
        </div>
      </div>
    </div>
  );
}
