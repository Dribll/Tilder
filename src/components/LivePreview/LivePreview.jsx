import React from 'react';

export default function LivePreview({ isOpen, htmlDocument, url, width, onRefresh, onOpenExternal, onOpenInBrowser, onClose }) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside className="live-preview-panel" style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}>
      <div className="live-preview-header">
        <div className="live-preview-title-group">
          <span className="live-preview-title">Live Preview</span>
          <span className="live-preview-subtitle">HTML preview updates from the active tab.</span>
        </div>
        <div className="live-preview-actions">
          <button type="button" className="live-preview-btn" onClick={onRefresh} title="Refresh Preview">
            <span><i className="fa-solid fa-rotate-right"></i></span>
          </button>
          {onOpenInBrowser ? (
            <button
              type="button"
              className="live-preview-btn"
              onClick={onOpenInBrowser}
              title="Open in Chrome/Edge (with Pulse Lens auto-connected)"
            >
              <span><i className="fa-solid fa-globe"></i></span>
            </button>
          ) : null}
          <button type="button" className="live-preview-btn" onClick={onOpenExternal} title="Open In New Tab">
            <span><i className="fa-solid fa-up-right-from-square"></i></span>
          </button>
          <button type="button" className="live-preview-btn" onClick={onClose} title="Close Preview">
            <span><i className="fa-solid fa-xmark"></i></span>
          </button>
        </div>
      </div>
      <div className="live-preview-body">
        {url || htmlDocument ? (
          <iframe
            className="live-preview-frame"
            title="Tilder Live Preview"
            src={url || undefined} srcDoc={url ? undefined : htmlDocument}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <div className="live-preview-empty">Preview is preparing...</div>
        )}
      </div>
    </aside>
  );
}
