import React, { useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';

/**
 * MonacoDiffEditor
 *
 * Props:
 *  - tab         : the active (modified) tab object { content, language, name, ... }
 *  - originalTab : the "select for compare" source tab { content, language, name, ... }
 *  - settings    : global settings object
 *  - style       : optional style overrides for the outer wrapper
 */
export default function MonacoDiffEditor({ tab, originalTab, settings, style }) {
  const editorRef = useRef(null);

  const theme =
    settings?.theme?.active?.startsWith('vs-light') || settings?.theme?.monacoTheme === 'vs-light'
      ? 'vs-light'
      : 'vs-dark';

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
      </div>

      {/* Diff Editor */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DiffEditor
          key={`diff-${originalTab?.id}-${tab?.id}`}
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme={theme}
          onMount={(editor) => {
            editorRef.current = editor;
          }}
          options={{
            fontSize,
            wordWrap,
            minimap: { enabled: false },
            readOnly: false,
            scrollBeyondLastLine: false,
            renderSideBySide: true,
            diffWordWrap: 'on',
            ignoreTrimWhitespace: false,
          }}
        />
      </div>
    </div>
  );
}
