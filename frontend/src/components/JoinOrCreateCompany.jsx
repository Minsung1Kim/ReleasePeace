import React, { useState } from 'react'
import { config } from '../config'

function JoinOrCreateCompany({ token, onCompanySelect, onLogout }) {
  const [companyName, setCompanyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreateCompany = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${config.apiUrl}/api/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: companyName }),
      })
      const data = await res.json()
      if (data.success) {
        onCompanySelect(data.company)
      } else {
        setError(data.error || 'Failed to create company')
      }
    } catch (err) {
      console.error(err)
      setError('Server error')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinCompany = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${config.apiUrl}/api/companies/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invite_code: inviteCode }),
      })
      const data = await res.json()
      if (data.success) {
        onCompanySelect(data.company)
      } else {
        setError(data.error || 'Failed to join company')
      }
    } catch (err) {
      console.error(err)
      setError('Server error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#292826] text-white px-4">
      <h1 className="text-3xl font-bold mb-6 text-[#F9D342]">Welcome to ReleasePeace</h1>

      <div className="bg-[#1E1E1E] p-6 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Create a New Company</h2>
        <input
          type="text"
          placeholder="Company Name"
          className="w-full p-2 rounded mb-2 text-black"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        <button
          onClick={handleCreateCompany}
          disabled={loading || !companyName}
          className="w-full bg-[#F9D342] text-black py-2 px-4 rounded hover:bg-yellow-400 disabled:opacity-50"
        >
          Create Company
        </button>
      </div>

      <div className="mt-8 bg-[#1E1E1E] p-6 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Join with Invite Code</h2>
        <input
          type="text"
          placeholder="Enter Invite Code"
          className="w-full p-2 rounded mb-2 text-black"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />
        <button
          onClick={handleJoinCompany}
          disabled={loading || !inviteCode}
          className="w-full bg-[#F9D342] text-black py-2 px-4 rounded hover:bg-yellow-400 disabled:opacity-50"
        >
          Join Company
        </button>
      </div>

      {error && <p className="text-red-400 mt-4">{error}</p>}

      <button onClick={onLogout} className="mt-8 text-sm underline text-gray-400">
        Log out
      </button>
    </div>
  )
}

export default JoinOrCreateCompany
