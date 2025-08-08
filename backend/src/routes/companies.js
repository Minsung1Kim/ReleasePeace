// backend/src/routes/companies.js
const express = require('express');
const crypto = require('crypto');
const { authMiddleware } = require('../middleware/auth');
const { extractCompanyContext } = require('../middleware/company');
const { Company, UserCompany, User } = require('../models');

const router = express.Router();

/**
 * Helper to shape member rows
 */
function toMemberList(rows) {
  return rows.map((m) => ({
    id: m.user.id,
    username: m.user.username,
    email: m.user.email,
    display_name: m.user.display_name,
    role: m.role,
    joined_at: m.joined_at,
  }));
}

/**
 * POST /api/companies
 * Create a company; creator becomes owner
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, subdomain, domain } = req.body;
    const userId = req.user.id;

    if (!name) return res.status(400).json({ error: 'Company name is required' });

    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const company = await Company.create({
      name,
      subdomain: subdomain || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      domain,
      invite_code: inviteCode,
      owner_id: userId,
      plan: 'starter',
      is_active: true,
    });

    await UserCompany.create({
      user_id: userId,
      company_id: company.id,
      role: 'owner',
      status: 'active',
      joined_at: new Date(),
    });

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        subdomain: company.subdomain,
        invite_code: inviteCode,
        role: 'owner',
        plan: company.plan,
      },
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Company subdomain or domain already exists' });
    }
    console.error('Error creating company:', error);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

/**
 * GET /api/companies/mine
 * List companies for current user
 */
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const userCompanies = await UserCompany.findAll({
      where: { user_id: userId, status: 'active' },
      include: [{ model: Company, as: 'company', where: { is_active: true } }],
      order: [['joined_at', 'DESC']],
    });

    const companies = userCompanies.map((uc) => ({
      id: uc.company.id,
      name: uc.company.name,
      subdomain: uc.company.subdomain,
      role: uc.role,
      joined_at: uc.joined_at,
      plan: uc.company.plan,
    }));

    res.json({ success: true, companies });
  } catch (error) {
    console.error('Error fetching user companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

/**
 * POST /api/companies/join
 * Join a company by invite code
 */
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { invite_code, role } = req.body;
    const userId = req.user.id;

    if (!invite_code) return res.status(400).json({ error: 'Invite code is required' });

    const company = await Company.findOne({
      where: { invite_code: String(invite_code).toUpperCase(), is_active: true },
    });

    if (!company) return res.status(404).json({ error: 'Invalid invite code' });

    const existing = await UserCompany.findOne({
      where: { user_id: userId, company_id: company.id },
    });
    if (existing) return res.status(400).json({ error: 'Already a member of this company' });

    const safeRole = (role || 'member').toLowerCase();
    await UserCompany.create({
      user_id: userId,
      company_id: company.id,
      role: ['owner', 'pm', 'engineer', 'qa', 'legal', 'member'].includes(safeRole)
        ? safeRole
        : 'member',
      status: 'active',
      joined_at: new Date(),
    });

    res.json({
      success: true,
      message: 'Successfully joined company',
      company: { id: company.id, name: company.name, role: safeRole, subdomain: company.subdomain, plan: company.plan },
    });
  } catch (error) {
    console.error('Error joining company:', error);
    res.status(500).json({ error: 'Failed to join company' });
  }
});

/**
 * GET /api/companies/:companyId
 * Return company details + members + viewer_role
 * (This is the route your modal calls.)
 */
router.get('/:companyId', authMiddleware, async (req, res) => {
  try {
    // accept both "175..." and "company_175..."
    const rawId = String(req.params.companyId || '');
    const companyId = rawId.startsWith('company_') ? rawId.slice(8) : rawId;

    const company = await Company.findByPk(companyId);
    if (!company || !company.is_active) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // viewer role (for gating actions in UI)
    const viewerUC = await UserCompany.findOne({
      where: { user_id: req.user.id, company_id: company.id, status: 'active' },
    });
    const viewer_role = viewerUC?.role || null;

    // members
    const members = await UserCompany.findAll({
      where: { company_id: company.id, status: 'active' },
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'email', 'display_name'] }],
      order: [['joined_at', 'DESC']],
    });

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        subdomain: company.subdomain,
        domain: company.domain,
        plan: company.plan,
        invite_code: company.invite_code,
        settings: company.settings,
        member_count: members.length,
        members: toMemberList(members),
        viewer_role,
      },
    });
  } catch (error) {
    console.error('Error fetching company details:', error);
    res.status(500).json({ error: 'Failed to fetch company details' });
  }
});

/**
 * POST /api/companies/:companyId/regenerate-invite
 * Owner only – regenerate invite code
 */
router.post('/:companyId/regenerate-invite', authMiddleware, extractCompanyContext, async (req, res) => {
  try {
    const company = req.company;
    if (company.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only company owner can regenerate invite codes' });
    }
    const newInviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    await company.update({ invite_code: newInviteCode });
    res.json({ success: true, invite_code: newInviteCode });
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

/**
 * PATCH /api/companies/:companyId/users/:userId/role
 * Owner only – change a member’s role
 */
router.patch('/:companyId/users/:userId/role', authMiddleware, extractCompanyContext, async (req, res) => {
  try {
    const { company } = req;
    const actingUserId = req.user.id;
    const { userId } = req.params;
    const { new_role } = req.body;

    if (company.owner_id !== actingUserId) {
      return res.status(403).json({ error: 'Only the owner can change roles' });
    }

    const allowed = ['owner', 'pm', 'engineer', 'qa', 'legal', 'member'];
    if (!allowed.includes(String(new_role).toLowerCase())) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const uc = await UserCompany.findOne({
      where: { user_id: userId, company_id: company.id, status: 'active' },
    });
    if (!uc) return res.status(404).json({ error: 'User not found in company' });

    await uc.update({ role: new_role.toLowerCase() });
    res.json({ success: true, role: uc.role });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

module.exports = router;
