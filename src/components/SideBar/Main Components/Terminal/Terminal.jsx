import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { executeTerminalCommand, getDisplayPath } from '../../../../core/terminalBridge.js';
import { getApiOrigin, apiFetch } from '../../../../core/apiBase.js';
import { syncTerminalWorkspaceRoot } from '../../../../core/codeRunner.js';
import { isDesktopRuntime } from '../../../../core/runtime.js';

const DESKTOP_TERMINAL_FONT_STACK =
  '"Cascadia Mono", Consolas, monospace';
const DEFAULT_TERMINAL_FONT_SIZE = 11;
const DEFAULT_TERMINAL_LINE_HEIGHT = 1.15;
const DEFAULT_TERMINAL_LETTER_SPACING = 0;
const DEFAULT_TERMINAL_SCROLLBACK = 8000;

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, numeric));
}

function isPrintableInput(data) {
  return data >= ' ' && data !== '\u007f';
}

function getBridgeConnectionConfig() {
  const apiOrigin = getApiOrigin();
  const hostname = window.location.hostname;
  const port = window.location.port;
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isViteHost = isLocalHost && (port === '5173' || port === '4173');
  const isBackendHost = isLocalHost && port && port !== '5173' && port !== '4173';
  const tauri = isDesktopRuntime();

  if (apiOrigin && apiOrigin !== window.location.origin) {
    return {
      url: apiOrigin,
      runtime: tauri ? 'desktop' : 'hosted',
      shouldConnect: true,
      connectTimeoutMs: tauri ? 20000 : 15000,
      connectingLabel: tauri ? '' : 'connecting',
      connectedLabel: tauri ? '' : 'hosted',
      connectingBanner: tauri ? '' : 'Connecting to Tilder API service...',
      connectedBanner: tauri ? '' : 'Connected to Tilder terminal service.',
      fallbackLabel: 'workspace',
      fallbackBanner: 'Using workspace terminal commands.',
    };
  }

  if (isViteHost) {
    return {
      url: `${window.location.protocol}//${hostname}:3210`,
      runtime: tauri ? 'desktop' : 'local',
      shouldConnect: true,
      connectTimeoutMs: tauri ? 20000 : 15000,
      connectingLabel: tauri ? '' : 'connecting',
      connectedLabel: tauri ? '' : 'local',
      connectingBanner: '',
      connectedBanner: tauri ? '' : 'Connected to local terminal bridge.',
      fallbackLabel: 'workspace',
      fallbackBanner: 'Using workspace terminal commands.',
    };
  }

  if (isBackendHost) {
    return {
      url: window.location.origin,
      runtime: tauri ? 'desktop' : 'local',
      shouldConnect: true,
      connectTimeoutMs: tauri ? 20000 : 15000,
      connectingLabel: tauri ? '' : 'connecting',
      connectedLabel: tauri ? '' : 'local',
      connectingBanner: '',
      connectedBanner: tauri ? '' : 'Connected to local terminal bridge.',
      fallbackLabel: 'workspace',
      fallbackBanner: 'Using workspace terminal commands.',
    };
  }

  return {
    url: '',
    runtime: 'browser',
    shouldConnect: false,
    connectTimeoutMs: 0,
    connectingLabel: '',
    connectedLabel: 'workspace',
    connectingBanner: '',
    connectedBanner: '',
    fallbackLabel: 'workspace',
    fallbackBanner: '',
  };
}

function createSessionId() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(name, profileId = '') {
  return {
    id: createSessionId(),
    name,
    profileId,
  };
}

const PANEL_VIEWS = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'debugConsole', label: 'Debug Console' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'ports', label: 'Ports' },
];

