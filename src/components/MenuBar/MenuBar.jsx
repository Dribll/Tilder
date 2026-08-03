import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import tilderIcon from '../../assets/Tilder_icon.png';
import { isDesktopRuntime } from '../../core/runtime.js';
import { invoke } from '@tauri-apps/api/core';

function MenuBar(props) {
  const [openMenu, setOpenMenu] = useState(null);
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const menuBarRef = useRef(null);
  // Cache the Tauri window reference eagerly on mount so click handlers fire synchronously
  const tauriWindowRef = useRef(null);

  useEffect(() => {
    if (isDesktopRuntime()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        tauriWindowRef.current = getCurrentWindow();
      }).catch(err => console.warn('Tauri window API not available:', err));
    }
  }, []);

  const minimizeWindow = (e) => {
    e.stopPropagation();
    if (isDesktopRuntime()) {
      invoke('window_minimize').catch(console.error);
    }
  };

  const maximizeWindow = (e) => {
    e.stopPropagation();
    if (isDesktopRuntime()) {
      invoke('window_maximize').catch(console.error);
    }
  };

  const closeWindow = (e) => {
    e.stopPropagation();
    if (isDesktopRuntime()) {
      invoke('window_close').catch(console.error);
    } else {
      window.close();
    }
  };

  // Alias used by the File > Quit menu item
  const quit = () => closeWindow({ stopPropagation: () => {} });

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target)) {
        setOpenMenu(null);
        setOpenSubmenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMenuTrigger = (menuKey) => {
    if (openMenu === menuKey) {
      setOpenMenu(null);
      setOpenSubmenu(null);
    } else {
      setOpenMenu(menuKey);
      setOpenSubmenu(null);
    }
  };

  const handleMenuHover = (menuKey) => {
    if (openMenu !== null && openMenu !== menuKey) {
      setOpenMenu(menuKey);
      setOpenSubmenu(null);
    }
  };

  const closeAll = () => {
    setOpenMenu(null);
    setOpenSubmenu(null);
  };

  const accountInitial = (props.accountDisplayName || props.accountProvider || 'A').trim().charAt(0).toUpperCase();

  return (
    <header ref={menuBarRef} className="tilder-menubar-header" data-tauri-drag-region>
      <nav data-tauri-drag-region>
        <div id="sidebarControls" data-tauri-drag-region>
          <div id="header_icon" data-tauri-drag-region>
            <img src={tilderIcon} alt="tilder_icon_header" aria-label="Tilder" data-tauri-drag-region />
          </div>
          <div className="navigation">
            {/* FILE MENU */}
            <div className={`dropdown ${openMenu === 'file' ? 'open' : ''}`}>
              <span 
                className="dropdown-trigger-btn" 
                onClick={() => handleMenuTrigger('file')}
                onMouseEnter={() => handleMenuHover('file')}
              >
                {props.file}
              </span>
              <div className="dropdown-content">
                <ul>
                  <li onClick={() => { props.triggerNewFile(); closeAll(); }}>New File</li>
                  <li onClick={() => { props.triggerNewFolder(); closeAll(); }}>New Folder</li>
                  <li onClick={() => { props.triggerNewWindow(); closeAll(); }}>New Window</li>
                  <li onClick={() => { props.triggerNewTab(); closeAll(); }}>New Tab</li>
                  <hr className="dropdowncontent-hr" />
                  <li onClick={() => { props.triggerOpenFile(); closeAll(); }}>Open File</li>
                  <li onClick={() => { props.triggerOpenFolder(); closeAll(); }}>Open Folder</li>
                  <li onClick={() => { props.addFolderToWorkspace(); closeAll(); }}>Add Folder to Workspace...</li>
                  <li onClick={() => { props.openWorkspace(); closeAll(); }}>Open Workspace from File...</li>
                  <li 
                    className={`subdropdown ${openSubmenu === 'recent' ? 'open' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmenu(openSubmenu === 'recent' ? null : 'recent');
                    }}
                  >
                    <div className="subdropdown-trigger-btn">
                      <span>Open Recent</span>
                      <i className="fa-solid fa-chevron-right"></i>
                    </div>
                    <div className="subdropdown-content">
                      <ul>
                        {(props.recentFiles || []).slice(0, 5).map((entry) => (
                          <li key={`recent-file-${entry.path}`} onClick={() => { props.openRecentFile(entry); closeAll(); }}>
                            {entry.name}
                          </li>
                        ))}
                        {(props.recentWorkspaces || []).slice(0, 3).map((entry) => (
                          <li key={`recent-workspace-${entry.id}`} onClick={() => { props.openRecentWorkspace(entry); closeAll(); }}>
                            {entry.name} (Workspace)
                          </li>
                        ))}
                        {!props.recentFiles?.length && !props.recentWorkspaces?.length ? <li className="disabled">No Recent Items</li> : null}
                      </ul>
                    </div>
                  </li>
                  <hr className="dropdowncontent-hr" />
                  <li onClick={() => { props.saveActiveFile(); closeAll(); }}>Save</li>
                  <li onClick={() => { props.saveAsActiveFile(); closeAll(); }}>Save As</li>
                  <li onClick={() => { props.saveWorkspace(); closeAll(); }}>Save Workspace</li>
                  <li onClick={() => { props.saveWorkspaceAs(); closeAll(); }}>Save Workspace As</li>
                  <li onClick={closeAll}>Change Save Root Directory</li>
                  <hr className="dropdowncontent-hr" />
                  <li onClick={quit}>Quit Editor</li>
                </ul>
              </div>
            </div>

            {/* EDIT MENU */}
            <div className={`dropdown ${openMenu === 'edit' ? 'open' : ''}`}>
              <span 
                className="dropdown-trigger-btn" 
                onClick={() => handleMenuTrigger('edit')}
                onMouseEnter={() => handleMenuHover('edit')}
              >
                {props.edit}
              </span>
              <div className="dropdown-content">
                <li onClick={() => { props.undo(); closeAll(); }}>Undo</li>
                <li onClick={() => { props.redo(); closeAll(); }}>Redo</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.cut(); closeAll(); }}>Cut</li>
                <li onClick={() => { props.copy(); closeAll(); }}>Copy</li>
                <li onClick={() => { props.paste(); closeAll(); }}>Paste</li>
                <li onClick={() => { props.selectAll(); closeAll(); }}>Select All</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.find(); closeAll(); }}>Find</li>
                <li onClick={() => { props.replace(); closeAll(); }}>Replace</li>
                <li onClick={() => { props.findInFiles(); closeAll(); }}>Find in Files</li>
                <li onClick={() => { props.replaceInFiles(); closeAll(); }}>Replace in Files</li>
              </div>
            </div>

            {/* VIEW MENU */}
            <div className={`dropdown ${openMenu === 'view' ? 'open' : ''}`}>
              <span 
                className="dropdown-trigger-btn" 
                onClick={() => handleMenuTrigger('view')}
                onMouseEnter={() => handleMenuHover('view')}
              >
                {props.view}
              </span>
              <div className="dropdown-content">
                <li onClick={() => { props.openCommandPalette(); closeAll(); }}>Command Palette</li>
                <li onClick={closeAll}>Open View</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.openSettings(); closeAll(); }}>Settings</li>
                <li onClick={() => { props.openKeyboardShortcuts(); closeAll(); }}>Keyboard Shortcuts</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.openExplorer(); closeAll(); }}>Explorer</li>
                <li onClick={() => { props.openSearch(); closeAll(); }}>Search</li>
                <li onClick={() => { props.openSourceControl(); closeAll(); }}>Source Control</li>
                <li onClick={() => { props.openDebug(); closeAll(); }}>Run</li>
                <li onClick={() => { props.openExtensions(); closeAll(); }}>Extensions</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.toggleSidebar(); closeAll(); }}>{props.sidebarVisible ? 'Hide Primary Side Bar' : 'Show Primary Side Bar'}</li>
                <li onClick={() => { props.toggleBottomPanel(); closeAll(); }}>{props.panelVisible ? 'Hide Bottom Panel' : 'Show Bottom Panel'}</li>
                <li onClick={() => { props.toggleStatusBar(); closeAll(); }}>{props.statusBarVisible ? 'Hide Status Bar' : 'Show Status Bar'}</li>
                <li onClick={() => { props.toggleMenuBar(); closeAll(); }}>{props.menuBarVisible ? 'Hide Menu Bar' : 'Show Menu Bar'}</li>
                <li onClick={() => { props.toggleCenteredLayout(); closeAll(); }}>{props.centeredLayoutEnabled ? 'Disable Centered Layout' : 'Enable Centered Layout'}</li>
                <li onClick={() => { props.toggleZenMode(); closeAll(); }}>{props.zenModeEnabled ? 'Exit Zen Mode' : 'Enter Zen Mode'}</li>
                <li onClick={() => { props.toggleBreadcrumbs(); closeAll(); }}>{props.breadcrumbsVisible ? 'Hide Breadcrumbs' : 'Show Breadcrumbs'}</li>
                <li onClick={() => { props.toggleMinimap(); closeAll(); }}>{props.minimapVisible ? 'Hide Minimap' : 'Show Minimap'}</li>
                <li onClick={() => { props.toggleWordWrap(); closeAll(); }}>{props.wordWrapEnabled ? 'Disable Word Wrap' : 'Enable Word Wrap'}</li>
                <li onClick={() => { props.reopenClosedEditor(); closeAll(); }}>Reopen Closed Editor</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.openProblems(); closeAll(); }}>Problems</li>
                <li onClick={() => { props.openOutput(); closeAll(); }}>Output</li>
                <li onClick={() => { props.openDebugConsole(); closeAll(); }}>Debug Console</li>
                <li onClick={() => { props.toggleTerminal(); closeAll(); }}>Terminal</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.splitEditorRight(); closeAll(); }}>Split Editor Right</li>
                <li onClick={() => { props.closeSplitEditor(); closeAll(); }}>Close Split Editor</li>
              </div>
            </div>

            {/* GO MENU */}
            <div className={`dropdown ${openMenu === 'go' ? 'open' : ''}`}>
              <span 
                className="dropdown-trigger-btn" 
                onClick={() => handleMenuTrigger('go')}
                onMouseEnter={() => handleMenuHover('go')}
              >
                {props.go}
              </span>
              <div className="dropdown-content">
                <li onClick={() => { props.navigateBack(); closeAll(); }}>Back</li>
                <li onClick={() => { props.navigateForward(); closeAll(); }}>Forward</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.goToFile(); closeAll(); }}>Go to File</li>
                <li onClick={() => { props.goToSymbolInWorkspace(); closeAll(); }}>Go to Symbol in Workspace</li>
                <li onClick={() => { props.goToSymbolInEditor(); closeAll(); }}>Go to Symbol in Editor</li>
                <li onClick={() => { props.goToLine(); closeAll(); }}>Go to Line</li>
                <li onClick={() => { props.goToDefinition(); closeAll(); }}>Go to Definition</li>
                <li onClick={() => { props.goToReferences(); closeAll(); }}>Go to References</li>
              </div>
            </div>

            {/* RUN & DEBUG MENU */}
            <div className={`dropdown ${openMenu === 'run_debug' ? 'open' : ''}`}>
              <span 
                className="dropdown-trigger-btn" 
                onClick={() => handleMenuTrigger('run_debug')}
                onMouseEnter={() => handleMenuHover('run_debug')}
              >
                {props.run_debug}
              </span>
              <div className="dropdown-content">
                <li onClick={() => { props.openSplitLivePreview(); closeAll(); }}>Open Live Preview Beside Editor</li>
                <li onClick={() => { props.openTabLivePreview(); closeAll(); }}>Open Live Preview In New Tab</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.startDebugging(); closeAll(); }}>Start Debugging</li>
                <li onClick={() => { props.runWithoutDebugging(); closeAll(); }}>Run Without Debugging</li>
                <li onClick={() => { props.stopDebugging(); closeAll(); }}>Stop Debugging</li>
                <li onClick={() => { props.restartDebugging(); closeAll(); }}>Restart Debugging</li>
              </div>
            </div>

            {/* HELP MENU */}
            <div className={`dropdown ${openMenu === 'help' ? 'open' : ''}`}>
              <span 
                className="dropdown-trigger-btn" 
                onClick={() => handleMenuTrigger('help')}
                onMouseEnter={() => handleMenuHover('help')}
              >
                {props.help}
              </span>
              <div className="dropdown-content">
                <li onClick={() => { props.openWelcome?.(); closeAll(); }}>Welcome</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.checkForUpdates?.(); closeAll(); }}>Check for Updates...</li>
                <hr className="dropdowncontent-hr" />
                <li onClick={() => { props.toggleInfoDisplay(); closeAll(); }}>About</li>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER SEARCH BAR (VS Code Style) */}
        <div className="menubar-center-search" onClick={props.openCommandPalette} data-tauri-drag-region>
          <div className="menubar-search-box">
            <i className="fa-solid fa-magnifying-glass"></i>
            <span>Tilder</span>
          </div>
        </div>

        <div id="sidebarSettings">
          <span className="dropdown-trigger-btn" onClick={props.openThemePicker} title="Select Color Theme">
            <i className="fa-solid fa-paint-roller"></i>
          </span>
          <span className="dropdown-trigger-btn" onClick={props.checkForUpdates} title="Check for Updates">
            <i className="fa-solid fa-gear"></i>
          </span>
          <span className="dropdown-trigger-btn" onClick={props.toggleInfoDisplay} title="About">
            <i className="fa-solid fa-circle-info"></i>
          </span>
          <span className="dropdown-trigger-btn" onClick={props.toggleSystemMonitor} title="System Monitor">
            <i className="fa-solid fa-chart-line"></i>
          </span>
          <span className="dropdown-trigger-btn" onClick={props.openSettings}>
            <i className="fa-solid fa-sliders"></i>
          </span>
          <span className="dropdown-trigger-btn" onClick={props.openKeyboardShortcuts}>
            <i className="fa-regular fa-keyboard"></i>
          </span>
          <span className="dropdown-trigger-btn" onClick={props.toggleTerminalPanel}>
            <i className="fa-solid fa-terminal"></i>
          </span>
          <span className="dropdown-trigger-btn account-menu-trigger" onClick={props.openAccount} title={props.accountDisplayName || 'Open Account Center'}>
            {props.accountAvatarUrl ? (
              <img src={props.accountAvatarUrl} alt={props.accountDisplayName || 'Connected account'} className="account-menu-avatar" />
            ) : (
              <span className={`account-menu-fallback ${props.accountProvider ? 'connected' : ''}`}>
                {props.accountProvider ? accountInitial : <i className="fa-regular fa-circle-user"></i>}
              </span>
            )}
          </span>

          {/* WINDOW CONTROLS (Only in Desktop) */}
          {isDesktopRuntime() && (
            <div className="menubar-window-controls" style={{ WebkitAppRegion: 'no-drag' }}>
              <div
                className="window-control-btn minimize"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={minimizeWindow}
                title="Minimize"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <i className="fa-solid fa-minus"></i>
              </div>
              <div
                className="window-control-btn maximize"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={maximizeWindow}
                title="Maximize / Restore"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <i className="fa-regular fa-square"></i>
              </div>
              <div
                className="window-control-btn close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={closeWindow}
                title="Close"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </div>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

export default MenuBar;

MenuBar.defaultProps = {
  file: 'File',
  edit: 'Edit',
  view: 'View',
  go: 'Go',
  run_debug: 'Run & Debug',
  help: 'Help',
  accountAvatarUrl: '',
  accountDisplayName: '',
  accountProvider: '',
  splitEditorRight: () => {},
  closeSplitEditor: () => {},
  triggerNewWindow: () => {},
  triggerNewTab: () => {},
  findInFiles: () => {},
  replaceInFiles: () => {},
  openCommandPalette: () => {},
  openProblems: () => {},
  openOutput: () => {},
  openDebugConsole: () => {},
  navigateBack: () => {},
  navigateForward: () => {},
  recentFiles: [],
  recentWorkspaces: [],
  openRecentFile: () => {},
  openRecentWorkspace: () => {},
  toggleSidebar: () => {},
  toggleBottomPanel: () => {},
  toggleStatusBar: () => {},
  toggleMenuBar: () => {},
  toggleCenteredLayout: () => {},
  toggleZenMode: () => {},
  toggleBreadcrumbs: () => {},
  toggleMinimap: () => {},
  toggleWordWrap: () => {},
  reopenClosedEditor: () => {},
  zenModeEnabled: false,
  centeredLayoutEnabled: false,
  statusBarVisible: true,
  menuBarVisible: true,
  sidebarVisible: true,
  panelVisible: false,
  breadcrumbsVisible: true,
  minimapVisible: true,
  wordWrapEnabled: false,
  addFolderToWorkspace: () => {},
  openWorkspace: () => {},
  saveWorkspace: () => {},
  checkForUpdates: () => {},
  openWelcome: () => {},
  toggleSystemMonitor: () => {},
};

MenuBar.propTypes = {
  file: PropTypes.string.isRequired,
  edit: PropTypes.string.isRequired,
  view: PropTypes.string.isRequired,
  go: PropTypes.string.isRequired,
  run_debug: PropTypes.string.isRequired,
  help: PropTypes.string.isRequired,
  openThemePicker: PropTypes.func,
  accountAvatarUrl: PropTypes.string,
  accountDisplayName: PropTypes.string,
  accountProvider: PropTypes.string,
  toggleSystemMonitor: PropTypes.func,
  splitEditorRight: PropTypes.func,
  closeSplitEditor: PropTypes.func,
  triggerNewWindow: PropTypes.func,
  triggerNewTab: PropTypes.func,
  findInFiles: PropTypes.func,
  replaceInFiles: PropTypes.func,
  openCommandPalette: PropTypes.func,
  openProblems: PropTypes.func,
  openOutput: PropTypes.func,
  openDebugConsole: PropTypes.func,
  navigateBack: PropTypes.func,
  navigateForward: PropTypes.func,
  recentFiles: PropTypes.array,
  recentWorkspaces: PropTypes.array,
  openRecentFile: PropTypes.func,
  openRecentWorkspace: PropTypes.func,
  toggleSidebar: PropTypes.func,
  toggleBottomPanel: PropTypes.func,
  toggleStatusBar: PropTypes.func,
  toggleMenuBar: PropTypes.func,
  toggleCenteredLayout: PropTypes.func,
  toggleZenMode: PropTypes.func,
  toggleBreadcrumbs: PropTypes.func,
  toggleMinimap: PropTypes.func,
  toggleWordWrap: PropTypes.func,
  reopenClosedEditor: PropTypes.func,
  zenModeEnabled: PropTypes.bool,
  centeredLayoutEnabled: PropTypes.bool,
  statusBarVisible: PropTypes.bool,
  menuBarVisible: PropTypes.bool,
  sidebarVisible: PropTypes.bool,
  panelVisible: PropTypes.bool,
  breadcrumbsVisible: PropTypes.bool,
  minimapVisible: PropTypes.bool,
  wordWrapEnabled: PropTypes.bool,
  addFolderToWorkspace: PropTypes.func,
  openWorkspace: PropTypes.func,
  saveWorkspace: PropTypes.func,
  checkForUpdates: PropTypes.func,
  openWelcome: PropTypes.func,
};
