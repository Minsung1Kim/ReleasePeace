// GET invite code for a company
router.get('/:companyId/invite-code', authMiddleware, requireRole('owner'), async (req, res) => {
  try {
    const company = await Company.findByPk(req.params.companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (!company.invite_code) {
      company.invite_code = genCode();
      await company.save();
    }
    return res.json({ success: true, invite_code: company.invite_code });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get invite code' });
  }
});
function genCode() {
  return crypto.randomBytes(8).toString('base64url').slice(0, 12);
}

// GET /api/companies/:companyId -> { id, name, invite_code, ... }
router.get('/:companyId',
  authMiddleware,
  requireRole('member', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const company = await Company.findByPk(companyId, {
        attributes: ['id', 'name', 'plan', 'is_active', 'invite_code']
      });
      if (!company) return res.status(404).json({ error: 'company not found' });

      // always make sure there IS a code
      if (!company.invite_code) {
        company.invite_code = genCode();
        await company.save();
      }

      res.json({ id: company.id, name: company.name, plan: company.plan, is_active: company.is_active, invite_code: company.invite_code });
    } catch (err) { next(err); }
  }
);

// POST /api/companies/:companyId/regenerate-invite -> { id, invite_code }
router.post('/:companyId/regenerate-invite',
  authMiddleware,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ error: 'company not found' });

      company.invite_code = genCode();
      await company.save();
      res.json({ id: company.id, invite_code: company.invite_code });
    } catch (err) { next(err); }
  }
);
// backend/src/routes/companies.js
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { User, UserCompany, Company } = require('../models');

// Only roles present in your DB enum
const ALLOWED_ROLES = ['owner', 'admin', 'member'];

/* ---------------------------
   COMPANIES: LIST / CREATE / JOIN
---------------------------- */

// Get companies the current user belongs to (NO requireRole here)
router.get('/mine', authMiddleware, async (req, res, next) => {
  try {
    const rows = await UserCompany.findAll({
      where: { user_id: req.user.id, status: 'active' },
      include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'subdomain', 'plan', 'is_active'] }],
      order: [['joined_at', 'DESC']]
    });

    const companies = rows.map(rc => ({
      id: rc.company.id,
      name: rc.company.name,
      subdomain: rc.company.subdomain,
      plan: rc.company.plan,
      is_active: rc.company.is_active,
      role: rc.role,
    }));

    res.json({ success: true, companies });
  } catch (err) { next(err); }
});

// Create a new company; creator becomes owner
router.post('/', authMiddleware, async (req, res, next) => {
  const t = await Company.sequelize.transaction();
  try {
    let { name, subdomain, plan = 'starter' } = req.body || {};
    if (!name) {
      await t.rollback();
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    // slugify helper to satisfy /^[a-z0-9-]+$/ and lowercase
    const slugify = (s) => {
      return String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')   // non allowed → dash
        .replace(/^-+|-+$/g, '')        // trim dashes
        .replace(/--+/g, '-')           // collapse
        .slice(0, 50) || null;
    };

    // If subdomain missing or invalid, derive from name
    const validRe = /^[a-z0-9-]+$/;
    if (!subdomain || !validRe.test(subdomain)) {
      subdomain = slugify(name);
    }
    // If still empty (e.g., name is all symbols), fall back to a random slug
    if (!subdomain) {
      subdomain = `team-${crypto.randomBytes(3).toString('hex')}`;
    }

    // Ensure uniqueness by adding a suffix on collision
    // (lightweight attempt – DB unique constraint is the source of truth)
    let finalSub = subdomain;
    let attempt = 0;
    // try up to 3 suffixes before letting DB error bubble
    while (attempt < 3) {
      const exists = await Company.findOne({ where: { subdomain: finalSub }, transaction: t });
      if (!exists) break;
      attempt += 1;
      finalSub = `${subdomain}-${attempt}`;
    }

    const invite_code = crypto.randomBytes(8).toString('base64url').slice(0, 12);

    const company = await Company.create({
      name,
      subdomain: finalSub,
      plan,
      owner_id: req.user.id,
      invite_code,
      is_active: true
    }, { transaction: t });

    await UserCompany.create({
      user_id: req.user.id,
      company_id: company.id,
      role: 'owner',
      status: 'active'
    }, { transaction: t });

    await t.commit();
    return res.status(201).json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        subdomain: company.subdomain,
        plan: company.plan,
        invite_code: company.invite_code,
        role: 'owner'
      }
    });
  } catch (err) {
    await t.rollback();
    // Return clean JSON for validation errors
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: err.errors?.map(e => ({ path: e.path, message: e.message }))
      });
    }
    return next(err);
  }
});

