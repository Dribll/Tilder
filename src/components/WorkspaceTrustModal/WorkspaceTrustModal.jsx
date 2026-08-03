import React, { useEffect, useState } from 'react';
import { soundEngine } from '../../core/SoundEngine.js';
import './WorkspaceTrustModal.css';

export default function WorkspaceTrustModal({ folderName, onTrust, onDeny }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Slight delay for animation
    const timer = setTimeout(() => {
      setShow(true);
      soundEngine.playWarning();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleTrust = () => {
    soundEngine.playSuccess();
    setShow(false);
    setTimeout(() => onTrust(), 300); // Wait for exit animation
  };

  const handleDeny = () => {
    soundEngine.playClick();
    setShow(false);
    setTimeout(() => onDeny(), 300);
  };

  return (
    <div className={`workspace-trust-overlay ${show ? 'visible' : ''}`}>
      <div className={`workspace-trust-modal ${show ? 'visible' : ''}`}>
        <div className="trust-icon">
          <i className="fa-solid fa-shield-halved"></i>
        </div>
        <h2>Do you trust the authors of the files in this folder?</h2>
        <p className="trust-folder-name">{folderName || 'this workspace'}</p>
        <p className="trust-description">
          Code provides features that may automatically execute files in this folder.
          If you don't trust the authors of these files, we recommend you continue in Restricted Mode in which these features are disabled.
        </p>
        <div className="trust-actions">
          <button className="trust-btn deny" onClick={handleDeny}>
            No, I don't trust the authors
            <br />
            <small>Browse folder in restricted mode</small>
          </button>
          <button className="trust-btn approve" onClick={handleTrust}>
            Yes, I trust the authors
            <br />
            <small>Trust folder and enable all features</small>
          </button>
        </div>
      </div>
    </div>
  );
}
