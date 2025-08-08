const jwt = require('jsonwebtoken');
const { User } = require('../models');

let admin = null;
function ensureFirebaseAdmin() {
  if (admin) return admin;
  try {
    admin = require('firebase-admin');
    if (admin.apps.length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(svc) });
        console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT');
      } else {
        admin.initializeApp(); // ADC path if configured
        console.log('✅ Firebase Admin initialized with ADC');
      }
    }
  } catch (e) {
    admin = null;
    console.warn('⚠️ Firebase Admin not available. Only local JWTs will work.');
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
    return null;
  }
}

async function getOrCreateUserFromFirebase(payload) {
  const email = payload.email || `${payload.uid}@firebase.local`;
  const username = (email.split('@')[0] || payload.uid).toLowerCase();

  // Try by email, then username
  let user = await User.findOne({ where: { email } });
  if (!user) user = await User.findOne({ where: { username } });

  if (!user) {
    user = await User.create({
      username,
      email,
      display_name: payload.name || username,
      role: 'member',     // global user role; company-specific role handled in UserCompany
      is_active: true,
    });
    console.log('👤 Created user from Firebase:', user.id, username);
  } else if (!user.is_active) {
    await user.update({ is_active: true });
  }

  return user;
}

const authMiddleware = async (req, res, next) => {
  try {
    const raw = req.header('Authorization') || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Access denied', message: 'No token provided' });
    }

    // 1) Local JWT
    const local = await verifyLocalJWT(token);
    if (local?.userId) {
      const user = await User.findByPk(local.userId);
      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'Access denied', message: 'Invalid token' });
      }
      req.user = user;
      return next();
    }

    // 2) Firebase ID token
    const fb = await verifyFirebaseToken(token);
    if (fb?.uid) {
      const user = await getOrCreateUserFromFirebase(fb);
      req.user = user;
      return next();
    }

    return res.status(401).json({ error: 'Access denied', message: 'Invalid token' });
  } catch (err) {
    console.error('Auth middleware error:', err);
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

module.exports = { authMiddleware, optionalAuth, requireRole };
