import React from 'react';

function Modal({ isOpen, closeModal, children, title }) {
  // Only render children when open to avoid DOM conflicts from conditionally-null children
  if (!isOpen) {
    return null;
  }
  const modalKind = String(title || 'default').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className={`modal overlay d-flex`}>
      <div className={`modalContainer modalContainer--${modalKind}`}>
        <div className="topbar">
          <div className="title">{title}</div>
          <div className="modalControls">
            <button type="button" className="modalControlButtons" onClick={closeModal} aria-label="Close modal">
              x
            </button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
