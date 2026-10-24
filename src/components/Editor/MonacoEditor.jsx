import React, { useEffect, useRef, useState } from 'react';
import { Editor } from '@monaco-editor/react';
import { emmetCSS, emmetHTML, emmetJSX } from 'emmet-monaco-es';
import { getExtensionCompletions } from '../../core/extensionsRuntime.js';
import { fetchScmBlame } from '../../core/scmApi.js';
import workspace from '../../core/workspace.js';
import '../../App.css';
import { disposeEditorResources } from '../../core/editorUtils.js';
import { registerMonacoThemes } from '../../core/themeRegistry.js';

// ── Shared helpers ────────────────────────────────────────────────────────────
function _fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
const _mpBtn = {
  width: 36, height: 36, borderRadius: 8, border: 'none',
  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', fontSize: 14, flexShrink: 0,
  transition: 'background 0.1s, transform 0.1s cubic-bezier(.175,.885,.32,1.275)',
};

// ── Inline Audio Player ───────────────────────────────────────────────────────
function InlineAudioPlayer({ src, name }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const progressRef = useRef(null);
  const rafRef = useRef(null);
  const analyserRef = useRef(null);
  const actxRef = useRef(null);
  const sourceRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeed, setShowSpeed] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!actxRef.current) actxRef.current = new AC();
      if (!analyserRef.current) {
        analyserRef.current = actxRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(actxRef.current.destination);
      }
      if (!sourceRef.current) {
        sourceRef.current = actxRef.current.createMediaElementSource(audio);
        sourceRef.current.connect(analyserRef.current);
      }
    } catch (_) {}
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!analyserRef.current) return;
      const buf = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(buf);
      const c = canvas.getContext('2d');
      c.clearRect(0, 0, canvas.width, canvas.height);
      const bw = (canvas.width / buf.length) * 2.2;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const bh = (buf[i] / 255) * canvas.height;
        c.fillStyle = `hsla(${240 + (i / buf.length) * 60},70%,65%,${playing ? 0.85 : 0.25})`;
        c.beginPath();
        if (c.roundRect) c.roundRect(x, canvas.height - bh, bw - 1, bh, 2);
        else c.rect(x, canvas.height - bh, bw - 1, bh);
        c.fill();
        x += bw;
      }
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [src, playing]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (actxRef.current?.state === 'suspended') actxRef.current.resume();
    playing ? a.pause() : a.play();
  };

  const seek = (e) => {
    const a = audioRef.current;
    const p = progressRef.current;
    if (!a || !p) return;
    const r = p.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (a.duration || 0);
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const ext = name.split('.').pop().toUpperCase();

  return (
    <div style={{ width: '100%', maxWidth: 600, margin: '0 auto', background: 'rgba(10,8,22,0.88)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, backdropFilter: 'blur(24px)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#6d28d9,#312e81)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px rgba(109,40,217,0.5)' }}>
          <span><i className="fa-solid fa-music" style={{ fontSize: 22, color: '#fff' }}></i></span>
        </div>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{ext} · {_fmtTime(duration)}</div>
        </div>
      </div>
      {/* Waveform */}
      <div style={{ padding: '16px 24px 8px' }}>
        <canvas ref={canvasRef} width={552} height={60} style={{ width: '100%', height: 60, borderRadius: 10, background: 'rgba(255,255,255,0.03)', display: 'block' }} />
      </div>
      {/* Seek */}
      <div style={{ padding: '4px 24px' }}>
        <div ref={progressRef} onClick={seek}
          onMouseMove={(e) => dragging && seek(e)}
          onMouseDown={(e) => { setDragging(true); seek(e); }}
          onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}
          style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 99, cursor: 'pointer', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: 99 }} />
          <div style={{ position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', left: `${pct}%`, width: 14, height: 14, borderRadius: '50%', background: '#a855f7', border: '2px solid #fff', boxShadow: '0 0 8px rgba(168,85,247,0.8)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          <span>{_fmtTime(current)}</span><span>{_fmtTime(duration)}</span>
        </div>
      </div>
      {/* Controls */}
      <div style={{ padding: '8px 24px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => { setLoop(l => { const nl = !l; if (audioRef.current) audioRef.current.loop = nl; return nl; })} } title="Loop" style={{ ..._mpBtn, color: loop ? '#a855f7' : 'rgba(255,255,255,0.5)' }}><span><i className="fa-solid fa-repeat"></i></span></button>
        <button onClick={() => { if (audioRef.current) audioRef.current.currentTime -= 10; }} title="-10s" style={_mpBtn}><span><i className="fa-solid fa-backward-step"></i></span></button>
        <button onClick={togglePlay} style={{ ..._mpBtn, width: 52, height: 52, borderRadius: '50%', fontSize: 18, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', boxShadow: '0 4px 20px rgba(139,92,246,0.5)', color: '#fff', flexShrink: 0 }}>
          <span><i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} style={{ marginLeft: playing ? 0 : 2 }}></i></span>
        </button>
        <button onClick={() => { if (audioRef.current) audioRef.current.currentTime += 10; }} title="+10s" style={_mpBtn}><span><i className="fa-solid fa-forward-step"></i></span></button>
        <button onClick={() => { const a = audioRef.current; if (!a) return; a.muted = !muted; setMuted(!muted); }} style={_mpBtn}>
          <span><i className={`fa-solid ${muted || volume === 0 ? 'fa-volume-xmark' : volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`}></i></span>
        </button>
        <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
          onChange={(e) => { const v = parseFloat(e.target.value); setVolume(v); setMuted(v === 0); if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = v === 0; } }}
          style={{ flex: 1, accentColor: '#a855f7', cursor: 'pointer' }} />
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowSpeed(s => !s)} style={{ ..._mpBtn, fontSize: 10, fontWeight: 700, width: 'auto', padding: '0 10px', letterSpacing: '0.5px' }}>{speed}x</button>
          {showSpeed && (
            <div style={{ position: 'absolute', bottom: '110%', right: 0, background: 'rgba(16,12,32,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 999, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(s => (
                <button key={s} onClick={() => { setSpeed(s); setShowSpeed(false); if (audioRef.current) audioRef.current.playbackRate = s; }}
                  style={{ ..._mpBtn, width: 64, fontSize: 12, height: 28, background: speed === s ? 'rgba(139,92,246,0.3)' : 'transparent', color: speed === s ? '#a855f7' : 'rgba(255,255,255,0.7)' }}>{s}x</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <audio ref={audioRef} src={src} loop={loop}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onVolumeChange={(e) => { setVolume(e.target.volume); setMuted(e.target.muted); }}
        style={{ display: 'none' }} preload="metadata" />
    </div>
  );
}

// ── Inline Video Player ───────────────────────────────────────────────────────
function InlineVideoPlayer({ src, name }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);
  const hideRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showCtrl, setShowCtrl] = useState(true);
  const [showSpeed, setShowSpeed] = useState(false);
  const [dragging, setDragging] = useState(false);

  const resetHide = () => {
    setShowCtrl(true);
    clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => setShowCtrl(false), 2500);
  };
  useEffect(() => () => clearTimeout(hideRef.current), []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    playing ? v.pause() : v.play();
    resetHide();
  };

  const seek = (e) => {
    const v = videoRef.current;
    const p = progressRef.current;
    if (!v || !p) return;
    const r = p.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (v.duration || 0);
  };

  const toggleFS = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    else document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
  };

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div ref={containerRef} onMouseMove={resetHide}
      style={{ position: 'relative', width: '100%', maxWidth: 900, margin: '0 auto', borderRadius: fullscreen ? 0 : 16, overflow: 'hidden', background: '#000', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <video ref={videoRef} src={src} loop={loop} onClick={togglePlay}
        onPlay={() => { setPlaying(true); resetHide(); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.target.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.target.duration)}
        onVolumeChange={(e) => { setVolume(e.target.volume); setMuted(e.target.muted); }}
        style={{ width: '100%', display: 'block', maxHeight: fullscreen ? '100vh' : '60vh', objectFit: 'contain', cursor: 'pointer' }}
        preload="metadata" />

      {!playing && (
        <div onClick={togglePlay} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', cursor: 'pointer' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.3)' }}>
            <span><i className="fa-solid fa-play" style={{ fontSize: 24, color: '#fff', marginLeft: 4 }}></i></span>
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent,rgba(0,0,0,0.88))', padding: '28px 16px 12px', transition: 'opacity 0.25s', opacity: showCtrl ? 1 : 0, pointerEvents: showCtrl ? 'auto' : 'none' }}>
        {/* Seek bar */}
        <div ref={progressRef} onClick={seek}
          onMouseMove={(e) => dragging && seek(e)}
          onMouseDown={(e) => { setDragging(true); seek(e); }}
          onMouseUp={() => setDragging(false)} onMouseLeave={() => setDragging(false)}
          style={{ height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 99, cursor: 'pointer', position: 'relative', marginBottom: 12 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius: 99 }} />
          <div style={{ position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', left: `${pct}%`, width: 12, height: 12, borderRadius: '50%', background: '#a855f7', border: '2px solid #fff' }} />
        </div>
        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={togglePlay} style={{ ..._mpBtn, color: '#fff' }}><span><i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`}></i></span></button>
          <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }} style={{ ..._mpBtn, color: '#fff' }} title="-10s"><span><i className="fa-solid fa-backward-step"></i></span></button>
          <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }} style={{ ..._mpBtn, color: '#fff' }} title="+10s"><span><i className="fa-solid fa-forward-step"></i></span></button>
          <button onClick={() => { const v = videoRef.current; if (!v) return; v.muted = !muted; setMuted(!muted); }} style={{ ..._mpBtn, color: '#fff' }}>
            <span><i className={`fa-solid ${muted || volume === 0 ? 'fa-volume-xmark' : volume < 0.5 ? 'fa-volume-low' : 'fa-volume-high'}`}></i></span>
          </button>
          <input type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
            onChange={(e) => { const vv = parseFloat(e.target.value); setVolume(vv); setMuted(vv === 0); if (videoRef.current) { videoRef.current.volume = vv; videoRef.current.muted = vv === 0; } }}
            style={{ width: 80, accentColor: '#a855f7', cursor: 'pointer' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginLeft: 4, whiteSpace: 'nowrap' }}>{_fmtTime(current)} / {_fmtTime(duration)}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setLoop(l => { const nl = !l; if (videoRef.current) videoRef.current.loop = nl; return nl; })} } style={{ ..._mpBtn, color: loop ? '#a855f7' : 'rgba(255,255,255,0.6)' }} title="Loop"><span><i className="fa-solid fa-repeat"></i></span></button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowSpeed(s => !s)} style={{ ..._mpBtn, fontSize: 10, fontWeight: 700, width: 'auto', padding: '0 8px', color: '#fff' }}>{speed}x</button>
            {showSpeed && (
              <div style={{ position: 'absolute', bottom: '110%', right: 0, background: 'rgba(16,12,32,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 999, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(s => (
                  <button key={s} onClick={() => { setSpeed(s); setShowSpeed(false); if (videoRef.current) videoRef.current.playbackRate = s; }}
                    style={{ ..._mpBtn, width: 64, fontSize: 12, height: 28, background: speed === s ? 'rgba(139,92,246,0.3)' : 'transparent', color: speed === s ? '#a855f7' : 'rgba(255,255,255,0.7)' }}>{s}x</button>
                ))}
              </div>
            )}
          </div>
          <button onClick={toggleFS} style={{ ..._mpBtn, color: '#fff' }} title="Fullscreen"><span><i className={`fa-solid ${fullscreen ? 'fa-compress' : 'fa-expand'}`}></i></span></button>
        </div>
      </div>
    </div>
  );
}


const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

let linkedHtmlTagProviderRegistered = false;
let emmetRegistered = false;
let embeddedCssProviderRegistered = false;
let embeddedJavaScriptProviderRegistered = false;
let embeddedCssPropertiesCache = null;
const lspCompletionRegistrations = new Map();
const lspFeatureRegistrations = new Map();
const extensionCompletionRegistrations = new Map();
const lspContextResolvers = new Map();
const LSP_COMPLETION_TRIGGER_CHARACTERS = [
  '.',
  ':',
  '>',
  '"',
  "'",
  '/',
  '#',
  '(',
  '<',
  ' ',
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split(''),
];

function toMonacoCompletionKind(monaco, lspKind) {
  const completionKind = monaco.languages.CompletionItemKind;
  const kindMap = {
    1: completionKind.Text,
    2: completionKind.Method,
    3: completionKind.Function,
    4: completionKind.Constructor,
    5: completionKind.Field,
    6: completionKind.Variable,
    7: completionKind.Class,
    8: completionKind.Interface,
    9: completionKind.Module,
    10: completionKind.Property,
    11: completionKind.Unit,
    12: completionKind.Value,
    13: completionKind.Enum,
    14: completionKind.Keyword,
    15: completionKind.Snippet,
    16: completionKind.Color,
    17: completionKind.File,
    18: completionKind.Reference,
    19: completionKind.Folder,
    20: completionKind.EnumMember,
    21: completionKind.Constant,
    22: completionKind.Struct,
    23: completionKind.Event,
    24: completionKind.Operator,
    25: completionKind.TypeParameter,
  };

  return kindMap[lspKind] || completionKind.Text;
}

function toMonacoCompletionItems(monaco, response, range) {
  const rawItems = Array.isArray(response) ? response : Array.isArray(response?.items) ? response.items : [];

  return rawItems
    .map((item, index) => {
      const label =
        typeof item.label === 'string' ? item.label : item.label?.label || item.insertText || '';
      
      let textEditRange = null;
      if (item.textEdit) {
        const editRange = item.textEdit.range || item.textEdit.insert || item.textEdit.replace;
        if (editRange) {
          textEditRange = {
            startLineNumber: Number(editRange.start?.line || 0) + 1,
            startColumn: Number(editRange.start?.character || 0) + 1,
            endLineNumber: Number(editRange.end?.line || 0) + 1,
            endColumn: Number(editRange.end?.character || 0) + 1,
          };
        }
      }

      const finalRange = textEditRange || range;
      const monacoRange = new monaco.Range(
        finalRange.startLineNumber,
        finalRange.startColumn,
        finalRange.endLineNumber,
        finalRange.endColumn
      );

      return {
        label,
        kind: toMonacoCompletionKind(monaco, item.kind),
        insertText: item.textEdit?.newText || item.insertText || label,
        insertTextRules:
          item.insertTextFormat === 2
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : monaco.languages.CompletionItemInsertTextRule.None,
        detail: item.detail || '',
        documentation:
          typeof item.documentation === 'string'
            ? item.documentation
            : item.documentation?.value || item.documentation?.kind || '',
        sortText: item.sortText || `z-${String(index).padStart(4, '0')}`,
        filterText: item.filterText || label,
        range: monacoRange,
        preselect: Boolean(item.preselect),
        commitCharacters: Array.isArray(item.commitCharacters) ? item.commitCharacters : undefined,
      };
    })
    .filter((item) => item.label);
}

function toFallbackCompletionKind(monaco, kind) {
  switch (kind) {
    case 'function':
      return monaco.languages.CompletionItemKind.Function;
    case 'keyword':
      return monaco.languages.CompletionItemKind.Keyword;
    case 'snippet':
    default:
      return monaco.languages.CompletionItemKind.Snippet;
  }
}

function buildExtensionCompletionItems(monaco, languageId, range) {
  const monacoRange = new monaco.Range(
    range.startLineNumber,
    range.startColumn,
    range.endLineNumber,
    range.endColumn
  );
  return getReactAwareExtensionCompletions(languageId).map((item, index) => ({
    label: item.label,
    kind: toFallbackCompletionKind(monaco, item.kind),
    insertText: item.insertText,
    insertTextRules:
      item.kind === 'snippet'
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : monaco.languages.CompletionItemInsertTextRule.None,
    detail: item.detail || '',
    documentation: item.documentation || '',
    filterText: item.filterText || item.label,
    sortText: item.sortText || `zy-ext-${String(index).padStart(4, '0')}`,
    range: monacoRange,
  }));
}

function mergeSuggestions(...groups) {
  const seen = new Set();
  const merged = [];

  for (const group of groups) {
    for (const item of group || []) {
      const label = String(item?.label?.label || item?.label || '').trim();
      if (!label) {
        continue;
      }
      const key = `${label.toLowerCase()}::${String(item.insertText || label)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function buildEditorOptions(settings, tab, wordBasedSuggestions) {
  const minimapSettings = settings?.minimap || {};
  const scrollbarSettings = settings?.scrollbar || {};
  const hoverSettings = settings?.hover || {};
  const findSettings = settings?.find || {};
  const lightbulbSettings = settings?.lightbulb || {};
  const parameterHintsSettings = settings?.parameterHints || {};
  const stickyScrollSettings = settings?.stickyScroll || {};
  const bracketPairColorizationSettings = settings?.bracketPairColorization || {};
  const inlineSuggestSettings = settings?.inlineSuggest || {};
  const guidesSettings = settings?.guides || {};

  return {
    ...settings,
    dragAndDrop: true,
    mouseWheelZoom: settings?.mouseWheelZoom !== false,
    multiCursorModifier: 'alt',
    formatOnPaste: true,
    formatOnType: true,
    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'mouseover',
    tabSize: tab?.tabSize ?? settings?.tabSize,
    insertSpaces: tab?.insertSpaces ?? settings?.insertSpaces,
    fontFamily: settings?.fontFamily,
    fontSize: settings?.fontSize ?? 14,
    fontWeight: settings?.fontWeight ?? 'normal',
    lineHeight: settings?.lineHeight > 0 ? settings.lineHeight : undefined,
    letterSpacing: settings?.letterSpacing ?? 0,
    fontLigatures: settings?.fontLigatures ? true : false,
    automaticLayout: settings?.automaticLayout !== false,
    glyphMargin: settings?.glyphMargin !== false,
    autoIndent: settings?.autoIndent ?? 'advanced',
    suggestOnTriggerCharacters: settings?.suggestOnTriggerCharacters !== false,
    quickSuggestionsDelay: settings?.quickSuggestionsDelay ?? 10,
    quickSuggestions:
      typeof settings?.quickSuggestions === 'boolean'
        ? settings.quickSuggestions
          ? { other: true, comments: false, strings: true }
          : false
        : settings?.quickSuggestions ?? { other: true, comments: false, strings: true },
    suggest: {
      selectionMode: 'always',
      snippetsPreventQuickSuggestions: false,
      showWords: true,
      showSnippets: settings?.snippetSuggestions !== 'none',
      localityBonus: true,
      showIcons: true,
      showStatusBar: true,
    },
    suggestSelection: settings?.suggestSelection ?? 'recentlyUsed',
    snippetSuggestions: settings?.snippetSuggestions ?? 'inline',
    acceptSuggestionOnEnter: settings?.acceptSuggestionOnEnter ?? 'on',
    acceptSuggestionOnCommitCharacter: true,
    tabCompletion: settings?.tabCompletion ?? 'off',
    parameterHints: {
      enabled: parameterHintsSettings.enabled !== false,
    },
    lightbulb: {
      enabled: lightbulbSettings.enabled !== false,
    },
    stickyScroll: {
      enabled: stickyScrollSettings.enabled !== false,
      maxLineCount: stickyScrollSettings.maxLineCount ?? 5,
    },
    hover: {
      enabled: hoverSettings.enabled !== false,
      delay: hoverSettings.delay ?? 300,
    },
    find: {
      cursorMoveOnType: findSettings.cursorMoveOnType !== false,
      autoFindInSelection: findSettings.autoFindInSelection ?? 'never',
      seedSearchStringFromSelection: findSettings.seedSearchStringFromSelection !== false,
      addExtraSpaceOnTop: findSettings.addExtraSpaceOnTop ?? false,
    },
    linkedEditing: settings?.links !== false,
    autoClosingBrackets: settings?.autoClosingBrackets ?? 'always',
    autoClosingQuotes: settings?.autoClosingQuotes ?? 'always',
    autoClosingDelete: settings?.autoClosingDelete ?? 'auto',
    autoClosingComments: 'always',
    autoSurround: 'languageDefined',
    wordBasedSuggestions,
    minimap: {
      enabled: minimapSettings.enabled !== false,
      side: minimapSettings.side ?? 'right',
      size: minimapSettings.size ?? 'proportional',
      showSlider: minimapSettings.showSlider ?? 'always',
      renderCharacters: minimapSettings.renderCharacters === true,
      autohide: minimapSettings.autohide ?? false,
      maxColumn: minimapSettings.maxColumn ?? 120,
    },
    scrollbar: {
      vertical: scrollbarSettings.vertical ?? 'auto',
      horizontal: scrollbarSettings.horizontal ?? 'auto',
      verticalScrollbarSize: scrollbarSettings.verticalScrollbarSize ?? 12,
      horizontalScrollbarSize: scrollbarSettings.horizontalScrollbarSize ?? 12,
      useShadows: scrollbarSettings.useShadows !== false,
      alwaysConsumeMouseWheel: scrollbarSettings.alwaysConsumeMouseWheel !== false,
    },
    bracketPairColorization: {
      enabled: bracketPairColorizationSettings.enabled !== false,
      independentColorPoolPerBracketType: true,
    },
    inlineSuggest: {
      enabled: inlineSuggestSettings.enabled !== false,
    },
    guides: {
      indentation: guidesSettings.indentation !== false,
      bracketPairs: guidesSettings.bracketPairs !== false,
    },
    inlayHints: {
      enabled: settings?.inlayHints?.enabled !== false ? 'on' : 'off',
      fontSize: settings?.inlayHints?.fontSize ?? 11,
      fontFamily: settings?.inlayHints?.fontFamily ?? '',
      padding: settings?.inlayHints?.padding !== false,
    },
    codeLens: settings?.codeLens !== false,
    'semanticHighlighting.enabled': settings?.semanticHighlighting?.enabled !== false,
  };
}

function getReactAwareExtensionCompletions(languageId) {
  const normalizedLanguageId = String(languageId || '').trim().toLowerCase();
  const languageIds = [normalizedLanguageId];

  if (normalizedLanguageId === 'javascript' && !languageIds.includes('javascriptreact')) {
    languageIds.push('javascriptreact');
  }

  if (normalizedLanguageId === 'typescript' && !languageIds.includes('typescriptreact')) {
    languageIds.push('typescriptreact');
  }

  const seen = new Set();
  return languageIds.flatMap((id) =>
    getExtensionCompletions(id).filter((item) => {
      const key = `${String(item.label || '').toLowerCase()}::${String(item.insertText || '')}`;
      if (!item?.label || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
  );
}

function findExactExtensionSnippet(languageId, prefix) {
  const normalizedPrefix = String(prefix || '').trim().toLowerCase();
  if (!normalizedPrefix) {
    return null;
  }

  return (
    getReactAwareExtensionCompletions(languageId).find((item) => {
      if (String(item.kind || '').toLowerCase() !== 'snippet') {
        return false;
      }

      const label = String(item.label || '').trim().toLowerCase();
      const filterText = String(item.filterText || '').trim().toLowerCase();
      return label === normalizedPrefix || filterText === normalizedPrefix;
    }) || null
  );
}

function expandExactExtensionSnippet(editor, monaco, languageId) {
  const model = editor.getModel?.();
  const position = editor.getPosition?.();
  if (!model || !position) {
    return false;
  }

  const word = model.getWordUntilPosition(position);
  const prefix = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const snippet = findExactExtensionSnippet(languageId, prefix);
  if (!snippet) {
    return false;
  }

  const snippetController = editor.getContribution?.('snippetController2');
  if (snippetController?.insert) {
    snippetController.insert(snippet.insertText, {
      overwriteBefore: prefix.length,
      overwriteAfter: 0,
      undoStopBefore: true,
      undoStopAfter: true,
    });
    return true;
  }

  const range = {
    startLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  };

  try {
    editor.trigger('keyboard', 'editor.action.insertSnippet', {
      snippet: snippet.insertText,
      range,
    });
    return true;
  } catch {
    return false;
  }
}

function getTriggerCharacter(model, position) {
  const offset = model.getOffsetAt(position);
  const text = model.getValue();
  const previousCharacter = text[Math.max(0, offset - 1)] || '';
  if (previousCharacter && previousCharacter.length === 1 && !/\s/.test(previousCharacter)) {
    // Only return as a trigger character if it is NOT a word character (a-z, A-Z, 0-9, _)
    if (!/^[a-zA-Z0-9_]$/.test(previousCharacter)) {
      return previousCharacter;
    }
  }
  return undefined;
}

function shouldUseManualSuggestTrigger(providerType) {
  return providerType === 'lsp' || providerType === 'basic' || providerType === 'extension-disabled';
}

function setLspContextResolver(languageId, token, resolver) {
  if (!languageId) {
    return;
  }

  const normalizedLanguageId = String(languageId).trim();
  if (!normalizedLanguageId) {
    return;
  }

  if (typeof resolver === 'function') {
    const resolvers = lspContextResolvers.get(normalizedLanguageId) || new Map();
    resolvers.set(token, resolver);
    lspContextResolvers.set(normalizedLanguageId, resolvers);
    return;
  }

  const resolvers = lspContextResolvers.get(normalizedLanguageId);
  if (!resolvers) {
    return;
  }

  resolvers.delete(token);
  if (!resolvers.size) {
    lspContextResolvers.delete(normalizedLanguageId);
  }
}

function getLspContextResolver(languageId) {
  const normalizedLanguageId = String(languageId || '').trim();
  const resolvers = lspContextResolvers.get(normalizedLanguageId);
  if (!resolvers?.size) {
    return null;
  }

  return () => {
    const resolverList = Array.from(resolvers.values()).reverse();
    for (const resolver of resolverList) {
      try {
        const context = resolver?.();
        if (context?.bridge) {
          return context;
        }
      } catch {
        // A stale editor resolver should not block active LSP completions.
      }
    }
    return null;
  };
}

function isUserTypingSuggestTrigger(text) {
  if (typeof text !== 'string' || text.length !== 1) {
    return false;
  }

  return /[A-Za-z0-9_:#./"'(-]/.test(text);
}

function offsetToRange(model, startOffset, endOffset) {
  const start = model.getPositionAt(startOffset);
  const end = model.getPositionAt(endOffset);
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

function buildHtmlTagPairs(text) {
  const tagPattern = /<\/?([A-Za-z][\w:-]*)?[^>]*?>/g;
  const stack = [];
  const pairs = [];
  let match;

  while ((match = tagPattern.exec(text))) {
    const [tagText, rawName = ''] = match;
    const name = rawName.toLowerCase();
    const isClosing = tagText.startsWith('</');
    const isSelfClosing = /\/\s*>$/.test(tagText);
    const nameStartOffset = match.index + (isClosing ? 2 : 1);
    const nameEndOffset = nameStartOffset + rawName.length;

    if (!isClosing && !isSelfClosing && !VOID_HTML_TAGS.has(name)) {
      stack.push({
        name,
        range: { startOffset: nameStartOffset, endOffset: nameEndOffset },
      });
      continue;
    }

    if (isClosing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const canLink =
          stack[index].name === name ||
          stack[index].name.length === 0 ||
          name.length === 0;

        if (!canLink) {
          continue;
        }

        const [openTag] = stack.splice(index, 1);
        pairs.push({
          openRange: openTag.range,
          closeRange: { startOffset: nameStartOffset, endOffset: nameEndOffset },
        });
        break;
      }
    }
  }

  return pairs;
}

function registerHtmlLinkedTagProvider(monaco) {
  if (linkedHtmlTagProviderRegistered) {
    return;
  }

  monaco.languages.registerLinkedEditingRangeProvider('html', {
    provideLinkedEditingRanges(model, position) {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const pairs = buildHtmlTagPairs(text);

      for (const pair of pairs) {
        const isInsideOpen =
          offset >= pair.openRange.startOffset && offset <= pair.openRange.endOffset;
        const isInsideClose =
          offset >= pair.closeRange.startOffset && offset <= pair.closeRange.endOffset;

        if (!isInsideOpen && !isInsideClose) {
          continue;
        }

        return {
          ranges: [
            offsetToRange(model, pair.openRange.startOffset, pair.openRange.endOffset),
            offsetToRange(model, pair.closeRange.startOffset, pair.closeRange.endOffset),
          ],
          wordPattern: /[\w:-]*/,
        };
      }

      return null;
    },
  });

  linkedHtmlTagProviderRegistered = true;
}

function getIndentUnit(tab, settings) {
  const insertSpaces = tab?.insertSpaces ?? settings?.insertSpaces;
  const tabSize = Number(tab?.tabSize ?? settings?.tabSize) || 2;
  return insertSpaces ? ' '.repeat(tabSize) : '\t';
}

function getHtmlTextBeforePosition(model, position) {
  return model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
}

function isInsideHtmlTagBlock(model, position, tagName) {
  const textBeforeCursor = getHtmlTextBeforePosition(model, position).toLowerCase();
  const openTagPattern = `<${tagName}`;
  const closeTagPattern = `</${tagName}`;
  const lastOpen = textBeforeCursor.lastIndexOf(openTagPattern);
  const lastClose = textBeforeCursor.lastIndexOf(closeTagPattern);
  return lastOpen !== -1 && lastOpen > lastClose;
}

function isInsideHtmlStyleBlock(model, position) {
  return isInsideHtmlTagBlock(model, position, 'style');
}

function isInsideHtmlScriptBlock(model, position) {
  return isInsideHtmlTagBlock(model, position, 'script');
}

function isInsideHtmlEmbeddedText(model, position, tagName) {
  if (!isInsideHtmlTagBlock(model, position, tagName)) {
    return false;
  }

  const textBeforeCursor = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });
  const lastOpenBracket = textBeforeCursor.lastIndexOf('>');
  const lastTagStart = textBeforeCursor.lastIndexOf(`<${tagName}`);
  return lastTagStart !== -1 && lastOpenBracket > lastTagStart;
}

function handleHtmlStyleBlockEnter(editor, monaco, tab, settings) {
  if (tab?.language !== 'html') {
    return false;
  }

  const model = editor.getModel?.();
  const position = editor.getPosition?.();
  if (!model || !position || !isInsideHtmlStyleBlock(model, position)) {
    return false;
  }

  const lineContent = model.getLineContent(position.lineNumber);
  const beforeCursor = lineContent.slice(0, Math.max(0, position.column - 1));
  const afterCursor = lineContent.slice(Math.max(0, position.column - 1));
  const trimmedBefore = beforeCursor.trimEnd();
  const trimmedAfter = afterCursor.trimStart();

  if (!trimmedBefore.endsWith('{') || !trimmedAfter.startsWith('}')) {
    return false;
  }

  const baseIndent = beforeCursor.match(/^\s*/)?.[0] || '';
  const indentUnit = getIndentUnit(tab, settings);
  const insertText = `\n${baseIndent}${indentUnit}\n${baseIndent}`;

  editor.executeEdits('tilder-html-style-enter', [
    {
      range: new monaco.Range(
        position.lineNumber,
        position.column,
        position.lineNumber,
        position.column
      ),
      text: insertText,
      forceMoveMarkers: true,
    },
  ]);

  editor.setPosition({
    lineNumber: position.lineNumber + 1,
    column: baseIndent.length + indentUnit.length + 1,
  });
  editor.revealPositionInCenterIfOutsideViewport({
    lineNumber: position.lineNumber + 1,
    column: baseIndent.length + indentUnit.length + 1,
  });
  return true;
}

function toKebabCase(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/^ms-/, '-ms-')
    .toLowerCase();
}

function getEmbeddedCssProperties() {
  if (embeddedCssPropertiesCache) {
    return embeddedCssPropertiesCache;
  }

  const seededProperties = new Set([
    'align-items',
    'background',
    'background-color',
    'border',
    'border-radius',
    'bottom',
    'box-shadow',
    'color',
    'display',
    'flex',
    'flex-direction',
    'font-family',
    'font-size',
    'font-weight',
    'gap',
    'grid-template-columns',
    'height',
    'justify-content',
    'left',
    'letter-spacing',
    'line-height',
    'list-style',
    'margin',
    'margin-top',
    'opacity',
    'padding',
    'position',
    'right',
    'text-align',
    'top',
    'transform',
    'transition',
    'width',
    'z-index',
  ]);

  if (typeof window !== 'undefined' && window.CSSStyleDeclaration) {
    const prototypeNames = Object.getOwnPropertyNames(window.CSSStyleDeclaration.prototype);
    prototypeNames
      .filter((name) => /^[A-Za-z]/.test(name) && !name.startsWith('webkit') && !name.startsWith('constructor'))
      .map(toKebabCase)
      .filter((name) => name && !name.includes('('))
      .forEach((name) => seededProperties.add(name));
  }

  embeddedCssPropertiesCache = [...seededProperties].sort((left, right) => left.localeCompare(right));
  return embeddedCssPropertiesCache;
}

function isInsideHtmlCssDeclarationBlock(model, position) {
  if (!isInsideHtmlStyleBlock(model, position)) {
    return false;
  }

  const textBeforeCursor = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const lastOpenBrace = textBeforeCursor.lastIndexOf('{');
  const lastCloseBrace = textBeforeCursor.lastIndexOf('}');
  return lastOpenBrace !== -1 && lastOpenBrace > lastCloseBrace;
}

function registerEmbeddedCssProvider(monaco) {
  if (embeddedCssProviderRegistered) {
    return;
  }

  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['-', ':'],
    provideCompletionItems(model, position) {
      if (!isInsideHtmlCssDeclarationBlock(model, position)) {
        return { suggestions: [] };
      }

      const linePrefix = model.getLineContent(position.lineNumber).slice(0, Math.max(0, position.column - 1));
      const trimmedLinePrefix = linePrefix.trim();
      if (!trimmedLinePrefix || trimmedLinePrefix.endsWith('{')) {
        return { suggestions: [] };
      }

      const lastColonIndex = linePrefix.lastIndexOf(':');
      const lastSemicolonIndex = linePrefix.lastIndexOf(';');
      if (lastColonIndex > lastSemicolonIndex) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const monacoRange = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      );

      const suggestions = getEmbeddedCssProperties().map((propertyName) => ({
        label: propertyName,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: `${propertyName}: \${1};`,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        documentation: `CSS property: ${propertyName}`,
        filterText: propertyName,
        sortText: `a-${propertyName}`,
        range: monacoRange,
      }));

      return { suggestions };
    },
  });

  embeddedCssProviderRegistered = true;
}

function registerEmbeddedJavaScriptProvider(monaco) {
  if (embeddedJavaScriptProviderRegistered) {
    return;
  }

  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['.', '(', '"', "'", '['],
    provideCompletionItems(model, position) {
      if (!isInsideHtmlEmbeddedText(model, position, 'script')) {
        return { suggestions: [] };
      }

      return { suggestions: [] };
    },
  });

  embeddedJavaScriptProviderRegistered = true;
}

function registerEmmetProviders(monaco) {
  if (emmetRegistered) {
    return;
  }

  emmetHTML(monaco, ['html'], { tokenizer: 'standard' });
  emmetCSS(monaco, ['css', 'scss'], { tokenizer: 'standard' });
  emmetJSX(monaco, ['javascript', 'typescript'], { tokenizer: 'standard' });
  emmetRegistered = true;
}

function registerLspCompletionProvider(monaco, languageId, getLspContext) {
  if (!languageId) {
    return;
  }

  setLspContextResolver(languageId, `bootstrap:${languageId}`, getLspContext);

  const existingRegistration = lspCompletionRegistrations.get(languageId);
  if (existingRegistration?.monaco === monaco) {
    return;
  }
  existingRegistration?.disposable?.dispose?.();

  const disposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: LSP_COMPLETION_TRIGGER_CHARACTERS,
    async provideCompletionItems(model, position) {
      const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      console.log(`[Tilder LSP] provideCompletionItems called for lang=${languageId}`, {
        hasContext: !!context,
        contextLanguageId: context?.languageId,
        hasBridge: !!context?.bridge,
        relativePath: context?.relativePath,
      });

      if (!context || context.languageId !== languageId || !context.bridge) {
        console.warn(`[Tilder LSP] Skipping completion: context=${!!context}, lang match=${context?.languageId === languageId}, bridge=${!!context?.bridge}`);
        return { suggestions: [] };
      }

      try {
        const completionRequest = {
          relativePath: context.relativePath,
          fileName: context.fileName,
          text: model.getValue(),
          position,
          triggerCharacter: getTriggerCharacter(model, position),
        };

        console.log(`[Tilder LSP] Sending completion request`, { relativePath: completionRequest.relativePath, line: position.lineNumber, col: position.column, triggerCharacter: completionRequest.triggerCharacter });

        let response = await context.bridge.requestCompletion(completionRequest);
        console.log(`[Tilder LSP] Got completion response`, { isArray: Array.isArray(response), hasItems: !!response?.items, itemCount: Array.isArray(response) ? response.length : response?.items?.length });
        let suggestions = toMonacoCompletionItems(monaco, response, range);
        console.log(`[Tilder LSP] Converted to ${suggestions.length} Monaco suggestions`);

        if (!suggestions.length) {
          await new Promise((resolve) => window.setTimeout(resolve, 150));
          response = await context.bridge.requestCompletion(completionRequest);
          suggestions = toMonacoCompletionItems(monaco, response, range);
          console.log(`[Tilder LSP] Retry: ${suggestions.length} suggestions`);
        }

        return {
          suggestions: mergeSuggestions(suggestions),
        };
      } catch (err) {
        console.error(`[Tilder LSP] Completion error:`, err);
        return {
          suggestions: [],
        };
      }
    },
  });

  lspCompletionRegistrations.set(languageId, { monaco, disposable });
}

function registerLspFeatureProviders(monaco, languageId, getLspContext) {
  if (!languageId) {
    return;
  }

  setLspContextResolver(languageId, `bootstrap:${languageId}`, getLspContext);

  const existingRegistration = lspFeatureRegistrations.get(languageId);
  if (existingRegistration?.monaco === monaco) {
    return;
  }
  existingRegistration?.disposables?.forEach((disposable) => disposable?.dispose?.());

  const disposables = [
    monaco.languages.registerHoverProvider(languageId, {
      async provideHover(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestHover) {
          return { contents: [] };
        }

        try {
          return await context.bridge.requestHover({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
          });
        } catch {
          return { contents: [] };
        }
      },
    }),
    monaco.languages.registerDefinitionProvider(languageId, {
      async provideDefinition(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestDefinition) {
          return [];
        }

        try {
          return await context.bridge.requestDefinition({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
          });
        } catch {
          return [];
        }
      },
    }),
    monaco.languages.registerReferenceProvider(languageId, {
      async provideReferences(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestReferences) {
          return [];
        }

        try {
          return await context.bridge.requestReferences({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
            includeDeclaration: true,
          });
        } catch {
          return [];
        }
      },
    }),
    monaco.languages.registerRenameProvider(languageId, {
      async provideRenameEdits(model, position, newName) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestRename) {
          return null;
        }

        try {
          return await context.bridge.requestRename({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
            newName,
          });
        } catch {
          return null;
        }
      },
    }),
    monaco.languages.registerDocumentSymbolProvider(languageId, {
      async provideDocumentSymbols(model) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestSymbols) {
          return [];
        }

        try {
          return await context.bridge.requestSymbols({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
          });
        } catch {
          return [];
        }
      },
    }),
    monaco.languages.registerSignatureHelpProvider(languageId, {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      async provideSignatureHelp(model, position) {
        const context = getLspContextResolver(languageId)?.() || getLspContext?.() || null;
        if (!context || context.languageId !== languageId || !context.bridge?.requestSignatureHelp) {
          return { value: { signatures: [], activeSignature: 0, activeParameter: 0 } };
        }

        try {
          const response = await context.bridge.requestSignatureHelp({
            relativePath: context.relativePath,
            fileName: context.fileName,
            text: model.getValue(),
            position,
          });
          return { value: response || { signatures: [], activeSignature: 0, activeParameter: 0 } };
        } catch {
          return { value: { signatures: [], activeSignature: 0, activeParameter: 0 } };
        }
      },
    }),
  ];

  lspFeatureRegistrations.set(languageId, { monaco, disposables });
}

