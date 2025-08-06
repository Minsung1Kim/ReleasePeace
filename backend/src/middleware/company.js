// backend/src/middleware/company.js
// Based on your successful Upstand pattern

const { Company, User } = require('../models');
const logger = require('../utils/logger');

/**
 * Extract company context from request (following your Upstand pattern)
 */
const extractCompanyContext = async (req, res, next) => {
  try {
    let companyId = null;

    // Strategy 1: X-Company-ID header (your existing approach)
    if (req.headers['x-company-id']) {
      companyId = req.headers['x-company-id'];
    }

    // Strategy 2: JWT token contains company info (if user is authenticated)
    if (!companyId && req.user && req.user.company_id) {
      companyId = req.user.company_id;
    }

    // Strategy 3: Subdomain (new addition for ReleasePeace)
    if (!companyId) {
      const host = req.get('host');
      if (host) {
        const subdomain = host.split('.')[0];
        if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
          // Look up company by subdomain
          const company = await Company.findOne({ 
            where: { subdomain, is_active: true } 
          });
          if (company) {
            companyId = company.id;
          }
        }
      }
    }

    if (!companyId) {
      return res.status(400).json({
        error: 'Company context required',
        message: 'Please provide X-Company-ID header or access via company subdomain'
      });
    }

    // Verify company exists and is active
    const company = await Company.findByPk(companyId);
    if (!company || !company.is_active) {
      return res.status(404).json({
        error: 'Company not found',
        message: 'Invalid company or company is inactive'
      });
    }

    // Set company context (following your pattern)
    req.company = company;
    req.companyId = company.id;
    req.company_id = company.id; // Match your naming convention

    logger.debug('Company context set', {
      companyId: company.id,
      companyName: company.name,
      userId: req.user?.id
    });

    next();
  } catch (error) {
    logger.error('Company context error:', error);
    res.status(500).json({
      error: 'Company resolution failed',
      message: 'Failed to resolve company context'
    });
  }
};

/**
 * Optional company context for public endpoints
 */
const optionalCompanyContext = async (req, res, next) => {
  try {
    await extractCompanyContext(req, res, next);
  } catch (error) {
    // Don't fail for optional context
    next();
  }
};

/**
 * Ensure user belongs to the current company
 */
const requireCompanyMembership = async (req, res, next) => {
  try {
    if (!req.user || !req.companyId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User and company context required'
      });
    }

    // Check if user is member of this company
    const userCompany = await UserCompany.findOne({
      where: {
        user_id: req.user.id,
        company_id: req.companyId,
        status: 'active'
      }
    });

    if (!userCompany) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'User is not a member of this company'
      });
    }

    req.userCompanyRole = userCompany.role;
    next();
  } catch (error) {
    logger.error('Company membership check error:', error);
    res.status(500).json({
      error: 'Membership check failed'
    });
  }
};

module.exports = {
  extractCompanyContext,
  optionalCompanyContext,
  requireCompanyMembership
};