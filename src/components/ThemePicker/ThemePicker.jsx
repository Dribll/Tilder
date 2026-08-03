import React, { useEffect, useState, useMemo } from 'react';
import './ThemePicker.css';
import { getThemes } from '../../core/themeRegistry.js';

export default function ThemePicker({ isOpen, onClose, onSelectTheme, activeTheme }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredThemes = useMemo(() => {
    const allThemes = getThemes();
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return allThemes;
    return allThemes.filter((t) => t.label.toLowerCase().includes(normalizedQuery) || t.id.toLowerCase().includes(normalizedQuery));
  }, [query]);

  // Pre-select the currently active theme when opened
  useEffect(() => {
    if (isOpen) {
      const activeIdx = filteredThemes.findIndex(t => t.id === activeTheme);
      setSelectedIndex(activeIdx !== -1 ? activeIdx : 0);
      setQuery('');
    }
  }, [isOpen, activeTheme]); // Wait, filteredThemes changes when query changes. Let's fix that below.

  useEffect(() => {
    if (isOpen && query === '') {
      const activeIdx = filteredThemes.findIndex(t => t.id === activeTheme);
      setSelectedIndex(activeIdx !== -1 ? activeIdx : 0);
    }
  }, [isOpen, activeTheme, query, filteredThemes]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((current) => Math.min(filteredThemes.length - 1, current + 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(0, current - 1));
        return;
      }

      if (event.key === 'Enter' && filteredThemes[selectedIndex]) {
        event.preventDefault();
        onSelectTheme(filteredThemes[selectedIndex].id);
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredThemes, isOpen, onClose, onSelectTheme, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="theme-picker-overlay" onMouseDown={onClose}>
      <div className="theme-picker" onMouseDown={(event) => event.stopPropagation()}>
        <div className="theme-picker-input-row">
          <span className="theme-picker-prompt">🖌</span>
          <input
            type="text"
            className="theme-picker-input"
            placeholder="Select Color Theme"
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="theme-picker-list">
          {filteredThemes.map((theme, index) => (
            <button
              key={theme.id}
              type="button"
              className={`theme-picker-item ${index === selectedIndex ? 'active' : ''} ${theme.id === activeTheme ? 'current-theme' : ''}`}
              onClick={() => {
                onSelectTheme(theme.id);
                onClose();
              }}
              onMouseEnter={() => {
                // Live preview effect on hover
                onSelectTheme(theme.id);
                setSelectedIndex(index);
              }}
            >
              <div className="theme-picker-item-main">
                <div className="theme-picker-item-label">{theme.label}</div>
              </div>
              <div className="theme-picker-item-side">
                {theme.id === activeTheme ? <span className="theme-picker-item-active-badge">Active</span> : null}
              </div>
            </button>
          ))}
          {!filteredThemes.length ? <div className="theme-picker-empty">No themes found.</div> : null}
        </div>
      </div>
    </div>
  );
}
