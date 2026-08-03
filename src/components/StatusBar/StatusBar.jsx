import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EDITOR_LANGUAGE_REGISTRY } from '../../../shared/editor/languageRegistry.js';

const LANGUAGE_OPTIONS = [...EDITOR_LANGUAGE_REGISTRY]
  .map((entry) => ({
    id: entry.id,
    label: entry.aliases?.[0] || entry.id,
  }))
  .sort((left, right) => {
    if (left.id === 'plaintext') {
      return -1;
    }

    if (right.id === 'plaintext') {
      return 1;
    }

    return left.label.localeCompare(right.label);
  });

const INDENT_OPTIONS = [
  { id: 'spaces-2', label: 'Spaces: 2', insertSpaces: true, tabSize: 2 },
  { id: 'spaces-4', label: 'Spaces: 4', insertSpaces: true, tabSize: 4 },
  { id: 'spaces-8', label: 'Spaces: 8', insertSpaces: true, tabSize: 8 },
  { id: 'tabs-2', label: 'Tab Size: 2', insertSpaces: false, tabSize: 2 },
  { id: 'tabs-4', label: 'Tab Size: 4', insertSpaces: false, tabSize: 4 },
  { id: 'tabs-8', label: 'Tab Size: 8', insertSpaces: false, tabSize: 8 },
];

const EOL_OPTIONS = [
  { id: 'LF', label: 'LF' },
  { id: 'CRLF', label: 'CRLF' },
];

