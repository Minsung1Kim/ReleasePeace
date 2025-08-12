// backend/src/routes/members.js
const express = require('express');
const router = express.Router();

const { authMiddleware: requireAuth } = require('../middleware/auth');
const { User, Company, UserCompany } = require('../models');

// GET /api/companies/:companyId/members
router.get('/companies/:companyId/members', requireAuth, async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await Company.findByPk(companyId);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const rows = await UserCompany.findAll({
      where: { company_id: companyId, status: 'active' },
      include: [
        {
          model: User,
          // don't force an alias; accept whatever association was defined
          required: false,
          attributes: ['id', 'username', 'display_name', 'email']
        }
      ],
      // order by either alias shape
      order: [
        [User, 'display_name', 'ASC']
      ]
    });

    const members = rows.map(r => {
      const u = r.user || r.User || null; // handle alias differences
      return {
        id: u?.id || r.user_id, // user id
        user_id: r.user_id,
        company_id: r.company_id,
        role: r.role,
        display_name: (u?.display_name || u?.username || u?.email || 'Unknown'),
        username: u?.username || null,
        email: u?.email || null,
      };
    });

    return res.json(members);
  } catch (err) {
    console.error('GET members error:', err);
    return res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// PATCH /api/companies/:companyId/members/:userId/role
router.patch('/companies/:companyId/members/:userId/role', requireAuth, async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { role } = req.body;

    // only owner/admin can change roles
    const actor = await UserCompany.findOne({ where: { company_id: companyId, user_id: req.user.id, status: 'active' }});
    if (!actor || !['owner','admin'].includes(actor.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }

    const member = await UserCompany.findOne({ where: { company_id: companyId, user_id: userId, status: 'active' }});
    if (!member) return res.status(404).json({ error: 'Member not found' });

    await member.update({ role });
    return res.json({ ok: true });
  } catch (err) {
    console.error('PATCH member role error:', err);
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/companies/:companyId/members/:userId
router.delete('/companies/:companyId/members/:userId', requireAuth, async (req, res) => {
  try {
    const { companyId, userId } = req.params;

    const actor = await UserCompany.findOne({ where: { company_id: companyId, user_id: req.user.id, status: 'active' }});
    if (!actor || !['owner','admin'].includes(actor.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }

    const member = await UserCompany.findOne({ where: { company_id: companyId, user_id: userId, status: 'active' }});
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // soft-remove to keep audit trails
    await member.update({ status: 'removed' });
    return res.status(204).end();
  } catch (err) {
    console.error('DELETE member error:', err);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
