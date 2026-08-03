import React, { useEffect, useRef, useState } from 'react';

const TEMPLATES = [
  { name: 'Empty File', ext: '.txt', defaultName: 'untitled.txt', icon: 'fa-regular fa-file', color: '#a0aec0', desc: 'Plain text file' },
  { name: 'HTML5 Document', ext: '.html', defaultName: 'index.html', icon: 'fa-brands fa-html5', color: '#e34c26', desc: 'Standard web page boilerplate' },
  { name: 'JavaScript File', ext: '.js', defaultName: 'app.js', icon: 'fa-brands fa-js', color: '#f7df1e', desc: 'Modern JavaScript script' },
  { name: 'CSS Stylesheet', ext: '.css', defaultName: 'style.css', icon: 'fa-brands fa-css3-alt', color: '#264de4', desc: 'Vanilla CSS stylesheet' },
  { name: 'Python Script', ext: '.py', defaultName: 'main.py', icon: 'fa-brands fa-python', color: '#3776ab', desc: 'Python program boilerplate' },
  { name: 'C++ Source', ext: '.cpp', defaultName: 'main.cpp', icon: 'fa-solid fa-code', color: '#00599c', desc: 'C++ standard boilerplate' },
  { name: 'C Source', ext: '.c', defaultName: 'main.c', icon: 'fa-solid fa-c', color: '#a8b9cc', desc: 'C language boilerplate' },
  { name: 'Java Class', ext: '.java', defaultName: 'Main.java', icon: 'fa-brands fa-java', color: '#5382a1', desc: 'Standard Java class template' }
];