function registerExtensionCompletionProvider(monaco, languageId) {
  if (!languageId) {
    return;
  }

  const existingRegistration = extensionCompletionRegistrations.get(languageId);
  if (existingRegistration?.monaco === monaco) {
    return;
  }
  existingRegistration?.disposable?.dispose?.();

  const disposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', ':', '>', '"', "'", '/', '#', '(', '<', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      };

      return {
        suggestions: mergeSuggestions(buildExtensionCompletionItems(monaco, languageId, range)),
      };
    },
  });

  extensionCompletionRegistrations.set(languageId, { monaco, disposable });
}

function disposeExtensionCompletionProvider(languageId) {
  const registration = extensionCompletionRegistrations.get(languageId);
  if (registration) {
    registration.disposable?.dispose?.();
    extensionCompletionRegistrations.delete(languageId);
  }
}

const gitBlameHoverRegistrations = new Map();
let cachedBlameResult = { path: null, lines: {} };

async function getBlameLines(filePath, rootPath) {
  if (cachedBlameResult.path === filePath) {
    return cachedBlameResult.lines;
  }
  const blameOutput = await fetchScmBlame(filePath, rootPath);
  if (!blameOutput) return {};

  const lines = {};
  const rawLines = blameOutput.split('\n');
  let currentCommit = null;
  let currentLineData = {};

  for (const raw of rawLines) {
    if (!raw) continue;
    const parts = raw.split(' ');
    
    // Check if it's a new commit block (40 char hash followed by line numbers)
    if (parts[0].length === 40 && !parts[0].includes('-')) {
      const hash = parts[0];
      const resultLine = parseInt(parts[2], 10);
      currentCommit = hash;
      currentLineData = { hash, resultLine, author: '', summary: '', date: '' };
      lines[resultLine] = currentLineData;
    } else if (currentCommit) {
      if (parts[0] === 'author') {
        currentLineData.author = parts.slice(1).join(' ');
      } else if (parts[0] === 'author-time') {
        const date = new Date(parseInt(parts[1], 10) * 1000);
        currentLineData.date = date.toLocaleDateString();
      } else if (parts[0] === 'summary') {
        currentLineData.summary = parts.slice(1).join(' ');
      }
    }
  }

  cachedBlameResult = { path: filePath, lines };
  return lines;
}

function registerGitBlameHoverProvider(monaco, languageId) {
  if (!languageId) return;

  const existingRegistration = gitBlameHoverRegistrations.get(languageId);
  if (existingRegistration?.monaco === monaco) return;
  existingRegistration?.disposable?.dispose?.();

  const disposable = monaco.languages.registerHoverProvider(languageId, {
    async provideHover(model, position) {
      const rootPath = workspace.roots?.[0]?.systemPath;
      // We get the tab path by extracting it from the model URI if possible, 
      // but Monaco model URIs are tricky. Let's find the active tab from workspace.
      let activeTabPath = null;
      const allTabs = workspace.getAllTabs ? workspace.getAllTabs() : [];
      for (const tab of allTabs) {
        if (model.uri.path.endsWith(tab.path) || tab.path.endsWith(model.uri.path.replace(/^\//, ''))) {
          activeTabPath = tab.path;
          break;
        }
      }
      
      if (!activeTabPath || !rootPath) return null;

      const lines = await getBlameLines(activeTabPath, rootPath);
      const blameData = lines[position.lineNumber];
      if (!blameData) return null;

      if (blameData.hash.startsWith('0000000000000000')) {
        return { contents: [{ value: 'Not Committed Yet' }] };
      }

      return {
        contents: [
          { value: `**${blameData.author}**, ${blameData.date} • \`${blameData.hash.substring(0, 8)}\`` },
          { value: `${blameData.summary}` }
        ]
      };
    }
  });

  gitBlameHoverRegistrations.set(languageId, { monaco, disposable });
}

function classifyBinaryTab(tab) {
  if (!tab?.isBinary) {
    return 'text';
  }
  const mimeType = String(tab.mimeType || '').toLowerCase();
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  return 'binary';
}

/**
 * Parse a unified diff string into line number arrays for git gutter decorations.
 * Returns { added: number[], modified: number[], deleted: number[] }
 */
function parseGitHunks(diffText) {
  const added = [];
  const modified = [];
  const deleted = [];

  if (!diffText) return { added, modified, deleted };

  const lines = diffText.split('\n');
  let newLineNum = 0;
  let pendingDeletes = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNum = parseInt(hunkMatch[1], 10);
      pendingDeletes = 0;
      continue;
    }

    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) {
      continue;
    }

    if (line.startsWith('-')) {
      pendingDeletes++;
    } else if (line.startsWith('+')) {
      if (pendingDeletes > 0) {
        modified.push(newLineNum); // adjacent delete+add = modification
      } else {
        added.push(newLineNum);
      }
      newLineNum++;
      pendingDeletes = 0;
    } else {
      if (pendingDeletes > 0) {
        // Deletion with no following addition = pure delete marker
        deleted.push(newLineNum);
        pendingDeletes = 0;
      }
      newLineNum++;
    }
  }

  return { added, modified, deleted };
}

