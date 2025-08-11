// Get invite code for a company
export async function getInviteCode(companyId) {
  return apiRequest(`/api/companies/${companyId}/invite-code`);
}
export { apiRequest, ApiError };


import { config } from '../config';

const API_ORIGIN = config.apiUrl.replace(/\/$/, ''); // e.g. https://...railway.app

function buildUrl(path) {
  const p = `/${String(path || '').replace(/^\//, '')}`;
  // If caller already passed /api/... don't double it
  const needsApi = !p.startsWith('/api/');
  return `${API_ORIGIN}${needsApi ? '/api' : ''}${p}`;
}

export async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const url = buildUrl(path);
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.status === 204 ? null : res.json();
}

// Auth API calls
export const auth = {
  login: (credentials) => 
    apiRequest('/api/users/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }),

  getMe: () => apiRequest('/api/users/me'),

  switchCompany: (companyId) =>
    apiRequest('/api/users/switch-company', {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId })
    })
}

// Company API calls
export const companies = {
  getMine: () => apiRequest('/api/companies/mine'),
  
  create: (companyData) =>
    apiRequest('/api/companies', {
      method: 'POST',
      body: JSON.stringify(companyData)
    }),

  join: (inviteCode) =>
    apiRequest('/api/companies/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCode })
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
      body: JSON.stringify(flagData)
    }),

  update: (flagId, flagData) =>
    apiRequest(`/api/flags/${flagId}`, {
      method: 'PUT',
      body: JSON.stringify(flagData)
    }),

  delete: (flagId) =>
    apiRequest(`/api/flags/${flagId}`, {
      method: 'DELETE'
    }),

  updateState: (flagId, environment, stateData) =>
    apiRequest(`/api/flags/${flagId}/state/${environment}`, {
      method: 'PUT',
      body: JSON.stringify(stateData)
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
      body: JSON.stringify({ user, environment })
    }),

  evaluateBulk: (flags, user = {}, environment = 'production') =>
    apiRequest('/sdk/evaluate-bulk', {
      method: 'POST',
      body: JSON.stringify({ flags, user, environment })
    }),

  track: (flagName, user, event, value, environment = 'production') =>
    apiRequest(`/sdk/track/${flagName}`, {
      method: 'POST',
      body: JSON.stringify({ user, event, value, environment })
    })
}

// --- Company membership / roles (uses apiRequest + config.apiUrl) ---
export async function getCompanyMembers(companyId) {
  return apiRequest(`/api/companies/${companyId}/members`);
}

export async function updateMemberRole(companyId, userId, role) {
  return apiRequest(`/api/companies/${companyId}/members/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function transferOwnership(companyId, newOwnerUserId) {
  return apiRequest(`/api/companies/${companyId}/ownership`, {
    method: 'POST',
    body: JSON.stringify({ userId: newOwnerUserId }),
  });
}

export async function removeMember(companyId, userId) {
  return apiRequest(`/api/companies/${companyId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export { ApiError }