// Join a company by invite code
router.post('/join', authMiddleware, async (req, res, next) => {
  const t = await Company.sequelize.transaction();
  try {
    const { invite_code } = req.body || {};
    if (!invite_code) return res.status(400).json({ success: false, message: 'invite_code is required' });

    const company = await Company.findOne({ where: { invite_code, is_active: true }, transaction: t });
    if (!company) return res.status(404).json({ success: false, message: 'Invalid invite code' });

    // upsert membership
    const [uc] = await UserCompany.findOrCreate({
      where: { user_id: req.user.id, company_id: company.id },
      defaults: { role: 'member', status: 'active' },
      transaction: t
    });
    if (uc.status !== 'active') await uc.update({ status: 'active' }, { transaction: t });

    await t.commit();
    res.json({
      success: true,
      company: { id: company.id, name: company.name, subdomain: company.subdomain, plan: company.plan, role: uc.role }
    });
  } catch (err) { await t.rollback(); next(err); }
});

/* ---------------------------
   COMPANY INFO + INVITE CODE
---------------------------- */

// Get basic company info (incl. invite_code) for members/admin/owner

/* ---------------------------
   MEMBERSHIP MANAGEMENT
---------------------------- */

// List members
router.get('/:companyId/members',
  authMiddleware,
  requireRole('member', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const rows = await UserCompany.findAll({
        where: { company_id: companyId, status: 'active' },
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'display_name', 'username'] }]
      });
      const members = rows.map(rc => ({
        id: rc.user.id,
        email: rc.user.email,
        name: rc.user.display_name || rc.user.username || rc.user.email,
        role: rc.role
      }));
      res.json(members);
    } catch (err) { next(err); }
  }
);

// Change a member's role (not owner)
router.patch('/:companyId/members/:userId/role',
  authMiddleware,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId, userId } = req.params;
      const { role } = req.body;

      if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'invalid role', allowed: ALLOWED_ROLES });
      if (role === 'owner') return res.status(400).json({ error: 'Use POST /ownership to transfer ownership' });

      const membership = await UserCompany.findOne({ where: { company_id: companyId, user_id: userId, status: 'active' } });
      if (!membership) return res.status(404).json({ error: 'member not found' });
      if (membership.role === 'owner') return res.status(400).json({ error: 'Owner cannot be changed here. Use ownership transfer.' });

      await membership.update({ role });
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// Transfer ownership
router.post('/:companyId/ownership',
  authMiddleware,
  requireRole('owner'),
  async (req, res, next) => {
    const t = await Company.sequelize.transaction();
    try {
      const { companyId } = req.params;
      const { userId: newOwnerId } = req.body;

      const company = await Company.findByPk(companyId, { transaction: t });
      if (!company) { await t.rollback(); return res.status(404).json({ error: 'company not found' }); }

      const target = await UserCompany.findOne({ where: { company_id: companyId, user_id: newOwnerId, status: 'active' }, transaction: t });
      if (!target) { await t.rollback(); return res.status(404).json({ error: 'target user is not a member' }); }

      const currentOwnerMembership = await UserCompany.findOne({
        where: { company_id: companyId, user_id: company.owner_id, status: 'active' }, transaction: t
      });

      if (currentOwnerMembership) await currentOwnerMembership.update({ role: 'admin' }, { transaction: t });
      await target.update({ role: 'owner' }, { transaction: t });
      await company.update({ owner_id: newOwnerId }, { transaction: t });

      await t.commit();
      res.json({ ok: true });
    } catch (err) { await t.rollback(); next(err); }
  }
);

// Remove a member (not the current owner)
router.delete('/:companyId/members/:userId',
  authMiddleware,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId, userId } = req.params;
      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ error: 'company not found' });
      if (userId === company.owner_id) return res.status(400).json({ error: 'cannot remove current owner' });

      const membership = await UserCompany.findOne({ where: { company_id: companyId, user_id: userId, status: 'active' } });
      if (!membership) return res.status(404).json({ error: 'member not found' });

      await membership.update({ status: 'inactive' });
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
