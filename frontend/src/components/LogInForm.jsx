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
      setError(err?.message || 'Failed to authenticate')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--rp-bg)] text-[var(--rp-text)] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 rp-link text-sm"
        >
          ← Back
        </button>

        <div className="rp-card rounded-lg shadow-xl p-8">
          <h1 className="text-2xl font-semibold mb-2">
            {showSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mb-6 text-[var(--rp-text-muted)]">
            {showSignUp
              ? 'Sign up to start managing flags with governance.'
              : 'Sign in to continue to ReleasePeace.'}
          </p>

          {error && (
            <div className="mb-4 p-3 border border-[var(--rp-border)] rounded text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--rp-text-muted)]">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-[var(--rp-input-bg)] text-[var(--rp-text)]
                           border border-[var(--rp-border)] rounded-md focus:outline-none"
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--rp-text-muted)]">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-[var(--rp-input-bg)] text-[var(--rp-text)]
                           border border-[var(--rp-border)] rounded-md focus:outline-none"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 rp-btn-primary rounded-md font-semibold disabled:opacity-50"
            >
              {loading
                ? (showSignUp ? 'Signing up…' : 'Signing in…')
                : (showSignUp ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          {/* Google Sign-In */}
          {!loading && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onGoogleLogin}
                className="w-full py-2 px-4 bg-white text-[var(--rp-bg)]
                           border border-[var(--rp-primary)] rounded-md
                           hover:bg-[var(--rp-primary)] hover:text-black transition"
              >
                {showSignUp ? 'Sign up with Google' : 'Sign in with Google'}
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            {showSignUp ? (
              <span className="text-sm">
                Already have an account?{' '}
                <button onClick={() => setShowSignUp(false)} className="rp-link">
                  Sign In
                </button>
              </span>
            ) : (
              <span className="text-sm">
                Need an account?{' '}
                <button onClick={() => setShowSignUp(true)} className="rp-link">
                  Create Account
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginForm
