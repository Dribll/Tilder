import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileIcon, defaultStyles } from 'react-file-icon';
import './Explorer.css';

// Helper to format file sizes
const formatSize = size => {
  if (size < 1024) return size + ' B';
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
};

function ExplorerNode({ path, name, isDir, size, depth, onFileOpen }) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);

  const toggle = async () => {
    if (!isDir) {
      onFileOpen(`${path}\\${name}`);
      return;
    }
    if (expanded) {
      setExpanded(false);
    } else {
      try {
        const result = await invoke('list_directory', { path: `${path}\\${name}` });
        setChildren(result);
        setExpanded(true);
      } catch (e) {
        console.error('Failed to list directory', e);
      }
    }
  };

  return (
    <div className="explorer-node" style={{ paddingLeft: depth * 16 }}>
      <div className="node-header" onClick={toggle}>
        {isDir ? (
          <i className={expanded ? 'fa-solid fa-folder-open' : 'fa-solid fa-folder'} />
        ) : (
          <FileIcon extension={name.split('.').pop() || ''} {...defaultStyles["file"]} />
        )}
        <span className="node-name">{name}</span>
        {!isDir && <span className="node-size">{formatSize(size)}</span>}
      </div>
      {expanded && (
        <div className="node-children">
          {children.map(child => (
            <ExplorerNode
              key={child.name}
              path={`${path}\\${name}`}
              {...child}
              depth={depth + 1}
              onFileOpen={onFileOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Explorer({ initialPath = 'C:\\', onFileOpen = console.log }) {
  const [rootChildren, setRootChildren] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const result = await invoke('list_directory', { path: initialPath });
        setRootChildren(result);
      } catch (e) {
        console.error('Failed to load root', e);
      }
    })();
  }, [initialPath]);

  return (
    <div className="explorer-root">
      {rootChildren.map(child => (
        <ExplorerNode
          key={child.name}
          path={initialPath}
          {...child}
          depth={0}
          onFileOpen={onFileOpen}
        />
      ))}
    </div>
  );
}
