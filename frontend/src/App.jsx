// frontend/src/App.jsx - COMPLETE UPDATED FILE
import React, { useState, useEffect } from 'react'
import { config } from './config'
import LandingPage from './components/LandingPage'
import LoginForm from './components/LoginForm'
import Dashboard from './components/Dashboard'
import CompanySelector from './components/CompanySelector'

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
      const response = await fetch(`${config.apiUrl}/api/users/me`, {
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

  const handleLogin = async (credentials) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials)
      })

      const data = await response.json()

      if (data.success) {
        setUser(data.user)
        setToken(data.token)
        setCompanies(data.companies)

        // Save to localStorage
        localStorage.setItem('releasepeace_token', data.token)
        localStorage.setItem('releasepeace_user', JSON.stringify(data.user))

        if (data.selected_company) {
          setSelectedCompany(data.selected_company)
          localStorage.setItem('releasepeace_company', JSON.stringify(data.selected_company))
          setCurrentView('dashboard')
        } else if (data.companies.length === 1) {
          // Auto-select single company
          handleCompanySelect(data.companies[0], data.token)
        } else if (data.companies.length > 1) {
          setCurrentView('company-select')
        } else {
          // No companies - show company creation/join
          setCurrentView('company-select')
        }
      } else {
        throw new Error(data.message || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      throw error
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

        // Update localStorage
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
      return <LoginForm onLogin={handleLogin} onBack={() => setCurrentView('landing')} />
    
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