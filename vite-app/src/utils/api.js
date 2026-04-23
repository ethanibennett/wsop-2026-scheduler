// ── API Helper ───────────────────────────────────────────
export const API_URL = (window.Capacitor && window.Capacitor.isNativePlatform())
  ? 'https://futurega.me/api'
  : window.location.origin + '/api';

export async function fetchApi(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  return res;
}
