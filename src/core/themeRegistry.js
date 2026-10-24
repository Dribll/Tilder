/**
 * themeRegistry.js
 * Centralized theme management for Tilder, supporting extension-based themes
 * and complete Monaco editor theme integration.
 */

// Helper to convert hex to rgb string "R, G, B"
function hexToRgb(hex) {
  if (!hex) return '14, 14, 18';
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split('');
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = '0x' + c.join('');
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(', ');
  }
  const rgbMatch = hex.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
  }
  return '14, 14, 18';
}

const COMMON_OVERVIEW_RULER_COLORS = {
  'editorOverviewRuler.addedForeground': '#3fb95099',
  'editorOverviewRuler.modifiedForeground': '#d2992299',
  'editorOverviewRuler.deletedForeground': '#f8514999',
  'editorOverviewRuler.errorForeground': '#ff537099',
  'editorOverviewRuler.warningForeground': '#ffcb6b99',
  'editorOverviewRuler.infoForeground': '#82aaff99',
  'editorOverviewRuler.currentContentForeground': '#7c5cfc99',
  'editorOverviewRuler.incomingContentForeground': '#3fb95099',
  'minimapGutter.addedBackground': '#3fb950cc',
  'minimapGutter.modifiedBackground': '#d29922cc',
  'minimapGutter.deletedBackground': '#f85149cc',
};

