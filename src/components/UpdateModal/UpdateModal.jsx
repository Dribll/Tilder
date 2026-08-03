import React, { useEffect, useState } from 'react';
import { soundEngine } from '../../core/SoundEngine.js';
import './UpdateModal.css';

export default function UpdateModal({ update, currentVersion, onClose }) {
  const [show, setShow] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0); // 0 to 1
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(true);
      soundEngine.playWarning(); // Or a custom notification sound
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    if (downloading) return; // Prevent closing while downloading
    soundEngine.playClick();
    setShow(false);
    setTimeout(() => onClose(), 300);
  };

  const handleInstall = async () => {
    soundEngine.playClick();
    setDownloading(true);
    setErrorMsg(null);

    let contentLength = 0;
    let downloaded = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            setTotalBytes(contentLength);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setDownloadedBytes(downloaded);
            if (contentLength > 0) {
              setProgress(downloaded / contentLength);
            }
            break;
          case 'Finished':
            setProgress(1);
            break;
          default:
            break;
        }
      });

      // After successful install, relaunch the app
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.error('Update failed:', err);
      setErrorMsg(err.message || String(err));
      setDownloading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className={`update-modal-overlay ${show ? 'visible' : ''}`}>
      <div className={`update-modal ${show ? 'visible' : ''}`}>
        
        <div className="update-modal-header">
          <div className="update-icon">
            <i className="fa-solid fa-cloud-arrow-down"></i>
          </div>
          <div className="update-title-group">
            <h2>Update Available</h2>
            <div className="update-version">
              Current: {currentVersion} &nbsp;→&nbsp; <strong>v{update.version}</strong>
            </div>
          </div>
        </div>

        <div className="update-modal-content">
          <div className="update-release-notes">
            {update.body || 'No release notes provided.'}
          </div>

          {(downloading || errorMsg) && (
            <div className="update-progress-container">
              {errorMsg ? (
                <div style={{ color: '#ff4d4f', fontSize: '13px' }}>
                  <strong>Update Failed:</strong> {errorMsg}
                </div>
              ) : (
                <>
                  <div className="update-progress-bar-bg">
                    <div 
                      className="update-progress-bar-fill" 
                      style={{ width: `${Math.max(2, progress * 100)}%` }}
                    ></div>
                  </div>
                  <div className="update-progress-stats">
                    <span>Downloading update...</span>
                    <span>{formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="update-actions">
          <button 
            className="update-btn later" 
            onClick={handleClose} 
            disabled={downloading}
          >
            Remind Me Later
          </button>
          <button 
            className="update-btn install" 
            onClick={handleInstall} 
            disabled={downloading}
          >
            {downloading ? 'Downloading...' : 'Download & Install'}
          </button>
        </div>

      </div>
    </div>
  );
}
