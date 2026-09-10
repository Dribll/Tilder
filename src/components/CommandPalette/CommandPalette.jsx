import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CommandPalette.css';
import { getSearchPool } from '../../core/searchUtils.js';

// ─── File icon map (extension → color + icon) ─────────────────────────────
const FILE_ICONS = {
  // Web
  html:  { icon: 'fa-html5',          fab: true,  color: '#e34c26' },
  css:   { icon: 'fa-css3-alt',        fab: true,  color: '#264de4' },
  scss:  { icon: 'fa-sass',            fab: true,  color: '#cc6699' },
  sass:  { icon: 'fa-sass',            fab: true,  color: '#cc6699' },
  less:  { icon: 'fa-circle',          fab: false, color: '#1d365d' },
  // JS / TS
  js:    { icon: 'fa-square-js',       fab: true,  color: '#f7df1e' },
  jsx:   { icon: 'fa-react',           fab: true,  color: '#61dafb' },
  ts:    { icon: 'fa-code',            fab: false, color: '#3178c6' },
  tsx:   { icon: 'fa-react',           fab: true,  color: '#3178c6' },
  mjs:   { icon: 'fa-square-js',       fab: true,  color: '#f7df1e' },
  cjs:   { icon: 'fa-square-js',       fab: true,  color: '#cbcb41' },
  // Python / Ruby / Go / Rust
  py:    { icon: 'fa-python',          fab: true,  color: '#3572A5' },
  rb:    { icon: 'fa-gem',             fab: false, color: '#CC342D' },
  go:    { icon: 'fa-code',            fab: false, color: '#00ADD8' },
  rs:    { icon: 'fa-code',            fab: false, color: '#CE422B' },
  // Java / C#
  java:  { icon: 'fa-java',            fab: true,  color: '#b07219' },
  cs:    { icon: 'fa-code',            fab: false, color: '#178600' },
  cpp:   { icon: 'fa-code',            fab: false, color: '#f34b7d' },
  c:     { icon: 'fa-code',            fab: false, color: '#555555' },
  h:     { icon: 'fa-code',            fab: false, color: '#c89c4a' },
  // Config / Data
  json:  { icon: 'fa-brackets-curly',  fab: false, color: '#cbcb41' },
  yaml:  { icon: 'fa-sliders',         fab: false, color: '#cc1018' },
  yml:   { icon: 'fa-sliders',         fab: false, color: '#cc1018' },
  toml:  { icon: 'fa-sliders',         fab: false, color: '#9c4221' },
  xml:   { icon: 'fa-file-code',       fab: false, color: '#ff6600' },
  env:   { icon: 'fa-gear',            fab: false, color: '#ecd53f' },
  // Docs
  md:    { icon: 'fa-markdown',        fab: true,  color: '#519aba' },
  mdx:   { icon: 'fa-markdown',        fab: true,  color: '#519aba' },
  txt:   { icon: 'fa-file-lines',      fab: false, color: '#89a0b0' },
  pdf:   { icon: 'fa-file-pdf',        fab: false, color: '#f40f02' },
  // Images
  png:   { icon: 'fa-file-image',      fab: false, color: '#a074c4' },
  jpg:   { icon: 'fa-file-image',      fab: false, color: '#a074c4' },
  jpeg:  { icon: 'fa-file-image',      fab: false, color: '#a074c4' },
  gif:   { icon: 'fa-file-image',      fab: false, color: '#a074c4' },
  svg:   { icon: 'fa-bezier-curve',    fab: false, color: '#ffb13b' },
  webp:  { icon: 'fa-file-image',      fab: false, color: '#a074c4' },
  ico:   { icon: 'fa-file-image',      fab: false, color: '#cbcb41' },
  // Shell / Config
  sh:    { icon: 'fa-terminal',        fab: false, color: '#89e051' },
  bash:  { icon: 'fa-terminal',        fab: false, color: '#89e051' },
  ps1:   { icon: 'fa-terminal',        fab: false, color: '#012456' },
  gitignore: { icon: 'fa-code-branch', fab: false, color: '#f54d27' },
  // Default
  _default: { icon: 'fa-file',         fab: false, color: '#89a0b0' },
};

function FileIcon({ name }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const special = name.toLowerCase().startsWith('.git') ? 'gitignore' : null;
  const cfg = FILE_ICONS[special || ext] || FILE_ICONS._default;
  const prefix = cfg.fab ? 'fa-brands' : 'fa-solid';
  return (
    <span className="cp-file-icon" style={{ color: cfg.color }}>
      <i className={`${prefix} ${cfg.icon}`}></i>
    </span>
  );
}

