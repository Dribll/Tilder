import React, { useState, useEffect, useRef, useMemo } from 'react';
import './AudioStudioViewer.css';

function formatTime(seconds) {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRemainingTime(current, total) {
  if (!isFinite(total) || isNaN(total) || total <= 0) return '-0:00';
  const rem = Math.max(0, total - current);
  return `-${formatTime(rem)}`;
}

export default function AudioStudioViewer({ src, name, path: filePath, onRevealInExplorer }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const progressRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [visualizerMode, setVisualizerMode] = useState('bars'); // 'bars' | 'wave'
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [audioStats, setAudioStats] = useState({ sampleRate: 44100, channels: 2 });
  const [copied, setCopied] = useState(false);

  const ext = (name || '').split('.').pop().toUpperCase();
  const formatBadge = useMemo(() => {
    switch (ext) {
      case 'WAV': return { label: 'WAV • Lossless PCM', color: '#38bdf8' };
      case 'MP3': return { label: 'MP3 • MPEG Audio', color: '#a855f7' };
      case 'FLAC': return { label: 'FLAC • Studio Master', color: '#4ade80' };
      case 'OGG': return { label: 'OGG • Vorbis Audio', color: '#fb923c' };
      case 'M4A':
      case 'AAC': return { label: 'AAC • High Quality', color: '#f472b6' };
      default: return { label: `${ext} Audio`, color: '#818cf8' };
    }
  }, [ext]);

  // Audio Context & Analyser Initialization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtxRef.current) {
      try {
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;
        setAudioStats({ sampleRate: ctx.sampleRate, channels: 2 });

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.82;
        analyserRef.current = analyser;

        const source = ctx.createMediaElementSource(audio);
        sourceNodeRef.current = source;
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } catch (err) {
        console.warn('[AudioStudioViewer] AudioContext notice:', err.message);
      }
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [src]);

  // Canvas Visualizer Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const renderVisualizer = () => {
      animFrameRef.current = requestAnimationFrame(renderVisualizer);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const analyser = analyserRef.current;
      if (!analyser) {
        // Idle decorative sine wave
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        for (let x = 0; x < width; x += 4) {
          const y = height / 2 + Math.sin(x * 0.04 + Date.now() * 0.002) * 6;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }

      if (visualizerMode === 'bars') {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const barCount = 64;
        const barWidth = (width / barCount) - 3;
        const step = Math.floor(bufferLength / barCount);

        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i * step] || 0;
          const barHeight = Math.max(4, (val / 255) * (height - 12));
          const x = i * (barWidth + 3) + 2;
          const y = height - barHeight;

          // Vibrant neon gradient: purple to cyan
          const grad = ctx.createLinearGradient(0, height, 0, 0);
          grad.addColorStop(0, playing ? 'rgba(124, 58, 237, 0.85)' : 'rgba(124, 58, 237, 0.35)');
          grad.addColorStop(0.6, playing ? 'rgba(56, 189, 248, 0.9)' : 'rgba(56, 189, 248, 0.4)');
          grad.addColorStop(1, playing ? 'rgba(236, 72, 153, 0.95)' : 'rgba(236, 72, 153, 0.45)');

          ctx.fillStyle = grad;
          if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, barWidth, barHeight);
          }

          // Top glow cap
          if (playing && barHeight > 10) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(x, y - 2, barWidth, 2);
          }
        }
      } else {
        // Waveform Oscillogram
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        ctx.lineWidth = 2.5;
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, '#7c3aed');
        grad.addColorStop(0.5, '#38bdf8');
        grad.addColorStop(1, '#ec4899');
        ctx.strokeStyle = grad;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }
    };

    renderVisualizer();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [visualizerMode, playing]);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const audio = audioRef.current;
      if (!audio) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skip(e.shiftKey ? 15 : 5);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skip(e.shiftKey ? -15 : -5);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        adjustVolume(0.1);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        adjustVolume(-0.1);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        toggleLoop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, volume, muted, loop]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  };

  const skip = (deltaSeconds) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + deltaSeconds));
  };

  const adjustVolume = (delta) => {
    const next = Math.max(0, Math.min(1, volume + delta));
    setVolume(next);
    setMuted(next === 0);
    if (audioRef.current) {
      audioRef.current.volume = next;
      audioRef.current.muted = next === 0;
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    if (audioRef.current) audioRef.current.loop = next;
  };

  const changeSpeed = (newSpeed) => {
    setSpeed(newSpeed);
    if (audioRef.current) audioRef.current.playbackRate = newSpeed;
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    const progressEl = progressRef.current;
    if (!audio || !progressEl) return;

    const rect = progressEl.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pos * (audio.duration || 0);
  };

  const handleProgressMouseMove = (e) => {
    const progressEl = progressRef.current;
    if (!progressEl || !duration) return;
    const rect = progressEl.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pos * duration);
    setHoverX(e.clientX - rect.left);
    if (isScrubbing) {
      handleSeek(e);
    }
  };

  const handleCopyPath = () => {
    if (filePath) {
      navigator.clipboard.writeText(filePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-studio-container">
      <div className="audio-studio-card">
        {/* Background Ambient Glow */}
        <div className={`audio-ambient-glow ${playing ? 'playing' : ''}`} />

        {/* Top Header Card */}
        <div className="audio-studio-header">
          <div className="audio-turntable-badge">
            <i className={`fa-solid fa-compact-disc ${playing ? 'spinning' : ''}`} />
          </div>

          <div className="audio-track-info">
            <div className="audio-track-title" title={name}>
              {name || 'Audio Track'}
            </div>
            <div className="audio-track-subline">
              <span className="audio-format-pill" style={{ color: formatBadge.color, borderColor: `${formatBadge.color}40`, background: `${formatBadge.color}15` }}>
                {formatBadge.label}
              </span>
              <span className="audio-stat-item">
                <i className="fa-solid fa-wave-square" /> {audioStats.sampleRate / 1000} kHz
              </span>
              <span className="audio-stat-item">
                <i className="fa-solid fa-sliders" /> Stereo (2ch)
              </span>
            </div>
          </div>

          <div className="audio-header-actions">
            {filePath && (
              <button
                className="audio-hdr-btn"
                onClick={handleCopyPath}
                title={copied ? 'Copied!' : 'Copy File Path'}
              >
                <i className={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'} />
                <span>{copied ? 'Copied' : 'Path'}</span>
              </button>
            )}
            <div className="audio-vis-toggle">
              <button
                className={`audio-vis-btn ${visualizerMode === 'bars' ? 'active' : ''}`}
                onClick={() => setVisualizerMode('bars')}
                title="Spectrum Bars Visualizer"
              >
                <i className="fa-solid fa-chart-simple" />
              </button>
              <button
                className={`audio-vis-btn ${visualizerMode === 'wave' ? 'active' : ''}`}
                onClick={() => setVisualizerMode('wave')}
                title="Oscilloscope Waveform"
              >
                <i className="fa-solid fa-bezier-curve" />
              </button>
            </div>
          </div>
        </div>

        {/* Visualizer Canvas Surface */}
        <div className="audio-visualizer-surface">
          <canvas ref={canvasRef} width={640} height={96} className="audio-canvas" />
        </div>

        {/* Interactive Scrubbing Bar */}
        <div className="audio-timeline-wrap">
          <div
            ref={progressRef}
            className={`audio-timeline-track ${isScrubbing ? 'scrubbing' : ''}`}
            onClick={handleSeek}
            onMouseDown={(e) => { setIsScrubbing(true); handleSeek(e); }}
            onMouseMove={handleProgressMouseMove}
            onMouseEnter={() => setHoverTime(currentTime)}
            onMouseLeave={() => { setHoverTime(null); setIsScrubbing(false); }}
            onMouseUp={() => setIsScrubbing(false)}
          >
            <div className="audio-timeline-progress" style={{ width: `${progressPercent}%` }} />
            <div className="audio-timeline-thumb" style={{ left: `${progressPercent}%` }} />

            {/* Hover Tooltip */}
            {hoverTime !== null && (
              <div className="audio-hover-tooltip" style={{ left: `${hoverX}px` }}>
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <div className="audio-time-row">
            <span className="audio-time-current">{formatTime(currentTime)}</span>
            <span className="audio-time-remaining">{formatRemainingTime(currentTime, duration)}</span>
          </div>
        </div>

        {/* Main Deck Controls */}
        <div className="audio-controls-deck">
          {/* Left: Loop & Skip Back */}
          <div className="audio-ctrl-group">
            <button
              className={`audio-ctrl-btn ${loop ? 'active' : ''}`}
              onClick={toggleLoop}
              title={loop ? 'Repeat: Enabled' : 'Repeat: Disabled (L)'}
            >
              <i className="fa-solid fa-repeat" />
            </button>
            <button className="audio-ctrl-btn" onClick={() => skip(-10)} title="Rewind 10s (←)">
              <i className="fa-solid fa-rotate-left" />
              <span className="audio-skip-tag">10s</span>
            </button>
          </div>

          {/* Center: Hero Play/Pause Button */}
          <div className="audio-play-center">
            <button
              className={`audio-hero-play-btn ${playing ? 'playing' : ''}`}
              onClick={togglePlay}
              title={playing ? 'Pause (Space)' : 'Play (Space)'}
            >
              <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} style={{ marginLeft: playing ? 0 : 3 }} />
            </button>
          </div>

          {/* Right: Skip Forward & Speed */}
          <div className="audio-ctrl-group">
            <button className="audio-ctrl-btn" onClick={() => skip(10)} title="Fast-Forward 10s (→)">
              <i className="fa-solid fa-rotate-right" />
              <span className="audio-skip-tag">10s</span>
            </button>

            {/* Speed Selector */}
            <div className="audio-speed-wrap">
              {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                <button
                  key={s}
                  className={`audio-speed-chip ${speed === s ? 'active' : ''}`}
                  onClick={() => changeSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Bar: Volume & Keyboard Hints */}
        <div className="audio-bottom-bar">
          <div className="audio-volume-panel">
            <button className="audio-volume-icon-btn" onClick={toggleMute} title="Mute/Unmute (M)">
              <i className={`fa-solid ${muted || volume === 0 ? 'fa-volume-xmark' : volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                setMuted(val === 0);
                if (audioRef.current) {
                  audioRef.current.volume = val;
                  audioRef.current.muted = val === 0;
                }
              }}
              className="audio-volume-slider"
              title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}% (↑/↓)`}
            />
            <span className="audio-volume-text">{Math.round((muted ? 0 : volume) * 100)}%</span>
          </div>

          {/* Keyboard shortcut badges */}
          <div className="audio-shortcuts-hint">
            <span className="audio-kbd-chip"><kbd>Space</kbd> Play</span>
            <span className="audio-kbd-chip"><kbd>←</kbd> <kbd>→</kbd> Seek</span>
            <span className="audio-kbd-chip"><kbd>↑</kbd> <kbd>↓</kbd> Vol</span>
            <span className="audio-kbd-chip"><kbd>M</kbd> Mute</span>
            <span className="audio-kbd-chip"><kbd>L</kbd> Loop</span>
          </div>
        </div>

        {/* Hidden HTML5 Native Audio Source */}
        <audio
          ref={audioRef}
          src={src}
          loop={loop}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.target.duration || 0);
            e.target.volume = volume;
          }}
          preload="auto"
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
}
