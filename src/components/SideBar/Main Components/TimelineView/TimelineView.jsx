import React, { useState, useEffect } from 'react';
import './TimelineView.css';

export default function TimelineView({ ariaExpandedisplaytimeline, workspace }) {
  const [history, setHistory] = useState([]);
  const [gitHistory, setGitHistory] = useState([]);
  
  const activeTabId = workspace?.activeTabId;

  useEffect(() => {
    if (!ariaExpandedisplaytimeline || !activeTabId) {
      setHistory([]);
      return;
    }

    const loadHistory = async () => {
      const tabHistory = workspace.history?.[activeTabId] || [];
      // reverse to show newest first
      setHistory([...tabHistory].reverse());

      // Attempt to fetch real git history for the active file
      try {
        const activeTab = workspace.tabs?.find(t => t.id === activeTabId);
        if (activeTab && activeTab.path && activeTab.path !== 'root') {
          const { getScmLog } = await import('../../../../core/scmApi.js');
          const rootPath = window.__tilderWorkspaceRoot;
          if (rootPath) {
            const result = await getScmLog(rootPath, activeTab.path);
            if (result && result.commits) {
              setGitHistory(result.commits);
            }
          }
        }
      } catch (err) {
        // Ignore git log errors
      }
    };

    loadHistory();
    
    // We should listen for some save event to refresh, but for now we poll or just load when activated.
    const interval = setInterval(loadHistory, 5000);
    return () => clearInterval(interval);

  }, [ariaExpandedisplaytimeline, activeTabId, workspace]);

  const handleRestore = (historyItem) => {
    if (!window.confirm('Restore this version? This will overwrite the current unsaved changes.')) return;
    const tab = workspace.tabs.find(t => t.id === activeTabId);
    if (tab) {
      tab.content = historyItem.content;
      tab.dirty = true; // Mark as dirty so they can save it
      // if Monaco is active, we might need a way to tell it to update.
      // A common way is dispatching an event
      window.dispatchEvent(new CustomEvent('tilder-file-content-replaced', { detail: { tabId: activeTabId, content: historyItem.content } }));
    }
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString() + ' - ' + d.toLocaleDateString();
  };

  return (
    <div className="timeline-view-container" style={{ display: ariaExpandedisplaytimeline ? 'flex' : 'none' }}>
      <div className="timeline-header">
        <h5>TIMELINE</h5>
      </div>
      <div className="timeline-content">
        {!activeTabId ? (
          <div className="timeline-empty">No active editor</div>
        ) : history.length === 0 ? (
          <div className="timeline-empty">No local saves for this file yet.</div>
        ) : (
          <div className="timeline-list">
            {history.map((item, idx) => (
              <div key={item.timestamp} className="timeline-item">
                <div className="timeline-item-icon">
                  <span><i className="fa-regular fa-clock"></i></span>
                </div>
                <div className="timeline-item-details">
                  <div className="timeline-item-title">File Saved</div>
                  <div className="timeline-item-time">{formatTime(item.timestamp)}</div>
                </div>
                <div className="timeline-item-actions">
                  <button type="button" onClick={() => handleRestore(item)} title="Restore Version">
                    <span><i className="fa-solid fa-rotate-left"></i></span>
                  </button>
                </div>
              </div>
            ))}
            
            {gitHistory.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '8px' }}>
                <div className="timeline-item-title" style={{ marginBottom: '8px', color: 'var(--vscode-descriptionForeground)' }}>GIT HISTORY</div>
                {gitHistory.map((commit) => (
                  <div key={commit.hash} className="timeline-item" style={{ opacity: 0.8 }}>
                    <div className="timeline-item-icon">
                      <span><i className="fa-solid fa-code-commit"></i></span>
                    </div>
                    <div className="timeline-item-details">
                      <div className="timeline-item-title">{commit.message}</div>
                      <div className="timeline-item-time">{(commit.hash || '').slice(0, 7)} • {commit.author_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