// ─── Mode detection ────────────────────────────────────────────────────────
function detectMode(query) {
  if (query.startsWith('>')) return { mode: 'command', q: query.slice(1).trim() };
  if (query.startsWith('@')) return { mode: 'symbol',  q: query.slice(1).trim() };
  if (query.startsWith('#')) return { mode: 'workspace-symbol', q: query.slice(1).trim() };
  if (query.startsWith(':')) return { mode: 'line',    q: query.slice(1).trim() };
  if (query.startsWith('?')) return { mode: 'help',    q: query.slice(1).trim() };
  return { mode: 'file', q: query.trim() };
}

const MODE_HINTS = [
  { prefix: '>', label: 'Run Command',        example: '>format document' },
  { prefix: '@', label: 'Go to Symbol',       example: '@myFunction' },
  { prefix: '#', label: 'Workspace Symbols',  example: '#handleClick' },
  { prefix: ':', label: 'Go to Line',         example: ':42' },
  { prefix: '?', label: 'Help',               example: '?' },
];

export default function CommandPalette({
  isOpen, commands = [], workspace, onClose, onRunCommand,
  onGoToLine, onGoToSymbolInEditor, onGoToSymbolInWorkspace,
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const [recentCommandIds, setRecentCommandIds] = useState(() => {
    try {
      const saved = localStorage.getItem('tilderRecentCommands');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });

  const { mode, q } = useMemo(() => detectMode(query), [query]);

  const items = useMemo(() => {
    if (mode === 'help') {
      return MODE_HINTS.map((h, i) => ({ id: 'help-' + i, type: 'help', ...h }));
    }

    if (mode === 'file') {
      const pool = workspace ? getSearchPool(workspace, 'workspace') : [];
      let files = pool.map(e => ({
        id: 'file:' + e.path, type: 'file', label: e.name, path: e.path,
      }));
      if (q) {
        const ql = q.toLowerCase();
        files = files.filter(f => f.path.toLowerCase().includes(ql));
      }
      files.sort((a, b) => {
        const al = a.label.toLowerCase(), bl = b.label.toLowerCase();
        const ql2 = q.toLowerCase();
        if (al === ql2) return -1;
        if (bl === ql2) return 1;
        if (al.startsWith(ql2) && !bl.startsWith(ql2)) return -1;
        if (!al.startsWith(ql2) && bl.startsWith(ql2)) return 1;
        return a.label.length - b.label.length;
      });
      return files.slice(0, 80);
    }

    if (mode === 'command') {
      const ranked = [...(commands || [])].sort((a, b) => {
        const ai = recentCommandIds.indexOf(a.id);
        const bi = recentCommandIds.indexOf(b.id);
        if (ai === -1 && bi === -1) return (a.label || '').localeCompare(b.label || '');
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      if (!q) return ranked;
      const ql = q.toLowerCase();
      return ranked.filter(c =>
        [c.label, c.category, c.id, c.bindingLabel || '', ...(c.keywords || [])]
          .join(' ').toLowerCase().includes(ql)
      );
    }

    if (mode === 'line') {
      const lineNum = parseInt(q, 10);
      if (!isNaN(lineNum)) {
        return [{ id: 'goto-line', type: 'line', label: `Go to line ${lineNum}`, lineNum }];
      }
      return [{ id: 'goto-line-hint', type: 'hint', label: 'Type a line number to jump to it' }];
    }

    return [];
  }, [mode, q, commands, workspace, recentCommandIds]);

  useEffect(() => setSelectedIndex(0), [query]);

  useEffect(() => {
    localStorage.setItem('tilderRecentCommands', JSON.stringify(recentCommandIds.slice(0, 12)));
  }, [recentCommandIds]);

  useEffect(() => {
    if (!isOpen) { setQuery(''); setSelectedIndex(0); return; }
    setTimeout(() => inputRef.current?.focus(), 0);

    const handleKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(items.length - 1, i + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(0, i - 1)); return; }
      if (e.key === 'Enter' && items[selectedIndex]) {
        e.preventDefault();
        runItem(items[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, items, selectedIndex, onClose]);

  if (!isOpen) return null;

  function runItem(item) {
    if (item.type === 'file') {
      setRecentCommandIds(prev => [item.id, ...prev.filter(x => x !== item.id)].slice(0, 12));
      onRunCommand(item);
    } else if (item.type === 'line' && item.lineNum && onGoToLine) {
      onClose();
      onGoToLine(item.lineNum);
    } else if (item.type === 'help') {
      setQuery(item.prefix);
    } else {
      setRecentCommandIds(prev => [item.id, ...prev.filter(x => x !== item.id)].slice(0, 12));
      onRunCommand(item);
    }
  }

  const modeLabel = {
    file: null,
    command: <span className="cp-mode-tag cmd"><i className="fa-solid fa-terminal"></i> Commands</span>,
    symbol: <span className="cp-mode-tag sym"><i className="fa-solid fa-at"></i> Symbols</span>,
    line: <span className="cp-mode-tag line"><i className="fa-solid fa-arrow-right"></i> Go to line</span>,
    help: <span className="cp-mode-tag help"><i className="fa-solid fa-circle-question"></i> Help</span>,
  }[mode];

  return (
    <div className="cp-overlay" onMouseDown={onClose}>
      <div className="cp-panel" onMouseDown={e => e.stopPropagation()}>
        {/* Input */}
        <div className="cp-input-row">
          <i className="fa-solid fa-magnifying-glass cp-search-icon"></i>
          <input
            ref={inputRef}
            type="text"
            className="cp-input"
            placeholder="Search files, run commands (>), go to line (:), help (?)"
            value={query}
            autoFocus
            spellCheck={false}
            onChange={e => setQuery(e.target.value)}
          />
          {modeLabel}
          {query && <button className="cp-clear" onClick={() => setQuery('')}><i className="fa-solid fa-xmark"></i></button>}
        </div>

        {/* Mode hints bar */}
        {!query && (
          <div className="cp-hints-bar">
            {MODE_HINTS.map(h => (
              <button key={h.prefix} className="cp-hint-pill" onClick={() => { setQuery(h.prefix); inputRef.current?.focus(); }}>
                <code>{h.prefix}</code> {h.label}
              </button>
            ))}
          </div>
        )}

        {/* Results list */}
        <div className="cp-list">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`cp-item ${i === selectedIndex ? 'cp-active' : ''}`}
              onClick={() => runItem(item)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              {item.type === 'file' && (
                <>
                  <FileIcon name={item.label} />
                  <div className="cp-item-text">
                    <span className="cp-item-name">{item.label}</span>
                    <span className="cp-item-path">{item.path}</span>
                  </div>
                  <span className="cp-item-ext">{item.label.split('.').pop()?.toUpperCase()}</span>
                </>
              )}
              {item.type === 'help' && (
                <>
                  <span className="cp-help-prefix"><code>{item.prefix}</code></span>
                  <div className="cp-item-text">
                    <span className="cp-item-name">{item.label}</span>
                    <span className="cp-item-path">e.g. {item.example}</span>
                  </div>
                  <i className="fa-solid fa-chevron-right cp-item-arrow"></i>
                </>
              )}
              {(item.type === 'command' || !['file','help','line','hint'].includes(item.type)) && (
                <>
                  <span className="cp-cmd-icon"><i className="fa-solid fa-terminal"></i></span>
                  <div className="cp-item-text">
                    <span className="cp-item-name">{item.label}</span>
                    {item.category ? <span className="cp-item-path">{item.category}</span> : null}
                  </div>
                  <div className="cp-item-side">
                    {recentCommandIds.includes(item.id) && !query.trim() ? <span className="cp-recent">recent</span> : null}
                    {item.bindingLabel ? <kbd className="cp-kbd">{item.bindingLabel}</kbd> : null}
                  </div>
                </>
              )}
              {item.type === 'line' && (
                <>
                  <span className="cp-cmd-icon"><i className="fa-solid fa-arrow-right"></i></span>
                  <div className="cp-item-text"><span className="cp-item-name">{item.label}</span></div>
                </>
              )}
              {item.type === 'hint' && (
                <div className="cp-item-text"><span className="cp-item-path">{item.label}</span></div>
              )}
            </button>
          ))}
          {items.length === 0 && query && (
            <div className="cp-empty">
              <i className="fa-solid fa-face-meh"></i>
              <span>No results for <strong>{query}</strong></span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cp-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
          <span className="cp-footer-spacer"></span>
          <span className="cp-footer-tip">Type <code>&gt;</code> for commands</span>
        </div>
      </div>
    </div>
  );
}
