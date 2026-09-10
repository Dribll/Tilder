import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ContextMenu.css';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: y, left: x });
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Non-separator, non-disabled items for keyboard nav
  const navigableIndices = items.reduce((acc, item, i) => {
    if (!item.separator && !item.disabled) acc.push(i);
    return acc;
  }, []);

  // Smart viewport clamping — run after paint so we know the menu size
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let top = y;
    let left = x;
    const margin = 8;
    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin;
    }
    if (top < margin) top = margin;
    if (left < margin) left = margin;
    setPos({ top, left });
  }, [x, y]);

  // Close on outside click or Escape; keyboard navigation
  useEffect(() => {
    function handleMouseDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => {
          const cur = navigableIndices.indexOf(prev);
          const next = cur < navigableIndices.length - 1 ? cur + 1 : 0;
          return navigableIndices[next];
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => {
          const cur = navigableIndices.indexOf(prev);
          const next = cur > 0 ? cur - 1 : navigableIndices.length - 1;
          return navigableIndices[next];
        });
        return;
      }
      if (e.key === 'Enter' && focusedIndex >= 0) {
        e.preventDefault();
        const item = items[focusedIndex];
        if (item && !item.separator && !item.disabled && item.onClick) {
          item.onClick();
          onClose();
        }
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    // Auto-focus the menu for keyboard access
    menuRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, focusedIndex, navigableIndices, items]);

  return createPortal(
    <>
      <div className="context-menu-overlay" onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="tilder-context-menu"
        style={{ top: pos.top, left: pos.left }}
        ref={menuRef}
        tabIndex={-1}
        role="menu"
      >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="context-menu-separator" />;
        }

        const isFocused = focusedIndex === index;
        const classes = [
          'context-menu-item',
          item.danger ? 'danger' : '',
          item.disabled ? 'disabled' : '',
          isFocused ? 'focused' : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={`${item.label}-${index}`}
            className={classes}
            role="menuitem"
            aria-disabled={item.disabled}
            onMouseEnter={() => !item.disabled && setFocusedIndex(index)}
            onMouseLeave={() => setFocusedIndex(-1)}
            onClick={item.disabled ? undefined : (e) => {
              e.stopPropagation();
              item.onClick?.();
              onClose();
            }}
          >
            {item.icon && (
              <span>
                <i className={`${item.icon} context-menu-icon`} />
              </span>
            )}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu-shortcut">{item.shortcut}</span>
            )}
          </div>
        );
      })}
      </div>
    </>,
    document.body
  );
}
