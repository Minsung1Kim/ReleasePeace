// backend/src/routes/approvals.js
const express = require('express');
const router = express.Router();

const { authMiddleware: requireAuth } = require('../middleware/auth');
const { requireCompanyMembership } = (() => {
  try { return require('../middleware/company'); }
  catch { return { requireCompanyMembership: (req, _res, next) => next() }; }
})();
const { createApproval, listForFlag, addDecision } = require('../services/approvalService');
const { Flag } = require('../models');
const db = require('../utils/db'); // must expose .query

// Resolve :flagIdOrKey to a real flag
router.param('flagIdOrKey', async (req, res, next, val) => {
  try {
    let flag = await Flag.findByPk(val);
    if (!flag) flag = await Flag.findOne({ where: { key: val } });
    if (!flag) return res.status(404).json({ error: 'flag_not_found' });
    req.flag = flag;
    req.flagKey = flag.key;
    next();
  } catch (e) { next(e); }
});

// CREATE approval request for a flag
// UI calls: POST /api/flags/:flagIdOrKey/approvals
router.post('/:flagIdOrKey/approvals',
  requireAuth,
  requireCompanyMembership,
  async (req, res, next) => {
    try {
      const { requiredRoles = [], requiredCount = 1, note } = req.body || {};
      const actorId = req.user?.id || req.user?.email || 'unknown';
      const approval = await createApproval({
        flagKey: req.flagKey,
        requiredRoles,
        requiredCount,
        requestedBy: actorId,
        note: note || null,
      });
      res.status(201).json(approval);
    } catch (err) { next(err); }
  }
);

// LIST approvals attached to a flag
// UI calls: GET /api/flags/:flagIdOrKey/approvals
router.get('/:flagIdOrKey/approvals',
  requireAuth,
  requireCompanyMembership,
  async (req, res, next) => {
    try {
      const list = await listForFlag(req.flagKey);
      res.json(list);
    } catch (err) { next(err); }
  }
);

// DECIDE on an approval (approve / reject)
// UI calls: PATCH /api/flags/:flagIdOrKey/approvals/:approvalId
router.patch('/:flagIdOrKey/approvals/:approvalId',
  requireAuth,
  requireCompanyMembership,
  async (req, res, next) => {
    try {
      const id = req.params.approvalId;
      const raw = String(req.body?.status || '').toLowerCase(); // 'approved' | 'rejected'
      const decision = raw === 'approved' ? 'approve' : raw === 'rejected' ? 'reject' : null;
      if (!decision) return res.status(400).json({ error: 'invalid_status' });

      const role = String(req.membership?.role || req.body?.role || '').toLowerCase();
      if (!role) return res.status(400).json({ error: 'missing_role' });

      const comment = req.body?.comments || req.body?.comment || null;
      const actorId = req.user?.id || req.user?.email || 'unknown';

      const updated = await addDecision({ id, actorId, role, decision, comment });
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (err) { next(err); }
  }
);

// GLOBAL pending approvals (what the current member can act on)
// UI calls: GET /api/flags/approvals/pending?limit=100
router.get('/approvals/pending',
  requireAuth,
  requireCompanyMembership,
  async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
      const companyId = req.company?.id || req.companyId || req.header('x-company-id');
      const myRole = String(req.membership?.role || '').toLowerCase();
      const myUserId = String(req.user?.id);

      if (!companyId) return res.status(400).json({ error: 'missing_company' });
      if (!myRole) return res.status(400).json({ error: 'missing_role' });

      // Approvals for flags in this company, still 'pending',
      // where my role is required and I haven't already decided.
      const { rows } = await db.query(
        `
        SELECT ap.*,
               jsonb_build_object('id', f.id, 'key', f.key, 'name', f.name) AS flag,
               jsonb_build_object('id', u.id, 'email', u.email, 'username', u.username, 'display_name', u.display_name) AS requester
        FROM approvals ap
          JOIN flags f ON f.key = ap.flag_key
          LEFT JOIN users u ON u.id = ap.requested_by
        WHERE f.company_id = $1
          AND ap.status = 'pending'
          AND $2 = ANY(ap.required_roles)
          AND NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(ap.decisions) d
            WHERE (d->>'actorId') = $3
          )
        ORDER BY ap.created_at DESC
        LIMIT $4
        `,
        [companyId, myRole, myUserId, limit]
      );

      // Dashboard.jsx expects { pending: [...] }
      res.json({ pending: rows });
    } catch (err) { next(err); }
  }
);

module.exports = router;
