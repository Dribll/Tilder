import React, { useState, useEffect, useRef, useCallback } from 'react';
import './PulseLens.css';

function normalizePath(p) {
  if (!p) return '';
  return String(p)
    .replace(/^file:\/\/\/?/i, '')
    .replace(/^\/([a-zA-Z]:)/, '$1')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function PulseLens({ editorRef, monacoRef, currentFilePath, socketUrl, onLogsUpdate }) {
  const [logs, setLogs] = useState([]);
  const widgetsMapRef = useRef(new Map()); // Map<lineNum, IContentWidget>
  const socketRef = useRef(null);

  // ─── Push or update log entry with execution count tracking ─────────────────
  const pushLog = useCallback((filePath, lineNum, type, msg) => {
    const norm = normalizePath(filePath);
    const line = typeof lineNum === 'number' ? lineNum : parseInt(lineNum, 10);
    if (isNaN(line) || line < 1) return;

    setLogs(prev => {
      const next = [...prev];
      const existingIdx = next.findIndex(l => l.file === norm && l.line === line);

      if (existingIdx >= 0) {
        const existing = next[existingIdx];
        
        // Console ninja appending style: x5 'msg' | 'msg' | 'msg'
        // Let's store history to show it
        const history = existing.history || [existing.msg];
        history.push(String(msg ?? ''));
        if (history.length > 5) history.shift(); // Keep last 5

        next[existingIdx] = {
          ...existing,
          msg: String(msg ?? ''),
          history,
          type: type || 'log',
          count: (existing.count || 1) + 1,
          timestamp: Date.now()
        };
      } else {
        next.push({
          file: norm,
          line: line,
          type: type || 'log',
          msg: String(msg ?? ''),
          history: [String(msg ?? '')],
          count: 1,
          id: Date.now() + Math.random(),
          timestamp: Date.now()
        });
      }
      const newLogs = next.slice(-500);
      if (onLogsUpdate) onLogsUpdate(newLogs);
      return newLogs;
    });
  }, [onLogsUpdate]);

  // ─── Listen for window postMessage (Live Preview iframe) ───────────────────
  useEffect(() => {
    window.TilderPulseLens = {
      log: pushLog,
      clear: () => {
        setLogs([]);
        if (onLogsUpdate) onLogsUpdate([]);
        const editor = editorRef?.current;
        const widgetsMap = widgetsMapRef.current;
        if (editor) {
          for (const widget of widgetsMap.values()) {
            try { editor.removeContentWidget(widget); } catch (e) {}
          }
        }
        widgetsMap.clear();
      }
    };

    const handleMessage = (e) => {
      if (!e.data || e.data.type !== 'PULSE_LOG') return;
      const logType = e.data.isError ? 'error' : (e.data.method || 'log');
      pushLog(e.data.path, e.data.line, logType, e.data.msg);
    };

    window.addEventListener('message', handleMessage);
    return () => {
      delete window.TilderPulseLens;
      window.removeEventListener('message', handleMessage);
    };
  }, [pushLog, editorRef, onLogsUpdate]);

  // ─── Connect to backend socket (External Browser & Server logs) ────────────
  useEffect(() => {
    let sock = null;
    const resolvedApiUrl = (typeof window !== 'undefined' && window.__TILDER_API_BASE_URL__)
      ? String(window.__TILDER_API_BASE_URL__).replace(/\/$/, '')
      : null;
    const targetUrl =
      socketUrl ||
      resolvedApiUrl ||
      (typeof window !== 'undefined' && window.location.hostname
        ? `${window.location.protocol}//${window.location.hostname}:33210`
        : 'http://localhost:33210');

    import('socket.io-client').then(({ io }) => {
      sock = io(targetUrl, { transports: ['websocket', 'polling'] });
      socketRef.current = sock;

      sock.on('pulse-lens:log', (data) => {
        if (!data) return;
        const logType = data.isError ? 'error' : (data.method || 'log');
        pushLog(data.path, data.line, logType, data.msg);
      });
    }).catch(err => {
      console.warn('[PulseLens] Could not connect to socket:', err);
    });

    return () => {
      sock?.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl, pushLog]);

  // ─── Render Monaco Content Widgets (Guaranteed Inline Beside Code) ──────────
  useEffect(() => {
    const editor = editorRef?.current;
    const monaco = monacoRef?.current;
    if (!editor || !monaco || !currentFilePath) return;

    const normCurrent = normalizePath(currentFilePath);
    const currentBaseName = normCurrent.split('/').pop();
    const model = editor.getModel();
    if (!model) return;
    const lineCount = model.getLineCount();

    const fileLogs = logs.filter(l => {
      if (!l.file || isNaN(l.line)) return false;
      const lBase = l.file.split('/').pop();
      return (
        l.file === normCurrent ||
        normCurrent.endsWith('/' + l.file) ||
        l.file.endsWith('/' + normCurrent) ||
        (currentBaseName && lBase === currentBaseName)
      );
    });

    const byLine = {};
    for (const log of fileLogs) {
      byLine[log.line] = log;
    }

    const widgetsMap = widgetsMapRef.current;
    const activeLines = new Set(Object.keys(byLine).map(Number));

    // Remove widgets for lines no longer active
    for (const [line, widget] of widgetsMap.entries()) {
      if (!activeLines.has(line)) {
        try { editor.removeContentWidget(widget); } catch (e) {}
        widgetsMap.delete(line);
      }
    }

    // Add or update widgets
    for (const lineStr of activeLines) {
      const lineNum = Number(lineStr);
      if (lineNum > lineCount || lineNum < 1) continue;

      const log = byLine[lineNum];
      let widget = widgetsMap.get(lineNum);

      const colorMap = {
        log: 'var(--vscode-debugConsole-infoForeground, #75beff)',
        error: 'var(--vscode-debugConsole-errorForeground, #f48771)',
        warn: 'var(--vscode-debugConsole-warningForeground, #cca700)',
        info: 'var(--vscode-debugConsole-infoForeground, #75beff)'
      };
      
      const badgeColor = colorMap[log.type] || colorMap.log;
      
      // Format like Pulse Lens: x5 'hi' | 'hi'
      const countBadge = log.count > 1 ? `<span class="pl-count">x${log.count}</span> ` : '';
      const historyStr = log.history ? log.history.map(h => escapeHtml(h)).join(' <span class="pl-sep">|</span> ') : escapeHtml(log.msg);
      
      const domNodeHtml = `
        <div class="pl-inline-widget" style="color: ${badgeColor};">
          <i class="fa-solid fa-hourglass-half pl-icon"></i>
          ${countBadge}<span class="pl-msg">${historyStr}</span>
        </div>
      `;

      if (!widget) {
        const domNode = document.createElement('div');
        domNode.innerHTML = domNodeHtml;
        domNode.className = 'pl-inline-container';

        widget = {
          getId: () => `pl.inline.${lineNum}`,
          getDomNode: () => domNode,
          getPosition: () => ({
            position: { lineNumber: lineNum, column: model.getLineMaxColumn(lineNum) },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
          })
        };
        try {
          editor.addContentWidget(widget);
          widgetsMap.set(lineNum, widget);
        } catch (e) {}
      } else {
        const domNode = widget.getDomNode();
        if (domNode) {
          domNode.innerHTML = domNodeHtml;
          try { editor.layoutContentWidget(widget); } catch(e) {}
        }
      }
    }

  }, [logs, currentFilePath, editorRef, monacoRef]);

  // Headless component, no floating UI
  return null;
}
