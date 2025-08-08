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
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--rp-bg)] text-[var(--rp-text)]">
      <div className="w-full max-w-md">
        <button
          onClick={onBack}
          className="mb-6 rp-link text-sm"
          disabled={loading}
        >
          ← Back
        </button>
        <div className="rp-card p-8">
          <h1 className="text-2xl font-semibold mb-2">
            {showSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mb-6 text-[var(--rp-text-muted)]">
            {showSignUp
              ? 'Sign up to manage flags securely.'
              : 'Sign in to continue.'}
          </p>
          {error && (
            <div className="mb-4 p-3 border border-[var(--rp-border)] rounded text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block mb-2 text-sm text-[var(--rp-text-muted)]">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={loading}
                className="w-full rp-input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm text-[var(--rp-text-muted)]">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={loading}
                className="w-full rp-input"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rp-btn-primary py-2 rounded-md font-semibold disabled:opacity-50"
            >
              {loading
                ? showSignUp ? 'Signing up…' : 'Signing in…'
                : showSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          {!loading && (
            <div className="mt-6 text-center">
              <button
                onClick={onGoogleLogin}
                className="w-full rp-btn-primary py-2 rounded-md font-semibold"
              >
                {showSignUp ? 'Sign up with Google' : 'Sign in with Google'}
              </button>
            </div>
          )}
          <div className="mt-6 text-center text-sm">
            {showSignUp ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => setShowSignUp(false)}
                  className="rp-link"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Need an account?{' '}
                <button
                  onClick={() => setShowSignUp(true)}
                  className="rp-link"
                >
                  Create Account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginForm
