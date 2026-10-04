// Inter-Window Synchronization Manager for Tilder
// Enables VS Code-like multi-window communication, theme/settings/zoom sync, and window focus management

const CHANNEL_NAME = 'tilder_windows_sync';
const windowId = `tilder-win-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

let channel = null;
const listeners = new Set();
const knownWindows = new Map();

function getChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || data.senderId === windowId) return; // ignore self messages

        // Maintain known window heartbeats
        if (data.type === 'WINDOW_PING' || data.type === 'WINDOW_PONG') {
          if (data.payload?.windowId) {
            knownWindows.set(data.payload.windowId, {
              ...data.payload,
              lastSeen: Date.now(),
            });
          }
        }

        // Notify all registered listeners
        listeners.forEach((fn) => {
          try {
            fn(data.type, data.payload, data.senderId);
          } catch (err) {
            console.error('Error in windowSync listener:', err);
          }
        });
      };
    } catch (e) {
      console.warn('BroadcastChannel not available:', e);
    }
  }
  return channel;
}

export function getWindowId() {
  return windowId;
}

export function broadcast(type, payload = {}) {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage({
      type,
      payload,
      senderId: windowId,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('Failed to broadcast window message:', err);
  }
}

export function subscribeWindowSync(callback) {
  listeners.add(callback);
  getChannel(); // ensure channel initialized
  return () => {
    listeners.delete(callback);
  };
}

export function broadcastTheme(themeName, isGlassTheme = false) {
  broadcast('THEME_CHANGED', { themeName, isGlassTheme });
}

export function broadcastZoom(zoomLevel) {
  broadcast('ZOOM_CHANGED', { zoomLevel });
}

export function broadcastSettings(settings) {
  broadcast('SETTINGS_CHANGED', { settings });
}

export function broadcastRecentWorkspaces(recentWorkspaces) {
  broadcast('RECENT_WORKSPACES_CHANGED', { recentWorkspaces });
}

export function broadcastWindowPing(info = {}) {
  broadcast('WINDOW_PING', {
    windowId,
    rootSystemPath: info.rootSystemPath || null,
    rootName: info.rootName || null,
    title: document.title,
  });
}

export function requestFocusWorkspace(rootSystemPath) {
  if (!rootSystemPath) return false;
  broadcast('REQUEST_FOCUS_WORKSPACE', { rootSystemPath });
}
