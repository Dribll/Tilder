import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debugApi } from '../../../../core/debugApi.js';

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .8.4l7-4.5a.5.5 0 0 0 0-.8l-7-4.5A.5.5 0 0 0 4.5 3z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z" />
  </svg>
);
const StepOverIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M11 3.5a.5.5 0 0 1 .5.5v1.5a2.5 2.5 0 0 1-2.5 2.5H4.207l1.354 1.354a.5.5 0 0 1-.708.708l-2.2-2.2a.5.5 0 0 1 0-.708l2.2-2.2a.5.5 0 0 1 .708.708L4.207 7H9a1.5 1.5 0 0 0 1.5-1.5V4a.5.5 0 0 1 .5-.5z"/>
  </svg>
);
const StepIntoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1a.5.5 0 0 1 .5.5v8.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V1.5A.5.5 0 0 1 8 1zm-6 13.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
  </svg>
);
const StepOutIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 15a.5.5 0 0 1-.5-.5V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707V14.5a.5.5 0 0 1-.5.5zm-6-13.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
  </svg>
);
const RestartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
    <path d="M8 4.5a.5.5 0 0 1 .5-.5V1a.5.5 0 0 1 1 0v3a.5.5 0 0 1-.5.5z"/>
    <path d="M6 3.5a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 1 0v1a.5.5 0 0 1-.5.5z"/>
  </svg>
);
const StopIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="10" height="10" rx="1.5" />
  </svg>
);
const GearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.5.5v1.2l2.5.5.3.8-1.4 1.9.8.8 2-1.4.7.3.5 2.4h1.2l.5-2.4.7-.3 2 1.3.8-.8-1.3-2 .3-.7 2.4-.5V7.6l-2.4-.5-.3-.7 1.3-2-.8-.8-1.9 1.4-.8-.3zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z" />
  </svg>
);
const ClearIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
  </svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
    <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/>
  </svg>
);
const ChevronIcon = ({ open }) => (
  <svg
    width="12" height="12" viewBox="0 0 16 16"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', flexShrink: 0 }}
    fill="none"
  >
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── Custom Glass Checkbox ─────────────────────────────────────────────────────
function GlassCheckbox({ checked, onChange, title }) {
  return (
    <div
      className={`dbg-checkbox${checked ? ' dbg-checkbox--on' : ''}`}
      onClick={(e) => { e.stopPropagation(); onChange?.(e); }}
      role="checkbox"
      aria-checked={checked}
      title={title}
      tabIndex={0}
      onKeyDown={(e) => e.key === ' ' && onChange?.(e)}
    >
      {checked && (
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );
}

// ─── Collapsible Section ───────────────────────────────────────────────────────
function Section({ title, defaultOpen = true, count, actions, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="dbg-section">
      <div className="dbg-section-header" onClick={() => setOpen(v => !v)}>
        <div className="dbg-section-title">
          <ChevronIcon open={open} />
          <span className="dbg-section-label">{title}</span>
          {count != null && count > 0 && <span className="dbg-section-count">{count}</span>}
        </div>
        {actions && (
          <div className="dbg-section-actions" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      {open && <div className="dbg-section-body">{children}</div>}
    </section>
  );
}

// ─── Variable Value Renderer ───────────────────────────────────────────────────
function VarValue({ value, type }) {
  if (value === undefined || value === null) return <span className="dbg-val-nil">None</span>;
  const str = String(value);
  if (type === 'string' || str.startsWith('"') || str.startsWith("'")) {
    const formatted = (str.startsWith('"') || str.startsWith("'")) ? str : `"${str}"`;
    return <span className="dbg-val-string">{formatted}</span>;
  }
  if (type === 'number' || (!isNaN(Number(str)) && str.trim() !== '')) return <span className="dbg-val-number">{str}</span>;
  if (type === 'boolean' || str === 'true' || str === 'false') return <span className="dbg-val-bool">{str}</span>;
  if (str.startsWith('[') || str.startsWith('{')) return <span className="dbg-val-object">{str}</span>;
  if (str.includes('function') || str.includes('=>')) return <span className="dbg-val-fn">{str}</span>;
  return <span className="dbg-val-default">{str}</span>;
}

// ─── Variable Tree Node ────────────────────────────────────────────────────────
function VarNode({ variable, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = variable.children && variable.children.length > 0;
  return (
    <div className="dbg-var-node" style={{ paddingLeft: depth * 12 }}>
      <div
        className={`dbg-var-row${hasChildren ? ' dbg-var-row--expandable' : ''}`}
        onClick={() => hasChildren && setExpanded(v => !v)}
      >
        <span className="dbg-var-arrow">{hasChildren ? (expanded ? '▾' : '▸') : ''}</span>
        <span className="dbg-var-name">{variable.name}</span>
        <span className="dbg-var-sep">:</span>
        <span className="dbg-var-val"><VarValue value={variable.value} type={variable.type} /></span>
        {variable.type && <span className="dbg-var-type">{variable.type}</span>}
      </div>
      {expanded && hasChildren && (
        <div className="dbg-var-children">
          {variable.children.map((child, i) => (
            <VarNode key={`${child.name}-${i}`} variable={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Debug Component ──────────────────────────────────────────────────────
function Debug({
  ariaExpandedisplaydebug,
  activeTab,
  debugSession,
  breakpoints = [],
  callStack = [],
  variables = [],
  watchValues = {},
  onStartDebugging,
  onRunWithoutDebugging,
  onPauseDebugging,
  onContinueDebugging,
  onStopDebugging,
  onRestartDebugging,
  onRunCurrentFile,
  onAddBreakpointAtCursor,
  onClearBreakpoints,
  onRemoveBreakpoint,
  onSetBreakpointCondition,
  onToggleBreakpoint,
  onAddWatch,
  onRemoveWatch,
  onNavigateToFile,
  settings,
}) {
  const [selectedConfig, setSelectedConfig] = useState('');
  const [launchConfigs, setLaunchConfigs] = useState([]);
  const [watchInput, setWatchInput] = useState('');
  const [isAddingWatch, setIsAddingWatch] = useState(false);
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const [exceptionFilters, setExceptionFilters] = useState({ uncaught: true, all: false });
  const watchInputRef = useRef(null);

  const status = debugSession?.status || 'idle';
  const isActive = ['running', 'paused', 'starting'].includes(status);
  const isPaused = status === 'paused';
  const isRunning = status === 'running';
  const isStarting = status === 'starting';

  const detectedConfigName = useMemo(() => {
    const langMap = {
      py: 'Python', python: 'Python',
      js: 'Node.js', ts: 'TypeScript', tsx: 'TypeScript', jsx: 'Node.js',
      c: 'C (GDB)', cpp: 'C++ (GDB)', cc: 'C++ (GDB)', cxx: 'C++ (GDB)',
      rs: 'Rust', java: 'Java', go: 'Go', rb: 'Ruby', php: 'PHP', cs: 'C#',
    };
    const ext = (activeTab?.name || '').split('.').pop()?.toLowerCase();
    return `${langMap[ext] || 'Current File'}: Launch`;
  }, [activeTab]);

  useEffect(() => {
    if (isAddingWatch && watchInputRef.current) watchInputRef.current.focus();
  }, [isAddingWatch]);

  const handleOpenLaunchConfig = useCallback(async () => {
    if (!activeTab?.path) return;
    const folder = activeTab.path.replace(/[/\\][^/\\]+$/, '');
    const configPath = folder + '/.tilder/launch.json';
    const lang = (activeTab.name || '').split('.').pop()?.toLowerCase() || 'python';
    const langMap = { py: 'python', js: 'node', ts: 'typescript', cpp: 'cppdbg', c: 'cppdbg', rs: 'lldb', java: 'java', go: 'go' };
    const defaultConfig = {
      version: '0.2.0',
      configurations: [{ name: detectedConfigName, type: langMap[lang] || 'python', request: 'launch', program: activeTab.path }],
    };
    try {
      if (window.__TAURI__?.core?.invoke) {
        try { await window.__TAURI__.core.invoke('desktop_read_file', { path: configPath }); }
        catch { await window.__TAURI__.core.invoke('desktop_write_file', { filePath: configPath, content: JSON.stringify(defaultConfig, null, 2), isBinary: false }); }
      }
      onNavigateToFile?.(configPath, 1);
    } catch (err) { console.warn('Failed to open launch.json:', err); }
  }, [activeTab, detectedConfigName, onNavigateToFile]);

  const handleWatchSubmit = (e) => {
    e.preventDefault();
    const expr = watchInput.trim();
    if (expr) { onAddWatch?.(expr); setWatchInput(''); }
    setIsAddingWatch(false);
  };

  const handleFrameClick = (frame, index) => {
    setSelectedFrameIdx(index);
    if (frame.url && frame.line) {
      onNavigateToFile?.(frame.url, frame.line, frame.column || 1);
    } else if (frame.line) {
      const editor = window.getPreferredEditor?.();
      if (editor) { editor.focus(); editor.setPosition({ lineNumber: frame.line, column: frame.column || 1 }); editor.revealLineInCenter(frame.line); }
    }
  };

  const handleBreakpointClick = (bp) => {
    if (bp.path && bp.line) onNavigateToFile?.(bp.path, bp.line, 1);
  };

  const scopedVariables = useMemo(() => {
    if (!variables || variables.length === 0) return null;
    const groups = {};
    variables.forEach(v => { const scope = v.scope || 'Local'; if (!groups[scope]) groups[scope] = []; groups[scope].push(v); });
    return groups;
  }, [variables]);

  return (
    <div id="debugarea" className={`debug-shell sidebarscontent d-${ariaExpandedisplaydebug}`}>
      <div className="dbg-container">

        {/* ── Header ── */}
        <div className="dbg-header">
          <span className="dbg-eyebrow">RUN AND DEBUG</span>

          <div className="dbg-launch-row">
            <div className="dbg-select-wrap">
              <select
                className="dbg-select"
                value={selectedConfig || detectedConfigName}
                onChange={e => setSelectedConfig(e.target.value)}
                title="Select Debug Configuration"
              >
                {launchConfigs.length > 0
                  ? launchConfigs.map(c => <option key={c.name} value={c.name}>{c.name}</option>)
                  : <option value={detectedConfigName}>{detectedConfigName}</option>
                }
              </select>
              <svg className="dbg-select-arrow" width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>

            <button
              type="button"
              className={`dbg-run-btn${isActive ? ' dbg-run-btn--continue' : ''}`}
              onClick={isActive ? onContinueDebugging : onStartDebugging}
              title={isActive ? 'Continue (F5)' : 'Start Debugging (F5)'}
              disabled={!activeTab && !isActive}
            >
              <PlayIcon />
            </button>

            <button
              type="button"
              className="dbg-icon-btn"
              onClick={handleOpenLaunchConfig}
              title="Open launch.json"
            >
              <GearIcon />
            </button>
          </div>

          {!isActive && activeTab && (
            <button
              type="button"
              className="dbg-run-file-btn"
              onClick={() => onRunCurrentFile?.()}
              title="Run File without Debugging"
            >
              &#9654; Run {activeTab.name || 'Current File'}
            </button>
          )}
        </div>

        {/* ── Active Session Bar ── */}
        {isActive && (
          <div className="dbg-session-bar">
            <div className="dbg-session-status">
              <span className={`dbg-status-dot${isPaused ? ' dbg-status-dot--paused' : ' dbg-status-dot--running'}`} />
              <span className="dbg-status-text">
                {isPaused ? 'Paused on breakpoint' : isStarting ? 'Starting\u2026' : 'Running'}
              </span>
              {activeTab?.name && <span className="dbg-session-file">{activeTab.name}</span>}
            </div>
            <div className="dbg-controls">
              {isPaused ? (
                <button type="button" className="dbg-ctrl play" onClick={onContinueDebugging} title="Continue (F5)"><PlayIcon /></button>
              ) : (
                <button type="button" className="dbg-ctrl pause" onClick={onPauseDebugging} title="Pause (F6)" disabled={!isRunning}><PauseIcon /></button>
              )}
              <button type="button" className="dbg-ctrl" onClick={() => debugApi.stepOver()} title="Step Over (F10)" disabled={!isPaused}><StepOverIcon /></button>
              <button type="button" className="dbg-ctrl" onClick={() => debugApi.stepInto()} title="Step Into (F11)" disabled={!isPaused}><StepIntoIcon /></button>
              <button type="button" className="dbg-ctrl" onClick={() => debugApi.stepOut()} title="Step Out (Shift+F11)" disabled={!isPaused}><StepOutIcon /></button>
              <button type="button" className="dbg-ctrl restart" onClick={onRestartDebugging} title="Restart (Ctrl+Shift+F5)"><RestartIcon /></button>
              <button type="button" className="dbg-ctrl stop" onClick={onStopDebugging} title="Stop (Shift+F5)"><StopIcon /></button>
            </div>
          </div>
        )}

        {/* ── Scrollable Sections ── */}
        <div className="dbg-scroll">

          {/* 1. VARIABLES */}
          <Section title="VARIABLES" defaultOpen={true}>
            {scopedVariables ? (
              Object.entries(scopedVariables).map(([scope, vars]) => (
                <div key={scope} className="dbg-scope-group">
                  <div className="dbg-scope-label">{scope}</div>
                  {vars.map((v, i) => <VarNode key={`${v.name}-${i}`} variable={v} depth={0} />)}
                </div>
              ))
            ) : (
              <div className="dbg-empty">Not paused on a breakpoint.</div>
            )}
          </Section>

          {/* 2. WATCH */}
          <Section
            title="WATCH"
            defaultOpen={true}
            actions={
              <button type="button" className="dbg-mini-btn" onClick={() => setIsAddingWatch(true)} title="Add Watch Expression">
                <PlusIcon />
              </button>
            }
          >
            {isAddingWatch && (
              <form className="dbg-watch-form" onSubmit={handleWatchSubmit}>
                <input
                  ref={watchInputRef}
                  className="dbg-watch-input"
                  value={watchInput}
                  onChange={e => setWatchInput(e.target.value)}
                  placeholder="Expression\u2026"
                  onBlur={() => { if (!watchInput.trim()) setIsAddingWatch(false); }}
                  onKeyDown={e => { if (e.key === 'Escape') { setIsAddingWatch(false); setWatchInput(''); } }}
                />
              </form>
            )}
            {Object.keys(watchValues).length > 0 ? (
              Object.entries(watchValues).map(([expr, val]) => (
                <div key={expr} className="dbg-list-row">
                  <span className="dbg-watch-expr">{expr}</span>
                  <span className="dbg-watch-sep">:</span>
                  <span className="dbg-watch-val"><VarValue value={val?.result ?? val} type={val?.type} /></span>
                  <button type="button" className="dbg-row-del" onClick={() => onRemoveWatch?.(expr)} title="Remove Watch"><ClearIcon /></button>
                </div>
              ))
            ) : (
              !isAddingWatch && <div className="dbg-empty">No watch expressions.</div>
            )}
          </Section>

          {/* 3. CALL STACK */}
          <Section title="CALL STACK" defaultOpen={true}>
            {isActive ? (
              callStack.length > 0 ? (
                <div className="dbg-stack-list">
                  <div className="dbg-thread-header">
                    <span className="dbg-thread-label">Main Thread</span>
                    <span className={`dbg-thread-status ${isPaused ? 'paused' : 'running'}`}>
                      {isPaused ? 'Paused' : 'Running'}
                    </span>
                  </div>
                  {callStack.map((frame, i) => {
                    const fileName = frame.url ? frame.url.split(/[/\\]/).pop() : '';
                    return (
                      <div
                        key={i}
                        className={`dbg-list-row dbg-frame${i === selectedFrameIdx ? ' dbg-frame--selected' : ''}`}
                        onClick={() => handleFrameClick(frame, i)}
                        title={`${frame.url || ''}:${frame.line || ''}`}
                      >
                        <span className="dbg-frame-ptr">{i === selectedFrameIdx ? '\u2192' : ''}</span>
                        <span className="dbg-frame-name">{frame.name || `Frame ${i}`}</span>
                        {fileName && <span className="dbg-frame-loc">{fileName}{frame.line ? `:${frame.line}` : ''}</span>}
                      </div>
                    );
                  })}
                </div>
              ) : isRunning ? (
                <div className="dbg-empty dbg-empty--italic">Execution in progress\u2026</div>
              ) : (
                <div className="dbg-empty">Call stack is not available.</div>
              )
            ) : (
              <div className="dbg-empty">No active debug session.</div>
            )}
          </Section>

          {/* 4. BREAKPOINTS */}
          <Section
            title="BREAKPOINTS"
            defaultOpen={true}
            count={breakpoints.length}
            actions={
              breakpoints.length > 0 ? (
                <button type="button" className="dbg-mini-btn" onClick={onClearBreakpoints} title="Remove All Breakpoints">
                  <ClearIcon />
                </button>
              ) : null
            }
          >
            <div className="dbg-exception-group">
              <div className="dbg-checkbox-row" onClick={() => setExceptionFilters(f => ({ ...f, uncaught: !f.uncaught }))}>
                <GlassCheckbox checked={exceptionFilters.uncaught} onChange={() => setExceptionFilters(f => ({ ...f, uncaught: !f.uncaught }))} title="Break on uncaught exceptions" />
                <span className="dbg-checkbox-label">Uncaught Exceptions</span>
              </div>
              <div className="dbg-checkbox-row" onClick={() => setExceptionFilters(f => ({ ...f, all: !f.all }))}>
                <GlassCheckbox checked={exceptionFilters.all} onChange={() => setExceptionFilters(f => ({ ...f, all: !f.all }))} title="Break on all exceptions" />
                <span className="dbg-checkbox-label">All Exceptions</span>
              </div>
            </div>

            {breakpoints.length > 0 ? (
              <div className="dbg-bp-list">
                {breakpoints.map(bp => {
                  const fileName = bp.name || (bp.path ? bp.path.split(/[/\\]/).pop() : 'file');
                  return (
                    <div
                      key={`${bp.path}:${bp.line}`}
                      className="dbg-list-row dbg-bp-row"
                      onClick={() => handleBreakpointClick(bp)}
                      title={`${bp.path} : line ${bp.line}`}
                    >
                      <GlassCheckbox
                        checked={true}
                        onChange={(e) => { e.stopPropagation(); onToggleBreakpoint?.(bp.path, bp.line); }}
                        title="Toggle Breakpoint"
                      />
                      <span className="dbg-bp-dot">\u25CF</span>
                      <div className="dbg-bp-info">
                        <span className="dbg-bp-name">{fileName}</span>
                        <span className="dbg-bp-line">:{bp.line}</span>
                        {bp.condition && <span className="dbg-bp-cond">[if: {bp.condition}]</span>}
                      </div>
                      <div className="dbg-bp-actions" onClick={e => e.stopPropagation()}>
                        <button type="button" className="dbg-mini-btn" onClick={() => onSetBreakpointCondition?.(bp)} title="Edit Condition"><EditIcon /></button>
                        <button type="button" className="dbg-mini-btn dbg-mini-btn--danger" onClick={() => onRemoveBreakpoint?.(bp)} title="Remove Breakpoint"><ClearIcon /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="dbg-empty">No breakpoints set. Click the editor gutter to toggle breakpoints.</div>
            )}
          </Section>

        </div>
      </div>
    </div>
  );
}

export default React.memo(Debug);
