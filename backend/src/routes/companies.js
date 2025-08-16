// backend/src/routes/companies.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');

const {
  extractCompanyContext,
  requireCompanyMembership,
} = require('../middleware/company');
const { requireRole } = require('../middleware/roles');
const { User, UserCompany, Company } = require('../models');
const { Op, fn, col, where } = require('sequelize');

// Company membership roles
const ALLOWED_ROLES = ['owner', 'admin', 'pm', 'engineer', 'qa', 'viewer', 'member'];

function genCode() {
  return crypto.randomBytes(8).toString('base64url').slice(0, 12);
}



// List companies for current user (must be before "/:companyId")
router.get('/mine', requireAuth, async (req, res, next) => {
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
router.post('/', requireAuth, async (req, res, next) => {
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

    // Set creator as owner (membership row)
    await UserCompany.create({
      user_id: req.user.id,
      company_id: company.id,
      role: 'owner', // <-- IMPORTANT
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
router.post('/join', requireAuth, async (req, res, next) => {
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
  requireAuth,
  requireCompanyMembership,      // enough for read
  async (req, res, next) => {
    try {
      const company = req.company;
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

// Regenerate invite code (owner/admin only)
router.post('/:companyId/regenerate-invite',
  requireAuth,
  requireCompanyMembership,
  requireRole(['owner','admin']),
  async (req, res, next) => {
    try {
      req.company.invite_code = crypto.randomBytes(8).toString('base64url').slice(0,12);
      await req.company.save();
      res.json({ invite_code: req.company.invite_code });
    } catch (e) { next(e); }
  }
);


router.get(
  '/:companyId/members',
  requireAuth,
  requireCompanyMembership,
  async (req, res, next) => {
    try {
      const { companyId } = req.params;

      const rows = await UserCompany.findAll({
        where: { company_id: companyId, status: 'active' },
        include: [
          { model: User, as: 'user', attributes: ['id', 'email', 'username', 'display_name'] }
        ],
        // IMPORTANT: qualify "role" with the table alias to avoid ambiguity
        order: [
          [
            UserCompany.sequelize.literal(
              `CASE WHEN "UserCompany"."role"='owner' THEN 0 WHEN "UserCompany"."role"='admin' THEN 1 ELSE 2 END`
            ),
            'ASC'
          ],
          [{ model: User, as: 'user' }, 'email', 'ASC'],
        ],
      });

      let members = rows.map(r => ({
        id: r.user_id,
        user_id: r.user_id,
        role: r.role,
        status: r.status,
        email: r.user?.email ?? null,
        username: r.user?.username ?? null,
        display_name: r.user?.display_name ?? null,
        user: r.user
          ? {
              id: r.user.id,
              email: r.user.email ?? null,
              username: r.user.username ?? null,
              display_name: r.user.display_name ?? null,
            }
          : { id: r.user_id },
      }));

      // Safety: if DB ordering gets ignored in some environments, sort in JS
      const roleRank = { owner: 0, admin: 1 };
      members.sort(
        (a, b) =>
          (roleRank[a.role] ?? 2) - (roleRank[b.role] ?? 2) ||
          (a.email || '').localeCompare(b.email || '')
      );

      res.json({ members });
    } catch (e) {
      console.error('GET company members error:', e);
      next(e);
    }
  }
);


// Invite code (fetch) – allow owners/admins to view
router.get(
  '/:companyId/invite-code',
  requireAuth,
  requireCompanyMembership,
  requireRole(['owner','admin']),
  (req, res) => res.json({ invite_code: req.company.invite_code })
);

// Invite code (regenerate) – owner only
router.post(
  '/:companyId/invite-code',
  requireAuth,
  requireCompanyMembership,
  requireRole(['owner']),
  async (req, res, next) => {
    try {
      req.company.invite_code = genCode();
      await req.company.save();
      res.json({ invite_code: req.company.invite_code });
    } catch (e) { next(e); }
  }
);

// Change a member's role (not owner)
router.patch('/:companyId/members/:userId/role',
  requireAuth,
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
  requireAuth,
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
  requireAuth,
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
