// backend/src/middleware/auth.js
// Dual-mode auth: accepts local JWT (JWT_SECRET) OR Firebase ID token.
// On Firebase auth, auto-creates/activates a DB user from token claims.

const jwt = require('jsonwebtoken');
const { User, sequelize } = require('../models');
const { Op } = require('sequelize');

let admin = null;
function ensureFirebaseAdmin() {
  if (admin) return admin;
  try {
    admin = require('firebase-admin');
    if (admin.apps.length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        console.log('✅ FIREBASE_SERVICE_ACCOUNT present. Parsing…');
        const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(svc) });
        console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT');
      } else {
        // No creds provided; admin SDK won’t be able to verify production tokens
        console.warn('⚠️ No FIREBASE_SERVICE_ACCOUNT env var found. Firebase Admin not initialized.');
      }
    }
  } catch (e) {
    console.warn('⚠️ Firebase Admin not available. Only local JWTs will work.', e?.message);
    admin = null;
  }
  return admin;
}

async function verifyLocalJWT(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_change_this');
    return decoded && decoded.userId ? decoded : null;
  } catch {
    return null;
  }
}

async function verifyFirebaseToken(token) {
  const fb = ensureFirebaseAdmin();
  if (!fb) return null;
  try {
    const payload = await fb.auth().verifyIdToken(token);
    return payload || null;
  } catch (err) {
    console.error('❌ Firebase verifyIdToken failed:', err?.message);
    return null;
  }
}

async function getOrCreateUserFromFirebase(payload) {
  const email = payload.email || `${payload.uid}@firebase.local`;
  const username = (email.split('@')[0] || payload.uid).toLowerCase();

  // Try to find by email first, then username
  let user = await User.findOne({ where: { email } });
  if (!user) user = await User.findOne({ where: { username } });

  if (!user) {
    user = await User.create({
      username,
      email,
      display_name: payload.name || username,
      role: 'pm',
      is_active: true
    });
    console.log('👤 Created DB user from Firebase:', user.id, username);
  } else if (!user.is_active) {
    await user.update({ is_active: true });
  }
  return user;
}

async function authMiddleware(req, res, next) {
  try {
    const raw = req.header('Authorization') || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Access denied', message: 'No token provided' });
    }

    // 1) Local JWT path
    const local = await verifyLocalJWT(token);
    if (local?.userId) {
      const user = await User.findByPk(local.userId);
      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'Access denied', message: 'Invalid token' });
      }
      req.user = user;
      return next();
    }

    // 2) Firebase ID token path
    const fb = await verifyFirebaseToken(token);
    if (fb?.uid) {
      const user = await getOrCreateUserFromFirebase(fb);
      req.user = user;
      return next();
    }

    return res.status(401).json({ error: 'Access denied', message: 'Invalid token' });
  } catch (e) {
    console.error('Auth middleware error:', e);
    return res.status(401).json({ error: 'Access denied', message: 'Invalid token' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const raw = req.header('Authorization') || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
    if (!token) return next();

    const local = await verifyLocalJWT(token);
    if (local?.userId) {
      const user = await User.findByPk(local.userId);
      if (user?.is_active) req.user = user;
      return next();
    }

    const fb = await verifyFirebaseToken(token);
    if (fb?.uid) {
      const user = await getOrCreateUserFromFirebase(fb);
      req.user = user;
    }
    return next();
  } catch {
    return next();
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Access denied', message: 'Authentication required' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied', message: 'Insufficient permissions' });
  }
  next();
};

module.exports = {
  authMiddleware,
  optionalAuth,
  // Alias for consistency across routes
  requireAuth: authMiddleware,
};