export default function MonacoEditor({
  settings,
  tab,
  onChange,
  onMount,
  onFocusEditor,
  MonacoEditorDisplay,
  monacoEditorStyle,
  onOpenCommandPalette,
  onToggleZenMode,
  onEscapeCurrentMode,
  onGoToLine,
  onGoToDefinition,
  onGoToReferences,
  onPeekDefinition,
  onPeekReferences,
  onRenameSymbol,
  onMarkersChange,
  intelliSense,
  lspBridge,
  breakpoints = [],
  onToggleBreakpoint,
  gitDiff = '',
}) {
  const editorRef = React.useRef(null);
  const monacoRef = React.useRef(null);
  const activeLspContextRef = React.useRef(null);
  const activeIntelliSenseRef = React.useRef(intelliSense);
  const lspResolverTokenRef = React.useRef(Symbol(`lsp-context:${tab?.id || 'unknown'}`));
  const breakpointDecorationsRef = React.useRef([]);
  const gitDecorationsRef = React.useRef([]);
  const [binaryViewMode, setBinaryViewMode] = React.useState('preview');

  if (!settings || !tab) {
    return null;
  }

  // files.associations: override language based on user glob patterns
  function resolveEffectiveLanguage(tabName, tabLang) {
    const associations = settings?.files?.associations;
    if (!associations || !tabName) return tabLang;
    for (const [glob, langId] of Object.entries(associations)) {
      // Convert glob to regex: *.ext → /^.*\.ext$/  or exact match
      const pattern = glob
        .replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&') // escape regex chars except *
        .replace(/\\\*/g, '.*'); // replace escaped * back to .*
      try {
        if (new RegExp(`^${pattern}$`, 'i').test(tabName)) return langId;
      } catch { /* invalid pattern */ }
    }
    return tabLang;
  }
  const effectiveLanguage = resolveEffectiveLanguage(tab.name, tab.language);

  const binaryKind = classifyBinaryTab(tab);
  const isBinaryTab = binaryKind !== 'text';
  const canPreviewBinary = binaryKind === 'image' || binaryKind === 'pdf' || binaryKind === 'audio' || binaryKind === 'video';
  const binaryPreviewUrl = React.useMemo(() => {
    if (!isBinaryTab || !canPreviewBinary || !tab.content) {
      return '';
    }
    return `data:${tab.mimeType || 'application/octet-stream'};base64,${tab.content}`;
  }, [canPreviewBinary, isBinaryTab, tab.content, tab.mimeType]);

  const isExe = tab.name && tab.name.toLowerCase().endsWith('.exe');

  const handleRunExecutable = async () => {
    try {
      const { desktopExecuteCommand } = await import('../../core/desktopFileApi.js');
      await desktopExecuteCommand(tab.path);
    } catch (err) {
      console.error('Failed to run executable:', err);
      alert('Error running executable: ' + (err.message || err));
    }
  };

  React.useEffect(() => {
    setBinaryViewMode(canPreviewBinary ? 'preview' : 'raw');
  }, [tab.id, canPreviewBinary]);

  React.useEffect(() => {
    if (!onMarkersChange) return;
    const handleMarkerUpdate = (e) => {
      onMarkersChange(e.detail.path, e.detail.errors, e.detail.warnings);
    };
    window.addEventListener('tilder-markers-changed', handleMarkerUpdate);
    return () => window.removeEventListener('tilder-markers-changed', handleMarkerUpdate);
  }, [onMarkersChange]);

  function handleMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (!window.__monacoMarkersRegistered) {
      window.__monacoMarkersRegistered = true;
      monaco.editor.onDidChangeMarkers((uris) => {
        uris.forEach(uri => {
          const markers = monaco.editor.getModelMarkers({ resource: uri });
          let errors = 0, warnings = 0;
          markers.forEach(m => {
            if (m.severity === monaco.MarkerSeverity.Error) errors++;
            if (m.severity === monaco.MarkerSeverity.Warning) warnings++;
          });
          const path = decodeURIComponent(uri.path.startsWith('/') ? uri.path.substring(1) : uri.path);
          window.dispatchEvent(new CustomEvent('tilder-markers-changed', { detail: { path, errors, warnings } }));
        });
      });
    }

    if (monaco.languages.typescript) {
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
      monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
    }

    registerEmmetProviders(monaco);
    registerHtmlLinkedTagProvider(monaco);
    registerEmbeddedCssProvider(monaco);
    registerEmbeddedJavaScriptProvider(monaco);
    registerLspCompletionProvider(monaco, tab.language, () => activeLspContextRef.current);
    registerLspFeatureProviders(monaco, tab.language, () => activeLspContextRef.current);
    activeLspContextRef.current =
      intelliSense?.providerType === 'lsp' && lspBridge
        ? {
            bridge: lspBridge,
            languageId: tab.language,
            relativePath: tab.path === 'root' ? tab.name : tab.path,
            fileName: tab.name,
          }
        : null;
    if (intelliSense?.providerType !== 'lsp') {
      registerExtensionCompletionProvider(monaco, tab.language);
    } else {
      disposeExtensionCompletionProvider(tab.language);
    }

    registerMonacoThemes(monaco);
    const activeTheme = settings?.theme?.active || 'tilder-formal';
    monaco.editor.setTheme(activeTheme);

      if (onOpenCommandPalette) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => onOpenCommandPalette());
        editor.addCommand(monaco.KeyCode.F1, () => onOpenCommandPalette());
      }

      if (onToggleZenMode) {
        editor.addCommand(
          monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, monaco.KeyCode.KeyZ),
          () => onToggleZenMode()
        );
      }

      if (onEscapeCurrentMode) {
        editor.addCommand(monaco.KeyMod.chord(monaco.KeyCode.Escape, monaco.KeyCode.Escape), () => onEscapeCurrentMode());
      }

      if (onGoToLine) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => onGoToLine());
      }

    if (onGoToDefinition) {
      editor.addCommand(monaco.KeyCode.F12, () => onGoToDefinition());
    }

    if (onGoToReferences) {
      editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F12, () => onGoToReferences());
    }

    if (onRenameSymbol) {
      editor.addCommand(monaco.KeyCode.F2, () => onRenameSymbol());
    }

      editor.addCommand(
        monaco.KeyCode.Enter,
        () => editor.trigger('keyboard', 'acceptSelectedSuggestion', {}),
        'suggestWidgetVisible'
      );

      editor.addCommand(
        monaco.KeyCode.Enter,
        () => {
          if (handleHtmlStyleBlockEnter(editor, monaco, tab, settings)) {
            return;
        }

        editor.trigger('keyboard', 'type', { text: '\n' });
      },
        '!suggestWidgetVisible'
      );

      editor.onKeyDown((event) => {
        if (
          event.keyCode !== monaco.KeyCode.Tab ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ) {
          return;
        }

        if (expandExactExtensionSnippet(editor, monaco, tab.language)) {
          event.preventDefault();
          event.stopPropagation();
        }
      });

      editor.onDidChangeModelContent((event) => {
      if (activeLspContextRef.current) {
        const { bridge, relativePath, fileName } = activeLspContextRef.current;
        const text = editor.getModel()?.getValue() || '';
        if (editor.lspSyncTimeout) {
          window.clearTimeout(editor.lspSyncTimeout);
        }
        editor.lspSyncTimeout = window.setTimeout(() => {
          bridge.syncDocument({ relativePath, fileName, text }).catch(() => {});
        }, 300);
      }

      const nextIntelliSense = activeIntelliSenseRef.current;
      if (!nextIntelliSense?.providerType) {
        return;
      }

      if (!shouldUseManualSuggestTrigger(nextIntelliSense.providerType)) {
        return;
      }

      const shouldTriggerSuggest = event.changes.some((change) => {
        return isUserTypingSuggestTrigger(change.text);
      });

      if (!shouldTriggerSuggest) {
        return;
      }

      window.setTimeout(() => {
        editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
      }, 0);
    });

    window.tilderActiveEditor = editor;

    editor.onDidFocusEditorText(() => {
      window.tilderActiveEditor = editor;
      onFocusEditor?.(editor, monaco, tab);
    });

    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const lineNumber = e.target.position.lineNumber;
        // Allow a tiny timeout so the user isn't clicking while it renders rapidly
        setTimeout(() => {
          onToggleBreakpoint?.(lineNumber);
        }, 10);
      }
    });

    onMount?.(editor, monaco);

    // Register #region/#endregion custom folding for common languages (once per monaco instance)
    {
      const regionLangs = ['javascript','javascriptreact','typescript','typescriptreact','css','scss','less','python','csharp','json','html'];
      if (!monaco.__tilderRegionFoldingRegistered) {
        monaco.__tilderRegionFoldingRegistered = new Set();
      }
      regionLangs.forEach(lang => {
        if (monaco.__tilderRegionFoldingRegistered.has(lang)) return;
        monaco.__tilderRegionFoldingRegistered.add(lang);
        try {
          monaco.languages.registerFoldingRangeProvider(lang, {
            provideFoldingRanges(model) {
              const ranges = [];
              const lines = model.getLinesContent();
              const stack = [];
              lines.forEach((line, i) => {
                const t = line.trim();
                if (/^(?:\/\/\s*|#\s*|<!--\s*)#?region\b/i.test(t)) {
                  stack.push(i + 1);
                } else if (/^(?:\/\/\s*|#\s*|<!--\s*)#?endregion\b/i.test(t)) {
                  if (stack.length > 0) {
                    ranges.push({ start: stack.pop(), end: i + 1, kind: monaco.languages.FoldingRangeKind.Region });
                  }
                }
              });
              return ranges;
            }
          });
        } catch (_) { /* language may not support custom folding */ }
      });
    }
  }

  React.useEffect(() => {
    activeIntelliSenseRef.current = intelliSense;
  }, [intelliSense]);

  React.useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    
    const newDecorations = breakpoints.map(bp => ({
      range: new monacoRef.current.Range(bp, 1, bp, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'debug-breakpoint-glyph',
        stickiness: monacoRef.current.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      }
    }));
    
    breakpointDecorationsRef.current = editor.deltaDecorations(
      breakpointDecorationsRef.current,
      newDecorations
    );
  }, [breakpoints]);

  // ── Git gutter decorations (added = green, modified = orange, deleted marker = red) ──
  React.useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const hunks = parseGitHunks(gitDiff);
    const decorations = [];

    hunks.added.forEach(line => {
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          linesDecorationsClassName: 'tilder-git-added',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          overviewRuler: { color: '#3fb950cc', position: monaco.editor.OverviewRulerLane.Left },
        },
      });
    });

    hunks.modified.forEach(line => {
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          linesDecorationsClassName: 'tilder-git-modified',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          overviewRuler: { color: '#d29922cc', position: monaco.editor.OverviewRulerLane.Left },
        },
      });
    });

    hunks.deleted.forEach(line => {
      decorations.push({
        range: new monaco.Range(Math.max(1, line), 1, Math.max(1, line), 1),
        options: {
          isWholeLine: false,
          linesDecorationsClassName: 'tilder-git-deleted',
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          overviewRuler: { color: '#f85149cc', position: monaco.editor.OverviewRulerLane.Left },
        },
      });
    });

    gitDecorationsRef.current = editor.deltaDecorations(
      gitDecorationsRef.current,
      decorations
    );
  }, [gitDiff]);

  React.useEffect(() => {
    const active = settings?.theme?.active || 'tilder-formal';
    if (monacoRef.current) {
      try {
        monacoRef.current.editor.setTheme(active);
      } catch (_) {}
    }
  }, [settings?.theme?.active]);

  React.useEffect(() => {
    if (monacoRef.current && tab.language) {
      const monaco = monacoRef.current;
      registerLspCompletionProvider(monaco, tab.language, () => activeLspContextRef.current);
      registerLspFeatureProviders(monaco, tab.language, () => activeLspContextRef.current);
      registerGitBlameHoverProvider(monaco, tab.language);
      if (intelliSense?.providerType !== 'lsp') {
        registerExtensionCompletionProvider(monaco, tab.language);
      } else {
        disposeExtensionCompletionProvider(tab.language);
      }
    }
  }, [intelliSense?.providerType, tab.language]);

  React.useEffect(() => {
    activeLspContextRef.current =
      intelliSense?.providerType === 'lsp' && lspBridge
        ? {
            bridge: lspBridge,
            languageId: tab.language,
            relativePath: tab.path === 'root' ? tab.name : tab.path,
            fileName: tab.name,
          }
        : null;
  }, [intelliSense?.providerType, lspBridge, tab.language, tab.name, tab.path]);

  React.useEffect(() => {
    const token = lspResolverTokenRef.current;
    const hasLiveLspContext = intelliSense?.providerType === 'lsp' && lspBridge && tab.language;

    if (hasLiveLspContext) {
      setLspContextResolver(tab.language, token, () => activeLspContextRef.current);
    } else if (tab.language) {
      setLspContextResolver(tab.language, token, null);
    }

    return () => {
      if (tab.language) {
        setLspContextResolver(tab.language, token, null);
      }
    };
  }, [intelliSense?.providerType, lspBridge, tab.language]);

  React.useEffect(() => {
    if (intelliSense?.providerType === 'lsp' && lspBridge && editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        lspBridge.syncDocument({
          relativePath: tab.path === 'root' ? tab.name : tab.path,
          fileName: tab.name,
          text: model.getValue(),
        }).catch(() => {});
      }
    }
  }, [intelliSense?.providerType, lspBridge, tab.id, tab.name, tab.path]);

  React.useEffect(() => {
    if (!lspBridge || !editorRef.current || !monacoRef.current || intelliSense?.providerType !== 'lsp') {
      return undefined;
    }

    const monaco = monacoRef.current;
    const editor = editorRef.current;

    if (typeof lspBridge.onDiagnostics === 'function') {
      const unsubscribe = lspBridge.onDiagnostics((params) => {
        const model = editor.getModel();
        if (!model) return;

        const currentUri = model.uri.toString();
        const lspUri = params.uri;
        if (currentUri !== lspUri && decodeURIComponent(currentUri) !== decodeURIComponent(lspUri)) {
          return;
        }

        const markers = (params.diagnostics || []).map((diag) => {
          const startLine = Number(diag.range?.start?.line || 0) + 1;
          const startChar = Number(diag.range?.start?.character || 0) + 1;
          const endLine = Number(diag.range?.end?.line || 0) + 1;
          const endChar = Number(diag.range?.end?.character || 0) + 1;

          let severity = monaco.MarkerSeverity.Info;
          if (diag.severity === 1) severity = monaco.MarkerSeverity.Error;
          else if (diag.severity === 2) severity = monaco.MarkerSeverity.Warning;
          else if (diag.severity === 3) severity = monaco.MarkerSeverity.Info;
          else if (diag.severity === 4) severity = monaco.MarkerSeverity.Hint;

          return {
            severity,
            startLineNumber: startLine,
            startColumn: startChar,
            endLineNumber: endLine,
            endColumn: endChar,
            message: diag.message || 'Error',
            source: diag.source || 'LSP',
          };
        });

        monaco.editor.setModelMarkers(model, 'lsp', markers);
      });

      return () => {
        unsubscribe();
        const model = editor.getModel();
        if (model) {
          monaco.editor.setModelMarkers(model, 'lsp', []);
        }
      };
    }
  }, [lspBridge, intelliSense?.providerType, tab.id]);

  const wordBasedSuggestions =
    intelliSense?.providerType === 'native'
      ? 'matchingDocuments'
      : intelliSense?.providerType === 'basic'
        ? 'currentDocument'
      : intelliSense?.providerType === 'lsp' && intelliSense?.available
        ? false
        : false;
  const editorOptions = React.useMemo(
    () => buildEditorOptions(settings, tab, wordBasedSuggestions),
    [settings, tab, wordBasedSuggestions]
  );

  // Cleanup editor resources on component unmount or tab change
  React.useEffect(() => {
    return () => {
      if (editorRef.current) {
        disposeEditorResources(editorRef.current);
      }
    };
  }, []);


  return (
    <div className={`editor-wrapper d-${MonacoEditorDisplay}`} style={monacoEditorStyle}>
      {isBinaryTab ? (
        <div className="binary-editor-surface">
          <div className="binary-editor-toolbar">
            <span className="binary-editor-label">
              {isExe ? 'Executable file' : 'Binary file'}
            </span>
            {isExe && (
              <button
                type="button"
                className="binary-editor-tab active"
                style={{ background: 'var(--accent-color)', color: '#fff', border: 'none', marginLeft: 'auto' }}
                onClick={handleRunExecutable}
              >
                <span><i className="fa-solid fa-play" style={{ marginRight: '6px' }}></i></span>
                Run Executable
              </button>
            )}
            <button
              type="button"
              className={`binary-editor-tab ${binaryViewMode === 'preview' ? 'active' : ''}`}
              disabled={!canPreviewBinary}
              onClick={() => setBinaryViewMode('preview')}
            >
              Preview
            </button>
            <button
              type="button"
              className={`binary-editor-tab ${binaryViewMode === 'raw' ? 'active' : ''}`}
              onClick={() => setBinaryViewMode('raw')}
            >
              Raw binary (base64)
            </button>
          </div>
          {binaryViewMode === 'preview' && canPreviewBinary ? (
            <div className="binary-preview-container">
              {binaryKind === 'image' ? (
                <img src={binaryPreviewUrl} alt={tab.name || 'image preview'} className="binary-preview-image" />
              ) : binaryKind === 'audio' ? (
                <InlineAudioPlayer src={binaryPreviewUrl} name={tab.name || ''} />
              ) : binaryKind === 'video' ? (
                <InlineVideoPlayer src={binaryPreviewUrl} name={tab.name || ''} />
              ) : (
                <iframe title={tab.name || 'PDF preview'} src={binaryPreviewUrl} className="binary-preview-pdf" />
              )}
            </div>
          ) : (
            <Editor
              height="100%"
              theme={settings?.theme?.active || 'tilder-formal'}
                language="plaintext"
                value={tab.content}
                onChange={onChange}
                onMount={handleMount}
                options={{
                  ...editorOptions,
                  glyphMargin: false,
                  wordWrap: 'on',
                  minimap: { enabled: false },
                }}
            />
          )}
        </div>
      ) : (
        <Editor
          height="100%"
          theme={settings?.theme?.active || 'tilder-formal'}
          language={effectiveLanguage}
            value={tab.content}
            onChange={onChange}
            onMount={handleMount}
            options={editorOptions}
          />
        )}
      </div>
  );
}

