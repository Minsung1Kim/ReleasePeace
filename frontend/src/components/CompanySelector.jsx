// frontend/src/components/CompanySelector.jsx - NEW FILE
import React, { useState } from 'react'
import { config } from '../config'
import { getAuth, onAuthStateChanged } from 'firebase/auth';

const CompanySelector = ({ user, companies, token, onCompanySelect, onLogout, onCompaniesUpdate }) => {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = React.useState('');

  const [createForm, setCreateForm] = useState({
    name: '',
    subdomain: ''
  })

  const [joinForm, setJoinForm] = useState({
    invite_code: ''
  })

  const handleCreateCompany = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${config.apiUrl}/api/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(createForm)
      })

      const data = await response.json()

      if (data.success) {
        // Add new company to list
        const newCompany = data.company
        const updatedCompanies = [...companies, newCompany]
        onCompaniesUpdate(updatedCompanies)
        
        // Auto-select the new company
        onCompanySelect(newCompany)
      } else {
        throw new Error(data.message || 'Failed to create company')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleJoinCompany = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${config.apiUrl}/api/companies/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(joinForm)
      })

      const data = await response.json()

      if (data.success) {
        // Refresh companies list
        const companiesResponse = await fetch(`${config.apiUrl}/api/companies/mine`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const companiesData = await companiesResponse.json()
        
        if (companiesData.success) {
          onCompaniesUpdate(companiesData.companies)
          
          // Auto-select the joined company
          const joinedCompany = companiesData.companies.find(c => c.id === data.company.id)
          if (joinedCompany) {
            onCompanySelect(joinedCompany)
          }
        }
      } else {
        throw new Error(data.message || 'Failed to join company')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email || '');
    });
    return unsub;
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Select Company</h1>
            <p className="text-gray-300 text-center mt-2">
              Welcome, {userEmail || 'guest'}!
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}

          {companies.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Your Companies</h2>
              <div className="space-y-3">
                {companies.map((company) => (
                  <div
                    key={company.id}
                    onClick={() => onCompanySelect(company)}
                    className="border border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{company.name}</h3>
                        <p className="text-sm text-gray-500">
                          {company.subdomain}.releasepeace.com • {company.role}
                        </p>
                      </div>
                      <div className="text-right">
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
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setShowCreateForm(true)
                  setShowJoinForm(false)
                  setError('')
                }}
                className="flex flex-col items-center p-6 border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                disabled={loading}
              >
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Create Company</h3>
                <p className="text-sm text-gray-500 text-center">Start a new company workspace</p>
              </button>

              <button
                onClick={() => {
                  setShowJoinForm(true)
                  setShowCreateForm(false)
                  setError('')
                }}
                className="flex flex-col items-center p-6 border border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors"
                disabled={loading}
              >
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Join Company</h3>
                <p className="text-sm text-gray-500 text-center">Join with an invite code</p>
              </button>
            </div>
          </div>

          {showCreateForm && (
            <div className="mt-6 p-6 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Company</h3>
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Acme Corp"
                    required
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subdomain (optional)
                  </label>
                  <div className="flex">
                    <input
                      type="text"
                      value={createForm.subdomain}
                      onChange={(e) => setCreateForm({ ...createForm, subdomain: e.target.value.toLowerCase() })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="acme"
                      disabled={loading}
                    />
                    <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md text-sm text-gray-500">
                      .releasepeace.com
                    </span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading || !createForm.name.trim()}
                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Company'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {showJoinForm && (
            <div className="mt-6 p-6 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Join Company</h3>
              <form onSubmit={handleJoinCompany} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={joinForm.invite_code}
                    onChange={(e) => setJoinForm({ invite_code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    placeholder="TECH2024"
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Demo codes: TECH2024, START123, DEVS456
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={loading || !joinForm.invite_code.trim()}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading ? 'Joining...' : 'Join Company'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJoinForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="mt-8 text-center border-t border-gray-200 pt-6">
            <button
              onClick={onLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CompanySelector