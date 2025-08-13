// backend/src/routes/members.js
const express = require('express');
const router = express.Router();
const { authMiddleware: requireAuth } = require('../middleware/auth');
const db = require('../utils/db'); // Knex

// GET /api/companies/:companyId/members
router.get('/companies/:companyId/members', requireAuth, async (req, res) => {
  try {
    const { companyId } = req.params;

    const rows = await db('company_members as m')
      .leftJoin('users as u', 'u.id', 'm.user_id')
      .select(
        'm.user_id as id',
        'm.role',
        'u.email as email',
        'u.name as name'
      )
      .where('m.company_id', companyId);

    return res.json({ members: rows });
  } catch (err) {
    console.error('GET /companies/:companyId/members error:', err);
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