export default function PromptDialog({ request, onCancel, onSubmit }) {
  const [value, setValue] = useState(request?.defaultValue || '');
  const [shake, setShake] = useState(false);
  const inputRef = useRef(null);
  const requestKey = request ? `${request.title}-${request.message || ''}-${request.defaultValue || ''}` : '';
  const lastRequestKeyRef = useRef('');

  useEffect(() => {
    if (!request) {
      lastRequestKeyRef.current = '';
      return;
    }

    if (lastRequestKeyRef.current !== requestKey) {
      lastRequestKeyRef.current = requestKey;
      setValue(request.defaultValue || '');
      setShake(false); // Reset shake on new request

      const frame = window.requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const val = inputRef.current.value;
          const dotIdx = val.lastIndexOf('.');
          if (dotIdx > 0) {
            inputRef.current.setSelectionRange(0, dotIdx);
          } else {
            inputRef.current.select();
          }
        }
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [request, requestKey]);

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
        handleSubmit(value);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel, onSubmit, request, value]);

  const handleSubmit = (val) => {
    // If input is empty, trigger the macOS style shake error!
    if (!val || val.trim() === '') {
      import('../../core/SoundEngine.js').then((module) => {
        module.soundEngine.playError();
      });
      setShake(true);
      setTimeout(() => setShake(false), 400); // Remove class after animation finishes
      return;
    }
    onSubmit(val);
  };

  if (!request) {
    return null;
  }

  const isNewFilePrompt = request.title === 'New File';

  return (
    <div className="confirm-dialog-overlay" onMouseDown={onCancel}>
      <style>{`
        /* Premium New File Dialog Styles */
        .new-file-premium-dialog {
          width: min(580px, calc(100vw - 32px)) !important;
          background: linear-gradient(135deg, rgba(22, 23, 44, 0.98), rgba(12, 13, 24, 0.98)) !important;
          border: 1px solid rgba(139, 92, 246, 0.25) !important;
          border-radius: 20px !important;
          padding: 24px !important;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5), 0 0 100px rgba(139, 92, 246, 0.08) !important;
          gap: 20px !important;
          animation: modalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        @keyframes modalScaleIn {
          from {
            transform: scale(0.92);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .new-file-dialog-header {
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding-bottom: 16px;
        }

        .new-file-dialog-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.25);
          color: #a78bfa;
        }

        .new-file-dialog-header-icon {
          font-size: 22px;
        }

        .new-file-dialog-header .confirm-dialog-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #ffffff, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 4px;
          text-align: left;
        }

        .new-file-dialog-header .confirm-dialog-message {
          font-size: 13px;
          color: rgba(230, 235, 255, 0.6);
          line-height: 1.4;
          text-align: left;
        }

        .new-file-dialog-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .new-file-templates-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(230, 235, 255, 0.4);
          text-align: left;
        }

        .new-file-templates-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          max-height: 240px;
          overflow-y: auto;
          padding-right: 4px;
        }

        /* Custom scrollbar for templates */
        .new-file-templates-grid::-webkit-scrollbar {
          width: 6px;
        }
        .new-file-templates-grid::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 3px;
        }
        .new-file-templates-grid::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .new-file-templates-grid::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .new-file-template-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .new-file-template-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.12);
          transform: translateY(-1px);
        }

        .new-file-template-card.selected {
          background: rgba(139, 92, 246, 0.08);
          border-color: rgba(139, 92, 246, 0.4);
          box-shadow: 0 0 16px rgba(139, 92, 246, 0.06);
        }

        .new-file-template-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          font-size: 16px;
          transition: transform 0.2s ease;
        }

        .new-file-template-card:hover .new-file-template-icon {
          transform: scale(1.08);
        }

        .new-file-template-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }

        .new-file-template-name {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.95);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .new-file-template-desc {
          font-size: 10px;
          color: rgba(230, 235, 255, 0.45);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .new-file-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          margin-top: 8px;
        }

        .new-file-input {
          height: 46px !important;
          padding: 0 60px 0 16px !important;
          border-radius: 12px !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          background: rgba(10, 11, 20, 0.6) !important;
          font-size: 15px !important;
          color: #f4f6ff !important;
          font-family: 'JetBrains Mono', 'Fira Code', monospace !important;
          transition: all 0.2s ease !important;
        }

        .new-file-input:focus {
          border-color: rgba(139, 92, 246, 0.5) !important;
          background: rgba(10, 11, 20, 0.8) !important;
          box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.12) !important;
        }

        .new-file-input-badge {
          position: absolute;
          right: 12px;
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.05em;
          pointer-events: none;
          animation: fadeIn 0.2s ease;
        }

        .new-file-actions {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          padding-top: 16px;
          margin-top: 4px;
        }

        .new-file-btn-secondary {
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          background: rgba(255, 255, 255, 0.02) !important;
          border-radius: 10px !important;
          padding: 8px 16px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: rgba(255, 255, 255, 0.7) !important;
          transition: all 0.2s ease !important;
        }

        .new-file-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.06) !important;
          color: #ffffff !important;
        }

        .new-file-btn-primary {
          background: linear-gradient(135deg, #8b5cf6, #6d28d9) !important;
          border: none !important;
          border-radius: 10px !important;
          padding: 8px 20px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          color: #ffffff !important;
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25) !important;
          transition: all 0.2s ease !important;
        }

        .new-file-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(139, 92, 246, 0.4) !important;
        }
      `}</style>

      {isNewFilePrompt ? (
        <div className={`confirm-dialog prompt-dialog new-file-premium-dialog ${shake ? 'shake-error' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
          <div className="new-file-dialog-header">
            <div className="new-file-dialog-icon-wrapper">
              <i className="fa-regular fa-file-code new-file-dialog-header-icon"></i>
            </div>
            <div>
              <div className="confirm-dialog-title">{request.title}</div>
              {request.message ? <div className="confirm-dialog-message">{request.message}</div> : null}
            </div>
          </div>

          <div className="new-file-dialog-body">
            <div className="new-file-templates-label">Quick Templates</div>
            <div className="new-file-templates-grid">
              {TEMPLATES.map((tpl) => {
                const isSelected = value.endsWith(tpl.ext);
                return (
                  <button
                    key={tpl.name}
                    type="button"
                    className={`new-file-template-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setValue(tpl.defaultName);
                      setTimeout(() => {
                        if (inputRef.current) {
                          inputRef.current.focus();
                          const dotIdx = tpl.defaultName.lastIndexOf('.');
                          if (dotIdx > 0) {
                            inputRef.current.setSelectionRange(0, dotIdx);
                          } else {
                            inputRef.current.select();
                          }
                        }
                      }, 50);
                    }}
                  >
                    <span className="new-file-template-icon" style={{ color: tpl.color }}>
                      <i className={tpl.icon}></i>
                    </span>
                    <div className="new-file-template-info">
                      <span className="new-file-template-name">{tpl.name}</span>
                      <span className="new-file-template-desc">{tpl.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="new-file-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="prompt-dialog-input new-file-input"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={request.placeholder || 'e.g. main.cpp'}
              />
              {value.includes('.') && (
                <span className="new-file-input-badge">
                  {value.split('.').pop().toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <div className="confirm-dialog-actions new-file-actions">
            <button type="button" className="keyboard-shortcuts-btn subtle new-file-btn-secondary" onClick={onCancel}>
              {request.cancelLabel || 'Cancel'}
            </button>
            <button type="button" className="keyboard-shortcuts-btn new-file-btn-primary" onClick={() => handleSubmit(value)}>
              {request.confirmLabel || 'Create File'}
            </button>
          </div>
        </div>
      ) : (
        <div className={`confirm-dialog prompt-dialog ${shake ? 'shake-error' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
          <div className="confirm-dialog-title">{request.title || 'Enter Value'}</div>
          {request.message ? <div className="confirm-dialog-message">{request.message}</div> : null}
          <input
            ref={inputRef}
            type="text"
            className="prompt-dialog-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={request.placeholder || ''}
          />
          <div className="confirm-dialog-actions">
            <button type="button" className="keyboard-shortcuts-btn subtle" onClick={onCancel}>
              {request.cancelLabel || 'Cancel'}
            </button>
            <button type="button" className="keyboard-shortcuts-btn" onClick={() => handleSubmit(value)}>
              {request.confirmLabel || 'OK'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
