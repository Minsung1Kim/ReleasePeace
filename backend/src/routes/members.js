// backend/src/routes/members.js
const express = require('express');
const router = express.Router();
const { authMiddleware: requireAuth } = require('../middleware/auth');
const { sequelize, User, Company, UserCompany } = require('../models');

// GET /api/companies/:companyId/members
router.get('/companies/:companyId/members', requireAuth, async (req, res) => {
  try {
    const { companyId } = req.params;

    // 1) memberships
    const rows = await UserCompany.findAll({
      where: { company_id: companyId, status: 'active' },
      raw: true
    });
    if (!rows.length) return res.json([]);

    // 2) users in one shot (no JOIN)
    const ids = [...new Set(rows.map(r => r.user_id))];
    const users = await User.findAll({
      where: { id: ids },
      attributes: ['id', 'username', 'display_name', 'name', 'email'], // <-- add 'name'
      raw: true
    });
    const byId = Object.fromEntries(users.map(u => [u.id, u]));

    // 3) shape response
    const members = rows.map(r => {
      const u = byId[r.user_id] || {};
      return {
        id: r.user_id,
        user_id: r.user_id,
        company_id: r.company_id,
        role: r.role,
        display_name: (u.display_name || u.name || u.username || u.email || 'Unknown'), // <-- include 'name'
        username: u.username || null,
        email: u.email || null
      };
    });

    // sort by display_name
    members.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
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

    const [updated] = await UserCompany.update(
      { role },
      { where: { company_id: companyId, user_id: userId, status: 'active' } }
    );
    if (!updated) return res.status(404).json({ error: 'Member not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH member role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/companies/:companyId/members/:userId
router.delete('/companies/:companyId/members/:userId', requireAuth, async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const [updated] = await UserCompany.update(
      { status: 'removed' },
      { where: { company_id: companyId, user_id: userId, status: 'active' } }
    );
    if (!updated) return res.status(404).json({ error: 'Member not found' });
    res.status(204).end();
  } catch (err) {
    console.error('DELETE member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
