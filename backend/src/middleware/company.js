function resolveCompanyId(req) {
  return (
    req.headers['x-company-id'] ||
    req.params?.companyId || req.params?.id ||  // ✅ accept path /companies/:companyId/*
    req.companyId ||
    req.company?.id
  );
}

function resolveCompanyId(req) {
  return (
    req.headers['x-company-id'] ||
    req.params?.companyId || req.params?.id ||  // ✅ accept path /companies/:companyId/*
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

const { Company, UserCompany } = require('../models');

exports.requireCompanyMembership = async (req, res, next) => {
  try {
    const companyId = req.params.companyId || req.get('X-Company-ID');
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
  } catch (err) { next(err); }
};

exports.requireCompanyAdmin = (req, res, next) => {
  if (!req.membership) return res.status(403).json({ error: 'Not a member' });
  if (!['owner', 'admin'].includes(req.membership.role)) {
    return res.status(403).json({ error: 'Insufficient role' });
  }
  next();
};

const logger = (() => { try { return require('../utils/logger'); } catch { return console; } })();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function extractCompanyContext(req, res, next) {
  try {
    const headerId      = req.header('X-Company-Id');
    const headerDomain  = req.header('X-Company-Domain') || req.header('X-Company-Subdomain');
    const paramId       = req.params.companyId;

    // Try header/param UUID first
    let company = null;
    const tryId = headerId || paramId;
    if (tryId && UUID_RE.test(String(tryId))) {
      company = await Company.findByPk(tryId);
    }

    // If not found, try subdomain/domain from header or host
    if (!company) {
      const host = (req.headers.host || '').toLowerCase();
      const fromHeader = (headerDomain || '').toLowerCase() || null;

      // parse subdomain like acme.release-peace.vercel.app
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

    if (!company) {
      return res.status(400).json({ error: 'Failed to resolve company context' });
    }

    req.company = company;
    req.companyId = company.id;
    return next();
  } catch (e) {
    logger.error('extractCompanyContext error:', e);
    return res.status(500).json({ error: 'Company context error' });
  }
}

// ✅ export everything
module.exports = {
  resolveCompanyId,
  requireCompanyContext,
  extractCompanyContext,
  requireCompanyMembership,
};