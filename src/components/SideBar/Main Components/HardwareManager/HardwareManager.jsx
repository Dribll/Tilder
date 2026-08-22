import React, { useState, useEffect, useRef, useCallback } from 'react';
import './HardwareManager.css';
import {
  getElectronicsCliPath,
  downloadElectronicsCli,
  electronicsInit,
  getConnectedPorts,
  getAllBoards,
  getInstalledCores,
  installCore,
  compileSketch,
  uploadSketch,
  searchLibraries,
  installLibrary,
  getInstalledLibraries,
  startSerialMonitor,
  runCliStream,
} from '../../../../core/hardwareApi.js';
import workspace from '../../../../core/workspace.js';

/* ─── Output Console ─────────────────────────────────────── */
function OutputConsole({ lines, onClear }) {
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div className="hw-console">
      <div className="hw-console-header">
        <span>Output</span>
        <button onClick={onClear} title="Clear"><i className="fa-solid fa-trash-can" /></button>
      </div>
      <div className="hw-console-body">
        {lines.length === 0 && <span className="hw-console-empty">No output yet.</span>}
        {lines.map((l, i) => (
          <div key={i} className={`hw-console-line hw-line-${l.type}`}>
            <span className="hw-line-prefix">{l.type === 'stderr' ? '!' : '>'}</span>
            <span>{l.data}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/* ─── Serial Monitor ─────────────────────────────────────── */
function SerialMonitor({ ports }) {
  const [port, setPort] = useState('');
  const [baud, setBaud] = useState('115200');
  const [connected, setConnected] = useState(false);
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState('');
  const unlistenRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  async function handleConnect() {
    if (connected) {
      unlistenRef.current?.();
      setConnected(false);
      return;
    }
    if (!port) return;
    setLines([]);
    try {
      const unlisten = await startSerialMonitor(port, parseInt(baud), (payload) => {
        if (payload.type === 'data') {
          setLines(prev => [...prev, { text: payload.data, dir: 'rx' }]);
        } else if (payload.type === 'closed') {
          setConnected(false);
          setLines(prev => [...prev, { text: '--- Connection closed ---', dir: 'info' }]);
        }
      });
      unlistenRef.current = unlisten;
      setConnected(true);
      setLines([{ text: `--- Connected to ${port} @ ${baud} baud ---`, dir: 'info' }]);
    } catch (e) {
      setLines([{ text: `Error: ${e}`, dir: 'error' }]);
    }
  }

  function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || !connected) return;
    setLines(prev => [...prev, { text: input, dir: 'tx' }]);
    setInput('');
    // Note: sending data requires a separate serial write command (future enhancement)
  }

  return (
    <div className="hw-serial">
      <div className="hw-serial-toolbar">
        <select value={port} onChange={e => setPort(e.target.value)} disabled={connected}>
          <option value="">Select port...</option>
          {ports.map(p => {
            const addr = p.port?.address || p.address || p;
            return <option key={addr} value={addr}>{addr}</option>;
          })}
        </select>
        <select value={baud} onChange={e => setBaud(e.target.value)} disabled={connected}>
          {['9600','19200','38400','57600','74880','115200','230400','250000','1000000','2000000'].map(b => (
            <option key={b} value={b}>{b} baud</option>
          ))}
        </select>
        <button
          className={`hw-serial-btn ${connected ? 'connected' : ''}`}
          onClick={handleConnect}
        >
          <i className={`fa-solid ${connected ? 'fa-stop' : 'fa-play'}`} />
          {connected ? ' Disconnect' : ' Connect'}
        </button>
        <button className="hw-serial-btn" onClick={() => setLines([])}>
          <i className="fa-solid fa-trash-can" />
        </button>
      </div>

      <div className="hw-serial-output">
        {lines.map((l, i) => (
          <div key={i} className={`hw-serial-line hw-sl-${l.dir}`}>
            {l.dir === 'tx' && <span className="hw-sl-prefix">↑</span>}
            {l.dir === 'rx' && <span className="hw-sl-prefix">↓</span>}
            {l.dir === 'info' && <span className="hw-sl-prefix">─</span>}
            <span>{l.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="hw-serial-input" onSubmit={handleSend}>
        <input
          type="text"
          placeholder={connected ? 'Send message...' : 'Connect first...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={!connected}
        />
        <button type="submit" disabled={!connected || !input.trim()}>
          <i className="fa-solid fa-paper-plane" /> Send
        </button>
      </form>
    </div>
  );
}

/* ─── Library Manager Tab ────────────────────────────────── */
function LibraryManager({ pushNotification, isInitialized, onNeedInit }) {
  const [tab, setTab] = useState('search'); // 'search' | 'installed'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [installed, setInstalled] = useState([]);
  const [libLoading, setLibLoading] = useState(false);
  const [installing, setInstalling] = useState(''); // library name being installed
  const [installOutput, setInstallOutput] = useState([]);

  useEffect(() => {
    if (tab === 'installed') loadInstalled();
  }, [tab]);

  async function loadInstalled() {
    setLibLoading(true);
    try {
      const libs = await getInstalledLibraries();
      setInstalled(libs);
    } catch {}
    setLibLoading(false);
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (!isInitialized) { onNeedInit(); return; }
    setLibLoading(true);
    setSearchResults([]);
    try {
      const results = await searchLibraries(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        pushNotification?.(`No libraries found for "${searchQuery}"`, 'info');
      }
    } catch (e) {
      pushNotification?.('Library search failed. Run "Update Indexes" first.', 'error');
    }
    setLibLoading(false);
  }

  async function handleInstall(libName) {
    setInstalling(libName);
    setInstallOutput([]);
    pushNotification?.(`Installing ${libName}...`, 'info');
    try {
      const code = await installLibrary(libName, (line) => {
        setInstallOutput(prev => [...prev, line]);
      });
      if (code === 0) {
        pushNotification?.(`✓ Installed ${libName}`, 'success');
      } else {
        pushNotification?.(`Failed to install ${libName}`, 'error');
      }
    } catch (e) {
      pushNotification?.(`Error: ${e}`, 'error');
    }
    setInstalling('');
  }

  return (
    <div className="hw-lib-manager">
      <div className="hw-tab-bar">
        <button className={`hw-tab ${tab === 'search' ? 'active' : ''}`} onClick={() => setTab('search')}>
          Search
        </button>
        <button className={`hw-tab ${tab === 'installed' ? 'active' : ''}`} onClick={() => setTab('installed')}>
          Installed
        </button>
      </div>

      {tab === 'search' && (
        <div className="hw-tab-content">
          <form onSubmit={handleSearch} className="lib-search-form">
            <input
              type="text"
              placeholder="Search libraries (e.g. Servo, WiFi, DHT...)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button type="submit" disabled={libLoading}>
              <i className={`fa-solid ${libLoading ? 'fa-spinner fa-spin' : 'fa-magnifying-glass'}`} />
            </button>
          </form>

          {installing && (
            <div className="hw-install-progress">
              <i className="fa-solid fa-spinner fa-spin" /> Installing {installing}...
              <div className="hw-install-log">
                {installOutput.map((l, i) => <div key={i} className={`hw-line-${l.type}`}>{l.data}</div>)}
              </div>
            </div>
          )}

          <div className="lib-results">
            {!libLoading && searchResults.length === 0 && searchQuery && (
              <p className="hw-empty-msg">No libraries found for "{searchQuery}"</p>
            )}
            {searchResults.map(lib => {
              const latest = lib.latest || lib;
              return (
                <div key={lib.name} className="lib-card">
                  <div className="lib-card-top">
                    <div>
                      <span className="lib-name">{lib.name}</span>
                      <span className="lib-version">v{latest.version || '?'}</span>
                    </div>
                    <button
                      className="lib-install-btn"
                      onClick={() => handleInstall(lib.name)}
                      disabled={!!installing}
                    >
                      {installing === lib.name
                        ? <span><i className="fa-solid fa-spinner fa-spin" /> Installing...</span>
                        : <span><i className="fa-solid fa-download" /> Install</span>
                      }
                    </button>
                  </div>
                  <p className="lib-desc">{latest.sentence || latest.paragraph || ''}</p>
                  <small className="lib-author">By {latest.author || 'Unknown'}</small>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'installed' && (
        <div className="hw-tab-content">
          {libLoading ? (
            <div key="loading" className="hw-empty-msg"><i className="fa-solid fa-spinner fa-spin" /> Loading...</div>
          ) : installed.length === 0 ? (
            <div key="empty" className="hw-empty-msg">No libraries installed yet.</div>
          ) : (
            <div key="results" className="lib-results">
              {installed.map(item => {
                const lib = item.library || item;
                return (
                  <div key={lib.name} className="lib-card">
                    <div className="lib-card-top">
                      <div>
                        <span className="lib-name">{lib.name}</span>
                        <span className="lib-version">v{lib.version || '?'}</span>
                      </div>
                    </div>
                    <p className="lib-desc">{lib.sentence || ''}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Board Manager Tab ──────────────────────────────────── */
const POPULAR_CORES = [
  { id: 'arduino:avr',   name: 'Arduino AVR Boards',     desc: 'Uno, Nano, Mega, Mini, etc.' },
  { id: 'arduino:megaavr', name: 'Arduino megaAVR Boards', desc: 'Uno WiFi Rev2, Nano Every' },
  { id: 'arduino:samd',  name: 'Arduino SAMD Boards',    desc: 'Zero, MKR, Nano 33 IoT' },
  { id: 'esp32:esp32',   name: 'ESP32 Boards',           desc: 'ESP32, ESP32-S2, ESP32-S3, ESP32-C3' },
  { id: 'esp8266:esp8266', name: 'ESP8266 Boards',       desc: 'NodeMCU, Wemos D1 Mini' },
  { id: 'rp2040:rp2040', name: 'Raspberry Pi Pico (RP2040)', desc: 'Pico, Pico W, Pico 2' },
  { id: 'STMicroelectronics:stm32', name: 'STM32 Boards', desc: 'STM32F, STM32H, Nucleo' },
];

function BoardManager({ pushNotification }) {
  const [installed, setInstalled] = useState([]);
  const [installing, setInstalling] = useState('');
  const [installOutput, setInstallOutput] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadCores(); }, []);

  async function loadCores() {
    setLoading(true);
    try {
      const cores = await getInstalledCores();
      setInstalled(cores.map(c => c.id));
    } catch {}
    setLoading(false);
  }

  async function handleInstall(coreId, coreName) {
    setInstalling(coreId);
    setInstallOutput([{ type: 'stdout', data: `Installing ${coreName}...` }]);
    pushNotification?.(`Installing ${coreName}...`, 'info');
    try {
      const code = await installCore(coreId, (line) => {
        setInstallOutput(prev => [...prev, line]);
      });
      if (code === 0) {
        pushNotification?.(`✓ Installed ${coreName}`, 'success');
        setInstalled(prev => [...prev, coreId]);
      } else {
        pushNotification?.(`Failed to install ${coreName}`, 'error');
      }
    } catch (e) {
      pushNotification?.(`Error: ${e}`, 'error');
    }
    setInstalling('');
  }

  return (
    <div className="hw-board-manager">
      {installing && (
        <div className="hw-install-progress">
          <i className="fa-solid fa-spinner fa-spin" /> Installing board platform...
          <div className="hw-install-log">
            {installOutput.slice(-8).map((l, i) => <div key={i} className={`hw-line-${l.type}`}>{l.data}</div>)}
          </div>
        </div>
      )}

      <div className="hw-boards-list">
        {POPULAR_CORES.map(core => {
          const isInstalled = installed.includes(core.id);
          return (
            <div key={core.id} className="hw-board-card">
              <div className="hw-board-info">
                <span className="hw-board-name">{core.name}</span>
                {isInstalled && <span className="hw-installed-badge">Installed</span>}
                <p className="hw-board-desc">{core.desc}</p>
                <code className="hw-board-id">{core.id}</code>
              </div>
              <button
                className={`hw-board-install-btn ${isInstalled ? 'installed' : ''}`}
                onClick={() => handleInstall(core.id, core.name)}
                disabled={!!installing || isInstalled}
              >
                {isInstalled ? <span><i className="fa-solid fa-check" /> Installed</span> : <span><i className="fa-solid fa-download" /> Install</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main HardwareManager ───────────────────────────────── */
export default function HardwareManager({ ariaExpandedisplayhardware, pushNotification }) {
  const [status, setStatus] = useState('checking'); // checking | not_installed | installing | ready | error
  const [installProgress, setInstallProgress] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializing, setInitializing] = useState(false);

  const [ports, setPorts] = useState([]);
  const [boards, setBoards] = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [selectedBoard, setSelectedBoard] = useState('esp32:esp32:esp32');
  const [compiling, setCompiling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [outputLines, setOutputLines] = useState([]);

  const [activeTab, setActiveTab] = useState('sketch'); // sketch | libraries | boards | serial

  useEffect(() => {
    if (ariaExpandedisplayhardware === 'flex') init();
  }, [ariaExpandedisplayhardware]);

  async function init() {
    setStatus('checking');
    const path = await getElectronicsCliPath();
    if (path) {
      setStatus('ready');
      setIsInitialized(true); // <-- Fix: mark as initialized so searches work!
      refreshPorts();
      loadBoards();
    } else {
      setStatus('not_installed');
    }
  }

  async function handleAutoInstall() {
    setStatus('installing');
    setInstallProgress('Downloading arduino-cli from arduino.cc (~10 MB)...');
    try {
      await downloadElectronicsCli();
      setInstallProgress('Initializing board and library indexes...');
      await electronicsInit();
      setIsInitialized(true);
      setStatus('ready');
      pushNotification?.('arduino-cli installed and ready!', 'success');
      refreshPorts();
      loadBoards();
    } catch (e) {
      setStatus('error');
      setInstallProgress(String(e));
      pushNotification?.(`Install failed: ${e}`, 'error');
    }
  }

  async function handleUpdateIndexes() {
    setInitializing(true);
    pushNotification?.('Updating board and library indexes...', 'info');
    try {
      await electronicsInit();
      setIsInitialized(true);
      pushNotification?.('Indexes updated!', 'success');
    } catch (e) {
      pushNotification?.(`Index update failed: ${e}`, 'error');
    }
    setInitializing(false);
  }

  async function refreshPorts() {
    try {
      const portsData = await getConnectedPorts();
      const list = Array.isArray(portsData) ? portsData : [];
      setPorts(list);
      if (list.length > 0 && !selectedPort) {
        const addr = list[0].port?.address || list[0].address || '';
        setSelectedPort(addr);
      }
    } catch {}
  }

  async function loadBoards() {
    try {
      const boardList = await getAllBoards();
      setBoards(boardList);
    } catch {}
  }

  function addOutput(line) {
    setOutputLines(prev => [...prev, line]);
  }

  function getSketchPath() {
    const tab = workspace.getActiveTab?.() || workspace.tabs?.find(t => t.id === workspace.activeTabId);
    if (!tab) return null;
    if (!tab.name.endsWith('.ino') && !tab.name.endsWith('.cpp')) return null;
    // Get parent directory for .ino files
    if (tab.nativePath) {
      return tab.nativePath.replace(/[/\\][^/\\]+$/, '');
    }
    return null;
  }

  async function handleVerify() {
    const sketchPath = getSketchPath();
    if (!sketchPath) {
      pushNotification?.('Open an .ino file first', 'warning');
      return;
    }
    if (!selectedBoard) {
      pushNotification?.('Select a board first', 'warning');
      return;
    }
    setCompiling(true);
    setOutputLines([{ type: 'info', data: `Compiling for ${selectedBoard}...` }]);
    try {
      const code = await compileSketch(sketchPath, selectedBoard, addOutput);
      if (code === 0) {
        addOutput({ type: 'success', data: 'Compilation complete.' });
        pushNotification?.('✓ Compilation successful!', 'success');
      } else {
        addOutput({ type: 'error', data: 'Compilation failed.' });
        pushNotification?.('Compilation failed. Check output.', 'error');
      }
    } catch (e) {
      addOutput({ type: 'error', data: String(e) });
    }
    setCompiling(false);
  }

  async function handleUpload() {
    const sketchPath = getSketchPath();
    if (!sketchPath) { pushNotification?.('Open an .ino file first', 'warning'); return; }
    if (!selectedBoard) { pushNotification?.('Select a board first', 'warning'); return; }
    if (!selectedPort) { pushNotification?.('Select a port (COM) first', 'warning'); return; }

    setUploading(true);
    setOutputLines([{ type: 'info', data: `Uploading to ${selectedPort} using ${selectedBoard}...` }]);
    try {
      const code = await uploadSketch(sketchPath, selectedBoard, selectedPort, addOutput);
      if (code === 0) {
        addOutput({ type: 'success', data: 'Upload complete.' });
        pushNotification?.('✓ Upload successful!', 'success');
      } else {
        addOutput({ type: 'error', data: 'Upload failed.' });
        pushNotification?.('Upload failed. Check output.', 'error');
      }
    } catch (e) {
      addOutput({ type: 'error', data: String(e) });
    }
    setUploading(false);
  }

  const busy = compiling || uploading || initializing;

  return (
    <div id="hardwarearea" className={`hardware-shell sidebarscontent d-${ariaExpandedisplayhardware}`} tabIndex={-1}>

      {/* ── CHECKING ── */}
      {status === 'checking' && (
        <div className="hw-center">
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 32, opacity: 0.5 }} />
          <p style={{ marginTop: 12, opacity: 0.5 }}>Checking for arduino-cli...</p>
        </div>
      )}

      {/* ── NOT INSTALLED ── */}
      {status === 'not_installed' && (
        <div className="hw-center">
          <i className="fa-solid fa-microchip" style={{ fontSize: 48, color: '#3b82f6', marginBottom: 16 }} />
          <h3>Arduino CLI Not Found</h3>
          <p>Tilder needs <strong>arduino-cli</strong> to compile and upload sketches. It will be downloaded automatically (~10 MB).</p>
          <button className="hw-install-btn" onClick={handleAutoInstall}>
            <i className="fa-solid fa-download" /> Install Automatically
          </button>
          <p style={{ marginTop: 12, opacity: 0.4, fontSize: 10 }}>From arduino.cc • GPLv3 licensed</p>
        </div>
      )}

      {/* ── INSTALLING ── */}
      {status === 'installing' && (
        <div className="hw-center">
          <i className="fa-solid fa-gear fa-spin" style={{ fontSize: 36, color: '#3b82f6' }} />
          <h3 style={{ marginTop: 16 }}>Installing arduino-cli</h3>
          <p style={{ opacity: 0.65, fontSize: 11 }}>{installProgress}</p>
          <div className="hw-progress-bar"><div className="hw-progress-fill" /></div>
        </div>
      )}

      {/* ── ERROR ── */}
      {status === 'error' && (
        <div className="hw-center">
          <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 36, color: '#f87171', marginBottom: 12 }} />
          <h3>Installation Failed</h3>
          <p style={{ opacity: 0.6, fontSize: 11 }}>{installProgress}</p>
          <button className="hw-install-btn" onClick={handleAutoInstall} style={{ marginTop: 16 }}>
            <i className="fa-solid fa-rotate-right" /> Try Again
          </button>
        </div>
      )}

      {/* ── READY ── */}
      {status === 'ready' && (
        <div className="hw-ready">
          {/* Header */}
          <div className="hardware-header">
            <span className="hardware-eyebrow"><i className="fa-solid fa-microchip" /> Electronics Manager</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="hardware-toolbar-btn" onClick={handleUpdateIndexes} disabled={busy} title="Update Indexes">
                <i className={`fa-solid fa-rotate-right ${initializing ? 'fa-spin' : ''}`} />
              </button>
              <button className="hardware-toolbar-btn" onClick={refreshPorts} disabled={busy} title="Refresh Ports">
                <i className="fa-solid fa-plug" />
              </button>
            </div>
          </div>

          {/* Board + Port always visible */}
          <div className="hw-device-bar">
            <div className="hw-device-row">
              <label>Board</label>
              <select value={selectedBoard} onChange={e => setSelectedBoard(e.target.value)} disabled={busy}>
                <option value="">Select board...</option>
                {boards.map(b => <option key={b.fqbn} value={b.fqbn}>{b.name}</option>)}
                {/* Fallback popular boards if index not loaded */}
                {boards.length === 0 && <>
                  <option value="arduino:avr:uno">Arduino Uno</option>
                  <option value="arduino:avr:nano">Arduino Nano</option>
                  <option value="arduino:avr:mega">Arduino Mega</option>
                  <option value="esp32:esp32:esp32">ESP32 Dev Module</option>
                  <option value="esp32:esp32:esp32s3">ESP32-S3</option>
                  <option value="esp32:esp32:esp32c3">ESP32-C3</option>
                  <option value="esp8266:esp8266:nodemcuv2">NodeMCU (ESP8266)</option>
                  <option value="rp2040:rp2040:rpipico">Raspberry Pi Pico</option>
                </>}
              </select>
            </div>
            <div className="hw-device-row">
              <label>Port</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={selectedPort} onChange={e => setSelectedPort(e.target.value)} disabled={busy} style={{ flex: 1 }}>
                  <option value="">Select port...</option>
                  {ports.map(p => {
                    const addr = p.port?.address || p.address || p;
                    const label = p.port?.protocol_label || p.protocol_label || '';
                    return <option key={addr} value={addr}>{addr}{label ? ` (${label})` : ''}</option>;
                  })}
                </select>
                <button className="hw-icon-btn" onClick={refreshPorts} title="Refresh ports">
                  <i className="fa-solid fa-rotate-right" />
                </button>
              </div>
            </div>
            <div className="hw-action-row">
              <button className="hardware-btn" onClick={handleVerify} disabled={busy}>
                {compiling
                  ? <span><i className="fa-solid fa-spinner fa-spin" /> Compiling...</span>
                  : <span><i className="fa-solid fa-check" /> Verify</span>}
              </button>
              <button className="hardware-btn primary" onClick={handleUpload} disabled={busy || !selectedPort}>
                {uploading
                  ? <span><i className="fa-solid fa-spinner fa-spin" /> Uploading...</span>
                  : <span><i className="fa-solid fa-arrow-right-to-bracket" /> Upload</span>}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="hw-main-tabs">
            <button className={`hw-main-tab ${activeTab === 'sketch' ? 'active' : ''}`} onClick={() => setActiveTab('sketch')}>
              <i className="fa-solid fa-terminal" /> Output
            </button>
            <button className={`hw-main-tab ${activeTab === 'serial' ? 'active' : ''}`} onClick={() => setActiveTab('serial')}>
              <i className="fa-solid fa-satellite-dish" /> Serial
            </button>
            <button className={`hw-main-tab ${activeTab === 'libraries' ? 'active' : ''}`} onClick={() => setActiveTab('libraries')}>
              <i className="fa-solid fa-book" /> Libraries
            </button>
            <button className={`hw-main-tab ${activeTab === 'boards' ? 'active' : ''}`} onClick={() => setActiveTab('boards')}>
              <i className="fa-solid fa-microchip" /> Boards
            </button>
          </div>

          {/* Tab Content */}
          <div className="hw-tab-area">
            {activeTab === 'sketch' && (
              <OutputConsole lines={outputLines} onClear={() => setOutputLines([])} />
            )}
            {activeTab === 'serial' && (
              <SerialMonitor ports={ports} />
            )}
            {activeTab === 'libraries' && (
              <LibraryManager
                pushNotification={pushNotification}
                isInitialized={isInitialized}
                onNeedInit={handleUpdateIndexes}
              />
            )}
            {activeTab === 'boards' && (
              <BoardManager pushNotification={pushNotification} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
