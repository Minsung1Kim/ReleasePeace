// backend/src/routes/members.js
const express = require('express');
const router = express.Router();
const { authMiddleware: requireAuth } = require('../middleware/auth');
const { sequelize, User, Company, UserCompany } = require('../models');

// GET /api/companies/:companyId/members
router.get('/companies/:companyId/members', requireAuth, async (req, res) => {
  try {
    const { companyId } = req.params;

    // table names from models (works with any schema/casing)
    const T_USERS = sequelize.getQueryInterface().quoteTable(User.getTableName());
    const T_UC    = sequelize.getQueryInterface().quoteTable(UserCompany.getTableName());

    const rows = await sequelize.query(
      `
      SELECT
        uc.user_id            AS id,
        uc.user_id,
        uc.company_id,
        uc.role,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username, u.email, 'Unknown') AS display_name,
        u.username,
        u.email
      FROM ${T_UC} AS uc
      LEFT JOIN ${T_USERS} AS u
        ON u.id = uc.user_id
      WHERE uc.company_id = :companyId
        AND uc.status = 'active'
      ORDER BY display_name ASC
      `,
      { replacements: { companyId }, type: sequelize.QueryTypes.SELECT }
    );

    return res.json(rows);
  } catch (err) {
    console.error('GET /members error:', err);
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