const BUILT_IN_THEMES = [
  {
    id: 'tilder-formal',
    label: 'Tilder Pro Obsidian (Default)',
    category: 'Dark',
    preview: ['#0b0f17', '#161c2b', '#6366f1'],
    colors: {
      '--main-bg-color': '#0e131d',
      '--content-box-bg-color': '#131824',
      '--subdropdown-box-bg-color': '#1a2233',
      '--trigger-btn-dropdown-hover': 'rgba(99, 102, 241, 0.18)',
      '--trigger-btn-subdropdown-hover': 'rgba(99, 102, 241, 0.22)',
      '--sidebar-icons-hover': 'rgba(99, 102, 241, 0.25)',
      '--li-hover': 'rgba(99, 102, 241, 0.15)',
      '--a-hover': '#e2e8f0',
      '--tab-bg-color': '#0e131d',
      '--body-main-bg-color': '#080b11',
      '--welcome-page': '#131824',
      '--fa-primary-color': '#818cf8',
      '--dialogue-color': '#1a2233',
      '--dialogue-border-color': '1px solid rgba(99, 102, 241, 0.25)',
      '--file-options-hover': '#818cf8',
      '--modal-box-color': '#161c2b',
      '--accent-color': '#6366f1',
      '--tilder-active-glow': '0 0 16px rgba(99, 102, 241, 0.35)',
      '--tilder-border-highlight': '1px solid rgba(99, 102, 241, 0.18)',
      '--tilder-shadow': '0 10px 30px rgba(5, 7, 12, 0.85)',
      '--primary-gradient-1': '#4f46e5',
      '--primary-gradient-2': '#818cf8'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'f43f5e' },
        { token: 'keyword.control', foreground: 'f43f5e' },
        { token: 'string', foreground: '10b981' },
        { token: 'number', foreground: 'f59e0b' },
        { token: 'type', foreground: '38bdf8' },
        { token: 'type.identifier', foreground: '38bdf8' },
        { token: 'function', foreground: '818cf8' },
        { token: 'identifier', foreground: 'e2e8f0' },
        { token: 'delimiter', foreground: '94a3b8' },
        { token: 'operator', foreground: '38bdf8' }
      ],
      colors: {
        'editor.background': '#131824',
        'editor.foreground': '#e2e8f0',
        'editorCursor.foreground': '#818cf8',
        'editor.lineHighlightBackground': '#182030',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#c7d2fe',
        'editor.selectionBackground': '#2d3b59',
        'editor.inactiveSelectionBackground': '#1e283d',
        'editorIndentGuide.background1': '#1e273b',
        'editorIndentGuide.activeBackground1': '#4f46e5',
        'editorWidget.background': '#161c2b',
        'editorWidget.border': '#2d3b59',
        'editorSuggestWidget.background': '#161c2b',
        'editorSuggestWidget.border': '#2d3b59',
        'editorSuggestWidget.selectedBackground': '#242f4a',
        'editorHoverWidget.background': '#161c2b',
        'editorHoverWidget.border': '#2d3b59',
        'scrollbarSlider.background': '#33415566',
        'scrollbarSlider.hoverBackground': '#47556999',
        'scrollbarSlider.activeBackground': '#6366f1aa',
        'editorError.foreground': '#f43f5e',
        'editorWarning.foreground': '#f59e0b',
        'editorInfo.foreground': '#38bdf8',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-violet',
    label: 'Tilder Cyber Violet',
    category: 'Dark',
    preview: ['#07050e', '#140d28', '#a855f7'],
    colors: {
      '--main-bg-color': '#0c0819',
      '--content-box-bg-color': '#120c24',
      '--subdropdown-box-bg-color': '#1a1233',
      '--trigger-btn-dropdown-hover': 'rgba(168, 85, 247, 0.22)',
      '--trigger-btn-subdropdown-hover': 'rgba(168, 85, 247, 0.26)',
      '--sidebar-icons-hover': 'rgba(168, 85, 247, 0.25)',
      '--li-hover': 'rgba(168, 85, 247, 0.18)',
      '--a-hover': '#f3e8ff',
      '--tab-bg-color': '#0c0819',
      '--body-main-bg-color': '#06040c',
      '--welcome-page': '#120c24',
      '--fa-primary-color': '#c084fc',
      '--dialogue-color': '#1a1233',
      '--dialogue-border-color': '1px solid rgba(168, 85, 247, 0.3)',
      '--file-options-hover': '#c084fc',
      '--modal-box-color': '#150e2a',
      '--accent-color': '#a855f7',
      '--tilder-active-glow': '0 0 18px rgba(168, 85, 247, 0.45)',
      '--tilder-border-highlight': '1px solid rgba(168, 85, 247, 0.25)',
      '--tilder-shadow': '0 10px 32px rgba(4, 2, 8, 0.9)',
      '--primary-gradient-1': '#7c3aed',
      '--primary-gradient-2': '#c084fc'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '786a95', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'f472b6' },
        { token: 'keyword.control', foreground: 'f472b6' },
        { token: 'string', foreground: '34d399' },
        { token: 'number', foreground: 'fb923c' },
        { token: 'type', foreground: '67e8f9' },
        { token: 'type.identifier', foreground: '67e8f9' },
        { token: 'function', foreground: 'c084fc' },
        { token: 'identifier', foreground: 'f3e8ff' },
        { token: 'delimiter', foreground: 'a78bfa' },
        { token: 'operator', foreground: 'e879f9' }
      ],
      colors: {
        'editor.background': '#120c24',
        'editor.foreground': '#f3e8ff',
        'editorCursor.foreground': '#c084fc',
        'editor.lineHighlightBackground': '#1a1233',
        'editorLineNumber.foreground': '#5c4e78',
        'editorLineNumber.activeForeground': '#e9d5ff',
        'editor.selectionBackground': '#3e1d6d',
        'editor.inactiveSelectionBackground': '#2a144a',
        'editorIndentGuide.background1': '#221542',
        'editorIndentGuide.activeBackground1': '#9333ea',
        'editorWidget.background': '#160e2e',
        'editorWidget.border': '#3e1d6d',
        'editorSuggestWidget.background': '#160e2e',
        'editorSuggestWidget.border': '#3e1d6d',
        'editorSuggestWidget.selectedBackground': '#2d1557',
        'editorHoverWidget.background': '#160e2e',
        'editorHoverWidget.border': '#3e1d6d',
        'scrollbarSlider.background': '#4c288266',
        'scrollbarSlider.hoverBackground': '#6b36b599',
        'scrollbarSlider.activeBackground': '#a855f7aa',
        'editorError.foreground': '#f43f5e',
        'editorWarning.foreground': '#fb923c',
        'editorInfo.foreground': '#c084fc',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-retro',
    label: 'Tilder Monokai Pro',
    category: 'Dark',
    preview: ['#171618', '#262327', '#ffd866'],
    colors: {
      '--main-bg-color': '#1d1b1e',
      '--content-box-bg-color': '#242226',
      '--subdropdown-box-bg-color': '#2e2b30',
      '--trigger-btn-dropdown-hover': 'rgba(255, 97, 136, 0.25)',
      '--trigger-btn-subdropdown-hover': 'rgba(255, 97, 136, 0.3)',
      '--sidebar-icons-hover': 'rgba(255, 216, 102, 0.22)',
      '--li-hover': 'rgba(255, 255, 255, 0.08)',
      '--a-hover': '#ffd866',
      '--tab-bg-color': '#1d1b1e',
      '--body-main-bg-color': '#141315',
      '--welcome-page': '#242226',
      '--fa-primary-color': '#ffd866',
      '--dialogue-color': '#2e2b30',
      '--dialogue-border-color': '1px solid rgba(255, 216, 102, 0.25)',
      '--file-options-hover': '#ff6188',
      '--modal-box-color': '#262327',
      '--accent-color': '#ffd866',
      '--tilder-active-glow': '0 0 16px rgba(255, 216, 102, 0.4)',
      '--tilder-border-highlight': '1px solid rgba(255, 216, 102, 0.18)',
      '--tilder-shadow': '0 10px 30px rgba(0, 0, 0, 0.8)',
      '--primary-gradient-1': '#ff6188',
      '--primary-gradient-2': '#ffd866'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '727072', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff6188' },
        { token: 'keyword.control', foreground: 'ff6188' },
        { token: 'string', foreground: 'ffd866' },
        { token: 'number', foreground: 'ab9df2' },
        { token: 'type', foreground: '78dce8' },
        { token: 'type.identifier', foreground: '78dce8' },
        { token: 'function', foreground: 'a9dc76' },
        { token: 'identifier', foreground: 'fcfcfa' },
        { token: 'delimiter', foreground: '939293' },
        { token: 'operator', foreground: 'ff6188' }
      ],
      colors: {
        'editor.background': '#242226',
        'editor.foreground': '#fcfcfa',
        'editorCursor.foreground': '#ffd866',
        'editor.lineHighlightBackground': '#2e2b30',
        'editorLineNumber.foreground': '#5c585c',
        'editorLineNumber.activeForeground': '#ffd866',
        'editor.selectionBackground': '#4e484f',
        'editor.inactiveSelectionBackground': '#363337',
        'editorIndentGuide.background1': '#343135',
        'editorIndentGuide.activeBackground1': '#ffd866',
        'editorWidget.background': '#2b282c',
        'editorWidget.border': '#4e484f',
        'editorSuggestWidget.background': '#2b282c',
        'editorSuggestWidget.border': '#4e484f',
        'editorSuggestWidget.selectedBackground': '#3b373d',
        'editorHoverWidget.background': '#2b282c',
        'editorHoverWidget.border': '#4e484f',
        'scrollbarSlider.background': '#5c585c66',
        'scrollbarSlider.hoverBackground': '#72707299',
        'scrollbarSlider.activeBackground': '#ffd866aa',
        'editorError.foreground': '#ff6188',
        'editorWarning.foreground': '#ffd866',
        'editorInfo.foreground': '#78dce8',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-frost',
    label: 'Tilder Arctic Nord',
    category: 'Dark',
    preview: ['#171a21', '#242933', '#88c0d0'],
    colors: {
      '--main-bg-color': '#1c202a',
      '--content-box-bg-color': '#222732',
      '--subdropdown-box-bg-color': '#2b313f',
      '--trigger-btn-dropdown-hover': 'rgba(136, 192, 208, 0.22)',
      '--trigger-btn-subdropdown-hover': 'rgba(136, 192, 208, 0.28)',
      '--sidebar-icons-hover': 'rgba(136, 192, 208, 0.22)',
      '--li-hover': 'rgba(136, 192, 208, 0.12)',
      '--a-hover': '#e5e9f0',
      '--tab-bg-color': '#1c202a',
      '--body-main-bg-color': '#13161c',
      '--welcome-page': '#222732',
      '--fa-primary-color': '#88c0d0',
      '--dialogue-color': '#2b313f',
      '--dialogue-border-color': '1px solid rgba(136, 192, 208, 0.25)',
      '--file-options-hover': '#81a1c1',
      '--modal-box-color': '#242933',
      '--accent-color': '#88c0d0',
      '--tilder-active-glow': '0 0 16px rgba(136, 192, 208, 0.38)',
      '--tilder-border-highlight': '1px solid rgba(136, 192, 208, 0.2)',
      '--tilder-shadow': '0 10px 30px rgba(10, 13, 18, 0.85)',
      '--primary-gradient-1': '#5e81ac',
      '--primary-gradient-2': '#88c0d0'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '616e88', fontStyle: 'italic' },
        { token: 'keyword', foreground: '81a1c1' },
        { token: 'keyword.control', foreground: '81a1c1' },
        { token: 'string', foreground: 'a3be8c' },
        { token: 'number', foreground: 'b48ead' },
        { token: 'type', foreground: 'ebcb8b' },
        { token: 'type.identifier', foreground: 'ebcb8b' },
        { token: 'function', foreground: '88c0d0' },
        { token: 'identifier', foreground: 'eceff4' },
        { token: 'delimiter', foreground: 'd8dee9' },
        { token: 'operator', foreground: '81a1c1' }
      ],
      colors: {
        'editor.background': '#222732',
        'editor.foreground': '#eceff4',
        'editorCursor.foreground': '#88c0d0',
        'editor.lineHighlightBackground': '#2b313f',
        'editorLineNumber.foreground': '#4c566a',
        'editorLineNumber.activeForeground': '#88c0d0',
        'editor.selectionBackground': '#3b4252',
        'editor.inactiveSelectionBackground': '#2e3440',
        'editorIndentGuide.background1': '#2e3440',
        'editorIndentGuide.activeBackground1': '#88c0d0',
        'editorWidget.background': '#262c38',
        'editorWidget.border': '#3b4252',
        'editorSuggestWidget.background': '#262c38',
        'editorSuggestWidget.border': '#3b4252',
        'editorSuggestWidget.selectedBackground': '#323a4a',
        'editorHoverWidget.background': '#262c38',
        'editorHoverWidget.border': '#3b4252',
        'scrollbarSlider.background': '#434c5e66',
        'scrollbarSlider.hoverBackground': '#4c566a99',
        'scrollbarSlider.activeBackground': '#88c0d0aa',
        'editorError.foreground': '#bf616a',
        'editorWarning.foreground': '#ebcb8b',
        'editorInfo.foreground': '#88c0d0',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-neon',
    label: 'Tilder Cyberpunk Neon',
    category: 'Dark',
    preview: ['#07040d', '#140a28', '#ff007f'],
    colors: {
      '--main-bg-color': '#0d071a',
      '--content-box-bg-color': '#130b24',
      '--subdropdown-box-bg-color': '#1d1036',
      '--trigger-btn-dropdown-hover': 'rgba(255, 0, 127, 0.28)',
      '--trigger-btn-subdropdown-hover': 'rgba(0, 245, 255, 0.28)',
      '--sidebar-icons-hover': 'rgba(0, 245, 255, 0.25)',
      '--li-hover': 'rgba(255, 0, 127, 0.16)',
      '--a-hover': '#00f5ff',
      '--tab-bg-color': '#0d071a',
      '--body-main-bg-color': '#05030a',
      '--welcome-page': '#130b24',
      '--fa-primary-color': '#00f5ff',
      '--dialogue-color': '#1d1036',
      '--dialogue-border-color': '1px solid rgba(0, 245, 255, 0.35)',
      '--file-options-hover': '#ff007f',
      '--modal-box-color': '#150c29',
      '--accent-color': '#ff007f',
      '--tilder-active-glow': '0 0 20px rgba(255, 0, 127, 0.55)',
      '--tilder-border-highlight': '1px solid rgba(0, 245, 255, 0.25)',
      '--tilder-shadow': '0 10px 32px rgba(0, 0, 0, 0.95)',
      '--primary-gradient-1': '#ff007f',
      '--primary-gradient-2': '#00f5ff'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6b5b82', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'ff007f' },
        { token: 'keyword.control', foreground: 'ff007f' },
        { token: 'string', foreground: '39ff14' },
        { token: 'number', foreground: 'ffe600' },
        { token: 'type', foreground: '00f5ff' },
        { token: 'type.identifier', foreground: '00f5ff' },
        { token: 'function', foreground: '00f5ff' },
        { token: 'identifier', foreground: 'e0f7fa' },
        { token: 'delimiter', foreground: 'd946ef' },
        { token: 'operator', foreground: 'ff007f' }
      ],
      colors: {
        'editor.background': '#130b24',
        'editor.foreground': '#e0f7fa',
        'editorCursor.foreground': '#ff007f',
        'editor.lineHighlightBackground': '#1d1036',
        'editorLineNumber.foreground': '#5c4873',
        'editorLineNumber.activeForeground': '#00f5ff',
        'editor.selectionBackground': '#4c0e4f',
        'editor.inactiveSelectionBackground': '#2d0a30',
        'editorIndentGuide.background1': '#261442',
        'editorIndentGuide.activeBackground1': '#00f5ff',
        'editorWidget.background': '#180d2e',
        'editorWidget.border': '#4c0e4f',
        'editorSuggestWidget.background': '#180d2e',
        'editorSuggestWidget.border': '#4c0e4f',
        'editorSuggestWidget.selectedBackground': '#301357',
        'editorHoverWidget.background': '#180d2e',
        'editorHoverWidget.border': '#4c0e4f',
        'scrollbarSlider.background': '#55156a66',
        'scrollbarSlider.hoverBackground': '#791a9799',
        'scrollbarSlider.activeBackground': '#ff007faa',
        'editorError.foreground': '#ff007f',
        'editorWarning.foreground': '#ffe600',
        'editorInfo.foreground': '#00f5ff',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-solar',
    label: 'Tilder Solarized Oceanic',
    category: 'Dark',
    preview: ['#00171f', '#002b36', '#2aa198'],
    colors: {
      '--main-bg-color': '#002029',
      '--content-box-bg-color': '#002731',
      '--subdropdown-box-bg-color': '#073642',
      '--trigger-btn-dropdown-hover': 'rgba(42, 161, 152, 0.25)',
      '--trigger-btn-subdropdown-hover': 'rgba(42, 161, 152, 0.3)',
      '--sidebar-icons-hover': 'rgba(42, 161, 152, 0.2)',
      '--li-hover': 'rgba(42, 161, 152, 0.14)',
      '--a-hover': '#93a1a1',
      '--tab-bg-color': '#002029',
      '--body-main-bg-color': '#00141b',
      '--welcome-page': '#002731',
      '--fa-primary-color': '#2aa198',
      '--dialogue-color': '#073642',
      '--dialogue-border-color': '1px solid rgba(42, 161, 152, 0.3)',
      '--file-options-hover': '#2aa198',
      '--modal-box-color': '#002b36',
      '--accent-color': '#2aa198',
      '--tilder-active-glow': '0 0 16px rgba(42, 161, 152, 0.38)',
      '--tilder-border-highlight': '1px solid rgba(42, 161, 152, 0.2)',
      '--tilder-shadow': '0 10px 30px rgba(0, 10, 15, 0.85)',
      '--primary-gradient-1': '#2aa198',
      '--primary-gradient-2': '#268bd2'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
        { token: 'keyword', foreground: '859900' },
        { token: 'keyword.control', foreground: '859900' },
        { token: 'string', foreground: '2aa198' },
        { token: 'number', foreground: 'd33682' },
        { token: 'type', foreground: 'b58900' },
        { token: 'type.identifier', foreground: 'b58900' },
        { token: 'function', foreground: '268bd2' },
        { token: 'identifier', foreground: '93a1a1' },
        { token: 'delimiter', foreground: '657b83' },
        { token: 'operator', foreground: '859900' }
      ],
      colors: {
        'editor.background': '#002731',
        'editor.foreground': '#93a1a1',
        'editorCursor.foreground': '#2aa198',
        'editor.lineHighlightBackground': '#073642',
        'editorLineNumber.foreground': '#3e5860',
        'editorLineNumber.activeForeground': '#2aa198',
        'editor.selectionBackground': '#0b424f',
        'editor.inactiveSelectionBackground': '#05313b',
        'editorIndentGuide.background1': '#073642',
        'editorIndentGuide.activeBackground1': '#2aa198',
        'editorWidget.background': '#002b36',
        'editorWidget.border': '#073642',
        'editorSuggestWidget.background': '#002b36',
        'editorSuggestWidget.border': '#073642',
        'editorSuggestWidget.selectedBackground': '#0b424f',
        'editorHoverWidget.background': '#002b36',
        'editorHoverWidget.border': '#073642',
        'scrollbarSlider.background': '#07364288',
        'scrollbarSlider.hoverBackground': '#0b424fcc',
        'scrollbarSlider.activeBackground': '#2aa198aa',
        'editorError.foreground': '#dc322f',
        'editorWarning.foreground': '#b58900',
        'editorInfo.foreground': '#268bd2',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-midnight',
    label: 'Tilder OLED Midnight',
    category: 'Dark',
    preview: ['#000000', '#101014', '#38bdf8'],
    colors: {
      '--main-bg-color': '#08080a',
      '--content-box-bg-color': '#0e0e12',
      '--subdropdown-box-bg-color': '#16161b',
      '--trigger-btn-dropdown-hover': 'rgba(56, 189, 248, 0.2)',
      '--trigger-btn-subdropdown-hover': 'rgba(56, 189, 248, 0.25)',
      '--sidebar-icons-hover': 'rgba(56, 189, 248, 0.22)',
      '--li-hover': 'rgba(255, 255, 255, 0.08)',
      '--a-hover': '#38bdf8',
      '--tab-bg-color': '#08080a',
      '--body-main-bg-color': '#000000',
      '--welcome-page': '#0e0e12',
      '--fa-primary-color': '#38bdf8',
      '--dialogue-color': '#16161b',
      '--dialogue-border-color': '1px solid rgba(56, 189, 248, 0.25)',
      '--file-options-hover': '#38bdf8',
      '--modal-box-color': '#101014',
      '--accent-color': '#38bdf8',
      '--tilder-active-glow': '0 0 18px rgba(56, 189, 248, 0.42)',
      '--tilder-border-highlight': '1px solid rgba(255, 255, 255, 0.12)',
      '--tilder-shadow': '0 12px 36px rgba(0, 0, 0, 0.98)',
      '--primary-gradient-1': '#0284c7',
      '--primary-gradient-2': '#38bdf8'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '52525b', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'f43f5e' },
        { token: 'keyword.control', foreground: 'f43f5e' },
        { token: 'string', foreground: '4ade80' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'type', foreground: 'a78bfa' },
        { token: 'type.identifier', foreground: 'a78bfa' },
        { token: 'function', foreground: '38bdf8' },
        { token: 'identifier', foreground: 'f1f5f9' },
        { token: 'delimiter', foreground: '71717a' },
        { token: 'operator', foreground: '38bdf8' }
      ],
      colors: {
        'editor.background': '#0e0e12',
        'editor.foreground': '#f1f5f9',
        'editorCursor.foreground': '#38bdf8',
        'editor.lineHighlightBackground': '#16161b',
        'editorLineNumber.foreground': '#3f3f46',
        'editorLineNumber.activeForeground': '#38bdf8',
        'editor.selectionBackground': '#1e293b',
        'editor.inactiveSelectionBackground': '#141c29',
        'editorIndentGuide.background1': '#18181b',
        'editorIndentGuide.activeBackground1': '#38bdf8',
        'editorWidget.background': '#131317',
        'editorWidget.border': '#27272a',
        'editorSuggestWidget.background': '#131317',
        'editorSuggestWidget.border': '#27272a',
        'editorSuggestWidget.selectedBackground': '#22222a',
        'editorHoverWidget.background': '#131317',
        'editorHoverWidget.border': '#27272a',
        'scrollbarSlider.background': '#3f3f4666',
        'scrollbarSlider.hoverBackground': '#52525b99',
        'scrollbarSlider.activeBackground': '#38bdf8aa',
        'editorError.foreground': '#f43f5e',
        'editorWarning.foreground': '#fbbf24',
        'editorInfo.foreground': '#38bdf8',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-emerald',
    label: 'Tilder Matrix Emerald',
    category: 'Dark',
    preview: ['#040a06', '#0d1e13', '#10b981'],
    colors: {
      '--main-bg-color': '#07130b',
      '--content-box-bg-color': '#0c1a10',
      '--subdropdown-box-bg-color': '#122619',
      '--trigger-btn-dropdown-hover': 'rgba(16, 185, 129, 0.22)',
      '--trigger-btn-subdropdown-hover': 'rgba(16, 185, 129, 0.28)',
      '--sidebar-icons-hover': 'rgba(16, 185, 129, 0.22)',
      '--li-hover': 'rgba(16, 185, 129, 0.14)',
      '--a-hover': '#34d399',
      '--tab-bg-color': '#07130b',
      '--body-main-bg-color': '#030704',
      '--welcome-page': '#0c1a10',
      '--fa-primary-color': '#34d399',
      '--dialogue-color': '#122619',
      '--dialogue-border-color': '1px solid rgba(16, 185, 129, 0.3)',
      '--file-options-hover': '#10b981',
      '--modal-box-color': '#0d1e13',
      '--accent-color': '#10b981',
      '--tilder-active-glow': '0 0 18px rgba(16, 185, 129, 0.42)',
      '--tilder-border-highlight': '1px solid rgba(16, 185, 129, 0.22)',
      '--tilder-shadow': '0 10px 32px rgba(2, 6, 3, 0.92)',
      '--primary-gradient-1': '#059669',
      '--primary-gradient-2': '#34d399'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '4b6a56', fontStyle: 'italic' },
        { token: 'keyword', foreground: '34d399' },
        { token: 'keyword.control', foreground: '34d399' },
        { token: 'string', foreground: 'a7f3d0' },
        { token: 'number', foreground: 'fde047' },
        { token: 'type', foreground: '67e8f9' },
        { token: 'type.identifier', foreground: '67e8f9' },
        { token: 'function', foreground: '6ee7b7' },
        { token: 'identifier', foreground: 'ecfdf5' },
        { token: 'delimiter', foreground: '5eead4' },
        { token: 'operator', foreground: '34d399' }
      ],
      colors: {
        'editor.background': '#0c1a10',
        'editor.foreground': '#ecfdf5',
        'editorCursor.foreground': '#34d399',
        'editor.lineHighlightBackground': '#122619',
        'editorLineNumber.foreground': '#285038',
        'editorLineNumber.activeForeground': '#34d399',
        'editor.selectionBackground': '#064e3b',
        'editor.inactiveSelectionBackground': '#04372a',
        'editorIndentGuide.background1': '#132d1d',
        'editorIndentGuide.activeBackground1': '#10b981',
        'editorWidget.background': '#0f2216',
        'editorWidget.border': '#064e3b',
        'editorSuggestWidget.background': '#0f2216',
        'editorSuggestWidget.border': '#064e3b',
        'editorSuggestWidget.selectedBackground': '#193925',
        'editorHoverWidget.background': '#0f2216',
        'editorHoverWidget.border': '#064e3b',
        'scrollbarSlider.background': '#1b4d3066',
        'scrollbarSlider.hoverBackground': '#246b4399',
        'scrollbarSlider.activeBackground': '#10b981aa',
        'editorError.foreground': '#f87171',
        'editorWarning.foreground': '#fde047',
        'editorInfo.foreground': '#34d399',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-amber',
    label: 'Tilder Warm Amber',
    category: 'Dark',
    preview: ['#0f0b08', '#1f1914', '#f59e0b'],
    colors: {
      '--main-bg-color': '#140f0b',
      '--content-box-bg-color': '#1c1611',
      '--subdropdown-box-bg-color': '#28201a',
      '--trigger-btn-dropdown-hover': 'rgba(245, 158, 11, 0.22)',
      '--trigger-btn-subdropdown-hover': 'rgba(245, 158, 11, 0.28)',
      '--sidebar-icons-hover': 'rgba(245, 158, 11, 0.2)',
      '--li-hover': 'rgba(245, 158, 11, 0.12)',
      '--a-hover': '#fbbf24',
      '--tab-bg-color': '#140f0b',
      '--body-main-bg-color': '#0a0705',
      '--welcome-page': '#1c1611',
      '--fa-primary-color': '#fbbf24',
      '--dialogue-color': '#28201a',
      '--dialogue-border-color': '1px solid rgba(245, 158, 11, 0.3)',
      '--file-options-hover': '#f59e0b',
      '--modal-box-color': '#1f1914',
      '--accent-color': '#f59e0b',
      '--tilder-active-glow': '0 0 18px rgba(245, 158, 11, 0.42)',
      '--tilder-border-highlight': '1px solid rgba(245, 158, 11, 0.2)',
      '--tilder-shadow': '0 10px 32px rgba(6, 4, 3, 0.92)',
      '--primary-gradient-1': '#d97706',
      '--primary-gradient-2': '#fbbf24'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '78604f', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'f87171' },
        { token: 'keyword.control', foreground: 'f87171' },
        { token: 'string', foreground: 'fde68a' },
        { token: 'number', foreground: 'fb923c' },
        { token: 'type', foreground: 'fdba74' },
        { token: 'type.identifier', foreground: 'fdba74' },
        { token: 'function', foreground: 'fbbf24' },
        { token: 'identifier', foreground: 'fef3c7' },
        { token: 'delimiter', foreground: 'b49c82' },
        { token: 'operator', foreground: 'fbbf24' }
      ],
      colors: {
        'editor.background': '#1c1611',
        'editor.foreground': '#fef3c7',
        'editorCursor.foreground': '#fbbf24',
        'editor.lineHighlightBackground': '#28201a',
        'editorLineNumber.foreground': '#5c483a',
        'editorLineNumber.activeForeground': '#fbbf24',
        'editor.selectionBackground': '#451a03',
        'editor.inactiveSelectionBackground': '#2e1202',
        'editorIndentGuide.background1': '#2b2118',
        'editorIndentGuide.activeBackground1': '#f59e0b',
        'editorWidget.background': '#231b14',
        'editorWidget.border': '#451a03',
        'editorSuggestWidget.background': '#231b14',
        'editorSuggestWidget.border': '#451a03',
        'editorSuggestWidget.selectedBackground': '#36291f',
        'editorHoverWidget.background': '#231b14',
        'editorHoverWidget.border': '#451a03',
        'scrollbarSlider.background': '#5c483a66',
        'scrollbarSlider.hoverBackground': '#7c624e99',
        'scrollbarSlider.activeBackground': '#f59e0baa',
        'editorError.foreground': '#f87171',
        'editorWarning.foreground': '#fbbf24',
        'editorInfo.foreground': '#fb923c',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-light',
    label: 'Tilder Pro Studio (Light)',
    category: 'Light',
    preview: ['#eef2f6', '#ffffff', '#4f46e5'],
    colors: {
      '--main-bg-color': '#f8fafc',
      '--content-box-bg-color': '#ffffff',
      '--subdropdown-box-bg-color': '#ffffff',
      '--trigger-btn-dropdown-hover': 'rgba(79, 70, 229, 0.1)',
      '--trigger-btn-subdropdown-hover': 'rgba(79, 70, 229, 0.14)',
      '--sidebar-icons-hover': 'rgba(79, 70, 229, 0.12)',
      '--li-hover': 'rgba(79, 70, 229, 0.08)',
      '--a-hover': '#0f172a',
      '--tab-bg-color': '#f1f5f9',
      '--body-main-bg-color': '#e2e8f0',
      '--welcome-page': '#ffffff',
      '--fa-primary-color': '#4f46e5',
      '--dialogue-color': '#ffffff',
      '--dialogue-border-color': '1px solid rgba(0, 0, 0, 0.12)',
      '--file-options-hover': '#4338ca',
      '--modal-box-color': '#ffffff',
      '--accent-color': '#4f46e5',
      '--tilder-active-glow': '0 0 12px rgba(79, 70, 229, 0.28)',
      '--tilder-border-highlight': '1px solid rgba(0, 0, 0, 0.1)',
      '--tilder-shadow': '0 8px 24px rgba(15, 23, 42, 0.12)',
      '--primary-gradient-1': '#4f46e5',
      '--primary-gradient-2': '#6366f1'
    },
    monaco: {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '94a3b8', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'cf222e' },
        { token: 'keyword.control', foreground: 'cf222e' },
        { token: 'string', foreground: '0a3069' },
        { token: 'number', foreground: '0969da' },
        { token: 'type', foreground: '953800' },
        { token: 'type.identifier', foreground: '953800' },
        { token: 'function', foreground: '6366f1' },
        { token: 'identifier', foreground: '1e293b' },
        { token: 'delimiter', foreground: '64748b' },
        { token: 'operator', foreground: 'cf222e' }
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#1e293b',
        'editorCursor.foreground': '#4f46e5',
        'editor.lineHighlightBackground': '#f8fafc',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#4f46e5',
        'editor.selectionBackground': '#c7d2fe',
        'editor.inactiveSelectionBackground': '#e0e7ff',
        'editorIndentGuide.background1': '#f1f5f9',
        'editorIndentGuide.activeBackground1': '#4f46e5',
        'editorWidget.background': '#ffffff',
        'editorWidget.border': '#cbd5e1',
        'editorSuggestWidget.background': '#ffffff',
        'editorSuggestWidget.border': '#cbd5e1',
        'editorSuggestWidget.selectedBackground': '#eef2ff',
        'editorHoverWidget.background': '#ffffff',
        'editorHoverWidget.border': '#cbd5e1',
        'scrollbarSlider.background': '#94a3b844',
        'scrollbarSlider.hoverBackground': '#64748b66',
        'scrollbarSlider.activeBackground': '#4f46e588',
        'editorError.foreground': '#cf222e',
        'editorWarning.foreground': '#d97706',
        'editorInfo.foreground': '#4f46e5',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  },
  {
    id: 'tilder-glass',
    label: 'Tilder Glass',
    category: 'Dark',
    preview: ['#121216', 'rgba(28, 28, 30, 0.5)', '#0a84ff'],
    colors: {
      '--main-bg-color': 'transparent',
      '--content-box-bg-color': 'rgba(28, 28, 30, 0.05)',
      '--subdropdown-box-bg-color': 'rgba(44, 44, 46, 0.2)',
      '--trigger-btn-dropdown-hover': 'rgba(255, 255, 255, 0.08)',
      '--trigger-btn-subdropdown-hover': 'rgba(255, 255, 255, 0.1)',
      '--sidebar-icons-hover': 'rgba(255, 255, 255, 0.15)',
      '--li-hover': 'rgba(255, 255, 255, 0.08)',
      '--a-hover': '#ffffff',
      '--tab-bg-color': 'transparent',
      '--body-main-bg-color': 'transparent',
      '--welcome-page': 'rgba(28, 28, 30, 0.05)',
      '--fa-primary-color': '#0a84ff',
      '--dialogue-color': 'rgba(44, 44, 46, 0.25)',
      '--dialogue-border-color': '1px solid rgba(255, 255, 255, 0.1)',
      '--file-options-hover': '#5e5ce6',
      '--modal-box-color': 'rgba(44, 44, 46, 0.2)',
      '--accent-color': '#0a84ff',
      '--tilder-active-glow': '0 0 10px rgba(10, 132, 255, 0.3)',
      '--tilder-border-highlight': '1px solid rgba(255, 255, 255, 0.1)',
      '--tilder-shadow': '0 12px 32px rgba(0, 0, 0, 0.4)',
      '--primary-gradient-1': '#0a84ff',
      '--primary-gradient-2': '#5e5ce6'
    },
    monaco: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6f7c99', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c7a3ff' },
        { token: 'string', foreground: '8fe388' },
        { token: 'number', foreground: 'ffd27a' },
        { token: 'type.identifier', foreground: '7dcfff' },
        { token: 'identifier', foreground: 'edf1ff' }
      ],
      colors: {
        'editor.background': '#0a0d16',
        'editor.foreground': '#edf1ff',
        'editorCursor.foreground': '#0a84ff',
        'editor.lineHighlightBackground': '#151a2a',
        'editorLineNumber.foreground': '#5b6685',
        'editorLineNumber.activeForeground': '#cdd7ff',
        'editor.selectionBackground': '#2d3560',
        'editor.inactiveSelectionBackground': '#232941',
        'editorIndentGuide.background1': '#1c2236',
        'editorIndentGuide.activeBackground1': '#0a84ff',
        'editorWidget.background': '#121726',
        'editorWidget.border': '#2f3760',
        'editorSuggestWidget.background': '#121726',
        'editorSuggestWidget.border': '#2f3760',
        'editorSuggestWidget.selectedBackground': '#242d4a',
        'editorHoverWidget.background': '#121726',
        'editorHoverWidget.border': '#2f3760',
        'scrollbarSlider.background': '#3a4470aa',
        'scrollbarSlider.hoverBackground': '#4b578faa',
        'scrollbarSlider.activeBackground': '#0a84ffaa',
        'editorError.foreground': '#ff5370',
        'editorWarning.foreground': '#ffcb6b',
        'editorInfo.foreground': '#0a84ff',
        ...COMMON_OVERVIEW_RULER_COLORS
      }
    }
  }
];

const registeredThemes = [...BUILT_IN_THEMES];

const THEME_ALIASES = {
  'tilder-tahoe': 'tilder-glass',
  'ultra-dark': 'tilder-formal',
  'monokai-retro': 'tilder-retro',
  'nordic-frost': 'tilder-frost',
  'cyberpunk-neon': 'tilder-neon',
  'midnight-purple': 'tilder-violet',
  'solarized-dark': 'tilder-solar',
};

export function registerTheme(themeDef) {
  const existingIndex = registeredThemes.findIndex(t => t.id === themeDef.id);
  if (existingIndex >= 0) {
    registeredThemes[existingIndex] = themeDef;
  } else {
    registeredThemes.push(themeDef);
  }
}

export function getThemes() {
  return registeredThemes;
}

export function registerMonacoThemes(monaco) {
  if (!monaco || !monaco.editor) return;
  registeredThemes.forEach(theme => {
    if (theme.monaco) {
      try {
        monaco.editor.defineTheme(theme.id, theme.monaco);
      } catch (_) {}
    }
  });

  // Legacy fallback alias
  const formalTheme = registeredThemes.find(t => t.id === 'tilder-formal');
  if (formalTheme && formalTheme.monaco) {
    try {
      monaco.editor.defineTheme('tilder-night', formalTheme.monaco);
    } catch (_) {}
  }
}

export function applyTheme(themeId, aesthetics = {}) {
  // Normalize aliases
  if (THEME_ALIASES[themeId]) {
    themeId = THEME_ALIASES[themeId];
  }
  let theme = registeredThemes.find(t => t.id === themeId);
  if (!theme) {
    theme = registeredThemes[0];
  }
  
  const root = document.documentElement;
  
  if (typeof document !== 'undefined') {
    document.body.dataset.theme = theme.id;
  }
  
  if (theme.colors) {
    for (const [key, value] of Object.entries(theme.colors)) {
      // Don't apply glow/highlight if they are disabled in aesthetics
      if (key === '--tilder-active-glow' && aesthetics.activeTabGlow === false) {
        root.style.setProperty(key, 'none');
        continue;
      }
      if (key === '--tilder-border-highlight' && aesthetics.borderGlow === false) {
        root.style.setProperty(key, 'none');
        continue;
      }

      root.style.setProperty(key, value);
      
      if (key.includes('bg-color') || key.includes('background')) {
        const rgbValue = hexToRgb(value);
        root.style.setProperty(`${key}-rgb`, rgbValue);
      }
    }
  }
  
  // Apply glassmorphism panel background
  // Glass is full-glass; all other dark themes get subtle semi-transparent glass
  if (theme.id === 'tilder-glass') {
    root.style.setProperty('--tilder-panel-bg', 'rgba(18, 18, 22, 0.55)');
    root.style.setProperty('--tilder-panel-blur', 'blur(5px) saturate(130%)');
    root.style.setProperty('--tilder-border-highlight', '1px solid rgba(255,255,255,0.10)');
  } else if (aesthetics.glassmorphism) {
    let bgRgb = root.style.getPropertyValue('--main-bg-color-rgb');
    if (!bgRgb || bgRgb === 'undefined') {
      bgRgb = '14, 14, 18';
    }
    const opacity = aesthetics.sidebarOpacity !== undefined ? aesthetics.sidebarOpacity : 0.72;
    root.style.setProperty('--tilder-panel-bg', `rgba(${bgRgb}, ${opacity})`);
    root.style.setProperty('--tilder-panel-blur', `blur(${aesthetics.blurStrength || 8}px)`);
  } else {
    // Default for all themes: gentle glass effect — semi-transparent with light blur
    let bgRgb = root.style.getPropertyValue('--main-bg-color-rgb');
    if (!bgRgb || bgRgb === 'undefined') {
      bgRgb = '14, 14, 18';
    }
    // Light themes get opacity 0.65, dark themes get 0.45 to show the true glass over body gradient
    const isLightTheme = theme.id === 'tilder-light';
    const opacity = isLightTheme ? 0.65 : 0.45;
    root.style.setProperty('--tilder-panel-bg', `rgba(${bgRgb}, ${opacity})`);
    root.style.setProperty('--tilder-panel-blur', 'blur(6px) saturate(120%)');
  }

  // Toggle native OS window vibrancy using Tauri IPC
  if (typeof window !== 'undefined' && (window.__TILDER_RUNTIME_MODE__ === 'desktop-local' || window.__TILDER_RUNTIME_MODE__ === 'desktop')) {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      if (theme.id === 'tilder-glass') {
        invoke('enable_glass_theme').catch(console.warn);
      } else {
        invoke('disable_glass_theme').catch(console.warn);
      }
    }).catch(console.error);
  }

  // Update global Monaco instance if available
  if (typeof window !== 'undefined' && window.monaco && window.monaco.editor) {
    try {
      window.monaco.editor.setTheme(theme.id);
    } catch (_) {}
  }
}

if (typeof window !== 'undefined') {
  window.tilder = window.tilder || {};
  window.tilder.theme = window.tilder.theme || {};
  window.tilder.theme.registerTheme = registerTheme;
  window.tilder.theme.getThemes = getThemes;
  window.tilder.theme.applyTheme = applyTheme;
  window.tilder.theme.registerMonacoThemes = registerMonacoThemes;
}
