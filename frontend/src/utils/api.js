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
  try {
    console.log('[API] Fetching members for company:', companyId);

    const headers = {
      ...(await authHeader(true)), // Force fresh token
      ...companyHeader(companyId)
    };

    console.log('[API] Request headers:', headers);

    const response = await fetch(`${BASE}/api/companies/${companyId}/members`, {
      method: 'GET',
      headers
    });

    console.log('[API] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[API] Error response:', errorData);
      throw new ApiError('Failed to fetch members', response.status, errorData);
    }

    const members = await response.json();
    console.log('[API] Received members:', members);

    return members;
  } catch (error) {
    console.error('[API] getMembers failed:', error);
    throw error;
  }
}

// Alternative direct route method if the above doesn't work
export async function getCompanyMembersAlternative(companyId) {
  try {
    console.log('[API] Alternative fetch for company members:', companyId);

    return await apiRequest(`/api/companies/${companyId}/members`, {
      method: 'GET',
      companyId, // adds X-Company-Id
    });
  } catch (error) {
    console.error('[API] Alternative getCompanyMembers failed:', error);
    throw error;
  }
}

// Get invite code for a company
export async function getInviteCode(companyId) {
  try {
    console.log('[API] Fetching invite code for company:', companyId);

    const headers = {
      ...(await authHeader(true)),
      ...companyHeader(companyId)
    };

    const response = await fetch(`${BASE}/api/companies/${companyId}/invite-code`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[API] Error getting invite code:', errorData);
      throw new ApiError('Failed to fetch invite code', response.status, errorData);
    }

    const data = await response.json();
    console.log('[API] Received invite code data:', data);

    return data; // { invite_code: "..." }
  } catch (error) {
    console.error('[API] getInviteCode failed:', error);
    throw error;
  }
}

// Regenerate invite code with better error handling
export async function regenerateInviteCode(companyId) {
  try {
    console.log('[API] Regenerating invite code for company:', companyId);

    return await apiRequest(`/api/companies/${companyId}/invite-code`, {
      method: 'POST',
      companyId,
    });
  } catch (error) {
    console.error('[API] regenerateInviteCode failed:', error);
    throw error;
  }
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
  const res = await apiRequest(`/companies/${companyId}/members`);
  return res.members; // ensure you pass through email/name
}

export async function updateMemberRole(companyId, userId, role) {
  try {
    console.log('[API] Updating member role:', { companyId, userId, role });

    return await apiRequest(`/api/companies/${companyId}/members/${userId}/role`, {
      method: 'PATCH',
      body: { role },
      companyId,
    });
  } catch (error) {
    console.error('[API] updateMemberRole failed:', error);
    throw error;
  }
}

export async function transferOwnership(companyId, newOwnerUserId) {
  return apiRequest(`/api/companies/${companyId}/ownership`, {
    method: 'POST',
    body: { userId: newOwnerUserId }, // pass plain object
    headers: { 'X-Company-Id': companyId }
  });
}

export async function removeMember(companyId, userId) {
  try {
    console.log('[API] Removing member:', { companyId, userId });

    return await apiRequest(`/api/companies/${companyId}/members/${userId}`, {
      method: 'DELETE',
      companyId,
    });
  } catch (error) {
    console.error('[API] removeMember failed:', error);
    throw error;
  }
}
