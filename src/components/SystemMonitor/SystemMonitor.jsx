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

  useEffect(() => {
    fetchStats();
    const statsInterval = setInterval(fetchStats, 1000);
    return () => clearInterval(statsInterval);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/system/stats');
      if (!res.ok) throw new Error(`Backend error ${res.status}. Please restart Tilder.`);
      const data = await res.json();
      if (!data || !data.cpu) throw new Error('Incomplete data from backend.');
      setErrorMsg(null);
      setStats(prev => {
        const fans = (data.fans && data.fans.length > 0) ? data.fans : (prev?.fans || []);
        return { ...data, fans };
      });
      setCpuHistory(prev => [...prev, data.cpu.usage].slice(-40));
      setMemHistory(prev => [...prev, data.memory?.percentage ?? 0].slice(-40));
      const gpuUsage = data.gpu?.[0]?.utilizationGpu ?? 0;
      setGpuHistory(prev => [...prev, gpuUsage].slice(-40));
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  if (errorMsg && !stats) {
    return (
      <div className="sys-mon-msg sys-mon-error">
        <i className="fa-solid fa-triangle-exclamation"></i>
        <p>{errorMsg}</p>
        <span className="sys-mon-subtext">Restart Tilder completely to reconnect telemetry.</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="sys-mon-msg sys-mon-loading">
        <div className="sys-mon-spinner"></div>
        <p>Gathering system telemetry...</p>
      </div>
    );
  }

  // Helpers
  const getSvgPath = (history) => {
    if (history.length < 2) return '';
    const width = 200, height = 40, maxVal = 100;
    const step = width / 39;
    const padded = [...Array(40 - history.length).fill(0), ...history];
    let path = padded.map((val, i) => {
      const x = i * step;
      const y = height - (Math.max(0, val) / maxVal) * height;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    path += ` L ${width} ${height} L 0 ${height} Z`;
    return path;
  };

  const formatUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${Math.floor(s % 60)}s`].filter(Boolean).join(' ');
  };

  const formatGB = (bytes) => (!bytes || isNaN(bytes)) ? '0 GB' : (bytes / 1073741824).toFixed(1) + ' GB';
  const TempBadge = ({ temp, isNvme }) => {
    if (!temp) return null;
    // NVMe drives normally run 60-90°C; HDDs should stay under 50°C
    const hot = isNvme ? temp > 90 : temp > 55;
    const warm = isNvme ? temp > 70 : temp > 45;
    return <span className={`sys-badge ${hot ? 'hot' : warm ? 'warm' : 'cool'}`} title={isNvme ? 'NVMe/SSD temps — normal range 40–85°C' : 'HDD temp — normal range 25–50°C'}>{temp}°C</span>;
  };

  return (
    <div className="sys-mon-layout">
      {/* Header Profile */}
      <div className="sys-mon-header">
        <div className="sys-mon-title">
          <h2>System Telemetry</h2>
          <span className="sys-mon-uptime">Uptime: {formatUptime(stats.uptime)}</span>
        </div>
        <div className="sys-mon-platform">
          <i className={`fa-brands ${stats.platform === 'darwin' ? 'fa-apple' : stats.platform === 'win32' ? 'fa-windows' : 'fa-linux'}`}></i>
          {stats.platform} • {stats.arch}
        </div>
      </div>

      <div className="sys-mon-grid">
        {/* CPU Card */}
        <div className="sys-mon-card golden-gate-card">
          <div className="sys-mon-card-header">
            <div className="card-title">
              <div className="icon-box cpu-icon"><i className="fa-solid fa-microchip"></i></div>
              <h3>CPU</h3>
            </div>
            <div className="card-value">{stats.cpu.usage}%</div>
          </div>
          <div className="sys-mon-graph">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none">
              <path d={getSvgPath(cpuHistory)} fill="url(#cpuGrad)" />
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(255, 123, 84, 0.4)" />
                  <stop offset="100%" stopColor="rgba(255, 123, 84, 0)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="sys-mon-details">
            <p className="detail-item"><span>Model</span> <span>{stats.cpu.model.replace('(TM)', '').replace('(R)', '')}</span></p>
            <p className="detail-item"><span>Cores</span> <span>{stats.cpu.physicalCores} P / {stats.cpu.cores} L</span></p>
            <p className="detail-item"><span>Clock</span> <span>{stats.cpu.speed} GHz (now) / {stats.cpu.speedMax} GHz (base)</span></p>
            <p className="detail-item"><span>Temp</span> <TempBadge temp={stats.cpu.temperature} /></p>
          </div>
        </div>

        {/* Memory Card */}
        <div className="sys-mon-card golden-gate-card">
          <div className="sys-mon-card-header">
            <div className="card-title">
              <div className="icon-box mem-icon"><i className="fa-solid fa-memory"></i></div>
              <h3>Memory</h3>
            </div>
            <div className="card-value">{stats.memory.percentage}%</div>
          </div>
          <div className="sys-mon-graph">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none">
              <path d={getSvgPath(memHistory)} fill="url(#memGrad)" />
              <defs>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(167, 139, 250, 0.4)" />
                  <stop offset="100%" stopColor="rgba(167, 139, 250, 0)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="sys-mon-details">
            <p className="detail-item"><span>Used</span> <span>{formatGB(stats.memory.used)}</span></p>
            <p className="detail-item"><span>Total</span> <span>{formatGB(stats.memory.total)}</span></p>
            <p className="detail-item"><span>Active</span> <span>{formatGB(stats.memory.active)}</span></p>
            <p className="detail-item"><span>Available</span> <span>{formatGB(stats.memory.available)}</span></p>
          </div>
        </div>

        {/* GPU Cards */}
        {stats.gpu && stats.gpu.map((g, idx) => (
          <div key={`gpu-${idx}`} className="sys-mon-card golden-gate-card">
            <div className="sys-mon-card-header">
              <div className="card-title">
                <div className="icon-box gpu-icon"><i className="fa-solid fa-display"></i></div>
                <h3>GPU {idx > 0 ? idx + 1 : ''}</h3>
              </div>
              <div className="card-value">{g.utilizationGpu}%</div>
            </div>
            {idx === 0 && (
              <div className="sys-mon-graph">
                <svg viewBox="0 0 200 40" preserveAspectRatio="none">
                  <path d={getSvgPath(gpuHistory)} fill="url(#gpuGrad)" />
                  <defs>
                    <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(96, 165, 250, 0.4)" />
                      <stop offset="100%" stopColor="rgba(96, 165, 250, 0)" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            )}
            <div className="sys-mon-details">
              <p className="detail-item"><span>Model</span> <span>{g.model || g.vendor}</span></p>
              <p className="detail-item"><span>VRAM</span> <span>{g.vram ? `${g.vram} MB` : 'Dynamic'}</span></p>
              <p className="detail-item"><span>Temp</span> <TempBadge temp={g.temperature} /></p>
            </div>
          </div>
        ))}
      </div>

      <div className="sys-mon-grid sys-mon-grid-small">
        {/* Cooling / Fans Card */}
        {stats.fans && stats.fans.length > 0 && (
          <div className="sys-mon-card glass-panel">
            <h4><i className="fa-solid fa-fan icon-pulse"></i> Cooling System</h4>
            <div className="fan-list">
              {stats.fans.map((f, i) => {
                const rpmVal = typeof f.rpm === 'number' ? f.rpm : parseInt(f.rpm, 10) || 0;
                const pct = f.isPercent ? `${rpmVal}%` : `${Math.min(100, Math.round((rpmVal / 3500) * 100))}%`;
                return (
                  <div key={i} className="fan-item">
                    <span>{f.name || `Fan ${i+1}`}</span>
                    <span className="fan-speed">
                      {f.isPercent ? `${rpmVal}%` : `${rpmVal} RPM (${pct})`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Storage Card */}
        {stats.storage && stats.storage.length > 0 && (
          <div className="sys-mon-card glass-panel">
            <h4><i className="fa-solid fa-hard-drive"></i> Storage Volumes</h4>
            <div className="storage-list">
              {stats.storage.map((drive, i) => {
                const isNvme = drive.mediaType ? drive.mediaType.includes('NVMe') : Boolean(drive.name && /nvme|m\.2/i.test(drive.name));
                const mediaLabel = drive.mediaType ? `· ${drive.mediaType}` : (drive.tempCelsius != null ? (isNvme ? '· NVMe SSD' : '· HDD') : '');
                return (
                <div key={i} className="storage-item">
                  <div className="storage-header">
                    <span>{drive.letter} {drive.label} <span style={{ fontSize: '0.7em', opacity: 0.5 }}>{mediaLabel}</span></span>
                    <span className="storage-temp"><TempBadge temp={drive.tempCelsius} isNvme={isNvme} /></span>
                  </div>
                  <div className="storage-bar">
                    <div className="storage-fill" style={{ width: `${(drive.usedGb / drive.totalGb) * 100}%` }}></div>
                  </div>
                  <div className="storage-stats">
                    {drive.freeGb.toFixed(1)} GB free of {drive.totalGb.toFixed(1)} GB
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Battery Card (if present) */}
        {stats.battery && (
          <div className="sys-mon-card glass-panel">
            <h4><i className="fa-solid fa-battery-half"></i> Power</h4>
            <div className="battery-info">
              <div className="battery-level">
                <div className="batt-fill" style={{ width: `${stats.battery.chargePercent}%` }}></div>
                <span>{stats.battery.chargePercent}%</span>
              </div>
              <p className="detail-item"><span>Status</span> <span>{stats.battery.status}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
