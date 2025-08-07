// frontend/src/components/Dashboard.jsx - ENHANCED VERSION WITH YOUR THEME
import React, { useState, useEffect } from 'react'
import { config } from '../config'

const Dashboard = ({ user, company, token, onLogout, onSwitchCompany }) => {
  const [apiStatus, setApiStatus] = useState('checking...')
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFlag, setSelectedFlag] = useState(null)
  const [activeEnvironment, setActiveEnvironment] = useState('production')
  const [showCreateFlag, setShowCreateFlag] = useState(false)

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
      const response = await fetch(`${config.apiUrl}/api/flags`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': company.id
        }
      })

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

  const createFlag = async (flagData) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/flags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': company.id
        },
        body: JSON.stringify(flagData)
      })

      const data = await response.json()
      
      if (data.success) {
        setFlags([data.flag, ...flags])
        setShowCreateFlag(false)
      } else {
        throw new Error(data.message || 'Failed to create flag')
      }
    } catch (err) {
      console.error('Failed to create flag:', err)
      alert(err.message)
    }
  }

  const toggleFlagState = async (flagId, environment, currentState) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/flags/${flagId}/state/${environment}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': company.id
        },
        body: JSON.stringify({
          is_enabled: !currentState.is_enabled
        })
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
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">ReleasePeace</h1>
              <div className="ml-6 flex items-center space-x-4">
                <div className="text-sm text-gray-500">
                  <span className="font-medium">{company.name}</span>
                  <span className="mx-2">•</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    company.plan === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                    company.plan === 'pro' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {company.plan}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                API: {apiStatus}
              </div>
              <button
                onClick={onSwitchCompany}
                className="text-sm text-blue-600 hover:text-blue-500 px-3 py-1 border border-blue-200 rounded-md hover:bg-blue-50"
              >
                Switch Company
              </button>
              <div className="text-sm text-gray-500 border-l pl-4">
                <div className="font-medium">{user.display_name || user.username}</div>
                <div className="text-xs">{user.role} • {company.role}</div>
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
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{flags.length}</div>
            <div className="text-sm text-gray-600">Total Flags</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {flags.filter(f => f.states?.some(s => s.is_enabled)).length}
            </div>
            <div className="text-sm text-gray-600">Active Flags</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {flags.filter(f => f.risk_level === 'high' || f.risk_level === 'critical').length}
            </div>
            <div className="text-sm text-gray-600">High Risk</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-purple-600">3</div>
            <div className="text-sm text-gray-600">Environments</div>
          </div>
        </div>

        {/* Environment Selector */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
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
                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                        : 'text-gray-600 hover:bg-gray-100 border border-gray-300'
                    }`}
                  >
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowCreateFlag(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
            >
              + Create Flag
            </button>
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
        <div className="bg-white rounded-lg shadow">
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
                  <div key={flag.id} className="p-6 hover:bg-gray-50">
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
                              <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
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
                              <span className={`w-3 h-3 rounded-full ${currentEnvState.is_enabled ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                              <span className="text-sm text-gray-600">
                                {currentEnvState.is_enabled ? `${currentEnvState.rollout_percentage}% enabled` : 'Disabled'}
                              </span>
                            </div>
                            <button
                              onClick={() => toggleFlagState(flag.id, activeEnvironment, currentEnvState)}
                              className={`px-3 py-1 rounded text-xs font-medium ${
                                currentEnvState.is_enabled
                                  ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                  : 'bg-green-100 text-green-800 hover:bg-green-200'
                              }`}
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

        {/* Company Info */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">🎉 Multi-Tenant Setup Complete!</h3>
          <p className="text-blue-800 text-sm mb-2">
            You're viewing flags for <strong>{company.name}</strong>. Each company has completely isolated data.
          </p>
          <div className="text-blue-700 text-sm">
            <strong>Company Details:</strong><br/>
            • Name: {company.name}<br/>
            • Subdomain: {company.subdomain}<br/>
            • Plan: {company.plan}<br/>
            • Your Role: {company.role}
          </div>
        </div>
      </div>
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
    e.preventDefault()
    setLoading(true)

    const flagData = {
      ...formData,
      tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
    }

    try {
      await onCreate(flagData)
    } catch (err) {
      console.error('Create flag error:', err)
    } finally {
      setLoading(false)
    }
  }

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

export default Dashboard