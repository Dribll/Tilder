import React, { useState, useEffect, useRef } from 'react';
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

  const fetchStats = () => {
    apiFetch('/api/system/stats')
      .then(async res => {
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}: Ensure backend is updated & restarted.`);
        }
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error('Invalid JSON from backend. Please restart your Tilder desktop backend.');
        }
      })
      .then(async data => {
        if (!data || !data.cpu) {
           throw new Error('Incomplete data received. Is the new backend running?');
        }
        
        try {
          const { isDesktopRuntime } = await import('../../core/runtime.js');
          if (isDesktopRuntime()) {
            const { desktopReadFile } = await import('../../core/desktopFileApi.js');
            const monitorData = await desktopReadFile('C:\\ProgramData\\Tilder\\monitor.json');
            if (monitorData) {
              const parsed = JSON.parse(monitorData);
              if (typeof parsed.cpuTemp === 'number') data.cpu.temperature = parsed.cpuTemp;
              
              if (!data.gpu || data.gpu.length === 0) {
                 if (typeof parsed.gpuUsage === 'number' || typeof parsed.gpuTemp === 'number') {
                    data.gpu = [{
                      utilizationGpu: parsed.gpuUsage || 0,
                      temperature: parsed.gpuTemp,
                      model: 'Detected GPU',
                    }];
                 }
              } else {
                 if (typeof parsed.gpuTemp === 'number') data.gpu[0].temperature = parsed.gpuTemp;
                 if (typeof parsed.gpuUsage === 'number') data.gpu[0].utilizationGpu = parsed.gpuUsage;
              }
            }
          }
        } catch (e) {
          console.warn('Failed to merge local monitor stats', e);
        }

        setErrorMsg(null);
        setStats(data);
        setCpuHistory(prev => [...prev, data.cpu.usage].slice(-40));
        setMemHistory(prev => [...prev, data.memory.percentage].slice(-40));
        const gpuUsage = data.gpu && data.gpu[0] ? data.gpu[0].utilizationGpu || 0 : 0;
        setGpuHistory(prev => [...prev, gpuUsage].slice(-40));
      })
      .catch(err => {
        console.error('Failed to fetch system stats:', err);
        setErrorMsg(err.message);
      });
  };

  const fetchPorts = () => {
    apiFetch('/api/ports')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setActivePorts(data);
        }
      })
      .catch(err => console.error('Failed to fetch active ports:', err));
  };

  if (errorMsg && !stats) {
    return (
      <div className="system-monitor-loading">
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '2rem', color: '#ff5f5f' }}></i>
        <p style={{ color: '#ff5f5f', textAlign: 'center', maxWidth: '80%' }}>{errorMsg}</p>
        <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Tip: You likely need to completely restart the Tilder desktop application (close it and run it again) to load the new backend changes.</p>
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

  // Helper to build SVG path from history
  const getSvgPath = (history, isFilled = false) => {
    if (history.length < 2) return '';
    const width = 300;
    const height = 80;
    const maxVal = 100;
    const step = width / (40 - 1);
    
    // Fill array up to 40 elements with 0 at the start if it has less data
    const padded = [...Array(40 - history.length).fill(0), ...history];
    
    let path = padded.map((val, index) => {
      const x = index * step;
      const y = height - (Math.max(0, val) / maxVal) * height;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    if (isFilled) {
      path += ` L ${width} ${height} L 0 ${height} Z`;
    }
    return path;
  };

  const formatUptime = (seconds) => {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor((seconds % (3600*24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const formatBytes = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0.0 GB';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const currentGpu = stats.gpu && stats.gpu.length > 0 ? stats.gpu[0] : null;

  return (
    <div className="system-monitor-container">
      <div className="system-monitor-grid">
        {/* CPU Panel */}
        <div className="monitor-card cpu-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-microchip"></i> CPU Usage</h3>
            <span className="live-badge">LIVE</span>
          </div>
          <div className="monitor-metric-row">
            <div className="large-metric">{stats.cpu.usage}%</div>
            <div className="metric-details">
              <div className="cpu-model">{stats.cpu.model}</div>
              <div className="cores-badge">{stats.cpu.cores} Cores @ {(stats.cpu.speedMax || stats.cpu.speed || 0).toFixed(2)}GHz</div>
              {stats.cpu.temperature && <div className="cores-badge" style={{ marginLeft: '6px', background: 'rgba(255, 90, 90, 0.15)', color: '#ff8a8a' }}><i className="fa-solid fa-temperature-half"></i> {stats.cpu.temperature}°C</div>}
            </div>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill cpu-fill" style={{ width: `${stats.cpu.usage}%` }}></div>
          </div>
          <div className="chart-wrapper">
            <div className="tm-graph-grid"></div>
            <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="monitor-svg-chart">
              <defs>
                <linearGradient id="fillCPU" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(138, 124, 255, 0.4)" />
                  <stop offset="100%" stopColor="rgba(138, 124, 255, 0)" />
                </linearGradient>
              </defs>
              <path d={getSvgPath(cpuHistory, true)} fill="url(#fillCPU)" />
              <path d={getSvgPath(cpuHistory)} fill="none" stroke="#a89eff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* RAM Panel */}
        <div className="monitor-card ram-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-memory"></i> Memory</h3>
            <span>{stats.memory.percentage}% Used</span>
          </div>
          <div className="monitor-metric-row">
            <div className="large-metric">{stats.memory.percentage}%</div>
            <div className="metric-details">
              <div>Used: {formatBytes(stats.memory.active)}</div>
              <div>Free: {formatBytes(stats.memory.available || stats.memory.free)}</div>
              <div>Total: {formatBytes(stats.memory.total)}</div>
            </div>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill ram-fill" style={{ width: `${stats.memory.percentage}%` }}></div>
          </div>
          <div className="chart-wrapper">
            <div className="tm-graph-grid"></div>
            <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="monitor-svg-chart">
              <defs>
                <linearGradient id="fillMem" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(88, 215, 199, 0.4)" />
                  <stop offset="100%" stopColor="rgba(88, 215, 199, 0)" />
                </linearGradient>
              </defs>
              <path d={getSvgPath(memHistory, true)} fill="url(#fillMem)" />
              <path d={getSvgPath(memHistory)} fill="none" stroke="#58d7c7" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        
        {/* GPU Panel */}
        {currentGpu && (
          <div className="monitor-card gpu-card">
            <div className="monitor-card-header">
              <h3><i className="fa-solid fa-vr-cardboard"></i> GPU Usage</h3>
              <span>{currentGpu.utilizationGpu || 0}% Used</span>
            </div>
            <div className="monitor-metric-row">
              <div className="large-metric">{currentGpu.utilizationGpu || 0}%</div>
              <div className="metric-details">
                <div className="cpu-model">{currentGpu.model}</div>
                <div>VRAM: {formatBytes((currentGpu.vram || 0) * 1024 * 1024)}</div>
                {currentGpu.temperature && <div className="cores-badge" style={{ background: 'rgba(255, 90, 90, 0.15)', color: '#ff8a8a', marginTop: '4px' }}><i className="fa-solid fa-temperature-half"></i> {currentGpu.temperature}°C</div>}
              </div>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill gpu-fill" style={{ width: `${currentGpu.utilizationGpu || 0}%` }}></div>
            </div>
            <div className="chart-wrapper">
              <div className="tm-graph-grid"></div>
              <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="monitor-svg-chart">
                <defs>
                  <linearGradient id="fillGPU" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(36, 234, 137, 0.4)" />
                    <stop offset="100%" stopColor="rgba(36, 234, 137, 0)" />
                  </linearGradient>
                </defs>
                <path d={getSvgPath(gpuHistory, true)} fill="url(#fillGPU)" />
                <path d={getSvgPath(gpuHistory)} fill="none" stroke="#24ea89" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="system-monitor-subgrid">
        {/* Host Details */}
        <div className="monitor-card system-info-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-circle-info"></i> System Details</h3>
          </div>
          <table className="monitor-info-table">
            <tbody>
              <tr>
                <td>OS Platform</td>
                <td>{stats.platform} ({stats.arch})</td>
              </tr>
              <tr>
                <td>System Uptime</td>
                <td>{formatUptime(stats.uptime)}</td>
              </tr>
              <tr>
                <td>Load Average</td>
                <td>{stats.loadAvg.map(n => n.toFixed(2)).join(', ')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Port Tunnels */}
        <div className="monitor-card active-tunnels-card">
          <div className="monitor-card-header">
            <h3><i className="fa-solid fa-arrow-right-arrow-left"></i> Active Tunnels</h3>
            <span className="count-badge">{activePorts.length}</span>
          </div>
          <div className="monitor-tunnels-list">
            {activePorts.length === 0 ? (
              <div className="no-tunnels-msg">No active forwarded port tunnels.</div>
            ) : (
              activePorts.map(tunnel => (
                <div key={tunnel.port} className="monitor-tunnel-item">
                  <div className="tunnel-header">
                    <span className="tunnel-port">Port {tunnel.port}</span>
                    <span className={`tunnel-status status-${tunnel.status}`}>{tunnel.status}</span>
                  </div>
                  <div className="tunnel-desc">{tunnel.description}</div>
                  {tunnel.url && (
                    <a href={tunnel.url} target="_blank" rel="noreferrer" className="tunnel-link">
                      {tunnel.url}
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
