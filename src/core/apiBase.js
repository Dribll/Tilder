const rawApiBaseUrl = typeof import.meta !== 'undefined' ? String(import.meta.env.VITE_API_BASE_URL || '').trim() : '';

export const apiBaseUrl = rawApiBaseUrl.replace(/\/$/, '');

function getInjectedApiBaseUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  const injected = String(window.__TILDER_API_BASE_URL__ || '').trim();
  return injected.replace(/\/$/, '');
}

export function getResolvedApiBaseUrl() {
  return getInjectedApiBaseUrl() || apiBaseUrl;
}

export function getClientOrigin() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function buildApiUrl(path = '') {
  const resolvedApiBaseUrl = getResolvedApiBaseUrl();

  if (!path) {
    return resolvedApiBaseUrl || '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return resolvedApiBaseUrl ? `${resolvedApiBaseUrl}${normalizedPath}` : normalizedPath;
}

export function getApiOrigin() {
  const candidate = buildApiUrl('/');
  try {
    return candidate ? new URL(candidate, getClientOrigin() || undefined).origin : getClientOrigin();
  } catch {
    return getClientOrigin();
  }
}

function shouldRetryDesktopApi() {
  if (typeof window === 'undefined') {
    return false;
  }

  const runtimeMode = String(window.__TILDER_RUNTIME_MODE__ || '').trim().toLowerCase();
  if (runtimeMode === 'desktop-local' || runtimeMode === 'desktop') {
    return true;
  }

  const protocol = String(window.location?.protocol || '').toLowerCase();
  const hostname = String(window.location?.hostname || '').toLowerCase();
  return protocol.startsWith('tauri:') || hostname === 'tauri.localhost';
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch(path, init = {}) {
  const headers = {
    ...(init.headers || {}),
  };

  if (typeof window !== 'undefined') {
    const savedSessionId = localStorage.getItem('tilder_session_id');
    if (savedSessionId) {
      headers['x-tilder-session-id'] = savedSessionId;
    }
  }

  const request = () =>
    fetch(buildApiUrl(path), {
      credentials: 'include',
      ...init,
      headers,
    });

  if (!shouldRetryDesktopApi()) {
    return request();
  }

  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt === 7) {
        break;
      }
      await delay(250 + attempt * 150);
    }
  }

  throw lastError || new Error('Unable to reach the Tilder desktop backend.');
}
