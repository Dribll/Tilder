import React, { useState, useEffect } from 'react';
import './AILensModal.css';

export default function AILensModal({ isOpen, onClose, targetFile, workspace }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (isOpen && targetFile) {
      setLoading(true);
      setSummary('');
      
      // Mock AI processing delay
      const timer = setTimeout(() => {
        const ext = targetFile.split('.').pop()?.toLowerCase();
        let mockText = `Analysis of ${targetFile.split('/').pop()}:\n\n`;
        
        if (ext === 'jsx' || ext === 'tsx') {
          mockText += "This appears to be a React Component. It likely handles UI rendering and state management. The code structure suggests modular architecture with possible hooks integration for side effects.";
        } else if (ext === 'js' || ext === 'ts') {
          mockText += "This is a JavaScript/TypeScript module. It likely contains business logic, utility functions, or API integrations. Check exported functions for entry points.";
        } else if (ext === 'css') {
          mockText += "This is a stylesheet containing styling rules. It uses modern CSS features for layout and visual presentation.";
        } else {
          mockText += "This file contains configuration or data. Its structure is essential for the project's setup and operation.";
        }
        
        setSummary(mockText);
        setLoading(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isOpen, targetFile]);

  if (!isOpen) return null;

  return (
    <div className="ai-lens-overlay" onClick={onClose}>
      <div className="ai-lens-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-lens-header">
          <div className="ai-lens-title">
            <i className="fa-solid fa-wand-magic-sparkles"></i> AI Workspace Lens
          </div>
          <button className="ai-lens-close" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className="ai-lens-content">
          <div className="ai-lens-target">
            <i className="fa-regular fa-file-code"></i> {targetFile.split('/').pop()}
          </div>
          
          {loading ? (
            <div className="ai-lens-loading">
              <div className="ai-lens-spinner"></div>
              <span>Analyzing file structure...</span>
            </div>
          ) : (
            <div className="ai-lens-result">
              {summary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