function BottomPanelTabs({ activeView, onChangeView }) {
  return (
    <div className="bottom-panel-tab-strip">
      {PANEL_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={`bottom-panel-tab ${activeView === view.id ? 'active' : ''}`}
          onClick={() => onChangeView?.(view.id)}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

function LogEntries({ entries, emptyMessage }) {
  if (!entries.length) {
    return <div className="bottom-panel-empty">{emptyMessage}</div>;
  }

  return (
    <div className="bottom-panel-log-list">
      {entries.map((entry) => (
        <div key={entry.id} className="bottom-panel-log-entry">
          <div className="bottom-panel-log-meta">
            <span>{entry.source}</span>
            <span>{entry.time}</span>
          </div>
          <pre className="bottom-panel-log-output">{entry.lines.join('\n')}</pre>
        </div>
      ))}
    </div>
  );
}

function DebugConsoleView({
  entries,
  filterText,
  onEvaluate,
  debugSession,
}) {
  const containerRef = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Auto-scroll on new entries
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const val = inputValue.trim();
      if (!val) return;

      onEvaluate?.(val);
      setHistory(prev => [...prev, val]);
      setHistoryIndex(-1);
      setInputValue('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputValue(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      if (historyIndex === history.length - 1) {
        setHistoryIndex(-1);
        setInputValue('');
      } else {
        const nextIndex = historyIndex + 1;
        setHistoryIndex(nextIndex);
        setInputValue(history[nextIndex]);
      }
    }
  };

  const isSessionActive = debugSession && (debugSession.status === 'paused' || debugSession.status === 'running');

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!filterText.trim()) return entries;
    const query = filterText.trim().toLowerCase();
    
    // Check if negate filter
    if (query.startsWith('!')) {
      const negateQuery = query.slice(1).trim();
      if (!negateQuery) return entries;
      return entries.filter(entry => {
        const text = entry.lines.join('\n').toLowerCase();
        return !text.includes(negateQuery);
      });
    }

    return entries.filter(entry => {
      const text = entry.lines.join('\n').toLowerCase();
      return text.includes(query);
    });
  }, [entries, filterText]);

  return (
    <div className="debug-console-container">
      <div className="debug-console-logs" ref={containerRef}>
        {filteredEntries.length === 0 ? (
          <div className="bottom-panel-empty">
            {filterText.trim() ? "No results match the current filter." : "No debug console messages yet."}
          </div>
        ) : (
          filteredEntries.map((entry) => {
            let className = "debug-console-entry";
            if (entry.type === 'error' || entry.type === 'stderr') {
              className += " error";
            } else if (entry.type === 'input') {
              className += " input";
            } else if (entry.type === 'result') {
              className += " result";
            }

            return (
              <div key={entry.id} className={className}>
                {entry.type === 'input' && <span className="debug-prompt">&gt;</span>}
                {entry.type === 'result' && <span className="debug-result-indicator">&lt;</span>}
                <span className="debug-time">{entry.time}</span>
                <span className="debug-text-content">{entry.lines.join('\n')}</span>
              </div>
            );
          })
        )}
      </div>
      <div className="debug-console-input-bar">
        <span className="debug-console-input-prompt">&gt;</span>
        <input
          type="text"
          className={`debug-console-input-field ${!isSessionActive ? 'disabled' : ''}`}
          placeholder={isSessionActive ? "Evaluate expression..." : "Please start a debug session to evaluate expressions"}
          value={inputValue}
          disabled={!isSessionActive}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}

