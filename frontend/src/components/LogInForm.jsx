import React, { useState } from 'react'

const LoginForm = ({ onLogin, onBack, onGoogleLogin }) => {
  const [formData, setFormData] = useState({ email: '', password: '' })
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
      await onLogin(formData, showSignUp ? 'signup' : 'login')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#292826] text-[#F9D142] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-[#1f1e1c] border border-[#F9D142] rounded-lg shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">
              {showSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="text-[#e6cf63]">
              {showSignUp ? 'Enter your email and password to sign up' : 'Login to your dashboard'}
            </p>
          </div>

          {error && (
            <div className="bg-red-900 border border-red-700 rounded-md p-4 mb-6 text-red-200">
              <h3 className="text-sm font-semibold mb-1">Error</h3>
              <div className="text-sm">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-[#2d2c2a] text-[#F9D142] border border-[#F9D142] rounded-md focus:outline-none"
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-[#2d2c2a] text-[#F9D142] border border-[#F9D142] rounded-md focus:outline-none"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-[#F9D142] text-[#292826] rounded-md font-semibold hover:bg-yellow-400 disabled:opacity-50"
            >
              {loading ? (showSignUp ? 'Signing up...' : 'Signing in...') : (showSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          {/* 🔹 Google Sign-In Button */}
          {!loading && (
            <div className="mt-6 text-center">
              <button
              type="button"
              onClick={onGoogleLogin}
              className="w-full py-2 px-4 bg-white text-[#292826] font-semibold border border-[#F9D142] rounded-md hover:bg-[#F9D142] hover:text-black transition"
            >
              {showSignUp ? 'Sign up with Google' : 'Sign in with Google'}
            </button>
            </div>
          )}

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
