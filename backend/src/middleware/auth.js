// backend/src/middleware/auth.js
// Dual-mode auth: accepts local JWT (JWT_SECRET) OR Firebase ID token.
// Creates/updates a DB user from Firebase claims when needed.

const jwt = require('jsonwebtoken')
const { User } = require('../models')

let admin = null
function initFirebaseAdmin() {
  if (admin) return admin
  try {
    // Lazy require to avoid startup failure if not installed
    // Install: npm i firebase-admin
    admin = require('firebase-admin')

    if (admin.apps.length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        admin.initializeApp({ credential: admin.credential.cert(creds) })
      } else {
        // Will use ADC if GOOGLE_APPLICATION_CREDENTIALS is set
        admin.initializeApp()
      }
    }
  } catch (e) {
    admin = null
  }
  return admin
}

async function verifyLocalJWT(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_change_this')
    return { kind: 'local', payload: decoded }
  } catch {
    return null
  }
}

async function verifyFirebaseToken(token) {
  const fb = initFirebaseAdmin()
  if (!fb) return null
  try {
    const payload = await fb.auth().verifyIdToken(token)
    return { kind: 'firebase', payload }
  } catch {
    return null
  }
}

async function getOrCreateUserFromFirebase(payload) {
  // Prefer email; fallback to uid if no email.
  const email = payload.email || `${payload.uid}@firebase.local`
  const username = (email.split('@')[0] || payload.uid).toLowerCase()

  // Try to find by email first
  let user = await User.findOne({ where: { email } })
  if (!user) {
    // Fallback to username
    user = await User.findOne({ where: { username } })
  }

  if (!user) {
    user = await User.create({
      username,
      email,
      display_name: payload.name || username,
      role: 'member',           // default; app-level role in company handled separately
      is_active: true
    })
  } else if (!user.is_active) {
    // Soft reactivate if needed
    await user.update({ is_active: true })
  }

  return user
}

const authMiddleware = async (req, res, next) => {
  try {
    const raw = req.header('Authorization') || ''
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'Access denied', message: 'No token provided' })
    }

    // 1) Try local JWT first
    const local = await verifyLocalJWT(token)
    if (local?.payload?.userId) {
      const user = await User.findByPk(local.payload.userId)
      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'Access denied', message: 'Invalid token' })
      }
      req.user = user
      return next()
    }

    // 2) Fallback: verify Firebase ID token
    const fb = await verifyFirebaseToken(token)
    if (fb?.payload) {
      const user = await getOrCreateUserFromFirebase(fb.payload)
      req.user = user
      return next()
    }

    // 3) Nothing verified
    return res.status(401).json({ error: 'Access denied', message: 'Invalid token' })
  } catch (error) {
    console.error('Auth middleware error:', error)
    return res.status(401).json({ error: 'Access denied', message: 'Invalid token' })
  }
}

// Optional auth - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const raw = req.header('Authorization') || ''
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null
    if (!token) return next()

    const local = await verifyLocalJWT(token)
    if (local?.payload?.userId) {
      const user = await User.findByPk(local.payload.userId)
      if (user?.is_active) req.user = user
      return next()
    }

    const fb = await verifyFirebaseToken(token)
    if (fb?.payload) {
      const user = await getOrCreateUserFromFirebase(fb.payload)
      req.user = user
    }
    return next()
  } catch {
    return next()
  }
}

// Role-based (global user-level) — keep if you need it elsewhere
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Access denied', message: 'Authentication required' })
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied', message: 'Insufficient permissions' })
    }
    next()
  }
}

module.exports = { authMiddleware, optionalAuth, requireRole }
