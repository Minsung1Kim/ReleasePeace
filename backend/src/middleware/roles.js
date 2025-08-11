// backend/src/middleware/roles.js
const { UserCompany } = require('../models')
const { resolveCompanyId } = require('./company');

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
// normalize and accept arrays
const requireRole = (allowed) => {
  const allow = new Set(Array.isArray(allowed) ? allowed : [allowed]);
  return (req, res, next) => {
    const role = req.membership?.role || req.userRole || req.user?.role;
    if (!role) return res.status(403).json({ error: 'Insufficient role', message: 'No role on request' });
    if (!allow.has(role) && !allow.has('any')) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
};

module.exports = { requireRole, getUserRoleInCompany }
