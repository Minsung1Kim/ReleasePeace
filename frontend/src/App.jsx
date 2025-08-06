// frontend/src/App.jsx
import React, { useState, useEffect } from 'react'
import { config } from './config'
import LandingPage from './components/LandingPage'

function Dashboard() {
  const [apiStatus, setApiStatus] = useState('checking...')
  const [flags, setFlags] = useState([])

  useEffect(() => {
    // Test API connection
    fetch(`${config.apiUrl}/health`)
      .then(res => res.json())
      .then(data => setApiStatus('✅ Connected!'))
      .catch(err => setApiStatus('❌ Connection failed'))

    // Fetch flags
    fetch(`${config.apiUrl}/api/flags`)
      .then(res => res.json())
      .then(data => setFlags(data.flags || []))
      .catch(err => console.error('Failed to load flags:', err))
  }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center text-gray-900 mb-4">
          🚀 ReleasePeace Dashboard
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Feature Flag Governance Platform
        </p>
        
        <div className="max-w-4xl mx-auto">
          {/* API Status */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">System Status</h2>
            <p className="text-lg">API: {apiStatus}</p>
            <p className="text-sm text-gray-500 mt-2">
              Environment: {config.environment} | API: {config.apiUrl}
            </p>
          </div>

          {/* Flags Preview */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Feature Flags ({flags.length})</h2>
            {flags.length > 0 ? (
              <div className="space-y-3">
                {flags.slice(0, 5).map((flag) => (
                  <div key={flag.id} className="border-l-4 border-blue-500 pl-4 py-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-gray-900">{flag.name}</h3>
                        <p className="text-sm text-gray-600">{flag.description}</p>
                        <div className="flex gap-2 mt-1">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            flag.risk_level === 'high' ? 'bg-red-100 text-red-800' :
                            flag.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {flag.risk_level} risk
                          </span>
                          <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                            {flag.flag_type}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">
                          {flag.states?.length || 0} environments
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {flags.length > 5 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    ... and {flags.length - 5} more flags
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">⏳</div>
                <p>Loading flags...</p>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="text-2xl font-bold text-blue-600">{flags.length}</div>
              <div className="text-sm text-gray-600">Total Flags</div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="text-2xl font-bold text-green-600">
                {flags.filter(f => f.states?.some(s => s.is_enabled)).length}
              </div>
              <div className="text-sm text-gray-600">Active Flags</div>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 text-center">
              <div className="text-2xl font-bold text-purple-600">3</div>
              <div className="text-sm text-gray-600">Environments</div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
            <h3 className="font-semibold text-blue-900 mb-2">🎉 Deployment Successful!</h3>
            <p className="text-blue-800 text-sm">
              Backend and frontend are connected. Ready to build the full dashboard interface.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [showDashboard, setShowDashboard] = useState(false)

  if (showDashboard) {
    return <Dashboard />
  }

  return (
    <LandingPage onEnterApp={() => setShowDashboard(true)} />
  )
}

export default App