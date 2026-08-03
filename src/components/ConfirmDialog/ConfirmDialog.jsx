import React, { useEffect, useState } from 'react';

export default function ConfirmDialog({ request, onCancel, onConfirm }) {
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    setRemember(false);
  }, [request]);

  useEffect(() => {
    if (!request) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        onConfirm(remember);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onConfirm, request, remember]);

  if (!request) {
    return null;
  }

  return (
    <div className="confirm-dialog-overlay" onMouseDown={onCancel}>
      <div className="confirm-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="confirm-dialog-title">{request.title || 'Confirm Action'}</div>
        <div className="confirm-dialog-message">{request.message}</div>
        
        {request.showCheckbox && (
          <label className="confirm-dialog-checkbox-label" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '4px',
            fontSize: '13px',
            color: 'rgba(230, 235, 255, 0.64)',
            cursor: 'pointer',
            userSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{
                accentColor: 'var(--accent-color, #7574c6)',
                cursor: 'pointer'
              }}
            />
            {request.checkboxLabel || "Don't ask again"}
          </label>
        )}

        <div className="confirm-dialog-actions">
          <button type="button" className="keyboard-shortcuts-btn subtle" onClick={onCancel}>
            {request.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            className={`keyboard-shortcuts-btn ${request.danger ? 'danger' : ''}`}
            onClick={() => onConfirm(remember)}
          >
            {request.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
