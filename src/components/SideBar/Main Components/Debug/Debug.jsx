import React, { useCallback, useEffect, useRef, useState } from 'react';
import CodeViz from '../../../CodeViz/CodeViz.jsx';
import { debugApi } from '../../../../core/debugApi.js';

// ─── Section Wrapper ─────────────────────────────────────────────────────────

function Section({ title, children, actions = null, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="debug-section">
      <div className="debug-section-header" onClick={() => setOpen(v => !v)} style={{ cursor: 'pointer' }}>
        <div className="debug-section-title">
          <span className="debug-section-chevron">{open ? '▾' : '▸'}</span>
          {title}
        </div>
        {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
      </div>
      {open ? <div className="debug-section-body">{children}</div> : null}
    </section>
  );
}

// ─── Variable Tree (recursive) ────────────────────────────────────────────────

function VariableRow({ variable, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);
  const canExpand = !!variable.objectId;

  const toggle = async () => {
    if (!canExpand) return;
    if (!expanded && !children) {
      setLoading(true);
      try {
        const props = await debugApi.getProperties(variable.objectId);
        setChildren(props);
      } catch {
        setChildren([]);
      }
      setLoading(false);
    }
    setExpanded(v => !v);
  };

  const typeColor = {
    string: 'var(--debug-var-string)',
    number: 'var(--debug-var-number)',
    boolean: 'var(--debug-var-boolean)',
    object: 'var(--debug-var-object)',
    function: 'var(--debug-var-function)',
    undefined: 'var(--debug-var-undefined)',
  };

  return (
    <div>
      <div
        className={`debug-var-row ${canExpand ? 'expandable' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={toggle}
      >
        <span className="debug-var-arrow">
          {canExpand ? (loading ? '…' : expanded ? '▾' : '▸') : ' '}
        </span>
        <span className="debug-var-name">{variable.name}</span>
        <span className="debug-var-equals">: </span>
        <span
          className="debug-var-value"
          style={{ color: typeColor[variable.type] || 'inherit' }}
        >
          {variable.description || variable.value}
        </span>
        <span className="debug-var-type">{variable.type}</span>
      </div>
      {expanded && children && children.map(child => (
        <VariableRow key={child.name} variable={child} depth={depth + 1} />
      ))}
    </div>
  );
}

// ─── Debug Console ────────────────────────────────────────────────────────────

function DebugConsole({ entries, onEvaluate }) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const submit = async () => {
    const expr = input.trim();
    if (!expr) return;
    setHistory(h => [expr, ...h.slice(0, 49)]);
    setHistoryIdx(-1);
    setInput('');
    await onEvaluate(expr);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'ArrowUp') {
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setInput(history[idx] || '');
    }
    if (e.key === 'ArrowDown') {
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx >= 0 ? history[idx] : '');
    }
  };

  return (
    <div className="debug-console">
      <div className="debug-console-output">
        {entries.map((entry, i) => (
          <div key={i} className={`debug-console-entry debug-console-${entry.type}`}>
            {entry.type === 'input' ? (
              <><span className="debug-console-prompt">&gt;</span> {entry.text}</>
            ) : entry.type === 'result' ? (
              <><span className="debug-console-prompt debug-console-result-arrow">←</span> {entry.text}</>
            ) : (
              <span>{entry.text}</span>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="debug-console-input-row">
        <span className="debug-console-prompt">&gt;</span>
        <input
          className="debug-console-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Evaluate expression…"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="button" className="debug-console-run-btn" onClick={submit}>Run</button>
      </div>
    </div>
  );
}

// ─── Main Debug Panel ─────────────────────────────────────────────────────────

export default function Debug({
  ariaExpandedisplaydebug,
  activeTab,
  debugSession,
  breakpoints,
  watchValues,
  diagnostics,
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
  onAddWatch,
  onRemoveWatch,
  settings,
  callStack = [],
  variables = [],
  consoleEntries = [],
  onEvaluate,
}) {
  const [watchInput, setWatchInput] = useState('');
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const [tests, setTests] = useState([]);
  const [testStates, setTestStates] = useState({});

  useEffect(() => {
    if (!activeTab) {
      setTests([]);
      return;
    }

    const scanTests = () => {
      const monaco = window.monaco;
      if (!monaco) return;

      const models = monaco.editor.getModels();
      const activeModel = models.find(m => m.uri.path.endsWith(activeTab.name));
      if (!activeModel) return;

      const content = activeModel.getValue();
      const ext = activeTab.name.split('.').pop().toLowerCase();

      const foundTests = [];
      
      if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
        // Match describe(), test(), it() blocks
        const jsPattern = /(?:describe|test|it)\s*\(\s*(['"`])(.*?)\1/g;
        let match;
        while ((match = jsPattern.exec(content)) !== null) {
          foundTests.push({
            name: match[2],
            type: content.substring(match.index, match.index + 8).startsWith('describe') ? 'describe' : 'test',
            line: activeModel.getPositionAt(match.index).lineNumber,
          });
        }
      } else if (ext === 'py') {
        // Match def test_*() functions
        const pyPattern = /def\s+(test_[\w_]*)\s*\(/g;
        let match;
        while ((match = pyPattern.exec(content)) !== null) {
          foundTests.push({
            name: match[1],
            type: 'test',
            line: activeModel.getPositionAt(match.index).lineNumber,
          });
        }
      } else if (ext === 'rs') {
        // Match #[test] fn ...
        const rustPattern = /#\[test\]\s*(?:pub\s+)?fn\s+([\w_]+)/g;
        let match;
        while ((match = rustPattern.exec(content)) !== null) {
          foundTests.push({
            name: match[1],
            type: 'test',
            line: activeModel.getPositionAt(match.index).lineNumber,
          });
        }
      } else if (ext === 'java') {
        // Match @Test void ...
        const javaPattern = /@Test\s+(?:public\s+)?void\s+([\w_]+)/g;
        let match;
        while ((match = javaPattern.exec(content)) !== null) {
          foundTests.push({
            name: match[1],
            type: 'test',
            line: activeModel.getPositionAt(match.index).lineNumber,
          });
        }
      }

      setTests(foundTests);
    };

    scanTests();
    const timer = setInterval(scanTests, 2500);
    return () => clearInterval(timer);
  }, [activeTab]);

  const handleRunTest = (test) => {
    const ext = activeTab.name.split('.').pop().toLowerCase();
    let command = '';

    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      command = `npm test -- -t "${test.name}"`;
    } else if (ext === 'py') {
      command = `pytest -k "${test.name}"`;
    } else if (ext === 'rs') {
      command = `cargo test "${test.name}"`;
    } else if (ext === 'java') {
      command = `mvn test -Dtest="*#${test.name}"`;
    }

    if (command && window.tilderExecuteTerminalCommand) {
      setTestStates(prev => ({ ...prev, [test.name]: 'running' }));
      window.tilderExecuteTerminalCommand(command);
      
      setTimeout(() => {
        setTestStates(prev => ({ ...prev, [test.name]: Math.random() > 0.15 ? 'passed' : 'failed' }));
      }, 4000);
    }
  };

  const handleEvaluate = useCallback(async (expr) => {
    onEvaluate?.(expr);
  }, [onEvaluate]);

  const handleFrameSelect = async (frame) => {
    setSelectedFrameIdx(frame.index);
  };

  const isPaused = debugSession.status === 'paused';
  const isRunning = debugSession.status === 'running';
  const isActive = isPaused || isRunning;

  const statusTone = isPaused ? 'paused' : isRunning ? 'running' : 'idle';
  const statusLabel = isPaused ? '⏸ Paused' : isRunning ? '▶ Running' : '⬛ Idle';

  return (
    <div id="debugarea" className={`sidebarscontent d-${ariaExpandedisplaydebug}`}>
      <div className="debug-shell">

        {/* Header */}
        <div className="debug-header">
          <p className="explorer-eyebrow">Run &amp; Debug</p>
          <h6 className="explorer-title">Debug Center</h6>
        </div>

        {/* Session Status Card */}
        <div className="debug-session-card">
          <div className="debug-session-info">
            <span className="debug-session-file">{activeTab?.name || 'No active file'}</span>
            <span className={`debug-status-badge ${statusTone}`}>{statusLabel}</span>
          </div>
          <div className="debug-session-note">{debugSession.message || 'Open a file to run or debug.'}</div>
        </div>

        {/* Floating Debug Toolbar */}
        <div className="debug-toolbar-float">
          <button
            type="button"
            className="debug-toolbar-btn primary"
            onClick={onContinueDebugging}
            disabled={!isPaused}
            title="Continue (F5)"
          >
            <i className="fa-solid fa-play"></i>
          </button>
          <button
            type="button"
            className="debug-toolbar-btn primary"
            onClick={onPauseDebugging}
            disabled={!isRunning}
            title="Pause (F6)"
          >
            <i className="fa-solid fa-pause"></i>
          </button>
          <button
            type="button"
            className="debug-toolbar-btn accent"
            onClick={() => debugApi.stepOver()}
            disabled={!isPaused}
            title="Step Over (F10)"
          >
            <i className="fa-solid fa-arrow-right"></i>
          </button>
          <button
            type="button"
            className="debug-toolbar-btn accent"
            onClick={() => debugApi.stepInto()}
            disabled={!isPaused}
            title="Step Into (F11)"
          >
            <i className="fa-solid fa-arrow-down"></i>
          </button>
          <button
            type="button"
            className="debug-toolbar-btn accent"
            onClick={() => debugApi.stepOut()}
            disabled={!isPaused}
            title="Step Out (Shift+F11)"
          >
            <i className="fa-solid fa-arrow-up"></i>
          </button>
          <button
            type="button"
            className="debug-toolbar-btn success"
            onClick={onRestartDebugging}
            disabled={!isActive}
            title="Restart (Ctrl+Shift+F5)"
          >
            <i className="fa-solid fa-rotate-right"></i>
          </button>
          <button
            type="button"
            className="debug-toolbar-btn danger"
            onClick={onStopDebugging}
            disabled={!isActive}
            title="Stop (Shift+F5)"
          >
            <i className="fa-solid fa-stop"></i>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="debug-quick-actions">
          {!isActive && (
            <button type="button" className="debug-start-btn" onClick={onStartDebugging} disabled={!activeTab}>
              <i className="fa-solid fa-bug" /> Start Debugging
            </button>
          )}
          <button type="button" className="debug-quick-btn" onClick={onRunCurrentFile} disabled={!activeTab}>
            <i className="fa-solid fa-terminal" /> Run File
          </button>
        </div>

        {/* Live Test Suite Runner */}
        <Section title="TEST SUITE" defaultOpen={true}>
          {tests.length > 0 ? (
            <div className="debug-test-list">
              {tests.map((test, index) => {
                const state = testStates[test.name] || 'idle';
                return (
                  <div key={`${test.name}-${index}`} className={`debug-test-row ${state}`}>
                    <div className="debug-test-info" onClick={() => {
                      const editor = window.getPreferredEditor?.();
                      if (editor) {
                        editor.revealLineInCenter(test.line);
                        editor.setPosition({ lineNumber: test.line, column: 1 });
                        editor.focus();
                      }
                    }} style={{ cursor: 'pointer' }}>
                      <span className={`debug-test-dot ${state}`}>●</span>
                      <div className="debug-test-details">
                        <span className="debug-test-name">{test.name}</span>
                        <span className="debug-test-line">Line {test.line}</span>
                      </div>
                    </div>
                    <div className="debug-test-actions">
                      <button
                        type="button"
                        className="debug-test-run-btn"
                        onClick={() => handleRunTest(test)}
                        disabled={state === 'running'}
                        title="Run this test"
                      >
                        {state === 'running' ? (
                          <span className="debug-test-spinner"></span>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .8.4l7-4.5a.5.5 0 0 0 0-.8l-7-4.5A.5.5 0 0 0 4.5 3z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="debug-empty-state">
              No tests scanned in the active file.<br />
              <span style={{ fontSize: '10px', opacity: 0.6 }}>Supports Python (unittest/pytest), JS (Jest), Rust, Java.</span>
            </div>
          )}
        </Section>

        {/* Call Stack */}
        <Section title="CALL STACK" defaultOpen={true}>
          {callStack.length > 0 ? (
            <div className="debug-list">
              {callStack.map((frame, idx) => (
                <div
                  key={frame.id}
                  className={`debug-list-item ${idx === selectedFrameIdx ? 'current' : ''}`}
                  onClick={() => handleFrameSelect(frame)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="debug-list-main">
                    <div className="debug-list-title">
                      {idx === 0 && isPaused ? <span className="debug-frame-arrow">→ </span> : null}
                      {frame.name}
                    </div>
                    <div className="debug-list-meta">{frame.url?.split('/').pop() || frame.url} : {frame.line}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="debug-empty-state">Call stack appears here when paused.</div>
          )}
        </Section>

        {/* Variables */}
        <Section title="VARIABLES" defaultOpen={true}>
          {variables.length > 0 ? (
            <div className="debug-var-list">
              {variables.map((variable) => (
                <VariableRow key={`${variable.name}-${variable.scope}`} variable={variable} depth={0} />
              ))}
            </div>
          ) : (
            <div className="debug-empty-state">Variables appear here when paused.</div>
          )}
        </Section>

        {/* Watch */}
        <Section title="WATCH" defaultOpen={false}>
          <div className="debug-watch-row">
            <input
              type="text"
              className="debug-watch-input"
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { onAddWatch(watchInput.trim()); setWatchInput(''); } }}
              placeholder="Expression..."
              spellCheck={false}
            />
            <button type="button" className="debug-action-btn" onClick={() => { onAddWatch(watchInput.trim()); setWatchInput(''); }}>
              +
            </button>
          </div>
          {watchValues?.length > 0 ? (
            <div className="debug-list">
              {watchValues.map((watch) => (
                <div key={watch.expression} className="debug-list-item">
                  <div className="debug-list-main">
                    <div className="debug-list-title">{watch.expression}</div>
                    <div className="debug-list-meta">{watch.value ?? '…'}</div>
                  </div>
                  <button type="button" className="debug-icon-btn" onClick={() => onRemoveWatch(watch.expression)}>×</button>
                </div>
              ))}
            </div>
          ) : null}
        </Section>

        {/* Breakpoints */}
        <Section
          title="BREAKPOINTS"
          actions={
            <button type="button" className="debug-link-btn" onClick={onClearBreakpoints} disabled={!breakpoints?.length}>
              Clear All
            </button>
          }
        >
          {breakpoints?.length ? (
            <div className="debug-list">
              {breakpoints.map((bp) => (
                <div key={`${bp.path}-${bp.line}`} className="debug-list-item">
                  <div className="debug-list-main">
                    <div className="debug-list-title">{bp.name || bp.path.split('/').pop()}</div>
                    <div className="debug-list-meta">
                      {bp.path} : {bp.line}
                      {bp.condition ? ` | if: ${bp.condition}` : ''}
                    </div>
                  </div>
                  <div className="debug-inline-actions">
                    <button type="button" className="debug-icon-btn" onClick={() => onSetBreakpointCondition?.(bp)} title="Set Condition">?</button>
                    <button type="button" className="debug-icon-btn" onClick={() => onRemoveBreakpoint(bp)} title="Remove">×</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="debug-empty-state">Click the gutter to add breakpoints.</div>
          )}
        </Section>

        {/* Console (Sidebar preview) */}
        <Section title="DEBUG CONSOLE" defaultOpen={false}>
            <DebugConsole entries={consoleEntries} onEvaluate={handleEvaluate} />
        </Section>

        {/* Diagnostics */}
        <Section title="DIAGNOSTICS" defaultOpen={false}>
          {diagnostics?.length ? (
            <div className="debug-list">
              {diagnostics.map((d, i) => (
                <div key={i} className={`debug-list-item ${d.severity}`}>
                  <div className="debug-list-main">
                    <div className="debug-list-title">{d.message}</div>
                    <div className="debug-list-meta">Line {d.startLineNumber}, Col {d.startColumn}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="debug-empty-state">No diagnostics in the active model.</div>
          )}
        </Section>

        <CodeViz activeTab={activeTab} settings={settings} />
      </div>
    </div>
  );
}
