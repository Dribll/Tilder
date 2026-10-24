import React, { useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { registerMonacoThemes } from '../../core/themeRegistry.js';

/**
 * MonacoDiffEditor
 *
 * Props:
 *  - tab         : the active (modified) tab object { content, language, name, ... }
 *  - originalTab : the "select for compare" source tab { content, language, name, ... }
 *  - settings    : global settings object
 *  - style       : optional style overrides for the outer wrapper
 */
export default function MonacoDiffEditor({ tab, originalTab, settings, style, onChange }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const [sideBySide, setSideBySide] = React.useState(true);

  const activeTheme = settings?.theme?.active || 'tilder-formal';

  React.useEffect(() => {
    if (monacoRef.current) {
      try {
        monacoRef.current.editor.setTheme(activeTheme);
      } catch (_) {}
    }
  }, [activeTheme]);

  const fontSize = settings?.editor?.fontSize ?? 13;
  const wordWrap = settings?.editor?.wordWrap ? 'on' : 'off';
  const language = tab?.language ?? 'plaintext';

  const originalContent = originalTab?.content ?? '';
  const modifiedContent = tab?.content ?? '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--editor-bg, #1e1e1e)',
        ...style,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          background: 'var(--sidebar-bg, #252526)',
          borderBottom: '1px solid var(--border, #3e3e42)',
          fontSize: '12px',
          color: 'var(--text-muted, #888)',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--text-secondary, #aaa)' }}>
          <i className="fa-solid fa-left-right" style={{ marginRight: '6px' }} />
          Comparing
        </span>
        <span
          style={{
            background: 'var(--badge-bg, #3a3a3a)',
            borderRadius: '4px',
            padding: '2px 8px',
            color: 'var(--accent, #7c3aed)',
          }}
        >
          {originalTab?.name ?? 'Original'}
        </span>
        <span style={{ color: 'var(--text-muted, #666)' }}>→</span>
        <span
          style={{
            background: 'var(--badge-bg, #3a3a3a)',
            borderRadius: '4px',
            padding: '2px 8px',
            color: 'var(--success, #22c55e)',
          }}
        >
          {tab?.name ?? 'Modified'}
        </span>

        <button
          type="button"
          onClick={() => setSideBySide((v) => !v)}
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '4px',
            color: '#ddd',
            cursor: 'pointer',
            padding: '3px 8px',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title={sideBySide ? 'Switch to Inline View' : 'Switch to Side-by-Side View'}
        >
          <i className={`fa-solid ${sideBySide ? 'fa-bars' : 'fa-table-columns'}`} />
          {sideBySide ? 'Inline Diff' : 'Side-by-Side'}
        </button>
      </div>

      {/* Diff Editor */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DiffEditor
          key={`diff-${originalTab?.id}-${tab?.id}-${sideBySide}`}
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme={activeTheme}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            registerMonacoThemes(monaco);
            monaco.editor.setTheme(activeTheme);
            const modifiedEditor = editor.getModifiedEditor();
            if (modifiedEditor && typeof onChange === 'function') {
              modifiedEditor.onDidChangeModelContent(() => {
                onChange(modifiedEditor.getValue());
              });
            }
          }}
          options={{
            fontSize,
            wordWrap,
            minimap: { enabled: false },
            readOnly: false,
            originalEditable: false,
            scrollBeyondLastLine: false,
            renderSideBySide: sideBySide,
            diffWordWrap: 'on',
            ignoreTrimWhitespace: false,
          }}
        />
      </div>
    </div>
  );
}
