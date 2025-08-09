// backend/src/routes/companies.js
const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');          // <- real name
const { requireRole } = require('../middleware/roles');            // <- you already export this
const { User, UserCompany, Company } = require('../models');

// helper: only roles you actually have in DB enum
const ALLOWED_ROLES = ['owner', 'admin', 'member'];

/**
 * GET /api/companies/:companyId/members
 * Requires company membership (any role). We use requireRole('member') since your enum is owner/admin/member.
 */
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
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/companies/:companyId/members/:userId/role
 * Only admin/owner can change roles. You cannot assign 'owner' here—use the transfer endpoint.
 */
router.patch('/:companyId/members/:userId/role',
  authMiddleware,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId, userId } = req.params;
      const { role } = req.body;

      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ error: 'invalid role', allowed: ALLOWED_ROLES });
      }
      if (role === 'owner') {
        return res.status(400).json({ error: "Use POST /ownership to transfer ownership" });
      }

      const membership = await UserCompany.findOne({ where: { company_id: companyId, user_id: userId, status: 'active' } });
      if (!membership) return res.status(404).json({ error: 'member not found' });

      // Prevent demoting current owner via this route
      if (membership.role === 'owner') {
        return res.status(400).json({ error: 'Owner cannot be changed here. Use ownership transfer.' });
      }

      await membership.update({ role });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/companies/:companyId/ownership
 * body: { userId }
 * Only current owner can transfer. Safely updates Company.owner_id and roles in user_companies.
 */
router.post('/:companyId/ownership',
  authMiddleware,
  requireRole('owner'),
  async (req, res, next) => {
    const t = await Company.sequelize.transaction();
    try {
      const { companyId } = req.params;
      const { userId: newOwnerId } = req.body;

      const company = await Company.findByPk(companyId, { transaction: t });
      if (!company) {
        await t.rollback();
        return res.status(404).json({ error: 'company not found' });
      }

      // Ensure target is a member
      const target = await UserCompany.findOne({ where: { company_id: companyId, user_id: newOwnerId, status: 'active' }, transaction: t });
      if (!target) {
        await t.rollback();
        return res.status(404).json({ error: 'target user is not a member' });
      }

      // Current owner membership
      const currentOwnerMembership = await UserCompany.findOne({
        where: { company_id: companyId, user_id: company.owner_id, status: 'active' },
        transaction: t
      });

      // Demote previous owner to admin (if membership row exists)
      if (currentOwnerMembership) {
        await currentOwnerMembership.update({ role: 'admin' }, { transaction: t });
      }

      // Promote target to owner
      await target.update({ role: 'owner' }, { transaction: t });

      // Update company.owner_id
      await company.update({ owner_id: newOwnerId }, { transaction: t });

      await t.commit();
      res.json({ ok: true });
    } catch (err) {
      await t.rollback();
      next(err);
    }
  }
);

/**
 * DELETE /api/companies/:companyId/members/:userId
 * Only admin/owner can remove. You cannot remove the current owner.
 */
router.delete('/:companyId/members/:userId',
  authMiddleware,
  requireRole('admin', 'owner'),
  async (req, res, next) => {
    try {
      const { companyId, userId } = req.params;

      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ error: 'company not found' });

      // Never remove current owner
      if (userId === company.owner_id) {
        return res.status(400).json({ error: 'cannot remove current owner' });
      }

      const membership = await UserCompany.findOne({ where: { company_id: companyId, user_id: userId, status: 'active' } });
      if (!membership) return res.status(404).json({ error: 'member not found' });

      await membership.update({ status: 'inactive' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
