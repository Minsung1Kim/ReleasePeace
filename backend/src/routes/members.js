// backend/src/routes/members.js
const express = require('express');
const router = express.Router();
const { authMiddleware: requireAuth } = require('../middleware/auth');
const { sequelize, User, Company, UserCompany } = require('../models');

// GET /api/companies/:companyId/members
router.get('/companies/:companyId/members', requireAuth, async (req, res) => {
  try {
    const { companyId } = req.params;

    // 1) Get memberships
    const rows = await UserCompany.findAll({
      where: { company_id: companyId, status: 'active' },
      raw: true
    });
    
    if (!rows.length) {
      return res.json([]);
    }

    // 2) Get users in one shot (no JOIN)
    const userIds = [...new Set(rows.map(r => r.user_id))];
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'username', 'display_name', 'name', 'email', 'avatar_url'],
      raw: true
    });
    
    const userById = Object.fromEntries(users.map(u => [u.id, u]));

    // 3) Shape response with better display name logic
    const members = rows.map(membership => {
      const user = userById[membership.user_id] || {};
      
      // Determine the best display name
      let displayName = user.display_name || user.name || user.username || user.email;
      
      // Clean up the display name
      if (displayName) {
        displayName = displayName.trim();
        if (displayName === '' || displayName.toLowerCase() === 'unknown') {
          displayName = user.email || user.username || 'Unknown User';
        }
      } else {
        displayName = user.email || user.username || 'Unknown User';
      }

      return {
        id: membership.user_id,           // Primary identifier
        user_id: membership.user_id,      // For backwards compatibility
        company_id: membership.company_id,
        role: membership.role,
        display_name: displayName,
        username: user.username || null,
        email: user.email || null,
        avatar_url: user.avatar_url || null,
        // Add raw user data for debugging
        _debug: {
          raw_display_name: user.display_name,
          raw_name: user.name,
          raw_username: user.username,
          raw_email: user.email
        }
      };
    });

    // HOTFIX: if the DB doesn't have a user row yet, at least show the current user nicely
    for (const member of members) {
      if ((member.display_name === 'Unknown User' || !member.display_name) && member.user_id === req.user?.id) {
        member.display_name = req.user?.display_name || req.user?.name || req.user?.email || 'You (Current User)';
        member.email = member.email || req.user?.email || null;
        member.username = member.username || req.user?.username || null;
      }
    }

    // Sort by display_name
    members.sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
    
    console.log(`[MEMBERS] Returning ${members.length} members for company ${companyId}:`, 
      members.map(m => `${m.display_name} (${m.email || 'no email'})`));
    
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