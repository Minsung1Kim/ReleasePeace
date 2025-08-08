import React, { useState, useEffect } from 'react'
import { config } from './config'
import LandingPage from './components/LandingPage'
import LoginForm from './components/LogInForm'
import Dashboard from './components/Dashboard'
import CompanySelector from './components/CompanySelector'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from './firebase'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'

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
        // User logged in but no company selected
        fetchUserCompanies(savedToken)
      }
    }
  }, [])

  const fetchUserCompanies = async (authToken) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      })
      const data = await response.json()
      
      if (data.success) {
        setCompanies(data.companies)
        if (data.companies.length === 1) {
          // Auto-select if only one company
          handleCompanySelect(data.companies[0], authToken)
        } else {
          setCurrentView('company-select')
        }
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error)
      handleLogout()
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

    const user = userCredential.user
    const idToken = await user.getIdToken()

    setUser({ email: user.email, uid: user.uid })
    setToken(idToken)

    localStorage.setItem('releasepeace_token', idToken)
    localStorage.setItem('releasepeace_user', JSON.stringify({ email: user.email, uid: user.uid }))

    // 🔍 Fetch user's companies
    const response = await fetch(`${config.apiUrl}/api/users`, {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    })

    const data = await response.json()

    if (data.success && data.companies) {
      setCompanies(data.companies)

      if (data.companies.length === 1) {
        // ✅ Auto-select company
        handleCompanySelect(data.companies[0], idToken)
      } else if (data.companies.length > 1) {
        // 👉 Let user choose
        setCurrentView('company-select')
      } else {
        // ❌ No companies yet
        setCurrentView('company-select')
      }
    } else {
      throw new Error('Could not fetch companies')
    }
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

    console.log('✅ Google user:', userCred)

    // Persist auth state
    localStorage.setItem('releasepeace_token', idToken)
    localStorage.setItem(
      'releasepeace_user',
      JSON.stringify({ email: userCred.email, uid: userCred.uid })
    )

    // Update local state
    setUser({ email: userCred.email, uid: userCred.uid })
    setToken(idToken)

    // Now fetch this user’s companies and navigate accordingly
    await fetchUserCompanies(idToken)
  } catch (err) {
    console.error('❌ Google sign-in failed:', err)
    alert('Google login failed')
  }
}


  const handleCompanySelect = async (company, authToken = token) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users/switch-company`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ company_id: company.id })
      })

      const data = await response.json()

      if (data.success) {
        setSelectedCompany(data.company)
        setToken(data.token)

        localStorage.setItem('releasepeace_token', data.token)
        localStorage.setItem('releasepeace_company', JSON.stringify(data.company))

        setCurrentView('dashboard')
      } else {
        throw new Error(data.message || 'Company selection failed')
      }
    } catch (error) {
      console.error('Company selection error:', error)
      throw error
    }
  }


  const handleLogout = () => {
    setUser(null)
    setToken(null)
    setSelectedCompany(null)
    setCompanies([])
    setCurrentView('landing')
    
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
        onGoogleLogin={handleGoogleLogin}  // ✅ Add this
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