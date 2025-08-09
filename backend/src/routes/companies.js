// backend/src/routes/companies.js
// backend/src/routes/companies.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { User, UserCompany, Company } = require('../models');
const { Op, fn, col, where } = require('sequelize');

// Allowed per your DB enum
const ALLOWED_ROLES = ['owner', 'admin', 'member'];

function genCode() {
  return crypto.randomBytes(8).toString('base64url').slice(0, 12);
}

/* ---------------------------
   COMPANIES: LIST / CREATE / JOIN
---------------------------- */

// List companies for current user (must be before "/:companyId")
router.get('/mine', authMiddleware, async (req, res, next) => {
  try {
    const rows = await UserCompany.findAll({
      where: { user_id: req.user.id, status: 'active' },
      include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'subdomain', 'plan', 'is_active'] }],
      order: [['joined_at', 'DESC']],
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

    // slugify to satisfy /^[a-z0-9-]+$/
    const slugify = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/--+/g, '-')
        .slice(0, 50) || null;

    const validRe = /^[a-z0-9-]+$/;
    if (!subdomain || !validRe.test(subdomain)) subdomain = slugify(name);
    if (!subdomain) subdomain = `team-${crypto.randomBytes(3).toString('hex')}`;

    // attempt a few suffixes on collision
    let finalSub = subdomain;
    for (let i = 0; i < 3; i++) {
      const exists = await Company.findOne({ where: { subdomain: finalSub }, transaction: t });
      if (!exists) break;
      finalSub = `${subdomain}-${i + 1}`;
    }

    const invite_code = genCode();

    const company = await Company.create({
      name,
      subdomain: finalSub,
      plan,
      owner_id: req.user.id,
      invite_code,
      is_active: true,
    }, { transaction: t });

    await UserCompany.create({
      user_id: req.user.id,
      company_id: company.id,
      role: 'owner',
      status: 'active',
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
        role: 'owner',
      },
    });
  } catch (err) {
    await t.rollback();
    if (err.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: err.errors?.map(e => ({ path: e.path, message: e.message })),
      });
    }
    next(err);
  }
});

// Join by invite code
// Join by invite code (case-insensitive, trims spaces)
router.post('/join', authMiddleware, async (req, res, next) => {
  try {
    const invite_code_raw = (req.body?.invite_code ?? '').toString().trim();
    if (!invite_code_raw) {
      return res.status(400).json({ success: false, message: 'invite_code is required' });
    }

    // Log to confirm what the server actually receives
    console.log('Join attempt invite_code="%s"', invite_code_raw);

    // Case-insensitive lookup: lower(invite_code) = lower(:code)
    const code = invite_code_raw.toLowerCase();
    const company = await Company.findOne({
      where: where(fn('lower', col('invite_code')), code)
    });

    if (!company) {
      return res.status(404).json({ success: false, message: 'Invalid invite code' });
    }

    const [uc] = await UserCompany.findOrCreate({
      where: { user_id: req.user.id, company_id: company.id },
      defaults: { role: 'member', status: 'active' }
    });
    if (uc.status !== 'active') await uc.update({ status: 'active' });

    return res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        subdomain: company.subdomain,
        plan: company.plan,
        role: uc.role,
      }
    });
  } catch (err) { next(err); }
});

/* ---------------------------
   COMPANY INFO + INVITE CODE
---------------------------- */

// Basic company info (with invite_code)
router.get('/:companyId',
  authMiddleware,
  requireRole('member', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId } = req.params;
      const company = await Company.findByPk(companyId, {
        attributes: ['id', 'name', 'plan', 'is_active', 'invite_code', 'owner_id'],
      });
      if (!company) return res.status(404).json({ error: 'company not found' });

      // ensure a code exists
      if (!company.invite_code) {
        company.invite_code = genCode();
        await company.save();
      }

      res.json({
        success: true,
        company: {
          id: company.id,
          name: company.name,
          plan: company.plan,
          is_active: company.is_active,
          invite_code: company.invite_code,
          owner_id: company.owner_id,
        },
      });
    } catch (err) { next(err); }
  }
);

// Just the invite code (owner/admin can see)
router.get('/:companyId/invite-code',
  authMiddleware,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const company = await Company.findByPk(req.params.companyId);
      if (!company) return res.status(404).json({ error: 'Company not found' });
      if (!company.invite_code) {
        company.invite_code = genCode();
        await company.save();
      }
      res.json({ success: true, invite_code: company.invite_code });
    } catch (err) { next(err); }
  }
);

// Regenerate invite code
router.post('/:companyId/regenerate-invite',
  authMiddleware,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const company = await Company.findByPk(req.params.companyId);
      if (!company) return res.status(404).json({ error: 'company not found' });

      company.invite_code = genCode();
      await company.save();
      res.json({ success: true, id: company.id, invite_code: company.invite_code });
    } catch (err) { next(err); }
  }
);

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
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'display_name', 'username'] }],
      });
      const members = rows.map(rc => ({
        id: rc.user.id,
        email: rc.user.email,
        name: rc.user.display_name || rc.user.username || rc.user.email,
        role: rc.role,
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
        where: { company_id: companyId, user_id: company.owner_id, status: 'active' }, transaction: t,
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
