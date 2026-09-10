import React, { useState, useEffect } from 'react';
import './CodeSearch.css';
import { apiFetch } from '../../../../core/apiBase.js';

export default function CodeSearch({ fileTree, onFileSelect }) {
  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [isMatchCase, setIsMatchCase] = useState(false);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const { isDesktop } = useWorkspace();

  const presets = [
    { label: 'Async Functions', icon: 'fa-bolt', regex: 'async\\s+function\\s+\\w+|const\\s+\\w+\\s*=\\s*async\\s*\\(' },
    { label: 'React Hooks', icon: 'fa-link', regex: 'use[A-Z]\\w*\\(' },
    { label: 'Class Definitions', icon: 'fa-cubes', regex: 'class\\s+\\w+' },
    { label: 'Console Logs', icon: 'fa-terminal', regex: 'console\\.(log|warn|error|info)\\s*\\(' },
    { label: 'TODOs & FIXMEs', icon: 'fa-clipboard-list', regex: '\\/\\/\\s*(TODO|FIXME)' },
    { label: 'Exported Entities', icon: 'fa-file-export', regex: 'export\\s+(const|let|var|function|class|default)\\s+\\w+' }
  ];

  const handleSearch = async (searchRegexStr) => {
    if (!searchRegexStr || searchRegexStr.trim() === '') return;
    setIsSearching(true);
    setResults([]);
    
    try {
      const response = await apiFetch('/api/editor/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchRegexStr,
          isRegex: true,
          matchCase: isMatchCase,
          includePatterns: '',
          excludePatterns: ''
        })
      });
      
      const data = await response.json();
      if (data.results) {
        setResults(data.results);
      }
    } catch (err) {
      console.error('CodeSearch failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const applyPreset = (preset) => {
    setQuery(preset.regex);
    setIsRegex(true);
    handleSearch(preset.regex);
  };

  const onManualSearch = (e) => {
    if (e.key === 'Enter') {
      handleSearch(query);
    }
  };

  return (
    <div className="code-search-panel">
      <div className="code-search-header">
        <div className="cs-title">
          <span><i className="fa-solid fa-brain"></i></span>
          Code Intelligence
        </div>
      </div>
      
      <div className="cs-input-container">
        <input 
          type="text" 
          placeholder="Semantic / Regex Query..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onManualSearch}
          className="cs-search-input"
        />
        <div className="cs-toggles">
          <button 
            className={`cs-toggle-btn ${isRegex ? 'active' : ''}`}
            onClick={() => setIsRegex(!isRegex)}
            title="Use Regular Expression"
          >
            .*
          </button>
          <button 
            className={`cs-toggle-btn ${isMatchCase ? 'active' : ''}`}
            onClick={() => setIsMatchCase(!isMatchCase)}
            title="Match Case"
          >
            Aa
          </button>
        </div>
      </div>

      <div className="cs-presets-grid">
        {presets.map((p, i) => (
          <div key={i} className="cs-preset-card" onClick={() => applyPreset(p)}>
            <span><i className={`fa-solid ${p.icon}`}></i></span>
            <span className="cs-preset-label">{p.label}</span>
          </div>
        ))}
      </div>

      <div className="cs-results-container">
        {isSearching ? (
          <div className="cs-loading">Analyzing codebase...</div>
        ) : (
          results.length === 0 ? (
            <div className="cs-empty">No intelligent matches found.</div>
          ) : (
            <div className="cs-results-tree">
              {results.map((fileRes, idx) => (
                <div key={idx} className="cs-file-group">
                  <div className="cs-file-header">
                    <i className="fa-regular fa-file-code"></i>
                    {fileRes.file.split(/[\\/]/).pop()}
                    <span className="cs-file-path">{fileRes.file}</span>
                  </div>
                  {fileRes.matches.map((match, mIdx) => (
                    <div 
                      key={mIdx} 
                      className="cs-match-line"
                      onClick={() => onFileSelect({ path: fileRes.file, line: match.lineNumber })}
                    >
                      <span className="cs-line-num">{match.lineNumber}</span>
                      <span className="cs-line-text">{match.text.trim()}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
