// ...existing code...
// frontend/src/utils/api.js - NEW FILE


class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

const apiRequest = async (endpoint, options = {}) => {
  const url = `${config.apiUrl}${endpoint}`
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  }

  // Add auth token if available
  const token = localStorage.getItem('releasepeace_token')
  if (token) {
    defaultOptions.headers['Authorization'] = `Bearer ${token}`
  }

  // Add company ID if available
  const company = localStorage.getItem('releasepeace_company')
  if (company) {
    const companyData = JSON.parse(company)
    defaultOptions.headers['X-Company-ID'] = companyData.id
  }

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  }

  try {
    const response = await fetch(url, mergedOptions)
    const data = await response.json()

    if (!response.ok) {
      throw new ApiError(
        data.message || `HTTP ${response.status}`,
        response.status,
        data
      )
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(`Network error: ${error.message}`, 0, null)
  }
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