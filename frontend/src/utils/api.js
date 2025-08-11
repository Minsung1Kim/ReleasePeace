import { config } from '../config';
import { getAuth } from 'firebase/auth';

const BASE = config.apiUrl.replace(/\/$/, '');

async function authHeader(forceFresh = false) {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new ApiError('Not authenticated', 401);
  const token = await user.getIdToken(forceFresh);
  return { Authorization: `Bearer ${token}` };
}

function companyHeader(companyId) {
  return companyId ? { 'X-Company-Id': companyId } : {};
}

// Hardened company members API helper
export async function getMembers(companyId) {
  const headers = {
    ...(await authHeader(true)),
    ...companyHeader(companyId)
  };
  const r = await fetch(`${BASE}/api/companies/${companyId}/members`, { headers });
  if (!r.ok) throw new ApiError('Failed to fetch members', r.status, await r.json().catch(()=>({})));
  return r.json();
}


// Get invite code for a company
export async function getInviteCode(companyId) {
  const headers = {
    ...(await authHeader(true)),
    ...companyHeader(companyId)
  };
  const r = await fetch(`${BASE}/api/companies/${companyId}/invite-code`, { headers });
  if (!r.ok) throw new ApiError('Failed to fetch invite code', r.status, await r.json().catch(()=>({})));
  return r.json(); // { code }
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function buildUrl(endpoint) {
  const base = config.apiUrl.replace(/\/$/, ''); // no trailing slash
  let p = String(endpoint || '');
  if (!p.startsWith('/')) p = '/' + p;

  // Auto-prefix /api for app endpoints, but NOT for /sdk endpoints
  if (!p.startsWith('/api/') && !p.startsWith('/sdk/')) p = '/api' + p;

  return base + p;
}

export async function apiRequest(path, opts = {}) {
  const {
    method = 'GET',
    body,                      // <= pass plain objects here
    token,
    companyId,
    headers = {},
    signal,
  } = opts;

  const url = buildUrl(path);
  const hdrs = { Accept: 'application/json', ...headers };

  // Only stringify once, and only if it's not FormData
  let payload = body;
  if (payload !== undefined && !(payload instanceof FormData)) {
    hdrs['Content-Type'] = 'application/json';
    payload = JSON.stringify(payload);
  }

  // Auth
  if (!hdrs.Authorization) {
    const auth = getAuth();
    const user = auth.currentUser;
    let t = token;
    try { t = t || (user ? await user.getIdToken() : null); } catch {}
    if (!t) {
      const stored = localStorage.getItem('releasepeace_token');
      if (stored) t = stored;
    }
    if (t) hdrs.Authorization = `Bearer ${t}`;
  }

  // Company header (fallbacks)
  let cid = companyId;
  if (!cid) {
    try {
      const saved = JSON.parse(localStorage.getItem('releasepeace_company') || 'null');
      cid = saved?.id;
    } catch {}
    if (!cid) cid = localStorage.getItem('rp_company_id');
  }
  if (cid) hdrs['X-Company-Id'] = cid;

  const res = await fetch(url, {
    method,
    headers: hdrs,
    body: payload,
    credentials: 'include',
    ...(signal ? { signal } : {}),
  });

  // normalize errors
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.error || msg; } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.status === 204 ? null : res.json();
}


// Auth API calls
export const auth = {
  login: (credentials) => 
    apiRequest('/api/users/login', {
      method: 'POST',
      body: credentials
    }),

  getMe: () => apiRequest('/api/users/me'),

  switchCompany: (companyId) =>
    apiRequest('/api/users/switch-company', {
      method: 'POST',
      body: { company_id: companyId }
    })
}

// Company API calls
export const companies = {
  // ⬇️ normalize to a single company object
  getMine: async () => {
    const res = await apiRequest('/api/companies/mine');
    if (Array.isArray(res)) return res[0] || null;
    if (res && Array.isArray(res.companies)) return res.companies[0] || null;
    if (res && res.company) return res.company;
    return res || null;
  },

  create: (companyData) =>
    apiRequest('/api/companies', {
      method: 'POST',
      body: companyData
    }),

  join: (inviteCode) =>
    apiRequest('/api/companies/join', {
      method: 'POST',
      body: { invite_code: inviteCode }
    }),

  get: (companyId) => apiRequest(`/api/companies/${companyId}`),

  regenerateInvite: (companyId) =>
    apiRequest(`/api/companies/${companyId}/regenerate-invite`, {
      method: 'POST'
    })
}

// Flags API calls
export const flags = {
  getAll: () => apiRequest('/api/flags'),
  
  get: (flagId) => apiRequest(`/api/flags/${flagId}`),
  
  create: (flagData) =>
    apiRequest('/api/flags', {
      method: 'POST',
      body: flagData
    }),

  update: (flagId, flagData) =>
    apiRequest(`/api/flags/${flagId}`, {
      method: 'PUT',
      body: flagData
    }),

  delete: (flagId) =>
    apiRequest(`/api/flags/${flagId}`, {
      method: 'DELETE'
    }),

  updateState: (flagId, environment, stateData) =>
    apiRequest(`/api/flags/${flagId}/state/${environment}`, {
      method: 'PUT',
      body: stateData
    })
}

// Analytics API calls
export const analytics = {
  getFlag: (flagName, environment = 'production', timeRange = '7d') =>
    apiRequest(`/api/analytics/flags/${flagName}?environment=${environment}&timeRange=${timeRange}`)
}

// SDK API calls (for demo purposes)
export const sdk = {
  evaluate: (flagName, user = {}, environment = 'production') =>
    apiRequest(`/sdk/evaluate/${flagName}`, {
      method: 'POST',
      body: { user, environment }
    }),

  evaluateBulk: (flags, user = {}, environment = 'production') =>
    apiRequest('/sdk/evaluate-bulk', {
      method: 'POST',
      body: { flags, user, environment }
    }),

  track: (flagName, user, event, value, environment = 'production') =>
    apiRequest(`/sdk/track/${flagName}`, {
      method: 'POST',
      body: { user, event, value, environment }
    })
}

// --- Company membership / roles (uses apiRequest + config.apiUrl) ---
export async function getCompanyMembers(companyId) {
  return apiRequest(`/api/companies/${companyId}/members`, {
    headers: { 'X-Company-Id': companyId }
  });
}

export async function updateMemberRole(companyId, userId, role) {
  return apiRequest(`/api/companies/${companyId}/members/${userId}/role`, {
    method: 'PATCH',
    body: { role }, // pass plain object
    headers: { 'X-Company-Id': companyId }
  });
}

export async function transferOwnership(companyId, newOwnerUserId) {
  return apiRequest(`/api/companies/${companyId}/ownership`, {
    method: 'POST',
    body: { userId: newOwnerUserId }, // pass plain object
    headers: { 'X-Company-Id': companyId }
  });
}

export async function removeMember(companyId, userId) {
  return apiRequest(`/api/companies/${companyId}/members/${userId}`, {
    method: 'DELETE',
    headers: { 'X-Company-Id': companyId }
  });
}