function Menu({ title, children, anchorRef, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleOutside(event) {
      if (anchorRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [anchorRef, onClose]);

  return (
    <div className="statusbar-menu" ref={menuRef}>
      <div className="statusbar-menu-title">{title}</div>
      <div className="statusbar-menu-items">{children}</div>
    </div>
  );
}

export default function StatusBar({
  activeTab,
  intelliSense,
  currentLanguageCapability,
  runtimeMode,
  rootName,
  isTrusted,
  status,
  notifications,
  onGoToLine,
  onSetLanguage,
  onSetIndentation,
  onSetEol,
  onMarkNotificationsRead,
  onClearNotifications,
  settings,
  detectedRuntimes,
  customRuntimes,
  onSelectCompiler,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const notificationButtonRef = useRef(null);
  const intelliSenseButtonRef = useRef(null);
  const lineButtonRef = useRef(null);
  const indentButtonRef = useRef(null);
  const eolButtonRef = useRef(null);
  const languageButtonRef = useRef(null);
  const compilerButtonRef = useRef(null);
  const [perf, setPerf] = useState({ cpu: 0, ram: 0 });

  useEffect(() => {
    if (!settings?.performance?.statusMonitor) return;
    
    const fetchStats = async () => {
      if (runtimeMode !== 'desktop-local') return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { desktopReadFile } = await import('../../core/desktopFileApi.js');
        
        // 1. Fallback / Basic stats
        let cpu = 0;
        let ram = 0;
        let cpuTemp = 0;
        let gpu = 0;
        let gpuTemp = 0;

        try {
          const stats = await invoke('get_system_stats');
          cpu = Math.round(stats.cpu);
          ram = Math.round(stats.ram);
        } catch (e) {}

        // 2. Try to read the rich monitor data from the PS1 service
        try {
          const monitorData = await desktopReadFile('C:\\ProgramData\\Tilder\\monitor.json');
          if (monitorData) {
            const parsed = JSON.parse(monitorData);
            // Stale check: only use this data if it was written within the last 10 seconds
            const ts = parsed.timestamp || parsed.updatedAt || null;
            const ageMs = ts ? (Date.now() - new Date(ts).getTime()) : Infinity;
            if (ageMs < 10_000) {
              if (typeof parsed.cpuUsage === 'number' && parsed.cpuUsage >= 0) cpu = parsed.cpuUsage;
              if (typeof parsed.cpuTemp === 'number') cpuTemp = parsed.cpuTemp;
              if (typeof parsed.gpuUsage === 'number' && parsed.gpuUsage >= 0) gpu = parsed.gpuUsage;
              if (typeof parsed.gpuTemp === 'number') gpuTemp = parsed.gpuTemp;
            }
          }
        } catch (e) {}

        setPerf({ cpu, ram, cpuTemp, gpu, gpuTemp });
      } catch (err) {
        console.error('Failed to fetch system stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [settings?.performance?.statusMonitor, runtimeMode]);

  const languageLabel = useMemo(() => {
    return LANGUAGE_OPTIONS.find((option) => option.id === (activeTab?.language || 'plaintext'))?.label || 'Plain Text';
  }, [activeTab?.language]);

  const compilerLabel = useMemo(() => {
    if (!activeTab?.language) return null;
    const lang = activeTab.language;
    // Show custom if set
    if (customRuntimes?.[lang]) {
      const cr = customRuntimes[lang];
      return cr.label || cr.executable;
    }
    // Show detected runtime
    const langMap = { python: 'python', javascript: 'node', typescript: 'node', java: 'java', rust: 'rust', c: 'gcc', cpp: 'g++', go: 'go' };
    const rkey = langMap[lang];
    if (rkey && detectedRuntimes?.[rkey]) {
      const rt = detectedRuntimes[rkey];
      return `${rt.executable} (${rt.version.split(' ').slice(-1)[0] || rt.version})`;
    }
    return null;
  }, [activeTab?.language, detectedRuntimes, customRuntimes]);

  const indentLabel = status.insertSpaces ? `Spaces: ${status.tabSize}` : `Tab Size: ${status.tabSize}`;
  const selectionLabel = status.selectionLength
    ? `${status.selectionLength} selected${status.selectedLines > 1 ? `, ${status.selectedLines} lines` : ''}`
    : null;
  const rootLabel = rootName || 'No Folder';
  const unreadCount = notifications.filter((entry) => !entry.read).length;
  const runtimeBadgeLabel = runtimeMode === 'desktop-local' ? 'Desktop' : 'Web';

  const installCommand = currentLanguageCapability?.installCommandWindows || currentLanguageCapability?.installCommand || '';

  async function copyInstallCommand() {
    if (!installCommand) {
      return;
    }

    try {
      await navigator.clipboard.writeText(installCommand);
    } catch {
      // Ignore clipboard errors in the status menu.
    }
  }

  function renderMenu() {
    if (openMenu === 'notifications') {
      return (
        <Menu title="Notifications" anchorRef={notificationButtonRef} onClose={() => setOpenMenu(null)}>
          <div className="statusbar-menu-actions">
            <button type="button" className="statusbar-menu-action" onClick={onClearNotifications}>
              Clear All
            </button>
          </div>
          {notifications.length ? (
            notifications.map((entry) => (
              <div key={entry.id} className={`statusbar-notification-item ${entry.read ? '' : 'unread'}`}>
                <div className="statusbar-notification-text">{entry.message}</div>
                <div className="statusbar-notification-time">{entry.time}</div>
              </div>
            ))
          ) : (
            <div className="statusbar-notification-empty">No notifications</div>
          )}
        </Menu>
      );
    }

    if (openMenu === 'indent') {
      return (
        <Menu title="Indentation" anchorRef={indentButtonRef} onClose={() => setOpenMenu(null)}>
          {INDENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`statusbar-menu-item ${option.insertSpaces === status.insertSpaces && option.tabSize === status.tabSize ? 'active' : ''}`}
              onClick={() => {
                onSetIndentation(option);
                setOpenMenu(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </Menu>
      );
    }

    if (openMenu === 'eol') {
      return (
        <Menu title="End Of Line" anchorRef={eolButtonRef} onClose={() => setOpenMenu(null)}>
          {EOL_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`statusbar-menu-item ${option.id === status.eol ? 'active' : ''}`}
              onClick={() => {
                onSetEol(option.id);
                setOpenMenu(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </Menu>
      );
    }

    if (openMenu === 'language') {
      return (
        <Menu title="Language Mode" anchorRef={languageButtonRef} onClose={() => setOpenMenu(null)}>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`statusbar-menu-item ${option.id === (activeTab?.language || 'plaintext') ? 'active' : ''}`}
              onClick={() => {
                onSetLanguage(option.id);
                setOpenMenu(null);
              }}
            >
              {option.label}
            </button>
          ))}
        </Menu>
      );
    }

    if (openMenu === 'intellisense') {
      return (
        <Menu title="IntelliSense" anchorRef={intelliSenseButtonRef} onClose={() => setOpenMenu(null)}>
          <div className="statusbar-intellisense-card">
            <div className="statusbar-intellisense-row">
              <strong>Provider:</strong> {currentLanguageCapability?.serverLabel || intelliSense?.serverLabel || intelliSense?.statusLabel || 'Unknown'}
            </div>
            <div className="statusbar-intellisense-row">
              <strong>Status:</strong> {intelliSense?.statusLabel || 'Unknown'}
            </div>
            {currentLanguageCapability?.detail ? (
              <div className="statusbar-intellisense-note">{currentLanguageCapability.detail}</div>
            ) : null}
            {currentLanguageCapability?.installHint ? (
              <div className="statusbar-intellisense-note">{currentLanguageCapability.installHint}</div>
            ) : null}
            {installCommand ? (
              <>
                <div className="statusbar-intellisense-command">{installCommand}</div>
                <button type="button" className="statusbar-menu-action" onClick={copyInstallCommand}>
                  Copy Install Command
                </button>
              </>
            ) : null}
          </div>
        </Menu>
      );
    }

    if (openMenu === 'compiler') {
      const lang = activeTab?.language;
      const langMap = { python: 'python', javascript: 'node', typescript: 'node', java: 'java', rust: 'rust', c: 'gcc', cpp: 'g++', go: 'go' };
      const rkey = langMap[lang] || lang;
      const detected = detectedRuntimes?.[rkey];
      return (
        <Menu title={`Select ${languageLabel} Interpreter`} anchorRef={compilerButtonRef} onClose={() => setOpenMenu(null)}>
          <div className="statusbar-compiler-list">
            {detected ? (
              <button
                type="button"
                className={`statusbar-menu-item ${!customRuntimes?.[lang] ? 'active' : ''}`}
                onClick={() => { onSelectCompiler?.(lang, null); setOpenMenu(null); }}
              >
                <span className="statusbar-compiler-name">{detected.executable}</span>
                <span className="statusbar-compiler-version">{detected.version}</span>
                <span className="statusbar-compiler-tag">System Default</span>
              </button>
            ) : (
              <div className="statusbar-menu-item disabled">No system interpreter detected</div>
            )}
            {customRuntimes?.[lang] && (
              <button
                type="button"
                className="statusbar-menu-item active"
                onClick={() => { onSelectCompiler?.(lang, null); setOpenMenu(null); }}
              >
                <span className="statusbar-compiler-name">{customRuntimes[lang].executable}</span>
                <span className="statusbar-compiler-tag">Custom (Active)</span>
              </button>
            )}
            <div className="statusbar-compiler-custom">
              <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <input
                  type="text"
                  className="statusbar-compiler-input"
                  placeholder="Enter custom path..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      onSelectCompiler?.(lang, { executable: e.target.value.trim(), label: e.target.value.trim() });
                      setOpenMenu(null);
                    }
                  }}
                  style={{ flex: 1 }}
                />
                {runtimeMode === 'desktop-local' && (
                  <button
                    type="button"
                    className="statusbar-compiler-browse"
                    onClick={async () => {
                      try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const selection = await invoke('desktop_pick_file');
                        if (selection && selection.path) {
                          onSelectCompiler?.(lang, { executable: selection.path, label: selection.path });
                          setOpenMenu(null);
                        }
                      } catch (err) {
                        console.error('Failed to pick custom compiler path:', err);
                      }
                    }}
                  >
                    Browse...
                  </button>
                )}
              </div>
              <div className="statusbar-compiler-hint">Press Enter or Browse to select custom path</div>
            </div>
          </div>
        </Menu>
      );
    }

    return null;
  }

  return (
    <div className="areastatusBarWrapper">
      <div className="statusBarWrapper">
        <div className="statusbar-main">
          <div className="statusbar-left">
            <span className="statusbar-badge">{runtimeBadgeLabel}</span>
            <span className="statusbar-item subtle">{rootLabel}</span>
            {isTrusted === false && (
              <span className="statusbar-badge" style={{ backgroundColor: '#e52920', color: 'white' }} title="Some features like Terminal and Code Runner are disabled in Restricted Mode for security.">
                <i className="fa-solid fa-shield-halved" style={{ marginRight: '6px' }}></i>
                Restricted Mode
              </span>
            )}
            {activeTab ? <span className="statusbar-item subtle">{activeTab.dirty ? 'Unsaved Changes' : 'Ready'}</span> : null}
            {activeTab && intelliSense ? (
              <button
                type="button"
                className="statusbar-item subtle statusbar-intellisense-button"
                ref={intelliSenseButtonRef}
                title={intelliSense.detail}
                onClick={() => setOpenMenu((current) => (current === 'intellisense' ? null : 'intellisense'))}
              >
                {intelliSense.statusLabel}
              </button>
            ) : null}
            <button
              type="button"
              className="statusbar-item statusbar-notification-button"
              ref={notificationButtonRef}
              onClick={() =>
                setOpenMenu((current) => {
                  const next = current === 'notifications' ? null : 'notifications';
                  if (next === 'notifications') {
                    onMarkNotificationsRead();
                  }
                  return next;
                })
              }
            >
              Notifications {unreadCount ? `(${unreadCount})` : ''}
            </button>
            {settings?.performance?.statusMonitor && (
              <div className="statusbar-performance" style={{ display: 'flex', gap: '8px', marginLeft: '12px', alignItems: 'center' }}>
                <div className="statusbar-item" title="CPU Usage & Temp" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85, fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '4px' }}>
                  <i className="fa-solid fa-microchip" style={{ color: perf.cpu > 80 || perf.cpuTemp > 85 ? '#f87171' : '#60a5fa', fontSize: '12px' }}></i>
                  <span style={{ minWidth: '45px' }}>CPU {perf.cpu}%</span>
                  {perf.cpuTemp > 0 && <span style={{ color: perf.cpuTemp > 85 ? '#f87171' : '#9ca3af' }}>{perf.cpuTemp}°C</span>}
                  <div style={{ width: '20px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${perf.cpu}%`, height: '100%', background: perf.cpu > 80 ? '#f87171' : '#60a5fa', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
                {perf.gpu > 0 && (
                  <div className="statusbar-item" title="GPU Usage & Temp" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85, fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '4px' }}>
                    <i className="fa-solid fa-gamepad" style={{ color: perf.gpu > 80 || perf.gpuTemp > 85 ? '#f87171' : '#a78bfa', fontSize: '12px' }}></i>
                    <span style={{ minWidth: '45px' }}>GPU {perf.gpu}%</span>
                    {perf.gpuTemp > 0 && <span style={{ color: perf.gpuTemp > 85 ? '#f87171' : '#9ca3af' }}>{perf.gpuTemp}°C</span>}
                    <div style={{ width: '20px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${perf.gpu}%`, height: '100%', background: perf.gpu > 80 ? '#f87171' : '#a78bfa', transition: 'width 0.3s ease' }}></div>
                    </div>
                  </div>
                )}
                <div className="statusbar-item" title="RAM Usage" style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85, fontSize: '11px', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '4px' }}>
                  <i className="fa-solid fa-memory" style={{ color: '#34d399', fontSize: '12px' }}></i>
                  <span>RAM {perf.ram} MB</span>
                </div>
              </div>
            )}
          </div>
          <div className="statusbar-right">
            {selectionLabel ? <span className="statusbar-item subtle">{selectionLabel}</span> : null}
            {activeTab ? (
              <>
                <span className="statusbar-item">Lines: {status.lines}</span>
                <button type="button" className="statusbar-item" ref={lineButtonRef} onClick={onGoToLine}>
                  Ln {status.line}, Col {status.column}
                </button>
                <button
                  type="button"
                  className="statusbar-item"
                  ref={indentButtonRef}
                  onClick={() => setOpenMenu((current) => (current === 'indent' ? null : 'indent'))}
                >
                  {indentLabel}
                </button>
                <span className="statusbar-item">UTF-8</span>
                <button
                  type="button"
                  className="statusbar-item"
                  ref={eolButtonRef}
                  onClick={() => setOpenMenu((current) => (current === 'eol' ? null : 'eol'))}
                >
                  {status.eol}
                </button>
                <button
                  type="button"
                  className="statusbar-item"
                  ref={languageButtonRef}
                  onClick={() => setOpenMenu((current) => (current === 'language' ? null : 'language'))}
                >
                  {languageLabel}
                </button>
                {compilerLabel ? (
                  <button
                    type="button"
                    className="statusbar-item statusbar-compiler-button"
                    ref={compilerButtonRef}
                    onClick={() => setOpenMenu((current) => (current === 'compiler' ? null : 'compiler'))}
                    title="Select Interpreter / Compiler"
                  >
                    <i className="fa-solid fa-microchip" style={{ fontSize: '10px', marginRight: '4px' }}></i>
                    {compilerLabel}
                  </button>
                ) : null}
              </>
            ) : (
              <span className="statusbar-item subtle">No Active Editor</span>
            )}
          </div>
        </div>
        {renderMenu()}
      </div>
    </div>
  );
}