function ProblemsView({ diagnostics }) {
  if (!diagnostics.length) {
    return <div className="bottom-panel-empty">No problems have been detected in the active editor.</div>;
  }

  return (
    <div className="bottom-panel-problems-list">
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.message}-${index}`} className={`bottom-panel-problem ${diagnostic.severity || 'info'}`}>
          <div className="bottom-panel-problem-title">{diagnostic.message}</div>
          <div className="bottom-panel-problem-meta">
            line {diagnostic.startLineNumber}, col {diagnostic.startColumn} | {diagnostic.owner || 'editor'}
          </div>
        </div>
      ))}
    </div>
  );
}

function PortsView({ ports, onForwardPort, onRemovePort, onOpenBrowser, onUpdatePort, editingPortId, setEditingPortId }) {
  const [showInput, setShowInput] = React.useState(false);
  const [portInput, setPortInput] = React.useState('');
  const [descInput, setDescInput] = React.useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const num = parseInt(portInput, 10);
    if (!num || num < 1 || num > 65535) return;
    onForwardPort?.(num, descInput.trim() || `Port ${num}`);
    setPortInput('');
    setDescInput('');
    setShowInput(false);
  }

  return (
    <div className="ports-view">
      <div className="ports-toolbar">
        <button
          type="button"
          className="ports-action-btn"
          onClick={() => setShowInput((s) => !s)}
          title="Forward a Port"
        >
          <i className="fa-solid fa-plus"></i> Forward a Port
        </button>
      </div>
      {showInput && (
        <form className="ports-add-form" onSubmit={handleSubmit}>
          <input
            type="number"
            className="ports-input"
            placeholder="Port (e.g. 3000)"
            value={portInput}
            min="1"
            max="65535"
            onChange={(e) => setPortInput(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            className="ports-input"
            placeholder="Description (optional)"
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
          />
          <button type="submit" className="ports-action-btn primary">Forward</button>
          <button type="button" className="ports-action-btn" onClick={() => setShowInput(false)}>Cancel</button>
        </form>
      )}
      {ports.length === 0 && !showInput ? (
        <div className="ports-empty">
          <div className="ports-empty-icon"><i className="fa-solid fa-arrow-right-arrow-left"></i></div>
          <div className="ports-empty-text">No forwarded ports. Forward a port to access your locally running services over the internet.</div>
          <button type="button" className="ports-action-btn primary" onClick={() => setShowInput(true)}>
            Forward a Port
          </button>
        </div>
      ) : ports.length > 0 ? (
        <table className="ports-table">
          <thead>
            <tr>
              <th>Port</th>
              <th>Local Address</th>
              <th>Forwarded Address</th>
              <th>Description</th>
              <th>Visibility</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ports.map((entry) => (
              <tr key={entry.port} className={`ports-row ports-row-${entry.status}`}>
                <td className="ports-cell-port">{entry.port}</td>
                <td className="ports-cell-local">localhost:{entry.port}</td>
                <td className="ports-cell-forwarded">
                  {entry.url ? (
                    <a href={entry.url} target="_blank" rel="noreferrer" className="ports-url">
                      {entry.url}
                    </a>
                  ) : (
                    <span className="ports-url-pending">
                      {entry.status === 'connecting' ? 'Connecting...' : '—'}
                    </span>
                  )}
                </td>
                <td className="ports-cell-desc" onClick={() => setEditingPortId(entry.port)}>
                  {editingPortId === entry.port ? (
                    <input
                      type="text"
                      className="ports-input"
                      value={entry.description}
                      onBlur={() => setEditingPortId(null)}
                      onChange={(e) => {
                        const newDesc = e.target.value;
                        const updated = ports.map((p) => p.port === entry.port ? { ...p, description: newDesc } : p);
                        if (onUpdatePort) onUpdatePort(updated);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingPortId(null);
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    entry.description || <span className="ports-desc-placeholder">Add description...</span>
                  )}
                </td>
                <td className="ports-cell-visibility">
                  <select
                    className="ports-select"
                    value={entry.visibility}
                    onChange={(e) => {
                      const newVis = e.target.value;
                      const updated = ports.map((p) => p.port === entry.port ? { ...p, visibility: newVis } : p);
                      if (onUpdatePort) onUpdatePort(updated);
                      // Restart the tunnel with the new visibility
                      if (onForwardPort) onForwardPort(entry.port, entry.description, newVis);
                    }}
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </td>
                <td className="ports-cell-status">
                  <span className={`ports-status-badge ports-status-${entry.status}`}>
                    {entry.status === 'connecting' ? '⏳ Connecting' : entry.status === 'active' ? '✓ Active' : '✗ Error'}
                  </span>
                </td>
                <td className="ports-cell-actions">
                  {entry.url && (
                    <button
                      type="button"
                      className="ports-icon-btn"
                      title="Open in Browser"
                      onClick={() => onOpenBrowser?.(entry.url)}
                    >
                      <i className="fa-solid fa-arrow-up-right-from-square"></i>
                    </button>
                  )}
                  <button
                    type="button"
                    className="ports-icon-btn danger"
                    title="Stop Forwarding"
                    onClick={() => onRemovePort?.(entry.port)}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

function TerminalPane({
  session,
  workspace,
  openFile,
  workspaceSnapshot,
  isVisible,
  initialCwd,
  onModeChange,
  registerApi,
  terminalTypography,
  useNativeTerminal = false,
  onOpenNativeTerminal,
  profileLabel = '',
  onConnect = null,
}) {
  const bridgeConfig = useMemo(() => getBridgeConnectionConfig(), []);
  const [modeLabel, setModeLabel] = useState(() => bridgeConfig.connectingLabel || bridgeConfig.connectedLabel || '');
  const [bannerMessage, setBannerMessage] = useState(() => bridgeConfig.connectingBanner || '');
  const hostRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const socketRef = useRef(null);
  const connectionTimerRef = useRef(null);
  const cwdPathRef = useRef(initialCwd || 'root');
  const bridgeReadyRef = useRef(false);
  const localFallbackReadyRef = useRef(false);
  const workspaceSnapshotRef = useRef(workspaceSnapshot);
  const onModeChangeRef = useRef(onModeChange);
  const registerApiRef = useRef(registerApi);
  const outputBufferRef = useRef('');

  const promptLabel = useMemo(
    () => `${getDisplayPath(workspace, cwdPathRef.current)} $ `,
    [workspace.rootName, isVisible]
  );

  useEffect(() => {
    onModeChangeRef.current?.(session.id, modeLabel, bannerMessage);
  }, [bannerMessage, modeLabel, session.id]);

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) {
      return undefined;
    }

    const initTerminal = () => {
      if (!hostRef.current) return;

      // Clear host element to prevent "rendering down" or duplicated terminals
      hostRef.current.innerHTML = '';

      const terminal = new XTerm({
        convertEol: true,
        cursorBlink: terminalTypography.cursorBlinking,
        cursorStyle: terminalTypography.cursorStyle,
        fontFamily: terminalTypography.fontFamily,
        fontSize: terminalTypography.fontSize,
        lineHeight: terminalTypography.lineHeight,
        letterSpacing: terminalTypography.letterSpacing,
        scrollback: terminalTypography.scrollback,
        allowTransparency: true,
        allowProposedApi: true,
        windowsMode: true,
        theme: {
          background: 'transparent',
          foreground: '#ecf1ff',
          cursor: '#a89eff',
          selectionBackground: 'rgba(138, 132, 224, 0.28)',
          black: '#0b0e16',
          blue: '#7aa2ff',
          brightBlack: '#55627b',
          brightBlue: '#9ec1ff',
          brightCyan: '#7de4ff',
          brightGreen: '#9ef0a8',
          brightMagenta: '#c7a3ff',
          brightRed: '#ffb4b4',
          brightWhite: '#ffffff',
          brightYellow: '#ffe08a',
          cyan: '#58d7c7',
          green: '#7fd36d',
          magenta: '#b48cff',
          red: '#ff8f8f',
          white: '#dfe7ff',
          yellow: '#ffd86b',
        },
      });
      const fitAddon = new FitAddon();

      terminal.loadAddon(fitAddon);
      terminal.open(hostRef.current);
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      
      // Delay measurement slightly to ensure font is active in DOM
      const forceFit = () => {
        if (hostRef.current && isVisible) {
          fitAddon.fit();
          terminal.refresh(0, terminal.rows - 1);
        }
      };

      setTimeout(forceFit, 100);
      setTimeout(forceFit, 500);

      // Handle terminal resizing and sync with backend PTY
      terminal.onResize(({ cols, rows }) => {
        if (bridgeReadyRef.current) {
          socketRef.current?.emit('terminal:resize', { cols, rows });
        }
      });

      function activateLocalFallback(message = '') {
        if (localFallbackReadyRef.current) return;
        if (connectionTimerRef.current) {
          clearTimeout(connectionTimerRef.current);
          connectionTimerRef.current = null;
        }
        bridgeReadyRef.current = false;
        localFallbackReadyRef.current = true;
        setModeLabel(bridgeConfig.fallbackLabel);
        setBannerMessage(bridgeConfig.fallbackBanner);
        if (message) terminal.writeln(message);
      }

      const bootSocket = async () => {
        const socket = io(bridgeConfig.url, {
          transports: ['websocket', 'polling'],
          upgrade: true,
          rememberUpgrade: false,
          query: {
            cols: String(terminal.cols || 120),
            rows: String(terminal.rows || 30),
            shell: session.profileId || '',
          },
        });

        socketRef.current = socket;
        connectionTimerRef.current = setTimeout(() => {
          if (bridgeReadyRef.current || localFallbackReadyRef.current) return;
          socket.disconnect();
          activateLocalFallback('Terminal bridge was not reachable.');
        }, bridgeConfig.connectTimeoutMs || 2400);

        socket.on('connect', () => {
          if (connectionTimerRef.current) {
            clearTimeout(connectionTimerRef.current);
            connectionTimerRef.current = null;
          }
          bridgeReadyRef.current = true;
          localFallbackReadyRef.current = false;
          setModeLabel(bridgeConfig.connectedLabel);
          setBannerMessage(bridgeConfig.connectedBanner);
          terminal.clear();

          if (onConnect) {
            try {
              onConnect();
            } catch (err) {
              console.error('[Terminal] Failed to trigger onConnect profiles reload:', err);
            }
          }

          const snapshot = workspaceSnapshotRef.current;
          if (initialCwd) {
              socket.emit('terminal:set-cwd', initialCwd);
          } else if (snapshot) {
            syncTerminalWorkspaceRoot(snapshot).then(res => {
              if (res?.cwd) socket.emit('terminal:set-cwd', res.cwd);
            });
          }
          if (session.executeInitialCommand) {
              socket.emit('terminal:input', session.executeInitialCommand + '\r');
          }
        });

        socket.on('terminal:output', (data) => {
          terminal.write(data);
          outputBufferRef.current += data;
          if (outputBufferRef.current.length > 5000) {
            outputBufferRef.current = outputBufferRef.current.slice(-5000);
          }
        });

        socket.on('terminal:error', (message) => {
          activateLocalFallback(String(message || 'Terminal shell unavailable.'));
        });

        socket.on('disconnect', () => {
          activateLocalFallback('Terminal bridge disconnected.');
        });
      };

      if (bridgeConfig.shouldConnect) {
        bootSocket();
      } else {
        activateLocalFallback();
      }

      terminal.onData((data) => {
        // Filter out terminal-generated DA responses which PowerShell echoes back as garbage
        if (data.startsWith('\x1b[?')) {
          return;
        }

        if (bridgeReadyRef.current) {
          socketRef.current?.emit('terminal:input', data);
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        if (hostRef.current && hostRef.current.clientWidth > 0 && isVisible) {
          requestAnimationFrame(() => {
            fitAddon.fit();
            terminal.refresh(0, terminal.rows - 1);
            if (bridgeReadyRef.current) {
              socketRef.current?.emit('terminal:resize', {
                cols: terminal.cols,
                rows: terminal.rows,
              });
            }
          });
        }
      });
      resizeObserver.observe(hostRef.current);
      resizeObserverRef.current = resizeObserver;
    };

    // Initialize terminal instantly
    initTerminal();

    return () => {
      resizeObserverRef.current?.disconnect();
      socketRef.current?.disconnect();
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, [bridgeConfig, session.id, session.profileId]); 



  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontFamily = terminalTypography.fontFamily;
      terminalRef.current.options.fontSize = terminalTypography.fontSize;
      terminalRef.current.options.lineHeight = terminalTypography.lineHeight;
      terminalRef.current.options.letterSpacing = terminalTypography.letterSpacing;
      terminalRef.current.options.scrollback = terminalTypography.scrollback;
      terminalRef.current.options.cursorBlink = terminalTypography.cursorBlinking;
      terminalRef.current.options.cursorStyle = terminalTypography.cursorStyle;
      
      const timer = setTimeout(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [terminalTypography]);

  useEffect(() => {
    if (isVisible && terminalRef.current) {
      const timer = setTimeout(() => {
        if (hostRef.current) {
          fitAddonRef.current?.fit();
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
          terminalRef.current?.focus();
        }
      }, 150); // Increased delay for stability
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!registerApi) {
      return;
    }

    registerApi(session.id, {
      getOutput: () => outputBufferRef.current,
      focus: () => {
        terminalRef.current?.focus();
        terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
      },
      clear: () => terminalRef.current?.clear(),
      refresh: () => {
        fitAddonRef.current?.fit();
        terminalRef.current?.refresh(0, terminalRef.current.rows - 1);
        terminalRef.current?.focus();
      },
      writeLines: (lines = []) => {
        if (!terminalRef.current) {
          return;
        }

        lines.forEach((line) => {
          String(line)
            .split(/\r?\n/)
            .forEach((segment) => terminalRef.current.writeln(segment));
        });
      },
      executeCommand: (cmd) => {
        if (!terminalRef.current) return;
        terminalRef.current.focus();
        
        if (bridgeReadyRef.current) {
          socketRef.current?.emit('terminal:input', cmd + '\r');
        } else if (localFallbackReadyRef.current) {
          terminalRef.current.writeln(`\r\nCannot execute command: Native terminal bridge is not connected.`);
        } else {
          // Queue the command if we are still connecting
          const checkInterval = setInterval(() => {
            if (bridgeReadyRef.current) {
              clearInterval(checkInterval);
              socketRef.current?.emit('terminal:input', cmd + '\r');
            } else if (localFallbackReadyRef.current) {
              clearInterval(checkInterval);
              terminalRef.current?.writeln(`\r\nCannot execute command: Native terminal bridge is not connected.`);
            }
          }, 100);
          
          // Clear interval after 5 seconds just in case
          setTimeout(() => clearInterval(checkInterval), 5000);
        }
      },
    });

    return () => {
      registerApi(session.id, null);
    };
  }, [registerApi, session.id]);

  return (
    <div className={`terminal-pane ${isVisible ? 'visible' : 'hidden'}`}>
      <div className="terminal-pane-meta">
        <span className="terminal-pane-name">{session.name}</span>
        {modeLabel ? <span className="terminal-tab-badge">{modeLabel}</span> : null}
      </div>
      {bannerMessage ? <div className="terminal-banner">{bannerMessage}</div> : null}
      <div className="terminal-body" onClick={() => terminalRef.current?.focus()}>
        <div className="terminal-xterm" ref={hostRef} />
      </div>
    </div>
  );
}

export default function Terminal({
  isOpen,
  height,
  isMaximized = false,
  activeView = 'terminal',
  onChangeView,
  onToggleMaximize,
  onResizeStart,
  onClose,
  workspace,
  openFile,
  terminalApiRef,
  diagnostics = [],
  outputEntries = [],
  debugConsoleEntries = [],
  onEvaluateDebug,
  debugSession,
  onClearDebugConsole,
  settings,
  requestPrompt,
}) {
  const [debugFilterText, setDebugFilterText] = useState('');
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [defaultProfileId, setDefaultProfileId] = useState('');
  const [sessions, setSessions] = useState(() => [createSession('Terminal 1')]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [splitSessionIds, setSplitSessionIds] = useState([]);
  const [sessionMeta, setSessionMeta] = useState({});
  const [forwardedPorts, setForwardedPorts] = useState([]);
  const [editingPortId, setEditingPortId] = useState(null);
  const sessionApisRef = useRef(new Map());
  const workspaceSnapshot = workspace.getStructureSnapshot?.() || null;
  const desktopNativeTerminal = isDesktopRuntime();

  // Custom setter for editingPortId that saves metadata to backend when editing completes
  const prevEditingPortIdRef = useRef(null);
  const handleSetEditingPortId = (id) => {
    const prevId = prevEditingPortIdRef.current;
    prevEditingPortIdRef.current = id;
    setEditingPortId(id);

    if (prevId !== null && id === null) {
      const portEntry = forwardedPorts.find(p => p.port === prevId);
      if (portEntry) {
        apiFetch('/api/ports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            port: portEntry.port,
            description: portEntry.description,
            visibility: portEntry.visibility,
          }),
        }).catch(err => console.error('[Ports] Failed to save port metadata:', err));
      }
    }
  };

  // Fetch active tunnels on mount
  useEffect(() => {
    apiFetch('/api/ports')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setForwardedPorts(data);
        }
      })
      .catch((err) => console.error('[Ports] Failed to fetch active ports:', err));
  }, []);

  // Poll for status updates when Ports view is open or a tunnel is connecting
  const hasConnecting = forwardedPorts.some(p => p.status === 'connecting');
  useEffect(() => {
    const shouldPoll = activeView === 'ports' || hasConnecting;
    if (!shouldPoll) return;

    const interval = setInterval(() => {
      apiFetch('/api/ports')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setForwardedPorts(data);
          }
        })
        .catch((err) => console.error('[Ports] Polling error:', err));
    }, 1500);

    return () => clearInterval(interval);
  }, [activeView, hasConnecting]);

  function startTunnel(port, description, visibility) {
    // Optimistically add/update port in UI as connecting
    setForwardedPorts((prev) => {
      const existing = prev.find((e) => e.port === port);
      const newEntry = { port, description, visibility, status: 'connecting', url: null };
      if (existing) {
        return prev.map((e) => e.port === port ? newEntry : e);
      }
      return [...prev, newEntry];
    });

    apiFetch('/api/ports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port, description, visibility }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to start tunnel');
        }
        return res.json();
      })
      .then((updatedPort) => {
        setForwardedPorts((prev) =>
          prev.map((e) => e.port === port ? updatedPort : e)
        );
      })
      .catch((err) => {
        console.error('[Ports] Failed to start tunnel:', err);
        alert(err.message);
        setForwardedPorts((prev) =>
          prev.filter((e) => e.port !== port) // Remove from optimistic UI
        );
      });
  }

  function handleForwardPort(port, description, visibility = 'public') {
    startTunnel(port, description, visibility);
  }

  function handleRemovePort(port) {
    setForwardedPorts((prev) => prev.filter((e) => e.port !== port));

    apiFetch(`/api/ports/${port}`, {
      method: 'DELETE',
    }).catch((err) => console.error('[Ports] Failed to delete tunnel:', err));
  }

  function handleOpenBrowser(url) {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  useEffect(() => {
    setActiveSessionId((current) => current || sessions[0]?.id || '');
  }, [sessions]);

  const loadAvailableProfiles = () => {
    apiFetch('/api/terminal/health')
      .then((response) => response.json())
      .then((payload) => {
        const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
        setAvailableProfiles(profiles);
        setDefaultProfileId(String(payload?.defaultProfileId || profiles[0]?.id || ''));
      })
      .catch(() => {
        setAvailableProfiles([]);
        setDefaultProfileId('');
      });
  };

  useEffect(() => {
    loadAvailableProfiles();
  }, []);

  useEffect(() => {
    if (!defaultProfileId) {
      return;
    }

    setSessions((current) =>
      current.map((session) =>
        session.profileId
          ? session
          : {
            ...session,
            profileId: defaultProfileId,
          }
      )
    );
  }, [defaultProfileId]);

  useEffect(() => {
    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.id || '');
    }
  }, [activeSessionId, sessions]);

  const visibleSessionIds = useMemo(() => {
    if (splitSessionIds.length >= 2) {
      return splitSessionIds.filter((sessionId) => sessions.some((session) => session.id === sessionId));
    }

    return activeSessionId ? [activeSessionId] : sessions[0] ? [sessions[0].id] : [];
  }, [activeSessionId, sessions, splitSessionIds]);

  const terminalFontFamily = useMemo(() => {
    const configuredFontFamily = settings?.terminal?.fontFamily?.trim();
    if (configuredFontFamily) {
      return configuredFontFamily;
    }

    return DESKTOP_TERMINAL_FONT_STACK;
  }, [settings?.terminal?.fontFamily]);

  const terminalTypography = useMemo(() => ({
    fontFamily: terminalFontFamily,
    fontSize: clampNumber(settings?.terminal?.fontSize, 10, 28, DEFAULT_TERMINAL_FONT_SIZE),
    lineHeight: clampNumber(settings?.terminal?.lineHeight, 0.8, 3, DEFAULT_TERMINAL_LINE_HEIGHT),
    letterSpacing: clampNumber(settings?.terminal?.letterSpacing, -5, 10, DEFAULT_TERMINAL_LETTER_SPACING),
    scrollback: clampNumber(settings?.terminal?.scrollback, 100, 1000000, DEFAULT_TERMINAL_SCROLLBACK),
    cursorStyle: settings?.terminal?.cursorStyle || 'block',
    cursorBlinking: settings?.terminal?.cursorBlinking !== false,
  }), [
    settings?.terminal?.fontSize,
    settings?.terminal?.lineHeight,
    settings?.terminal?.letterSpacing,
    settings?.terminal?.scrollback,
    settings?.terminal?.cursorStyle,
    settings?.terminal?.cursorBlinking,
    terminalFontFamily
  ]);

  const activeSessionApi = activeSessionId ? sessionApisRef.current.get(activeSessionId) : null;
  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0] || null;

  const preferredProfileId = useMemo(() => {
    const configuredProfile = String(settings?.terminal?.profile || '').trim();
    if (configuredProfile && availableProfiles.some((profile) => profile.id === configuredProfile)) {
      return configuredProfile;
    }
    return defaultProfileId || availableProfiles[0]?.id || '';
  }, [availableProfiles, defaultProfileId, settings?.terminal?.profile]);

  function registerSessionApi(sessionId, api) {
    if (!api) {
      sessionApisRef.current.delete(sessionId);
      return;
    }

    sessionApisRef.current.set(sessionId, api);
  }

  function updateSessionMeta(sessionId, modeLabel, bannerMessage) {
    setSessionMeta((current) => ({
      ...current,
      [sessionId]: {
        modeLabel,
        bannerMessage,
      },
    }));
  }

  function createNewSession({ split = false, initialCwd = null, title = null, executeInitialCommand = null } = {}) {
    const inheritedProfileId = activeSession?.profileId || preferredProfileId;
    const nextSession = createSession(title || `Terminal ${sessions.length + 1}`, inheritedProfileId);
    if (initialCwd) {
        nextSession.initialCwd = initialCwd;
    }
    if (executeInitialCommand) {
        nextSession.executeInitialCommand = executeInitialCommand;
    }
    setSessions((current) => [...current, nextSession]);
    setActiveSessionId(nextSession.id);
    setSplitSessionIds((current) => {
      if (!split) {
        return [];
      }

      const baseId = activeSessionId || sessions[0]?.id || nextSession.id;
      return [...new Set([baseId, nextSession.id])].slice(0, 2);
    });
  }

  function closeSession(sessionId) {
    if (sessions.length === 1) {
      onClose();
      return;
    }

    setSessions((current) => current.filter((session) => session.id !== sessionId));
    setSplitSessionIds((current) => current.filter((id) => id !== sessionId));
    setSessionMeta((current) => {
      const next = { ...current };
      delete next[sessionId];
      return next;
    });
    sessionApisRef.current.delete(sessionId);

    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((session) => session.id !== sessionId);
      setActiveSessionId(remaining[0]?.id || '');
    }
  }

  function renameActiveSession() {
    const activeSession = sessions.find((session) => session.id === activeSessionId);
    if (!activeSession || !requestPrompt) {
      return;
    }

    requestPrompt({
      title: 'Rename Terminal Session',
      message: 'Choose a new terminal tab name.',
      defaultValue: activeSession.name,
      placeholder: 'Terminal name',
      confirmLabel: 'Rename',
    }).then((nextName) => {
      if (!nextName) {
        return;
      }

      setSessions((current) =>
        current.map((session) =>
          session.id === activeSession.id
            ? {
              ...session,
              name: nextName.trim() || session.name,
            }
            : session
        )
      );
    });
  }

  function updateActiveSessionProfile(nextProfileId) {
    if (!nextProfileId) {
      return;
    }

    setSessions((current) =>
      current.map((session) =>
        session.id === activeSessionId
          ? {
            ...session,
            profileId: nextProfileId,
          }
          : session
      )
    );
  }

  function getProfileLabel(profileId) {
    return availableProfiles.find((profile) => profile.id === profileId)?.label || 'Selected shell';
  }

  async function openNativeTerminal(profileId = '') {
    const resolvedProfileId = String(profileId || activeSession?.profileId || preferredProfileId || '').trim();
    const targetSessionId = activeSessionId || sessions[0]?.id || '';
    let cwd = '';

    try {
      if (workspaceSnapshot) {
        try {
          const syncResult = await syncTerminalWorkspaceRoot(workspaceSnapshot);
          cwd = String(syncResult?.cwd || '').trim();
        } catch {
          cwd = '';
        }
      }

      const response = await fetch(`${getApiOrigin()}/api/terminal/open-native`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: resolvedProfileId,
          cwd,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || 'Unable to open a native terminal window.');
      }

      updateSessionMeta(targetSessionId, 'native', `Opened ${getProfileLabel(resolvedProfileId)}.`);
    } catch (error) {
      updateSessionMeta(
        targetSessionId,
        'native',
        error instanceof Error ? error.message : 'Unable to open the selected native terminal profile.'
      );
    }
  }

  useEffect(() => {
    if (!terminalApiRef) {
      return;
    }

    terminalApiRef.current = {
      focus: () => activeSessionApi?.focus?.(),
      clear: () => activeSessionApi?.clear?.(),
      writeLines: (lines = []) => activeSessionApi?.writeLines?.(lines),
      executeCommand: (cmd) => activeSessionApi?.executeCommand?.(cmd),
      newSession: (options) => createNewSession(options),
      createSession: (options) => createNewSession(options), // Added for compatibility with App.jsx runner code
      splitSession: () => createNewSession({ split: true }),
      renameActiveSession,
      closeActiveSession: () => closeSession(activeSessionId),
    };

    return () => {
      terminalApiRef.current = null;
    };
  }, [activeSessionApi, activeSessionId, terminalApiRef]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="terminal-drawer" style={{ height: `${height}px` }}>
      <div className="terminal-resizer" onMouseDown={onResizeStart} />
      <div className="terminal-shell">
        <div className="terminal-header">
          <BottomPanelTabs activeView={activeView} onChangeView={onChangeView} />
          <div className="terminal-toolbar">
            {activeView === 'debugConsole' ? (
              <>
                <div className="debug-console-filter-wrapper">
                  <input
                    type="text"
                    placeholder="Filter (e.g. text, !exclude, \escape)"
                    value={debugFilterText}
                    onChange={(e) => setDebugFilterText(e.target.value)}
                    className="debug-console-filter-input"
                  />
                  <i className="fa-solid fa-filter filter-icon"></i>
                </div>
                <button
                  type="button"
                  className="terminal-toolbar-btn"
                  onClick={onClearDebugConsole}
                  title="Clear Console"
                >
                  <i className="fa-solid fa-ban"></i>
                </button>
              </>
            ) : null}
            {activeView === 'terminal' ? (
              <>
                <button type="button" className="terminal-toolbar-btn" onClick={() => createNewSession()} title="New Terminal">
                  <i className="fa-solid fa-plus"></i>
                </button>
                <button
                  type="button"
                  className="terminal-toolbar-btn"
                  onClick={() => createNewSession({ split: true })}
                  title="Split Terminal"
                >
                  <i className="fa-solid fa-table-columns"></i>
                </button>
                <button
                  type="button"
                  className="terminal-toolbar-btn"
                  onClick={() => activeSessionApi?.refresh?.()}
                  title="Refresh Terminal"
                >
                  <i className="fa-solid fa-arrows-rotate"></i>
                </button>
                <button type="button" className="terminal-toolbar-btn" onClick={renameActiveSession} title="Rename Terminal">
                  <i className="fa-solid fa-pen"></i>
                </button>
                <button
                  type="button"
                  className="terminal-toolbar-btn"
                  onClick={onToggleMaximize}
                  title={isMaximized ? 'Restore Panel Size' : 'Maximize Panel'}
                >
                  <i className={`fa-solid ${isMaximized ? 'fa-down-left-and-up-right-to-center' : 'fa-up-right-and-down-left-from-center'}`}></i>
                </button>
                {desktopNativeTerminal ? (
                  <button
                    type="button"
                    className="terminal-toolbar-btn"
                    onClick={() => {
                      openNativeTerminal(activeSession?.profileId || preferredProfileId);
                    }}
                    title="Open Native Terminal"
                  >
                    <i className="fa-solid fa-terminal"></i>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="terminal-toolbar-btn"
                    onClick={() => activeSessionApi?.clear?.()}
                    title="Clear Terminal"
                  >
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                )}
                <button
                  type="button"
                  className="terminal-toolbar-btn"
                  onClick={() => closeSession(activeSessionId)}
                  title="Close Terminal Session"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
                {availableProfiles.length ? (
                  <select
                    className="terminal-profile-select"
                    value={activeSession?.profileId || preferredProfileId}
                    onChange={(event) => updateActiveSessionProfile(event.target.value)}
                    title="Choose Terminal Profile"
                  >
                    {availableProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            ) : null}
            <button type="button" className="terminal-toolbar-btn" onClick={onClose} title="Hide Terminal">
              <i className="fa-solid fa-chevron-down"></i>
            </button>
          </div>
        </div>

        {activeView === 'terminal' ? (
          <div className="terminal-tab-strip terminal-session-tabs">
            {sessions.map((session) => {
              const meta = sessionMeta[session.id] || {};
              const isActive = session.id === activeSessionId;
              const isVisible = visibleSessionIds.includes(session.id);
              return (
                <button
                  key={session.id}
                  type="button"
                  className={`terminal-tab ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <span className="terminal-tab-label">{session.name}</span>
                  {meta.modeLabel ? <span className="terminal-tab-badge">{meta.modeLabel}</span> : null}
                  {isVisible && splitSessionIds.length >= 2 ? <span className="terminal-tab-split">split</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {activeView === 'problems' ? (
          <div className="bottom-panel-content">
            <ProblemsView diagnostics={diagnostics} />
          </div>
        ) : null}
        {activeView === 'output' ? (
          <div className="bottom-panel-content">
            <LogEntries entries={outputEntries} emptyMessage="No output has been written yet." />
          </div>
        ) : null}
        {activeView === 'debugConsole' ? (
          <div className="bottom-panel-content" style={{ padding: 0 }}>
            <DebugConsoleView
              entries={debugConsoleEntries}
              filterText={debugFilterText}
              onEvaluate={onEvaluateDebug}
              debugSession={debugSession}
            />
          </div>
        ) : null}
        {activeView === 'ports' ? (
          <div className="bottom-panel-content ports-panel-content">
            <PortsView
              ports={forwardedPorts}
              onForwardPort={handleForwardPort}
              onRemovePort={handleRemovePort}
              onOpenBrowser={handleOpenBrowser}
              onUpdatePort={(updatedPorts) => setForwardedPorts(updatedPorts)}
              editingPortId={editingPortId}
              setEditingPortId={handleSetEditingPortId}
            />
          </div>
        ) : null}

        <div className={`terminal-session-grid ${visibleSessionIds.length > 1 ? 'split' : ''} ${activeView === 'terminal' ? '' : 'inactive'}`}>
          {sessions.map((session) => (
            <TerminalPane
              key={`${session.id}:${session.profileId || 'default'}`}
              session={session}
              workspace={workspace}
              openFile={openFile}
              workspaceSnapshot={workspaceSnapshot}
              isVisible={activeView === 'terminal' && visibleSessionIds.includes(session.id)}
              initialCwd={session.initialCwd}
              onModeChange={updateSessionMeta}
              registerApi={registerSessionApi}
              terminalTypography={terminalTypography}
              useNativeTerminal={desktopNativeTerminal}
              onOpenNativeTerminal={openNativeTerminal}
              profileLabel={getProfileLabel(session.profileId || preferredProfileId)}
              onConnect={loadAvailableProfiles}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
