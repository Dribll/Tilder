// src/components/RemoteWindow/RemoteWindowModal.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import './RemoteWindowModal.css';
import remoteManager, {
  getActiveRemote,
  disconnectRemote,
  detectWslDistros,
  getWslWorkspacePath,
  detectSshConfigHosts,
  testSshConnection,
  hostRemoteTunnel,
  connectToRemoteTunnel,
  startCollabSession,
  joinCollabSession,
  checkDockerInstalled,
} from '../../core/remoteManager.js';

export default function RemoteWindowModal({
  isOpen,
  onClose,
  workspace,
  pushNotification,
  refreshWorkspace,
}) {
  const [view, setView] = useState('main'); // 'main' | 'tunnel' | 'wsl' | 'ssh' | 'liveshare' | 'liveshare-join' | 'container' | 'repo'
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeRemote, setActiveRemoteState] = useState(getActiveRemote());
  const inputRef = useRef(null);

  // Sub-view states
  const [tunnelProvider, setTunnelProvider] = useState('github');
  const [tunnelName, setTunnelName] = useState('');
  const [tunnelConnecting, setTunnelConnecting] = useState(false);
  const [tunnelLog, setTunnelLog] = useState('');

  const [wslDistros, setWslDistros] = useState([]);
  const [wslLoading, setWslLoading] = useState(false);
  const [wslError, setWslError] = useState(null);

  const [sshHosts, setSshHosts] = useState([]);
  const [sshCustomHost, setSshCustomHost] = useState('');
  const [sshTesting, setSshTesting] = useState(false);

  const [liveShareLink, setLiveShareLink] = useState('');
  const [liveShareJoinInput, setLiveShareJoinInput] = useState('');

  const [dockerStatus, setDockerStatus] = useState(null);

  // Subscribe to remote changes
  useEffect(() => {
    return remoteManager.subscribeRemoteState(setActiveRemoteState);
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setView('main');
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Main menu items
  const mainItems = useMemo(() => {
    const list = [];

    // If currently connected to a remote, offer Disconnect at top
    if (activeRemote.type !== 'local') {
      list.push({
        id: 'disconnect',
        label: 'Close Remote Connection',
        icon: 'fa-solid fa-xmark',
        badge: activeRemote.name,
        isDisconnect: true,
        action: () => {
          disconnectRemote();
          if (pushNotification) pushNotification('Closed remote connection. Switched to local Desktop.', 'info');
          onClose();
        },
      });
    }

    list.push(
      {
        id: 'tunnel',
        label: 'Connect to Tunnel...',
        icon: 'fa-solid fa-cloud',
        badge: 'Remote-Tunnels',
        action: () => setView('tunnel'),
      },
      {
        id: 'wsl',
        label: 'Connect to WSL',
        icon: 'fa-brands fa-linux',
        badge: 'WSL',
        action: async () => {
          setView('wsl');
          setWslLoading(true);
          setWslError(null);
          const res = await detectWslDistros();
          setWslLoading(false);
          if (res.installed && res.distros.length > 0) {
            setWslDistros(res.distros);
          } else {
            setWslError(res.error || 'WSL is not available.');
          }
        },
      },
      {
        id: 'live-share-start',
        label: 'Start Tilder Collab Session (Share)',
        icon: 'fa-solid fa-user-plus',
        badge: 'Tilder Collab',
        action: () => {
          setView('liveshare');
          const wsName = workspace?.rootName || 'Workspace';
          const session = startCollabSession(wsName);
          setLiveShareLink(session.joinUrl);
          if (pushNotification) {
            pushNotification('Tilder Collab session started! Invite link copied to clipboard.', 'success', 6000);
          }
        },
      },
      {
        id: 'live-share-join',
        label: 'Join Tilder Collab Session',
        icon: 'fa-solid fa-users',
        badge: 'Tilder Collab',
        action: () => setView('liveshare-join'),
      },
      {
        id: 'ssh',
        label: 'SSH: Connect to Host...',
        icon: 'fa-solid fa-terminal',
        badge: 'SSH',
        action: async () => {
          setView('ssh');
          const hosts = await detectSshConfigHosts();
          setSshHosts(hosts);
        },
      },
      {
        id: 'container',
        label: 'Dev Containers: Reopen in Container',
        icon: 'fa-brands fa-docker',
        badge: 'Dev Containers',
        action: async () => {
          setView('container');
          const installed = await checkDockerInstalled();
          setDockerStatus(installed);
        },
      },
      {
        id: 'codespaces',
        label: 'GitHub Codespaces / Remote Repository',
        icon: 'fa-brands fa-github',
        badge: 'GitHub',
        action: () => setView('repo'),
      }
    );

    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(item => item.label.toLowerCase().includes(q) || (item.badge && item.badge.toLowerCase().includes(q)));
  }, [activeRemote, query, workspace, pushNotification, onClose]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (view !== 'main') {
          setView('main');
        } else {
          onClose();
        }
        return;
      }

      if (view === 'main') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % (mainItems.length || 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + (mainItems.length || 1)) % (mainItems.length || 1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selected = mainItems[selectedIndex];
          if (selected) selected.action();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, view, selectedIndex, mainItems, onClose]);

  if (!isOpen) return null;

  return (
    <div className="remote-modal-backdrop" onClick={onClose}>
      <div className="remote-modal-box" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="remote-modal-header">
          {view !== 'main' && (
            <button className="remote-modal-back-btn" onClick={() => setView('main')} title="Back to menu">
              <i className="fa-solid fa-arrow-left"></i>
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            className="remote-modal-search"
            placeholder={
              view === 'main'
                ? 'Select an option to open a Remote Window'
                : view === 'tunnel'
                ? 'Enter tunnel name or select authentication...'
                : view === 'ssh'
                ? 'Enter SSH connection: user@hostname[:port]...'
                : view === 'wsl'
                ? 'Select a Linux distribution...'
                : 'Search remote options...'
            }
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        {/* ── View: Main Menu ── */}
        {view === 'main' && (
          <div className="remote-modal-list">
            {mainItems.length === 0 ? (
              <div className="remote-modal-empty">No matching remote options found.</div>
            ) : (
              mainItems.map((item, index) => (
                <button
                  key={item.id}
                  className={`remote-modal-item ${item.isDisconnect ? 'disconnect' : ''} ${index === selectedIndex ? 'is-selected' : ''}`}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="remote-modal-item-left">
                    <span className="remote-modal-item-icon">
                      <i className={item.icon}></i>
                    </span>
                    <span className="remote-modal-item-label">{item.label}</span>
                  </div>
                  {item.badge && <span className="remote-modal-item-badge">{item.badge}</span>}
                </button>
              ))
            )}
          </div>
        )}

        {/* ── View: Connect to Tunnel ── */}
        {view === 'tunnel' && (
          <div className="remote-modal-content-panel">
            <div className="remote-modal-panel-title">
              <i className="fa-solid fa-cloud" style={{ color: '#8e89ff' }}></i>
              <span>Connect to Remote Tunnel</span>
            </div>
            <p className="remote-modal-panel-desc">
              Connect to your machine securely from anywhere using GitHub or Microsoft Account authentication.
            </p>

            <div className="remote-modal-input-group">
              <label className="remote-modal-input-label">1. Authentication Provider</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`remote-modal-btn ${tunnelProvider === 'github' ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => setTunnelProvider('github')}
                >
                  <i className="fa-brands fa-github"></i> GitHub Account
                </button>
                <button
                  type="button"
                  className={`remote-modal-btn ${tunnelProvider === 'microsoft' ? 'primary' : 'secondary'}`}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => setTunnelProvider('microsoft')}
                >
                  <i className="fa-brands fa-microsoft"></i> Microsoft Account
                </button>
              </div>
            </div>

            <div className="remote-modal-input-group">
              <label className="remote-modal-input-label">2. Tunnel Identifier / Name</label>
              <input
                type="text"
                className="remote-modal-text-input"
                placeholder="e.g. my-dev-machine or tilder.dev/tunnel/my-dev"
                value={tunnelName}
                onChange={e => setTunnelName(e.target.value)}
              />
            </div>

            {tunnelLog && (
              <div style={{ fontSize: '11px', color: '#a0a0c0', background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: '6px' }}>
                {tunnelLog}
              </div>
            )}

            <div className="remote-modal-btn-row">
              <button
                type="button"
                className="remote-modal-btn secondary"
                disabled={tunnelConnecting}
                onClick={async () => {
                  setTunnelConnecting(true);
                  try {
                    const result = await hostRemoteTunnel({
                      tunnelName: tunnelName || undefined,
                      provider: tunnelProvider,
                      onLog: msg => setTunnelLog(msg),
                    });
                    if (pushNotification) {
                      pushNotification(`Hosted Remote Tunnel: ${result.tunnelName}! Access via ${result.url}`, 'success', 8000);
                    }
                    onClose();
                  } catch (err) {
                    if (pushNotification) pushNotification(err.message || 'Failed to host tunnel.', 'error');
                  } finally {
                    setTunnelConnecting(false);
                  }
                }}
              >
                <i className="fa-solid fa-server" style={{ marginRight: '6px' }}></i>
                Host a Tunnel
              </button>

              <button
                type="button"
                className="remote-modal-btn primary"
                disabled={tunnelConnecting || !tunnelName.trim()}
                onClick={async () => {
                  setTunnelConnecting(true);
                  try {
                    const result = await connectToRemoteTunnel({
                      tunnelName,
                      provider: tunnelProvider,
                    });
                    if (pushNotification) {
                      pushNotification(`Connected to remote tunnel: ${result.tunnelName}!`, 'success');
                    }
                    onClose();
                  } catch (err) {
                    if (pushNotification) pushNotification(err.message || 'Failed to connect to tunnel.', 'error');
                  } finally {
                    setTunnelConnecting(false);
                  }
                }}
              >
                <i className="fa-solid fa-plug" style={{ marginRight: '6px' }}></i>
                Connect to Tunnel
              </button>
            </div>
          </div>
        )}

        {/* ── View: WSL ── */}
        {view === 'wsl' && (
          <div className="remote-modal-content-panel">
            <div className="remote-modal-panel-title">
              <i className="fa-brands fa-linux" style={{ color: '#e5a00d' }}></i>
              <span>Windows Subsystem for Linux (WSL)</span>
            </div>

            {wslLoading ? (
              <div className="remote-modal-empty">
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                Detecting installed Linux distributions...
              </div>
            ) : wslError ? (
              <div style={{ background: 'rgba(255, 80, 80, 0.1)', border: '1px solid rgba(255,80,80,0.2)', padding: '12px', borderRadius: '8px', color: '#ff9090', fontSize: '12.5px' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>WSL Not Detected</p>
                <p style={{ opacity: 0.85, marginBottom: '8px' }}>{wslError}</p>
                <div style={{ fontSize: '11px', background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: '4px', fontFamily: 'monospace' }}>
                  wsl --install
                </div>
              </div>
            ) : (
              <div className="remote-modal-list" style={{ padding: 0 }}>
                <p className="remote-modal-panel-desc" style={{ marginBottom: '8px' }}>
                  Select an installed distribution to open its workspace in Tilder:
                </p>
                {wslDistros.map(distro => (
                  <button
                    key={distro}
                    className="remote-modal-item"
                    onClick={async () => {
                      const wslPath = getWslWorkspacePath(distro, 'home');
                      remoteManager.setActiveRemote({
                        type: 'wsl',
                        name: distro,
                        detail: `WSL: ${distro}`,
                      });
                      if (workspace?.openFolderFromPath) {
                        await workspace.openFolderFromPath(wslPath, `${distro} (WSL)`);
                        if (refreshWorkspace) refreshWorkspace();
                      }
                      if (pushNotification) {
                        pushNotification(`Connected to WSL: ${distro}! Opened Linux filesystem.`, 'success');
                      }
                      onClose();
                    }}
                  >
                    <div className="remote-modal-item-left">
                      <i className="fa-brands fa-ubuntu" style={{ color: '#e95420', fontSize: '16px' }}></i>
                      <span className="remote-modal-item-label">{distro}</span>
                    </div>
                    <span className="remote-modal-item-badge">Connect</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── View: SSH ── */}
        {view === 'ssh' && (
          <div className="remote-modal-content-panel">
            <div className="remote-modal-panel-title">
              <i className="fa-solid fa-terminal" style={{ color: '#48c774' }}></i>
              <span>SSH Remote Connection</span>
            </div>

            <div className="remote-modal-input-group">
              <label className="remote-modal-input-label">Connect to custom SSH Host</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="remote-modal-text-input"
                  style={{ flex: 1 }}
                  placeholder="e.g. root@192.168.1.100 or user@my-server.com"
                  value={sshCustomHost}
                  onChange={e => setSshCustomHost(e.target.value)}
                />
                <button
                  type="button"
                  className="remote-modal-btn primary"
                  disabled={sshTesting || !sshCustomHost.trim()}
                  onClick={async () => {
                    setSshTesting(true);
                    remoteManager.setActiveRemote({
                      type: 'ssh',
                      name: sshCustomHost.trim(),
                      detail: `SSH: ${sshCustomHost.trim()}`,
                    });
                    if (pushNotification) {
                      pushNotification(`Connected to SSH Remote: ${sshCustomHost.trim()}!`, 'success');
                    }
                    setSshTesting(false);
                    onClose();
                  }}
                >
                  Connect
                </button>
              </div>
            </div>

            {sshHosts.length > 0 && (
              <div className="remote-modal-input-group" style={{ marginTop: '10px' }}>
                <label className="remote-modal-input-label">Configured Hosts (~/.ssh/config)</label>
                <div className="remote-modal-list" style={{ padding: 0, maxHeight: '180px' }}>
                  {sshHosts.map(h => (
                    <button
                      key={h.name}
                      className="remote-modal-item"
                      onClick={() => {
                        remoteManager.setActiveRemote({
                          type: 'ssh',
                          name: h.name,
                          detail: `SSH: ${h.name} (${h.hostname || 'configured'})`,
                        });
                        if (pushNotification) {
                          pushNotification(`Connected to SSH Host: ${h.name}!`, 'success');
                        }
                        onClose();
                      }}
                    >
                      <div className="remote-modal-item-left">
                        <i className="fa-solid fa-server" style={{ color: '#48c774' }}></i>
                        <span className="remote-modal-item-label">{h.name}</span>
                      </div>
                      <span className="remote-modal-item-badge">{h.hostname || 'SSH Host'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── View: Live Share Start ── */}
        {view === 'liveshare' && (
          <div className="remote-modal-content-panel">
            <div className="remote-modal-panel-title">
              <i className="fa-solid fa-users" style={{ color: '#4da3ff' }}></i>
              <span>Tilder Collab — Real-time Pair Programming</span>
            </div>
            <p className="remote-modal-panel-desc">
              Your workspace is ready for real-time collaboration. Share this invite link with your collaborators:
            </p>

            <div className="remote-modal-input-group">
              <label className="remote-modal-input-label">Invite Link</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  className="remote-modal-text-input"
                  style={{ flex: 1, color: '#8ec5fc' }}
                  value={liveShareLink}
                />
                <button
                  type="button"
                  className="remote-modal-btn primary"
                  onClick={() => {
                    navigator.clipboard.writeText(liveShareLink);
                    if (pushNotification) pushNotification('Invite link copied to clipboard!', 'info');
                  }}
                >
                  <i className="fa-solid fa-copy" style={{ marginRight: '6px' }}></i> Copy
                </button>
              </div>
            </div>

            <div className="remote-modal-btn-row">
              <button type="button" className="remote-modal-btn secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── View: Live Share Join ── */}
        {view === 'liveshare-join' && (
          <div className="remote-modal-content-panel">
            <div className="remote-modal-panel-title">
              <i className="fa-solid fa-users" style={{ color: '#4da3ff' }}></i>
              <span>Join Tilder Collab Session</span>
            </div>
            <p className="remote-modal-panel-desc">
              Paste the invite link or session ID provided by your collaborator to join their session.
            </p>

            <div className="remote-modal-input-group">
              <label className="remote-modal-input-label">Invite Link or Code</label>
              <input
                type="text"
                className="remote-modal-text-input"
                placeholder="e.g. tilder://join/live-abc1234 or session ID"
                value={liveShareJoinInput}
                onChange={e => setLiveShareJoinInput(e.target.value)}
              />
            </div>

            <div className="remote-modal-btn-row">
              <button
                type="button"
                className="remote-modal-btn primary"
                disabled={!liveShareJoinInput.trim()}
                onClick={() => {
                  try {
                    joinCollabSession(liveShareJoinInput);
                    if (pushNotification) pushNotification('Joined Tilder Collab collaboration session!', 'success');
                    onClose();
                  } catch (err) {
                    if (pushNotification) pushNotification(err.message || 'Failed to join session.', 'error');
                  }
                }}
              >
                Join Session
              </button>
            </div>
          </div>
        )}

        {/* ── View: Dev Containers ── */}
        {view === 'container' && (
          <div className="remote-modal-content-panel">
            <div className="remote-modal-panel-title">
              <i className="fa-brands fa-docker" style={{ color: '#0db7ed' }}></i>
              <span>Dev Containers</span>
            </div>

            {dockerStatus === null ? (
              <div className="remote-modal-empty">Checking Docker availability...</div>
            ) : dockerStatus ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="remote-modal-status-badge">
                  <i className="fa-solid fa-check"></i> Docker Daemon is Running
                </div>
                <p className="remote-modal-panel-desc">
                  You can reopen this workspace inside an isolated container with all runtime dependencies configured.
                </p>
                <button
                  type="button"
                  className="remote-modal-btn primary"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => {
                    remoteManager.setActiveRemote({
                      type: 'container',
                      name: 'Dev Container',
                      detail: 'Container: Docker',
                    });
                    if (pushNotification) pushNotification('Switched environment to Dev Container!', 'success');
                    onClose();
                  }}
                >
                  <i className="fa-solid fa-box-open" style={{ marginRight: '6px' }}></i>
                  Reopen in Container
                </button>
              </div>
            ) : (
              <div style={{ background: 'rgba(255, 80, 80, 0.1)', border: '1px solid rgba(255,80,80,0.2)', padding: '12px', borderRadius: '8px', color: '#ff9090', fontSize: '12.5px' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px' }}>Docker Desktop Not Found</p>
                <p style={{ opacity: 0.85 }}>Please start or install Docker Desktop to use Dev Containers.</p>
              </div>
            )}
          </div>
        )}

        {/* ── View: GitHub Remote Repository ── */}
        {view === 'repo' && (
          <div className="remote-modal-content-panel">
            <div className="remote-modal-panel-title">
              <i className="fa-brands fa-github" style={{ color: '#fff' }}></i>
              <span>Open Remote GitHub Repository</span>
            </div>
            <p className="remote-modal-panel-desc">
              Browse and edit remote repositories directly on GitHub without cloning locally.
            </p>

            <div className="remote-modal-input-group">
              <label className="remote-modal-input-label">Repository (owner/repo)</label>
              <input
                type="text"
                className="remote-modal-text-input"
                placeholder="e.g. facebook/react or tilder-ide/tilder"
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.target.value.trim()) {
                    const repo = e.target.value.trim();
                    remoteManager.setActiveRemote({
                      type: 'repo',
                      name: repo,
                      detail: `GitHub: ${repo}`,
                    });
                    if (pushNotification) pushNotification(`Opened remote repository ${repo}!`, 'success');
                    onClose();
                  }
                }}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}