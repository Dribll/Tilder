import React, { useEffect, useRef } from 'react';
import './ContextMenu.css';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    }
    
    function handleEscape(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    // Add event listeners on mount
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position if it goes off-screen
  const style = { top: y, left: x };
  
  return (
    <div className="tilder-context-menu" style={style} ref={menuRef}>
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="context-menu-separator" />;
        }
        
        return (
          <div 
            key={item.label} 
            className={`context-menu-item ${item.danger ? 'danger' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <i className={`${item.icon} context-menu-icon`}></i>}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
          </div>
        );
      })}
    </div>
  );
}
