import React, { useState, useEffect, useRef } from 'react';

import { isDesktopRuntime } from '../../core/runtime.js';



const TAB_COLOR_OPTIONS = [

  { label: 'Red',    value: '#e85555' },

  { label: 'Orange', value: '#e8903a' },

  { label: 'Yellow', value: '#d4b93a' },

  { label: 'Green',  value: '#4caf6a' },

  { label: 'Teal',   value: '#3aacb8' },

  { label: 'Blue',   value: '#5599e8' },

  { label: 'Purple', value: '#9f6de8' },

  { label: 'Pink',   value: '#e855c0' },

  { label: 'None',   value: null },

];



export default function Tabs({

  tabs,

  activeTabId,

  setActiveTab,

  closeTab,

  onRunCurrentFile,

  onOpenCommandPalette,

  showRunAction,

  showLivePreviewAction,

  livePreviewOpen,

  livePreviewMode,

  onToggleLivePreview,

  onOpenLivePreviewTab,

  showSplitEditorAction,

  splitEditorOpen,

  onSplitEditor,

  groupId = '',

  onTabDragStart,

  onTabDrop,

  onTogglePin,

  onSetTabColor,

}) {

  const [dropInsertBefore, setDropInsertBefore] = useState(null);

  const [runMenuOpen, setRunMenuOpen] = useState(false);

  const [colorMenu, setColorMenu] = useState(null); // { tabId, x, y }

  const runMenuRef = useRef(null);

  const colorMenuRef = useRef(null);



  useEffect(() => {

    function handleOutsideClick(event) {

      if (runMenuRef.current && !runMenuRef.current.contains(event.target)) {

        setRunMenuOpen(false);

      }

      if (colorMenuRef.current && !colorMenuRef.current.contains(event.target)) {

        setColorMenu(null);

      }

    }

    document.addEventListener('mousedown', handleOutsideClick);

    return () => document.removeEventListener('mousedown', handleOutsideClick);

  }, []);



  function clearDrop() {

    setDropInsertBefore(null);

  }



  function handleTabContextMenu(event, tab) {

    event.preventDefault();

    event.stopPropagation();

    setColorMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });

  }



  const activeTab = tabs.find((t) => t.id === activeTabId);

  const isInoFile = Boolean(

    activeTab?.name?.toLowerCase().endsWith('.ino') ||

    activeTab?.language === 'arduino' ||

    activeTab?.language === 'ino'

  );



  if (!tabs.length) {

    return (

      <div className="tabs empty">

        <div className="tabs-actions">

          <button type="button" className="tabs-action-btn" onClick={onOpenCommandPalette} title="Command Palette">

            <span><i className="fa-solid fa-bars-staggered"></i></span>

          </button>

          {showSplitEditorAction ? (

            <button type="button" className="tabs-action-btn" onClick={onSplitEditor} title="Split Editor Right">

              <span><i className="fa-solid fa-columns"></i></span>

            </button>

          ) : null}

        </div>

      </div>

    );

  }



  return (

    <>

      <div className="tabs" onDragEnd={clearDrop}>

        <div

          className="tabs-list"

          onDragOver={(event) => event.preventDefault()}

          onDrop={(event) => {

            event.preventDefault();

            const insert = dropInsertBefore != null ? dropInsertBefore : tabs.length;

            onTabDrop?.(groupId, insert);

            clearDrop();

          }}

        >

          {tabs.map((tab, index) => (

            <React.Fragment key={tab.id}>

              {dropInsertBefore === index ? <div className="tab-drop-indicator" aria-hidden="true" /> : null}

              <div

                className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isPreview ? 'tab-preview' : ''} ${tab.colorLabel ? 'tab-has-color' : ''}`}

                style={tab.colorLabel ? { '--tab-color-label': tab.colorLabel } : undefined}

                onClick={() => setActiveTab(tab.id)}

                onContextMenu={(e) => handleTabContextMenu(e, tab)}

                title={tab.name}

                draggable

                onDragStart={() => {

                  onTabDragStart?.(tab.id, groupId, index);

                }}

                onDragOver={(event) => {

                  event.preventDefault();

                  event.stopPropagation();

                  const rect = event.currentTarget.getBoundingClientRect();

                  const before = event.clientX < rect.left + rect.width / 2;

                  setDropInsertBefore(before ? index : index + 1);

                }}

                onDrop={(event) => {

                  event.preventDefault();

                  event.stopPropagation();

                  const insert = dropInsertBefore != null ? dropInsertBefore : index + 1;

                  onTabDrop?.(groupId, insert);

                  clearDrop();

                }}

              >

                {tab.colorLabel ? (

                  <span className="tab-color-dot" style={{ background: tab.colorLabel }} aria-hidden="true" />

                ) : null}

                <span className="tab-name">{tab.name}</span>

                {tab.pinned ? (

                  <span className="tab-pin" title="Pinned tab">

                    {'\uD83D\uDCCC'}

                  </span>

                ) : null}

                <span className={`tab-dirty ${tab.dirty ? 'visible' : ''}`}>{tab.dirty ? '*' : ''}</span>

                <button

                  className="tabPin"

                  type="button"

                  aria-label={`${tab.pinned ? 'Unpin' : 'Pin'} ${tab.name}`}

                  onClick={(event) => {

                    event.stopPropagation();

                    onTogglePin?.(tab.id);

                  }}

                >

                  {tab.pinned ? '•' : '○'}

                </button>

                <button

                  className="tabClose"

                  type="button"

                  aria-label={`Close ${tab.name}`}

                  onClick={(event) => {

                    event.stopPropagation();

                    closeTab(tab.id, groupId || 'primary');

                  }}

                >

                  <span><i className="fa-solid fa-xmark"></i></span>

                </button>

              </div>

            </React.Fragment>

          ))}

          {dropInsertBefore === tabs.length ? <div className="tab-drop-indicator" aria-hidden="true" /> : null}

          <div

            className="tabs-list-end-catch"

            onDragOver={(event) => {

              event.preventDefault();

              setDropInsertBefore(tabs.length);

            }}

            aria-hidden="true"

          />

        </div>

        <div className="tabs-actions">

          <button type="button" className="tabs-action-btn" onClick={onOpenCommandPalette} title="Command Palette">

            <span><i className="fa-solid fa-bars-staggered"></i></span>

          </button>

          {showSplitEditorAction ? (

            <button type="button" className="tabs-action-btn" onClick={onSplitEditor} title="Split Editor Right">

              <span><i className="fa-solid fa-columns"></i></span>

            </button>

          ) : null}

          {showLivePreviewAction ? (

            <>

              <button

                type="button"

                className={`tabs-action-btn ${livePreviewOpen && livePreviewMode === 'split' ? 'active' : ''}`}

                onClick={onToggleLivePreview}

                title={

                  livePreviewOpen && livePreviewMode === 'split'

                    ? 'Hide Live Preview Beside Editor'

                    : 'Open Live Preview Beside Editor'

                }

              >

                <span><i className="fa-regular fa-rectangle-list"></i></span>

              </button>

              <button

                type="button"

                className={`tabs-action-btn ${livePreviewOpen && livePreviewMode === 'tab' ? 'active' : ''}`}

                onClick={onOpenLivePreviewTab}

                title="Open Live Preview In New Tab"

              >

                <span><i className="fa-solid fa-up-right-from-square"></i></span>

              </button>

            </>

          ) : null}

          {showRunAction ? (

            isInoFile ? (
              <div className="tabs-action-split-btn arduino-actions-group">
                <button
                  type="button"
                  className="tabs-action-btn primary arduino-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRunCurrentFile('arduino_compile');
                  }}
                  title="Verify / Compile (Arduino IDE)"
                >
                  <span><i className="fa-solid fa-check"></i></span>
                </button>
                <button
                  type="button"
                  className="tabs-action-btn primary arduino-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRunCurrentFile('arduino_upload');
                  }}
                  title="Upload to Board (Arduino IDE)"
                >
                  <span><i className="fa-solid fa-arrow-right"></i></span>
                </button>
              </div>
            ) : (

              <div className="tabs-action-dropdown-wrapper" ref={runMenuRef}>

                <div className="tabs-action-split-btn">

                  <button

                    type="button"

                    className="tabs-action-btn primary split-left"

                    onClick={(e) => {

                      e.stopPropagation();

                      setRunMenuOpen(false);

                      onRunCurrentFile('run_code');

                    }}

                    title="Run Code"

                  >

                    <span><i className="fa-solid fa-play"></i></span>

                  </button>

                  <button

                    type="button"

                    className="tabs-action-btn primary split-right"

                    onClick={(e) => {

                      e.stopPropagation();

                      setRunMenuOpen((current) => !current);

                    }}

                    title="Run/Debug Options"

                  >

                    <span><i className="fa-solid fa-chevron-down" style={{ fontSize: '10px' }}></i></span>

                  </button>

                </div>

                {runMenuOpen && (

                  <div className="tabs-action-dropdown-menu">

                    <button type="button" onClick={() => { setRunMenuOpen(false); onRunCurrentFile('run_code'); }}>

                      <span><i className="fa-solid fa-play"></i></span> Run Code

                    </button>

                    <button type="button" onClick={() => { setRunMenuOpen(false); onRunCurrentFile('run_file'); }}>

                      <span><i className="fa-regular fa-file-code"></i></span> Run File

                    </button>

                    <button type="button" onClick={() => { setRunMenuOpen(false); onRunCurrentFile('run_terminal'); }}>

                      <span><i className="fa-solid fa-terminal"></i></span> Run File in Dedicated Terminal

                    </button>

                    <button type="button" onClick={() => { setRunMenuOpen(false); onRunCurrentFile('compile_native'); }}>

                      <span><i className="fa-solid fa-microchip"></i></span> Compile to Native Binary

                    </button>

                    {isDesktopRuntime() && tabs.find((t) => t.id === activeTabId)?.name?.toLowerCase().endsWith('.exe') && (

                      <>

                        <div className="tabs-action-dropdown-divider"></div>

                        <button type="button" onClick={() => { setRunMenuOpen(false); onRunCurrentFile('run_sandbox'); }} style={{ color: '#9ef0a8' }}>

                          <span><i className="fa-solid fa-shield-halved"></i></span> Run in Sandbox (Secure Scan)

                        </button>

                      </>

                    )}

                    <div className="tabs-action-dropdown-divider"></div>

                    <button type="button" onClick={() => { setRunMenuOpen(false); onRunCurrentFile('debug_file'); }}>

                      <span><i className="fa-solid fa-bug"></i></span> Debug File

                    </button>

                    <button type="button" onClick={() => { setRunMenuOpen(false); onRunCurrentFile('debug_launch'); }}>

                      <span><i className="fa-solid fa-gear"></i></span> Debug using launch.json

                    </button>

                  </div>

                )}

              </div>

            )

          ) : null}

        </div>

      </div>



      {/* Tab Color Context Menu (portal-like, fixed position) */}

      {colorMenu && (

        <div

          ref={colorMenuRef}

          className="tab-color-menu"

          style={{ top: colorMenu.y, left: colorMenu.x }}

          onContextMenu={(e) => e.preventDefault()}

        >

          <div className="tab-color-menu-title">Label Color</div>

          <div className="tab-color-swatches">

            {TAB_COLOR_OPTIONS.map((opt) => (

              <button

                key={opt.value ?? 'none'}

                type="button"

                className={`tab-color-swatch ${opt.value === null ? 'tab-color-swatch-none' : ''}`}

                style={opt.value ? { background: opt.value } : undefined}

                title={opt.label}

                onClick={() => {

                  onSetTabColor?.(colorMenu.tabId, opt.value);

                  setColorMenu(null);

                }}

              >

                {opt.value === null ? <span><i className="fa-solid fa-xmark" /></span> : null}

              </button>

            ))}

          </div>

        </div>

      )}

    </>

  );

}

