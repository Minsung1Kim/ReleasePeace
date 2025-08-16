// backend/src/routes/members.js
const express = require('express');
const router = express.Router();
const { authMiddleware: requireAuth } = require('../middleware/auth');
const { UserCompany } = require('../models');

router.patch('/companies/:companyId/members/:userId/role', requireAuth, async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { role } = req.body;

    const [updated] = await UserCompany.update(
      { role },
      { where: { company_id: companyId, user_id: userId, status: 'active' } }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('PATCH member role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

router.delete('/companies/:companyId/members/:userId', requireAuth, async (req, res) => {
  try {
    const { companyId, userId } = req.params;

    const [updated] = await UserCompany.update(
      { status: 'removed' },
      { where: { company_id: companyId, user_id: userId, status: 'active' } }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.status(204).end();
  } catch (err) {
    console.error('DELETE member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
