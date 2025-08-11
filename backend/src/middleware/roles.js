// backend/src/middleware/roles.js
const { UserCompany } = require('../models')

async function getUserRoleInCompany(userId, companyId) {
  if (!userId || !companyId) return null
  const uc = await UserCompany.findOne({
    where: { user_id: userId, company_id: companyId, status: 'active' },
    attributes: ['role'],
  })
  return uc?.role || null
}

/**
 * requireRole(...roles)
 * Ensures the authed user has one of the allowed roles for the current company.
 * Needs req.user (authMiddleware) and req.company (extractCompanyContext) or X-Company-ID header.
 */
function requireRole(...allowed) {
  const allowedFlat = allowed.flat().filter(Boolean).map(r => String(r).toLowerCase());
  return async (req, res, next) => {
    try {
      const role = String(req.membership?.role ?? req.user?.role ?? '').toLowerCase();
      if (!role) return res.status(401).json({ error: 'No role on user/company membership' });
      if (!allowedFlat.includes(role)) return res.status(403).json({ error: 'Insufficient role' });
      next();
    } catch (e) {
      console.error('requireRole error:', e);
      res.status(500).json({ error: 'Role check failed' });
    }
  };
}

module.exports = { requireRole, getUserRoleInCompany }
