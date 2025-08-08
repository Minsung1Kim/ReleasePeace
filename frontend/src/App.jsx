import React, { useState, useEffect } from 'react'
import { config } from './config'
import LandingPage from './components/LandingPage'
import LoginForm from './components/LogInForm'
import Dashboard from './components/Dashboard'
import CompanySelector from './components/CompanySelector'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from './firebase'

function App() {
  const [currentView, setCurrentView] = useState('landing') // 'landing', 'login', 'company-select', 'dashboard'
  const [user, setUser] = useState(null)
  const [companies, setCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [token, setToken] = useState(null)

  // Check for existing session on load
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
        // User logged in but no company selected → look up companies
        fetchUserCompanies(savedToken)
      }
    }
  }, [])

  const fetchUserCompanies = async (authToken) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/companies/mine`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })
      const data = await response.json()
      
      if (data.success && Array.isArray(data.companies)) {
        setCompanies(data.companies)
        if (data.companies.length === 1) {
          // Auto-select if only one company
          handleCompanySelect(data.companies[0], authToken)
        } else {
          setCurrentView('company-select')
        }
      } else {
        throw new Error(data?.message || 'Could not load companies')
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error)
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
      const idToken = await userCred.getIdToken()

      if (mode === 'signup') {
        // New user: go straight to company select
        setUser({ email: userCred.email, uid: userCred.uid });
        setToken(idToken);
        localStorage.setItem('releasepeace_token', idToken);
        localStorage.setItem('releasepeace_user', JSON.stringify({ email: userCred.email, uid: userCred.uid }));
        setCurrentView('company-select');
        return;
      }

      // fallback for login
      setUser({ email: userCred.email, uid: userCred.uid })
      setToken(idToken)
      localStorage.setItem('releasepeace_token', idToken)
      localStorage.setItem('releasepeace_user', JSON.stringify({ email: userCred.email, uid: userCred.uid }))
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
      const idToken = await userCred.getIdToken()

      // Persist
      localStorage.setItem('releasepeace_token', idToken)
      localStorage.setItem('releasepeace_user', JSON.stringify({ email: userCred.email, uid: userCred.uid }))
      setUser({ email: userCred.email, uid: userCred.uid })
      setToken(idToken)

      // Load companies & navigate
      await fetchUserCompanies(idToken)
    } catch (err) {
      console.error('❌ Google sign-in failed:', err)
      alert('Google login failed')
    }
  }

  // 🔑 Select company (no server round-trip required for mock API)
  const handleCompanySelect = async (company, authToken = token) => {
    try {
      setSelectedCompany(company)
      localStorage.setItem('releasepeace_company', JSON.stringify(company))
      setCurrentView('dashboard')
    } catch (error) {
      console.error('Company selection error:', error)
      throw error
    }
  }

  const handleLogout = () => {
    setUser(null)
    setToken(null)
    setCompanies([])
    setSelectedCompany(null)
    setCurrentView('login')

    // Clear localStorage
    localStorage.removeItem('releasepeace_token')
    localStorage.removeItem('releasepeace_user')
    localStorage.removeItem('releasepeace_company')
  }

  const handleBackToCompanySelect = () => {
    setSelectedCompany(null)
    localStorage.removeItem('releasepeace_company')
    setCurrentView('company-select')
  }

  // Render based on current view
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
          onLogout={handleLogout}
          onSwitchCompany={handleBackToCompanySelect}
        />
      )
    
    default:
      return <LandingPage onEnterApp={() => setCurrentView('login')} />
  }
}

export default App
