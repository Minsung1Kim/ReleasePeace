// frontend/src/components/Dashboard.jsx - NEW FILE
import React, { useState, useEffect } from 'react'
import { config } from '../config'

const Dashboard = ({ user, company, token, onLogout, onSwitchCompany }) => {
  const [apiStatus, setApiStatus] = useState('checking...')
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">ReleasePeace</h1>
              <div className="ml-6 text-sm text-gray-500">
                {company.name} • {company.plan}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={onSwitchCompany}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Switch Company
              </button>
              <div className="text-sm text-gray-500">
                {user.display_name || user.username}
              </div>
              <button
                onClick={onLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* System Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-lg">API: {apiStatus}</p>
              <p className="text-sm text-gray-500 mt-1">
                Environment: {config.environment}
              </p>
            </div>
            <div>
              <p className="text-lg">Company: {company.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                Role: {company.role} • Plan: {company.plan}
              </p>
            </div>
            <div>
              <p className="text-lg">User: {user.display_name}</p>
              <p className="text-sm text-gray-500 mt-1">
                Role: {user.role}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{flags.length}</div>
            <div className="text-sm text-gray-600">Total Flags</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {flags.filter(f => f.states?.some(s => s.is_enabled)).length}
            </div>
            <div className="text-sm text-gray-600">Active Flags</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {flags.filter(f => f.risk_level === 'high' || f.risk_level === 'critical').length}
            </div>
            <div className="text-sm text-gray-600">High Risk</div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 text-center">
            <div className="text-3xl font-bold text-purple-600">3</div>
            <div className="text-sm text-gray-600">Environments</div>
          </div>
        </div>

        {/* Flags List */}
        <div className="bg-white rounded-lg shadow-md">
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
                        <div className="text-sm font-medium text-gray-900 mb-1">
                          Environment Status
                        </div>
                        {flag.states && flag.states.length > 0 ? (
                          <div className="space-y-1">
                            {flag.states.map((state) => (
                              <div key={state.environment} className="flex items-center gap-2 text-xs">
                                <span className="w-16 text-gray-600">{state.environment}</span>
                                <span className={`w-2 h-2 rounded-full ${state.is_enabled ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                                <span className="text-gray-500">
                                  {state.is_enabled ? `${state.rollout_percentage}%` : 'disabled'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">No states</div>
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
              <p className="text-sm text-gray-500">
                Create your first feature flag to get started with controlled releases.
              </p>
            </div>
          )}
        </div>

        {/* Company Info */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">🎉 Multi-Tenant Setup Complete!</h3>
          <p className="text-blue-800 text-sm mb-2">
            You're viewing flags for <strong>{company.name}</strong>. Each company has isolated data.
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

export default Dashboard