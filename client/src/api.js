const BASE = '/api/v1';
export class ApiError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields || {}; }
}
export const tokenStore = {
  get: () => { try { return localStorage.getItem('bl_token'); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem('bl_token', t) : localStorage.removeItem('bl_token'); } catch { /* private mode */ } },
};
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError(0, 'Cannot reach the server. Check that the API is running.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && tokenStore.get()) { tokenStore.set(null); window.dispatchEvent(new Event('bl-logout')); }
    throw new ApiError(res.status, data.error || 'Request failed', data.fields);
  }
  return data;
}
export const api = {
  get: (p, params) => request('GET', p + qs(params)),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
};
export function qs(params) {
  if (!params) return '';
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
}