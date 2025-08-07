import React, { useState } from 'react'

const LoginForm = ({ onLogin, onBack }) => {
  const [formData, setFormData] = useState({ username: '', role: 'pm' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSignUp, setShowSignUp] = useState(false)

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await onLogin(formData)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = (username, role) => {
    setFormData({ username, role })
    setTimeout(() => {
      onLogin({ username, role }).catch(err => {
        setError(err.message || 'Login failed')
        setLoading(false)
      })
    }, 300)
    setLoading(true)
  }

  return (
    <div className="min-h-screen bg-[#292826] text-[#F9D142] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-[#1f1e1c] border border-[#F9D142] rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">
              {showSignUp ? 'Create Account' : 'Welcome to ReleasePeace'}
            </h1>
            <p className="text-[#e6cf63]">
              {showSignUp ? 'Create your account to get started' : 'Sign in to manage your feature flags'}
            </p>
          </div>

          {error && (
            <div className="bg-red-900 border border-red-700 rounded-md p-4 mb-6 text-red-200">
              <h3 className="text-sm font-semibold mb-1">
                {showSignUp ? 'Signup Error' : 'Login Error'}
              </h3>
              <div className="text-sm">{error}</div>
            </div>
          )}

          <form onSubmit={showSignUp ? handleSubmit : handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Username
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-[#2d2c2a] text-[#F9D142] border border-[#F9D142] rounded-md focus:outline-none"
                placeholder={showSignUp ? "Choose a username" : "Enter your username"}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Role
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-[#2d2c2a] text-[#F9D142] border border-[#F9D142] rounded-md focus:outline-none"
                disabled={loading}
              >
                <option value="pm">Product Manager</option>
                <option value="engineer">Engineer</option>
                <option value="qa">QA Engineer</option>
                <option value="legal">Legal</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading || !formData.username.trim()}
              className="w-full py-2 px-4 bg-[#F9D142] text-[#292826] rounded-md font-semibold hover:bg-yellow-400 disabled:opacity-50"
            >
              {loading ? (showSignUp ? 'Creating Account...' : 'Signing in...') : (showSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="mt-6 text-center">
            {showSignUp ? (
              <span className="text-sm">
                Already have an account?{' '}
                <button onClick={() => setShowSignUp(false)} className="underline text-[#F9D142]">
                  Sign In
                </button>
              </span>
            ) : (
              <span className="text-sm">
                Need an account?{' '}
                <button onClick={() => setShowSignUp(true)} className="underline text-[#F9D142]">
                  Create Account
                </button>
              </span>
            )}
          </div>

          {!showSignUp && (
            <div className="mt-8">
              <div className="text-center mb-3 text-sm">Or try a demo account</div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['alice_pm', 'PM'],
                  ['bob_engineer', 'Eng'],
                  ['carol_qa', 'QA'],
                  ['emma_admin', 'Admin'],
                ].map(([user, label]) => (
                  <button
                    key={user}
                    onClick={() => quickLogin(user, user.split('_')[1])}
                    disabled={loading}
                    className="w-full py-2 border border-[#F9D142] text-[#F9D142] rounded-md hover:bg-[#F9D142] hover:text-[#292826] transition"
                  >
                    {user.split('_')[0]} ({label})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <button
              onClick={onBack}
              className="text-sm underline text-[#F9D142]"
              disabled={loading}
            >
              ← Back to landing page
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginForm
