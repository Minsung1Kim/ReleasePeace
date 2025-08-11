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
function requireRole(required) {
  const need = (Array.isArray(required) ? required : [required]).map(r => String(r).toLowerCase());
  return (req, res, next) => {
    // Always check membership for company-scoped routes
    const role = String(req.membership?.role || '').toLowerCase();
    if (!role) return res.status(403).json({ error: 'Not a member' });
    if (!need.includes(role)) return res.status(403).json({ error: 'Insufficient role', role });
    next();
  };
}

module.exports = { requireRole, getUserRoleInCompany }
