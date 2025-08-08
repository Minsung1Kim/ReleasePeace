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
  return async (req, res, next) => {
    try {
      const userId = req.user?.id
      const companyId =
        req.company?.id ||
        req.headers['x-company-id'] ||
        req.params.companyId

      const role = await getUserRoleInCompany(userId, companyId)
      if (!role || !allowed.map(r => r.toLowerCase()).includes(role.toLowerCase())) {
        return res.status(403).json({ error: 'Forbidden: insufficient role' })
      }
      req.userRole = role
      return next()
    } catch (err) {
      console.error('requireRole error:', err)
      return res.status(500).json({ error: 'Authorization check failed' })
    }
  }
}

module.exports = { requireRole, getUserRoleInCompany }
