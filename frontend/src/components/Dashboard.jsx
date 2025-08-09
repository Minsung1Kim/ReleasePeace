function InviteCodePopover({ companyId, companyName }) {
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  async function loadInvite() {
    const c = await companies.get(companyId);
    setInviteCode(c.invite_code || "");
  }
  async function regenerate() {
    if (!confirm("Regenerate invite code? Old code will stop working.")) return;
    const updated = await companies.regenerateInvite(companyId);
    setInviteCode(updated.invite_code || "");
  }
  async function copyCode() {
    await navigator.clipboard.writeText(inviteCode);
    alert("Invite code copied!");
  }

  return (
    <div className="relative">
      <button
        className="px-3 py-2 rounded-md border text-sm hover:bg-gray-100"
        onClick={async () => {
          if (!open) await loadInvite();
          setOpen(!open);
        }}
      >
        Invite
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border bg-white shadow-lg p-3 z-50">
          <div className="text-sm font-semibold mb-2">Invite to {companyName}</div>

          <div className="text-xs text-gray-600 mb-1">Invite code</div>
          <div className="flex items-center gap-2 mb-2">
            <input
              readOnly
              value={inviteCode}
              className="flex-1 border px-2 py-1 text-sm rounded"
            />
            <button onClick={copyCode} className="border px-2 py-1 rounded text-xs hover:bg-gray-50">
              Copy
            </button>
          </div>

          <button
            onClick={regenerate}
            className="w-full border px-2 py-1 rounded text-xs text-red-600 hover:bg-red-50"
          >
            Regenerate code
          </button>

          <div className="mt-3 text-[11px] text-gray-500">
            Share this code with a teammate. They can join via your app’s “Join company” screen.
          </div>
        </div>
      )}
    </div>
  );
}
import { companies, getCompanyMembers, updateMemberRole, transferOwnership, removeMember } from '../utils/api';
import React, { useState, useEffect } from 'react'
import ManageRolesModal from "./ManageRolesModal";
import * as api from '../utils/api';
import { config } from '../config'

const Dashboard = ({ user, company, token, getToken, onLogout, onSwitchCompany }) => {
  const companyPathParam = () => {
    const id = company?.id || '';
    const sub = company?.subdomain || '';
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRe.test(id) ? id : (sub || id);
  };
  const companyId = company?.id?.startsWith('company_') ? company.id.slice(8) : company?.id
  const [apiStatus, setApiStatus] = useState('checking...')
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFlag, setSelectedFlag] = useState(null)
  const [activeEnvironment, setActiveEnvironment] = useState('production')
  const [showCreateFlag, setShowCreateFlag] = useState(false)
  // New state for roles modal
  const [rolesOpen, setRolesOpen] = useState(false);
  const [members, setMembers] = useState([]);

  async function refreshMembers() {
    const list = await api.getCompanyMembers(company.id);
    setMembers(list);
  }

  async function openRoles() {
    await refreshMembers();
    setRolesOpen(true);
  }

  // Always use a fresh Firebase ID token and retry once on 401
  const authedFetch = async (path, opts = {}, retry = true) => {
    // get a fresh token if possible
    let t = token
    try {
      if (getToken) t = await getToken()
    } catch (_) {}

    const headers = {
      ...(opts.headers || {}),
      Authorization: `Bearer ${t}`,
      'X-Company-ID': company?.id || company?.subdomain || 'demo'
    }

    const res = await fetch(`${config.apiUrl}${path}`, { ...opts, headers })

    // If token expired, refresh and retry once
    if (res.status === 401 && retry && getToken) {
      try {
        const fresh = await getToken()
        const res2 = await fetch(`${config.apiUrl}${path}`, {
          ...opts,
          headers: { ...(opts.headers || {}), Authorization: `Bearer ${fresh}`, 'X-Company-ID': headers['X-Company-ID'] }
        })
        return res2
      } catch (_) {
        // fall through to original res
      }
    }
    return res
  }
  // Fetch company with members for modal
  const fetchCompanyWithMembers = async () => {
    try {
      const res = await authedFetch(`/api/companies/${companyPathParam()}`);
      const data = await res.json();
      if (data.success && data.company.members) {
        setCompanyMembers(data.company.members);
      }
    } catch (err) {
      console.error('Failed to fetch company members:', err);
    }
  } 
  const userRole = company?.role || 'member'
  const canCreate = ['owner','pm'].includes(userRole)
  const canToggle = ['owner','pm','engineer'].includes(userRole)

 

  useEffect(() => {
    // Test API connection
    fetch(`${config.apiUrl}/health`)
      .then(res => res.json())
      .then(data => setApiStatus('✅ Connected!'))
      .catch(err => setApiStatus('❌ Connection failed'))

    // Fetch flags for this company
    fetchFlags()
  }, [company, token])

  const fetchFlags = async () => {
    try {
      setLoading(true)
      const response = await authedFetch('/api/flags')
      const data = await response.json()
      if (data.success) {
        setFlags(data.flags || [])
      } else {
        throw new Error(data.message || 'Failed to load flags')
      }
    } catch (err) {
      setError(err.message)
      console.error('Failed to load flags:', err)
    } finally {
      setLoading(false)
    }
  }

 // Add this function
  
  // Modal role change handler (soft update)
  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await authedFetch(`/api/companies/${companyPathParam()}/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_role: newRole })
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to update role')

      // Soft update for now — could refetch company later
      company.members = company.members.map(m => m.id === userId ? { ...m, role: newRole } : m)
    } catch (err) {
      alert(err.message)
    }
  }

  const createFlag = async (flagData) => {
    try {
      const response = await authedFetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flagData)
      });

      const data = await response.json();

      // accept either { success, flag } or just the flag
      const newFlag = data?.flag ?? data;

      if (!response.ok || (!data?.success && !newFlag?.id)) {
        throw new Error(data?.message || 'Failed to create flag');
      }

      // optimistic add (not required but makes UI snappy)
      if (newFlag?.id) {
        setFlags(prev => [newFlag, ...prev]);
      }

      // ensure we’re in sync with server
      await fetchFlags();

      setShowCreateFlag(false);
    } catch (err) {
      console.error('Failed to create flag:', err);
      alert(err.message || 'Failed to create flag');
    }
  };

  const toggleFlagState = async (flagId, environment, currentState) => {
    try {
      const response = await authedFetch(`/api/flags/${flagId}/state/${environment}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !currentState.is_enabled })
      })
      const data = await response.json()
      if (data.success) {
        // Refresh flags to get updated state
        fetchFlags()
      } else {
        throw new Error(data.message || 'Failed to update flag state')
      }
    } catch (err) {
      console.error('Failed to toggle flag:', err)
      alert(err.message)
    }
  }

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'critical': return 'bg-red-100 text-red-800'
      case 'high': return 'bg-orange-100 text-orange-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type) => {
    switch (type) {
      case 'killswitch': return 'bg-red-100 text-red-800'
      case 'experiment': return 'bg-purple-100 text-purple-800'
      case 'rollout': return 'bg-blue-100 text-blue-800'
      case 'permission': return 'bg-indigo-100 text-indigo-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getEnvironmentStats = (flag) => {
    const envs = flag.states || []
    const enabled = envs.filter(s => s.is_enabled).length
    const total = envs.length
    return { enabled, total }
  }

  const environments = ['development', 'staging', 'production']

  return (
    <div className="min-h-screen bg-[var(--rp-bg)] text-[var(--rp-fg)]">
      {/* Header */}
      <header className="bg-[var(--rp-card-bg)] border-b border-[var(--rp-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold rp-heading">ReleasePeace</h1>
              <div className="ml-6 flex items-center space-x-4">
                <div className="text-sm text-gray-500">
                  <span className="font-medium">{company?.name || 'No company selected'}</span>
                  <span className="mx-2">•</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    company?.plan === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                    company?.plan === 'pro' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {company?.plan || 'unknown'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                API: {apiStatus}
              </div>

              {company?.role === 'owner' && (
                <>
                  <InviteCodePopover companyId={company.id} companyName={company.name} />
                  <button
                    onClick={openRoles}
                    className="px-3 py-2 rounded-md border text-sm hover:bg-gray-100"
                  >
                    Manage Roles
                  </button>
                </>
              )}

              <button
                onClick={onSwitchCompany}
                className="text-sm text-blue-600 hover:text-blue-500 px-3 py-1 border border-blue-200 rounded-md hover:bg-blue-50"
              >
                Switch Company
              </button>
              <div className="text-sm text-gray-500 border-l pl-4">
                <div className="font-medium">{user.display_name || user.username}</div>
                <div className="text-xs">{user.role} • {company?.role}</div>
              </div>
              <button
                onClick={onLogout}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{flags.length}</div>
            <div className="text-sm text-gray-600">Total Flags</div>
          </div>
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {flags.filter(f => f.states?.some(s => s.is_enabled)).length}
            </div>
            <div className="text-sm text-gray-600">Active Flags</div>
          </div>
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {flags.filter(f => f.risk_level === 'high' || f.risk_level === 'critical').length}
            </div>
            <div className="text-sm text-gray-600">High Risk</div>
          </div>
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-purple-600">3</div>
            <div className="text-sm text-gray-600">Environments</div>
          </div>
        </div>

        {/* Environment Selector */}
        <div className="rp-card p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">Environment:</span>
              <div className="flex space-x-2">
                {environments.map(env => (
                  <button
                    key={env}
                    onClick={() => setActiveEnvironment(env)}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      activeEnvironment === env
                        ? 'bg-[var(--rp-accent)] text-[var(--rp-fg)] border border-[var(--rp-border)]'
                        : 'text-[var(--rp-muted)] hover:bg-[var(--rp-accent)] border border-[var(--rp-border)]'
                    }`}
                  >
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {canCreate && (
              <button
                onClick={() => setShowCreateFlag(true)}
                className="px-4 py-2 rp-btn-primary rounded-md text-sm font-semibold"
              >
                + Create Flag
              </button>
            )}
          </div>
        </div>

        {/* Create Flag Modal */}
        {showCreateFlag && (
          <CreateFlagModal
            onClose={() => setShowCreateFlag(false)}
            onCreate={createFlag}
          />
        )}

        {/* Flags List */}
        <div className="rp-card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Feature Flags ({flags.length})</h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading flags...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="text-red-600 mb-2">⚠️ Error</div>
              <p className="text-gray-600">{error}</p>
              <button 
                onClick={fetchFlags}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : flags.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {flags.map((flag) => {
                const envStats = getEnvironmentStats(flag)
                const currentEnvState = flag.states?.find(s => s.environment === activeEnvironment)
                
                return (
                  <div key={flag.id} className="p-6 hover:bg-[var(--rp-accent)] transition">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{flag.name}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(flag.risk_level)}`}>
                            {flag.risk_level} risk
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(flag.flag_type)}`}>
                            {flag.flag_type}
                          </span>
                          {flag.requires_approval && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              approval required
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{flag.description}</p>
                        
                        {flag.tags && flag.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {flag.tags.map((tag, index) => (
                              <span key={index} className="rp-badge text-xs">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="text-xs text-gray-500">
                          Created by {flag.creator?.display_name || flag.creator?.username || 'Unknown'} • 
                          {envStats.enabled}/{envStats.total} environments enabled
                        </div>
                      </div>
                      
                      <div className="ml-6 text-right">
                        <div className="text-sm font-medium text-gray-900 mb-3">
                          {activeEnvironment.charAt(0).toUpperCase() + activeEnvironment.slice(1)} Environment
                        </div>
                        {currentEnvState ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full ${
                                currentEnvState.is_enabled ? 'bg-[var(--rp-primary)]' : 'bg-gray-500/50'
                              }`}></span>
                              <span className="text-sm text-gray-600">
                                {currentEnvState.is_enabled ? `${currentEnvState.rollout_percentage}% enabled` : 'Disabled'}
                              </span>
                            </div>
                            <button
                              onClick={() => canToggle
                                ? toggleFlagState(flag.id, activeEnvironment, currentEnvState)
                                : alert('You do not have permission to toggle flags.')
                              }
                              className="px-3 py-1 rounded text-xs font-medium rp-btn-primary disabled:opacity-50"
                              disabled={!canToggle}
                            >
                              {currentEnvState.is_enabled ? 'Disable' : 'Enable'}
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">No state</div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">🎯</div>
              <p className="text-gray-600 mb-4">No feature flags yet</p>
              <p className="text-sm text-gray-500 mb-4">
                Create your first feature flag to get started with controlled releases.
              </p>
              <button
                onClick={() => setShowCreateFlag(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create Your First Flag
              </button>
            </div>
          )}
        </div>

      </div>
      {rolesOpen && (
        <ManageRolesModal
          members={members}
          currentUserId={user?.id}
          onClose={() => setRolesOpen(false)}
          onChangeRole={async (userId, role) => {
            await api.updateMemberRole(company.id, userId, role);
            const list = await api.getCompanyMembers(company.id);
            setMembers(list);
          }}
          onTransferOwnership={async (userId) => {
            await api.transferOwnership(company.id, userId);
            const list = await api.getCompanyMembers(company.id);
            setMembers(list);
          }}
          onRemoveMember={async (userId) => {
            await api.removeMember(company.id, userId);
            const list = await api.getCompanyMembers(company.id);
            setMembers(list);
          }}
        />
      )}
    </div>
  )
}

// Create Flag Modal Component
const CreateFlagModal = ({ onClose, onCreate }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    flag_type: 'rollout',
    risk_level: 'medium',
    tags: '',
    requires_approval: false
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const flagData = {
      ...formData,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
    };

    try {
      await onCreate(flagData); // parent will add + refetch
      onClose();                // close right away for snappy UX
    } catch (err) {
      console.error('Create flag error:', err);
      alert(err.message || 'Failed to create flag');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Feature Flag</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Flag Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="my_new_feature"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              rows="3"
              placeholder="Describe what this flag controls..."
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={formData.flag_type}
                onChange={(e) => setFormData({ ...formData, flag_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="rollout">Rollout</option>
                <option value="experiment">Experiment</option>
                <option value="permission">Permission</option>
                <option value="killswitch">Kill Switch</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Risk Level
              </label>
              <select
                value={formData.risk_level}
                onChange={(e) => setFormData({ ...formData, risk_level: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="ui, checkout, experiment"
              disabled={loading}
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="requires_approval"
              checked={formData.requires_approval}
              onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={loading}
            />
            <label htmlFor="requires_approval" className="ml-2 block text-sm text-gray-700">
              Requires approval before changes
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Flag'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ...existing code...

export default Dashboard