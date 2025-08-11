// backend/src/middleware/company.js
const { Company, UserCompany } = require('../models');

const logger = (() => { try { return require('../utils/logger'); } catch { return console; } })();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveCompanyId(req) {
  return (
    req.get('X-Company-Id') ||
    req.headers['x-company-id'] ||
    req.params?.companyId ||
    req.params?.id ||
    req.companyId ||
    req.company?.id
  );
}

function requireCompanyContext(req, res, next) {
  const id = resolveCompanyId(req);
  if (!id) return res.status(400).json({ error: 'Missing companyId' });
  req.companyId = id;
  next();
}

async function extractCompanyContext(req, res, next) {
  try {
    const headerId      = req.get('X-Company-Id');
    const headerDomain  = req.get('X-Company-Domain') || req.get('X-Company-Subdomain');
    const paramId       = req.params.companyId;

    let company = null;

    // Prefer UUID first
    const tryId = headerId || paramId;
    if (tryId && UUID_RE.test(String(tryId))) {
      company = await Company.findByPk(tryId);
    }

    // Fallback to subdomain/domain
    if (!company) {
      const host = (req.headers.host || '').toLowerCase();
      const fromHeader = (headerDomain || '').toLowerCase() || null;

      let sub = null;
      if (host) {
        const parts = host.split('.');
        if (parts.length > 2) sub = parts[0];
      }
      const key = fromHeader || sub;

      if (key) {
        company = await Company.findOne({ where: { subdomain: key } })
               || await Company.findOne({ where: { domain: key } });
      }
    }

    if (!company) return res.status(400).json({ error: 'Failed to resolve company context' });

    req.company = company;
    req.companyId = company.id;
    next();
  } catch (e) {
    logger.error('extractCompanyContext error:', e);
    res.status(500).json({ error: 'Company context error' });
  }
}

const requireCompanyMembership = async (req, res, next) => {
  try {
    const companyId = req.params.companyId || req.get('X-Company-Id');
    if (!companyId) return res.status(400).json({ error: 'Missing company id' });

    const company = await Company.findByPk(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const membership = await UserCompany.findOne({
      where: { company_id: company.id, user_id: req.user.id, status: 'active' }
    });
    if (!membership) return res.status(403).json({ error: 'Not a member of this company' });

    req.company = company;
    req.membership = membership;
    next();
  } catch (err) {
    next(err);
  }
};

function requireCompanyAdmin(req, res, next) {
  if (!req.membership) return res.status(403).json({ error: 'Not a member' });
  if (!['owner', 'admin'].includes(String(req.membership.role).toLowerCase())) {
    return res.status(403).json({ error: 'Insufficient role' });
  }
  next();
}

module.exports = {
  resolveCompanyId,
  requireCompanyContext,
  extractCompanyContext,
  requireCompanyMembership,
  requireCompanyAdmin,
};
