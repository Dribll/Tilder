import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../core/apiBase.js';
import './SystemMonitor.css';

export default function SystemMonitor({ modalType }) {
  if (modalType !== 'System Monitor') return null;

  const [stats, setStats] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memHistory, setMemHistory] = useState([]);
  const [gpuHistory, setGpuHistory] = useState([]);
  const [activePorts, setActivePorts] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchPorts();
    const statsInterval = setInterval(fetchStats, 1500);
    const portsInterval = setInterval(fetchPorts, 3000);
    return () => {
      clearInterval(statsInterval);
      clearInterval(portsInterval);
    };
  }, []);

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/system/stats');
      if (!res.ok) {
        throw new Error(`Backend error ${res.status}. Please restart Tilder.`);
      }
      const data = await res.json();
      if (!data || !data.cpu) {
        throw new Error('Incomplete data from backend. Please fully restart Tilder (close & reopen).');
      }
      setErrorMsg(null);
      setStats(data);
      setCpuHistory(prev => [...prev, data.cpu.usage].slice(-40));
      setMemHistory(prev => [...prev, data.memory?.percentage ?? 0].slice(-40));
      const gpuUsage = data.gpu?.[0]?.utilizationGpu ?? 0;
      setGpuHistory(prev => [...prev, gpuUsage].slice(-40));
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const fetchPorts = async () => {
    try {
      const res = await apiFetch('/api/ports');
      const data = await res.json();
      if (Array.isArray(data)) setActivePorts(data);
    } catch {}
  };

  if (errorMsg && !stats) {
    return (
      <div className="system-monitor-loading">
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '2rem', color: '#ff5f5f' }}></i>
        <p style={{ color: '#ff5f5f', textAlign: 'center', maxWidth: '80%' }}>{errorMsg}</p>
        <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Close Tilder completely and reopen it to load the new backend.</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="system-monitor-loading">
        <div className="loading-spinner"></div>
        <p>Gathering system telemetry...</p>
      </div>
    );
  }

  // ── Helpers ─────────────────────────────────────────────
  const getSvgPath = (history, isFilled = false) => {
    if (history.length < 2) return '';
    const width = 300, height = 80, maxVal = 100;
    const step = width / 39;
    const padded = [...Array(40 - history.length).fill(0), ...history];
    let path = padded.map((val, i) => {
      const x = i * step;
      const y = height - (Math.max(0, val) / maxVal) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    if (isFilled) path += ` L ${width} ${height} L 0 ${height} Z`;
    return path;
  };

  const formatUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
          m = Math.floor((s % 3600) / 60);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${Math.floor(s % 60)}s`].filter(Boolean).join(' ');
  };

  const formatGB = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0 GB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  };

  const TempBadge = ({ temp }) => {
    if (temp == null) return null;
    const cls = temp >= 85 ? 'temp-hot' : temp >= 65 ? 'temp-warm' : 'temp-cool';
    return <span className={`temp-badge ${cls}`}><i className="fa-solid fa-temperature-half"></i> {temp}°C</span>;
  };

  const currentGpu = stats.gpu?.[0] ?? null;
  const fans = stats.fans || [];
  const storage = stats.storage || [];
  const battery = stats.battery || null;

  return (
    <div className="system-monitor-container">

      {/* ── ROW 1: CPU + RAM ── */}
      <div className="system-monitor-grid">

        {/* CPU */}
        <div className="monitor-card cpu-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-microchip"></i> CPU Usage</h3>
            <span className="live-badge">LIVE</span>
          </div>
          <div className="monitor-metric-row">
            <div className="large-metric">{stats.cpu.usage}%</div>
            <div className="metric-details">
              <div className="cpu-model">{stats.cpu.model}</div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                <span className="cores-badge">{stats.cpu.cores} Cores @ {(stats.cpu.speedMax || stats.cpu.speed || 0).toFixed(2)}GHz</span>
                <TempBadge temp={stats.cpu.temperature} />
              </div>
            </div>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill cpu-fill" style={{ width: `${stats.cpu.usage}%` }}></div>
          </div>
          {/* Per-core heatmap */}
          {stats.cpu.loadHistory?.length > 0 && (
            <div className="cpu-cores-heatmap">
              {stats.cpu.loadHistory.map((load, i) => (
                <div key={i} className="core-box"
                  style={{ backgroundColor: `rgba(138,124,255,${Math.max(0.08, load / 100)})`, border: `1px solid rgba(138,124,255,${Math.max(0.15, load / 100 + 0.1)})` }}
                  title={`Core ${i}: ${load}%`}
                />
              ))}
            </div>
          )}
          <div className="chart-wrapper">
            <div className="tm-graph-grid"></div>
            <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="monitor-svg-chart">
              <defs>
                <linearGradient id="fillCPU" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(138,124,255,0.4)" />
                  <stop offset="100%" stopColor="rgba(138,124,255,0)" />
                </linearGradient>
              </defs>
              <path d={getSvgPath(cpuHistory, true)} fill="url(#fillCPU)" />
              <path d={getSvgPath(cpuHistory)} fill="none" stroke="#a89eff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* RAM */}
        <div className="monitor-card ram-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-memory"></i> Memory</h3>
            <span className="live-badge">LIVE</span>
          </div>
          <div className="monitor-metric-row">
            <div className="large-metric" style={{ color: '#00d2ff' }}>{stats.memory.percentage}%</div>
            <div className="metric-details">
              <div className="cpu-model">{formatGB(stats.memory.active)} Used</div>
              <span className="cores-badge" style={{ background: 'rgba(0,210,255,0.1)', color: '#00d2ff', border: '1px solid rgba(0,210,255,0.2)', marginTop: '4px', display: 'inline-block' }}>
                {formatGB(stats.memory.total)} Total
              </span>
            </div>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${stats.memory.percentage}%`, background: 'linear-gradient(90deg,#005c97,#363795)' }}></div>
          </div>
          <div className="chart-wrapper">
            <div className="tm-graph-grid"></div>
            <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="monitor-svg-chart">
              <defs>
                <linearGradient id="fillRAM" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(0,210,255,0.4)" />
                  <stop offset="100%" stopColor="rgba(0,210,255,0)" />
                </linearGradient>
              </defs>
              <path d={getSvgPath(memHistory, true)} fill="url(#fillRAM)" />
              <path d={getSvgPath(memHistory)} fill="none" stroke="#00d2ff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── ROW 2: GPU + Fans/Battery ── */}
      <div className="system-monitor-grid">

        {/* GPU */}
        <div className="monitor-card gpu-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-gamepad"></i> Graphics</h3>
            <span className="live-badge">LIVE</span>
          </div>
          {currentGpu ? (
            <>
              <div className="monitor-metric-row">
                <div className="large-metric" style={{ color: '#38ef7d' }}>{currentGpu.utilizationGpu ?? 0}%</div>
                <div className="metric-details">
                  <div className="cpu-model">{currentGpu.model || 'GPU'}</div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                    {currentGpu.vram > 0 && <span className="cores-badge">{Math.round(currentGpu.vram / 1024)}GB VRAM</span>}
                    <TempBadge temp={currentGpu.temperature} />
                  </div>
                </div>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${currentGpu.utilizationGpu ?? 0}%`, background: 'linear-gradient(90deg,#11998e,#38ef7d)' }}></div>
              </div>
              <div className="chart-wrapper">
                <div className="tm-graph-grid"></div>
                <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="monitor-svg-chart">
                  <defs>
                    <linearGradient id="fillGPU" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(56,239,125,0.4)" />
                      <stop offset="100%" stopColor="rgba(56,239,125,0)" />
                    </linearGradient>
                  </defs>
                  <path d={getSvgPath(gpuHistory, true)} fill="url(#fillGPU)" />
                  <path d={getSvgPath(gpuHistory)} fill="none" stroke="#38ef7d" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
            </>
          ) : (
            <div className="no-data-msg">GPU data unavailable</div>
          )}
        </div>

        {/* Fans & Battery */}
        <div className="monitor-card multi-panel-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-fan"></i> Cooling &amp; Power</h3>
          </div>
          <div className="cooling-power-layout">
            <div className="fans-container">
              {fans.length > 0 ? fans.map((fan, i) => (
                <div key={i} className="fan-gauge-box">
                  <div className="fan-icon-spin"><i className="fa-solid fa-fan"></i></div>
                  <div className="fan-details">
                    <div className="fan-rpm">
                      {fan.rpm}
                      <span className="rpm-unit">{fan.isPercent ? '%' : 'RPM'}</span>
                    </div>
                    <div className="fan-name">{fan.name || `Fan ${i + 1}`}</div>
                  </div>
                </div>
              )) : (
                <div className="no-data-sm"><i className="fa-solid fa-fan" style={{ opacity: 0.3 }}></i> No fan sensors detected</div>
              )}
            </div>
            {battery && (
              <div className="battery-box">
                <div className="battery-icon">
                  <i className={`fa-solid ${battery.isCharging ? 'fa-plug-circle-bolt' : battery.percent > 80 ? 'fa-battery-full' : battery.percent > 50 ? 'fa-battery-half' : battery.percent > 20 ? 'fa-battery-quarter' : 'fa-battery-empty'}`} style={{ color: battery.isCharging ? '#38ef7d' : battery.percent < 20 ? '#ff5f5f' : '#00d2ff' }}></i>
                </div>
                <div className="battery-details">
                  <div className="batt-pct">{battery.percent}%</div>
                  <div className="batt-status">{battery.isCharging ? '⚡ Charging' : battery.minutesRemaining ? `${Math.floor(battery.minutesRemaining / 60)}h ${battery.minutesRemaining % 60}m left` : 'On Battery'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── STORAGE ROW ── */}
      {storage.length > 0 && (
        <div className="monitor-card" style={{ marginBottom: '14px' }}>
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-hard-drive"></i> Storage</h3>
          </div>
          <div className="storage-grid">
            {storage.map((drive, i) => {
              const usedPct = drive.totalGb > 0 ? Math.min(100, Math.max(0, (drive.usedGb / drive.totalGb) * 100)) : 0;
              return (
                <div key={i} className="storage-drive-card">
                  <div className="storage-drive-header">
                    <div className="drive-letter-box">{drive.letter || '?'}</div>
                    <div className="drive-info-stack">
                      <span className="drive-name" title={drive.name}>{drive.name || 'Local Disk'}</span>
                      <span className={`drive-type ${(drive.mediaType || '').toLowerCase().includes('nvme') || (drive.mediaType || '').toLowerCase().includes('ssd') ? 'badge-nvme' : 'badge-hdd'}`}>{drive.mediaType || drive.type || 'Drive'}</span>
                    </div>
                    <TempBadge temp={drive.tempCelsius} />
                  </div>
                  <div className="storage-progress-wrapper">
                    <div className="storage-labels">
                      <span>{(drive.usedGb || 0).toFixed(1)} GB used</span>
                      <span>{(drive.totalGb || 0).toFixed(1)} GB total</span>
                    </div>
                    <div className="progress-bar-container storage-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${usedPct}%`, background: usedPct > 85 ? '#ff5f5f' : '#8d5aff' }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ROW 3: Ports + OS Info ── */}
      <div className="system-monitor-grid">

        <div className="monitor-card ports-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-network-wired"></i> Active Tunnels</h3>
            <button className="refresh-btn" onClick={fetchPorts} title="Refresh">
              <i className="fa-solid fa-rotate-right"></i>
            </button>
          </div>
          <div className="ports-list">
            {activePorts.length === 0 ? (
              <div className="no-ports">No active localhost tunnels</div>
            ) : activePorts.map((p, i) => (
              <div key={i} className="port-item">
                <div className="port-icon"><i className="fa-solid fa-ethernet"></i></div>
                <div className="port-info">
                  <div className="port-number">Port {p.port}</div>
                  <div className="port-process">{p.process} (PID: {p.pid})</div>
                </div>
                <div className="port-status active">Listening</div>
              </div>
            ))}
          </div>
        </div>

        <div className="monitor-card info-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-circle-info"></i> System Info</h3>
          </div>
          <table className="info-table">
            <tbody>
              <tr><td>Platform</td><td>{stats.platform} ({stats.arch})</td></tr>
              <tr><td>Uptime</td><td>{formatUptime(stats.uptime || 0)}</td></tr>
              <tr><td>Total RAM</td><td>{formatGB(stats.memory.total)}</td></tr>
              {currentGpu?.vendor && <tr><td>GPU Vendor</td><td>{currentGpu.vendor}</td></tr>}
              {stats.loadAvg && <tr><td>Load Avg</td><td>{stats.loadAvg.map(l => l.toFixed(2)).join(' / ')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
