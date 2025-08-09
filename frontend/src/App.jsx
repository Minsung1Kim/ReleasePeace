import React, { useState, useEffect } from 'react'
import { config } from './config'
import LandingPage from './components/LandingPage'
import LoginForm from './components/LogInForm'
import Dashboard from './components/Dashboard'
import CompanySelector from './components/CompanySelector'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from 'firebase/auth'
import { auth } from './firebase'

function App() {
  const [currentView, setCurrentView] = useState('landing')
  const [user, setUser] = useState(null)
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [token, setToken] = useState(null)

  // keep auth in sync (handles refresh & tab restore)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) return
      const fresh = await fbUser.getIdToken(true)
      setToken(fresh)
      setUser({ email: fbUser.email, uid: fbUser.uid })
      localStorage.setItem('releasepeace_token', fresh)
      localStorage.setItem('releasepeace_user', JSON.stringify({ email: fbUser.email, uid: fbUser.uid }))
    })
    return () => unsub()
  }, [])

  // boot from storage
  useEffect(() => {
    const savedToken = localStorage.getItem('releasepeace_token')
    const savedUser = localStorage.getItem('releasepeace_user')
    const savedCompany = localStorage.getItem('releasepeace_company')

    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
      if (savedCompany) {
        setSelectedCompany(JSON.parse(savedCompany))
        setCurrentView('dashboard')
      } else {
        fetchUserCompanies(savedToken)
      }
    }
  }, [])

  // Handle invite code in URL after authentication
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get('invite') || '').trim();
    if (!code) return;

    (async () => {
      try {
        // POST /api/companies/join { invite_code: code }
        if (window.companies && window.companies.join) {
          await window.companies.join(code);
        } else {
          // fallback: direct fetch
          await fetch(`${config.apiUrl}/api/companies/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ invite_code: code })
          });
        }
        params.delete('invite');
        const url = window.location.pathname + (params.toString() ? `?${params}` : '');
        window.history.replaceState({}, '', url);
        if (typeof fetchUserCompanies === 'function') {
          await fetchUserCompanies(token);
        } else {
          window.location.reload();
        }
      } catch (e) {
        alert(e?.data?.message || e.message);
      }
    })();
  }, [token]);

  // always return a fresh token (and persist)
  const getFreshToken = async () => {
    if (auth.currentUser) {
      try {
        const fresh = await auth.currentUser.getIdToken(true)
        setToken(fresh)
        localStorage.setItem('releasepeace_token', fresh)
        return fresh
      } catch {
        // fall back to last known token
      }
    }
    return token
  }

  const fetchUserCompanies = async (authToken) => {
    try {
      const t = authToken || (await getFreshToken())
      const res = await fetch(`${config.apiUrl}/api/companies/mine`, {
        headers: { Authorization: `Bearer ${t}` }
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.companies)) {
        setCompanies(data.companies)
        if (data.companies.length === 1) {
          handleCompanySelect(data.companies[0], t)
        } else {
          setCurrentView('company-select')
        }
      } else {
        throw new Error(data?.message || 'Could not load companies')
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err)
      setCompanies([])
      setCurrentView('company-select')
    }
  }

  const handleLogin = async (credentials, mode = 'login') => {
    const { email, password } = credentials
    try {
      let userCredential
      if (mode === 'signup') {
        userCredential = await createUserWithEmailAndPassword(auth, email, password)
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password)
      }
      const userCred = userCredential.user
      const idToken = await userCred.getIdToken(true)

      setUser({ email: userCred.email, uid: userCred.uid })
      setToken(idToken)
      localStorage.setItem('releasepeace_token', idToken)
      localStorage.setItem('releasepeace_user', JSON.stringify({ email: userCred.email, uid: userCred.uid }))

      if (mode === 'signup') {
        setCurrentView('company-select')
        return
      }
      await fetchUserCompanies(idToken)
    } catch (error) {
      console.error('❌ Login error:', error)
      throw error
    }
  }

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
      const userCred = result.user
      const idToken = await userCred.getIdToken(true)

      localStorage.setItem('releasepeace_token', idToken)
      localStorage.setItem('releasepeace_user', JSON.stringify({ email: userCred.email, uid: userCred.uid }))
      setUser({ email: userCred.email, uid: userCred.uid })
      setToken(idToken)

      await fetchUserCompanies(idToken)
    } catch (err) {
      console.error('❌ Google sign-in failed:', err)
      alert('Google login failed')
    }
  }

  const handleCompanySelect = async (company) => {
    setSelectedCompany(company)
    localStorage.setItem('releasepeace_company', JSON.stringify(company))
    setCurrentView('dashboard')
  }

  const handleLogout = () => {
    setUser(null)
    setToken(null)
    setCompanies([])
    setSelectedCompany(null)
    setCurrentView('login')
    localStorage.removeItem('releasepeace_token')
    localStorage.removeItem('releasepeace_user')
    localStorage.removeItem('releasepeace_company')
  }

  const handleBackToCompanySelect = () => {
    setSelectedCompany(null)
    localStorage.removeItem('releasepeace_company')
    setCurrentView('company-select')
  }

  switch (currentView) {
    case 'login':
      return (
        <LoginForm
          onLogin={handleLogin}
          onGoogleLogin={handleGoogleLogin}
          onBack={() => setCurrentView('landing')}
        />
      )
    case 'company-select':
      return (
        <CompanySelector
          user={user}
          companies={companies}
          token={token}
          onCompanySelect={handleCompanySelect}
          onLogout={handleLogout}
          onCompaniesUpdate={setCompanies}
        />
      )
    case 'dashboard':
      return (
        <Dashboard
          user={user}
          company={selectedCompany}
          token={token}
          getToken={getFreshToken}  // 🔑 pass refresher
          onLogout={handleLogout}
          onSwitchCompany={handleBackToCompanySelect}
        />
      )
    default:
      return <LandingPage onEnterApp={() => setCurrentView('login')} />
  }
}

export default App
