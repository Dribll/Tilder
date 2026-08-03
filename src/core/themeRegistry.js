/**
 * themeRegistry.js
 * Centralized theme management for Tilder, supporting extension-based themes.
 */

// Helper to convert hex to rgb string "R, G, B"
function hexToRgb(hex) {
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

const BUILT_IN_THEMES = [
  {
    id: 'tilder-formal',
    label: 'Tilder Formal (Default)',
    category: 'Dark',
    colors: {
      '--main-bg-color': '#0d1117',
      '--content-box-bg-color': '#0d1117',
      '--subdropdown-box-bg-color': '#161b22',
      '--trigger-btn-dropdown-hover': '#21262d',
      '--trigger-btn-subdropdown-hover': '#21262d',
      '--sidebar-icons-hover': 'rgba(124, 111, 204, 0.25)',
      '--li-hover': '#21262d',
      '--a-hover': '#c9d1d9',
      '--tab-bg-color': '#0d1117',
      '--body-main-bg-color': '#010409',
      '--welcome-page': '#0d1117',
      '--fa-primary-color': '#a79dff',
      '--dialogue-color': '#161b22',
      '--dialogue-border-color': '1px solid #30363d',
      '--file-options-hover': '#7c6fcc',
      '--modal-box-color': '#161b22',
      '--accent-color': '#7c6fcc',
      '--tilder-active-glow': '0 0 12px rgba(124, 111, 204, 0.25)',
      '--tilder-border-highlight': '1px solid #30363d',
      '--tilder-shadow': '0 8px 24px rgba(1, 4, 9, 0.8)',
      '--primary-gradient-1': '#5a4fa0',
      '--primary-gradient-2': '#7c6fcc'
    }
  },
  {
    id: 'tilder-violet',
    label: 'Tilder Violet',
    category: 'Dark',
    colors: {
      '--main-bg-color': '#10131a',
      '--content-box-bg-color': '#171a28',
      '--subdropdown-box-bg-color': '#1d2032',
      '--trigger-btn-dropdown-hover': 'rgba(122, 116, 208, 0.16)',
      '--trigger-btn-subdropdown-hover': 'rgba(122, 116, 208, 0.16)',
      '--sidebar-icons-hover': 'rgba(108, 104, 194, 0.18)',
      '--li-hover': '#e4ecff11',
      '--a-hover': '#e4ecff',
      '--tab-bg-color': '#1b1d33',
      '--body-main-bg-color': '#04060b',
      '--welcome-page': '#090c13',
      '--fa-primary-color': '#a79dff',
      '--dialogue-color': '#1d2032',
      '--dialogue-border-color': '1px solid rgba(145, 137, 255, 0.2)',
      '--file-options-hover': '#cbc2ff',
      '--modal-box-color': '#171a28',
      '--accent-color': '#a79dff',
      '--tilder-active-glow': '0 0 15px rgba(145, 137, 255, 0.25)',
      '--tilder-border-highlight': '1px solid rgba(145, 137, 255, 0.2)',
      '--tilder-shadow': '0 8px 32px rgba(0, 0, 0, 0.5)',
      '--primary-gradient-1': '#6f6c99',
      '--primary-gradient-2': '#a79dff'
    }
  },
  {
    id: 'tilder-retro',
    label: 'Tilder Retro',
    category: 'Dark',
    colors: {
      '--main-bg-color': 'rgb(39, 40, 34)',
      '--content-box-bg-color': 'rgb(46, 47, 41)',
      '--subdropdown-box-bg-color': 'rgb(62, 61, 50)',
      '--trigger-btn-dropdown-hover': 'rgba(249, 38, 114, 0.4)',
      '--trigger-btn-subdropdown-hover': 'rgba(249, 38, 114, 0.4)',
      '--sidebar-icons-hover': 'rgba(255, 255, 255, 0.1)',
      '--li-hover': 'rgba(255, 255, 255, 0.1)',
      '--a-hover': 'rgba(255, 255, 255, 0.8)',
      '--tab-bg-color': 'rgb(34, 35, 30)',
      '--body-main-bg-color': 'rgb(30, 31, 28)',
      '--welcome-page': 'rgb(39, 40, 34)',
      '--fa-primary-color': '#a6e22e',
      '--dialogue-color': 'rgb(62, 61, 50)',
      '--dialogue-border-color': '1px solid rgba(255, 255, 255, 0.1)',
      '--file-options-hover': '#f92672',
      '--modal-box-color': 'rgb(62, 61, 50)',
      '--accent-color': '#f92672',
      '--tilder-active-glow': '0 0 15px rgba(249, 38, 114, 0.4)',
      '--tilder-border-highlight': '1px solid rgba(255, 255, 255, 0.05)',
      '--tilder-shadow': '0 8px 24px rgba(0, 0, 0, 0.6)',
      '--primary-gradient-1': '#f92672',
      '--primary-gradient-2': '#fd5ff0'
    }
  },
  {
    id: 'tilder-frost',
    label: 'Tilder Frost',
    category: 'Dark',
    colors: {
      '--main-bg-color': 'rgb(36, 41, 51)',
      '--content-box-bg-color': 'rgb(46, 52, 64)',
      '--subdropdown-box-bg-color': 'rgb(59, 66, 82)',
      '--trigger-btn-dropdown-hover': 'rgba(136, 192, 208, 0.3)',
      '--trigger-btn-subdropdown-hover': 'rgba(136, 192, 208, 0.3)',
      '--sidebar-icons-hover': 'rgba(255, 255, 255, 0.1)',
      '--li-hover': 'rgba(255, 255, 255, 0.1)',
      '--a-hover': 'rgba(255, 255, 255, 0.8)',
      '--tab-bg-color': 'rgb(33, 37, 46)',
      '--body-main-bg-color': 'rgb(29, 33, 42)',
      '--welcome-page': 'rgb(46, 52, 64)',
      '--fa-primary-color': '#8fbcbb',
      '--dialogue-color': 'rgb(67, 76, 94)',
      '--dialogue-border-color': '1px solid rgba(255, 255, 255, 0.1)',
      '--file-options-hover': '#81a1c1',
      '--modal-box-color': 'rgb(67, 76, 94)',
      '--accent-color': '#88c0d0',
      '--tilder-active-glow': '0 0 15px rgba(136, 192, 208, 0.4)',
      '--tilder-border-highlight': '1px solid rgba(255, 255, 255, 0.05)',
      '--tilder-shadow': '0 8px 24px rgba(0, 0, 0, 0.6)',
      '--primary-gradient-1': '#5e81ac',
      '--primary-gradient-2': '#81a1c1'
    }
  },
  {
    id: 'tilder-neon',
    label: 'Tilder Neon',
    category: 'Dark',
    colors: {
      '--main-bg-color': 'rgb(24, 5, 38)',
      '--content-box-bg-color': 'rgb(35, 8, 55)',
      '--subdropdown-box-bg-color': 'rgb(55, 12, 86)',
      '--trigger-btn-dropdown-hover': 'rgba(255, 0, 85, 0.5)',
      '--trigger-btn-subdropdown-hover': 'rgba(255, 0, 85, 0.5)',
      '--sidebar-icons-hover': 'rgba(255, 255, 255, 0.15)',
      '--li-hover': 'rgba(255, 255, 255, 0.1)',
      '--a-hover': 'rgba(255, 255, 255, 0.8)',
      '--tab-bg-color': 'rgb(20, 4, 32)',
      '--body-main-bg-color': 'rgb(13, 2, 20)',
      '--welcome-page': 'rgb(35, 8, 55)',
      '--fa-primary-color': '#00ffff',
      '--dialogue-color': 'rgb(55, 12, 86)',
      '--dialogue-border-color': '1px solid rgba(0, 255, 255, 0.3)',
      '--file-options-hover': '#ff0055',
      '--modal-box-color': 'rgb(55, 12, 86)',
      '--accent-color': '#ff0055',
      '--tilder-active-glow': '0 0 15px rgba(255, 0, 85, 0.6)',
      '--tilder-border-highlight': '1px solid rgba(255, 0, 85, 0.2)',
      '--tilder-shadow': '0 8px 24px rgba(0, 0, 0, 0.6)',
      '--primary-gradient-1': '#ff0055',
      '--primary-gradient-2': '#00ffff'
    }
  },
  {
    id: 'tilder-solar',
    label: 'Tilder Solar',
    category: 'Dark',
    colors: {
      '--main-bg-color': 'rgb(7, 54, 66)',
      '--content-box-bg-color': 'rgb(10, 68, 83)',
      '--subdropdown-box-bg-color': 'rgb(12, 84, 102)',
      '--trigger-btn-dropdown-hover': 'rgba(42, 161, 152, 0.3)',
      '--trigger-btn-subdropdown-hover': 'rgba(42, 161, 152, 0.3)',
      '--sidebar-icons-hover': 'rgba(255, 255, 255, 0.1)',
      '--li-hover': 'rgba(255, 255, 255, 0.1)',
      '--a-hover': 'rgba(255, 255, 255, 0.8)',
      '--tab-bg-color': 'rgb(5, 43, 53)',
      '--body-main-bg-color': 'rgb(0, 43, 54)',
      '--welcome-page': 'rgb(10, 68, 83)',
      '--fa-primary-color': '#268bd2',
      '--dialogue-color': 'rgb(12, 84, 102)',
      '--dialogue-border-color': '1px solid rgba(255, 255, 255, 0.1)',
      '--file-options-hover': '#2aa198',
      '--modal-box-color': 'rgb(12, 84, 102)',
      '--accent-color': '#2aa198',
      '--tilder-active-glow': '0 0 15px rgba(42, 161, 152, 0.4)',
      '--tilder-border-highlight': '1px solid rgba(255, 255, 255, 0.05)',
      '--tilder-shadow': '0 8px 24px rgba(0, 0, 0, 0.6)',
      '--primary-gradient-1': '#2aa198',
      '--primary-gradient-2': '#859900'
    }
  },
  {
    id: 'tilder-light',
    label: 'Tilder Light',
    category: 'Light',
    colors: {
      '--main-bg-color': '#f3f4f6',
      '--content-box-bg-color': '#ffffff',
      '--subdropdown-box-bg-color': '#f9fafb',
      '--trigger-btn-dropdown-hover': '#e5e7eb',
      '--trigger-btn-subdropdown-hover': '#e5e7eb',
      '--sidebar-icons-hover': 'rgba(124, 111, 204, 0.15)',
      '--li-hover': '#e5e7eb',
      '--a-hover': '#111827',
      '--tab-bg-color': '#e5e7eb',
      '--body-main-bg-color': '#e5e7eb',
      '--welcome-page': '#ffffff',
      '--fa-primary-color': '#7c6fcc',
      '--dialogue-color': '#ffffff',
      '--dialogue-border-color': '1px solid #d1d5db',
      '--file-options-hover': '#6b5ebd',
      '--modal-box-color': '#ffffff',
      '--accent-color': '#7c6fcc',
      '--tilder-active-glow': '0 0 12px rgba(124, 111, 204, 0.35)',
      '--tilder-border-highlight': '1px solid #d1d5db',
      '--tilder-shadow': '0 8px 24px rgba(0, 0, 0, 0.15)',
      '--primary-gradient-1': '#7c6fcc',
      '--primary-gradient-2': '#9d94ff'
    }
  },
  {
    id: 'tilder-tahoe',
    label: 'Tilder Tahoe (Glass)',
    category: 'Dark',
    colors: {
      '--main-bg-color': 'transparent',
      '--content-box-bg-color': 'rgba(28, 28, 30, 0.15)',
      '--subdropdown-box-bg-color': 'rgba(44, 44, 46, 0.4)',
      '--trigger-btn-dropdown-hover': 'rgba(255, 255, 255, 0.12)',
      '--trigger-btn-subdropdown-hover': 'rgba(255, 255, 255, 0.15)',
      '--sidebar-icons-hover': 'rgba(255, 255, 255, 0.2)',
      '--li-hover': 'rgba(255, 255, 255, 0.1)',
      '--a-hover': '#ffffff',
      '--tab-bg-color': 'transparent',
      '--body-main-bg-color': 'transparent',
      '--welcome-page': 'rgba(28, 28, 30, 0.15)',
      '--fa-primary-color': '#0a84ff',
      '--dialogue-color': 'rgba(44, 44, 46, 0.45)',
      '--dialogue-border-color': '1px solid rgba(255, 255, 255, 0.15)',
      '--file-options-hover': '#5e5ce6',
      '--modal-box-color': 'rgba(44, 44, 46, 0.4)',
      '--accent-color': '#0a84ff',
      '--tilder-active-glow': '0 0 10px rgba(10, 132, 255, 0.3)',
      '--tilder-border-highlight': '1px solid rgba(255, 255, 255, 0.15)',
      '--tilder-shadow': '0 12px 32px rgba(0, 0, 0, 0.4)',
      '--primary-gradient-1': '#0a84ff',
      '--primary-gradient-2': '#5e5ce6'
    }
  }
];

const registeredThemes = [...BUILT_IN_THEMES];

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

export function applyTheme(themeId, aesthetics = {}) {
  let theme = registeredThemes.find(t => t.id === themeId);
  if (!theme) {
    theme = registeredThemes[0];
  }
  
  const root = document.documentElement;
  
  if (typeof document !== 'undefined') {
      document.body.dataset.theme = themeId;
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
  
  // Apply glassmorphism panel background based on computed rgb
  if (aesthetics.glassmorphism || themeId === 'tilder-tahoe') {
    let bgRgb = root.style.getPropertyValue('--main-bg-color-rgb');
    if (!bgRgb || bgRgb === 'undefined') {
        bgRgb = themeId === 'tilder-tahoe' ? '28, 28, 30' : '14, 14, 18';
    }
    const opacity = themeId === 'tilder-tahoe' ? 0.15 : (aesthetics.sidebarOpacity !== undefined ? aesthetics.sidebarOpacity : 0.7);
    root.style.setProperty('--tilder-panel-bg', `rgba(${bgRgb}, ${opacity})`);
    root.style.setProperty('--tilder-panel-blur', themeId === 'tilder-tahoe' ? 'blur(40px) saturate(200%)' : `blur(${aesthetics.blurStrength || 10}px)`);
  } else {
    const bg = root.style.getPropertyValue('--main-bg-color') || '#1e1e1e';
    root.style.setProperty('--tilder-panel-bg', bg);
    root.style.setProperty('--tilder-panel-blur', 'none');
  }

  // Toggle native OS window vibrancy using Tauri IPC
  if (typeof window !== 'undefined' && (window.__TILDER_RUNTIME_MODE__ === 'desktop-local' || window.__TILDER_RUNTIME_MODE__ === 'desktop')) {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      if (themeId === 'tilder-tahoe') {
        invoke('enable_glass_theme').catch(console.warn);
      } else {
        invoke('disable_glass_theme').catch(console.warn);
      }
    }).catch(console.error);
  }
}

if (typeof window !== 'undefined') {
  window.tilder = window.tilder || {};
  window.tilder.theme = window.tilder.theme || {};
  window.tilder.theme.registerTheme = registerTheme;
  window.tilder.theme.getThemes = getThemes;
  window.tilder.theme.applyTheme = applyTheme;
}
