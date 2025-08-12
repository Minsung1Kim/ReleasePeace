// backend/src/routes/members.js
const express = require('express');
const router = express.Router();
const { authMiddleware: requireAuth } = require('../middleware/auth');
const db = require('../utils/db'); // Knex

// GET /api/companies/:companyId/members
router.get('/companies/:companyId/members', requireAuth, async (req, res) => {
  try {
    const { companyId } = req.params;

    // 1) memberships for this company
    const memberships = await db('company_members')
      .select('user_id', 'company_id', 'role')
      .where({ company_id: companyId, status: 'active' });

    if (!memberships.length) {
      res.set('Cache-Control', 'no-store');
      return res.json([]);
    }

    // 2) batch fetch users
    const ids = Array.from(new Set(memberships.map(m => m.user_id)));
    const users = await db('users')
      .select('id', 'display_name', 'name', 'username', 'email')
      .whereIn('id', ids);

    const byId = Object.fromEntries(users.map(u => [String(u.id), u]));
    const pick = (...vals) => vals.find(v => typeof v === 'string' && v.trim());

    // 3) normalize response: always provide a display_name (falls back to email)
    const out = memberships.map(m => {
      const u = byId[String(m.user_id)] || {};
      const display =
        pick(u.display_name, u.name, u.username, u.email) ||
        (String(m.user_id) === String(req.user?.id)
          ? pick(req.user?.display_name, req.user?.name, req.user?.email)
          : null) ||
        'Unknown';

      return {
        user_id: m.user_id,
        company_id: m.company_id,
        role: m.role,
        display_name: display,
        email: u.email || (String(m.user_id) === String(req.user?.id) ? (req.user?.email || null) : null),
      };
    });

    // fresh each time to avoid 304s
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    return res.json(out);
  } catch (e) {
    console.error('GET /companies/:companyId/members error:', e);
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