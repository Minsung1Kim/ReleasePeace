// backend/src/routes/approvals.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { Flag } = require('../models');
const db = require('../utils/db');
const { createApproval, listForFlag, addDecision } = require('../services/approvalService');

// audit is optional; no-op if service missing
const { logAudit } = (() => {
  try { return require('../services/auditService'); }
  catch { return { logAudit: async () => {} }; }
})();

// Resolve :flagIdOrKey to a Flag, expose req.flagKey
router.param('flagIdOrKey', async (req, res, next, val) => {
  try {
    let flag = await Flag.findByPk(val);
    if (!flag) flag = await Flag.findOne({ where: { key: val } });
    if (!flag) return res.status(404).json({ error: 'Flag not found' });
    req.flag = flag;
    req.flagKey = flag.key;
    next();
  } catch (e) { next(e); }
});

// Request approval(s) for a flag (id or key)
router.post('/flags/:flagIdOrKey/approvals', authMiddleware, async (req, res) => {
  try {
    const { requiredRoles = ['QA','LEGAL'], requiredCount = 1 } = req.body || {};
    const actorId = req.user?.id || req.user?.email || 'unknown';

    const ap = await createApproval({
      flagKey: req.flagKey,
      requestedBy: actorId,
      requiredRoles,
      requiredCount
    });

    await logAudit({
      actorId, action: 'APPROVAL_REQUESTED',
      entityType: 'approval', entityId: String(ap.id),
      payload: { flagKey: req.flagKey, requiredRoles, requiredCount }
    });

    res.status(201).json(ap);
  } catch (e) {
    console.error('create approval error:', e);
    res.status(500).json({ error: 'failed_to_create_approval' });
  }
});

// List approvals for one flag
router.get('/flags/:flagIdOrKey/approvals', authMiddleware, async (req, res, next) => {
  try { res.json(await listForFlag(req.flagKey)); } catch (e) { next(e); }
});

// Company-wide pending (canonical)
router.get('/approvals/pending', authMiddleware, async (req, res) => {
  try {
    const companyId = req.get('X-Company-Id') || req.query.companyId || null;
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);

    const params = [];
    let sql = `
      SELECT a.*, f.id AS flag_id, f.key AS flag_key, f.name AS flag_name
      FROM approvals a JOIN flags f ON f.key = a.flag_key
      WHERE a.status='pending'`;
    if (companyId) { params.push(companyId); sql += ` AND f.company_id = $${params.length}`; }
    params.push(limit); sql += ` ORDER BY a.created_at DESC LIMIT $${params.length}`;

    const { rows } = await db.query(sql, params);
    const mapped = rows.map(r => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      required_roles: r.required_roles,
      required_count: r.required_count,
      requested_by: r.requested_by,
      flag: { id: r.flag_id, key: r.flag_key, name: r.flag_name },
      flag_key: r.flag_key
    }));
    res.json({ pending: mapped, approvals: mapped, items: mapped, data: mapped });
  } catch (e) {
    console.error('GET /approvals/pending failed:', e);
    res.status(500).json({ error: 'failed_to_list_pending' });
  }
});

// Alias for the panel that calls /approvals/recent?status=pending
router.get('/approvals/recent', authMiddleware, async (req, res, next) => {
  req.query.status = req.query.status || 'pending';
  return router.handle(req, res, next); // fallthrough to /approvals/pending mapping above
});

// Legacy array response for existing dashboard
router.get('/flags/approvals/pending', authMiddleware, async (req, res) => {
  try {
    const companyId = req.get('X-Company-Id') || req.query.companyId || null;
    const { rows } = await db.query(`
      SELECT a.*, f.id AS flag_id, f.key AS flag_key, f.name AS flag_name
      FROM approvals a JOIN flags f ON f.key=a.flag_key
      WHERE a.status='pending' ${companyId ? 'AND f.company_id=$1' : ''}
      ORDER BY a.created_at DESC`, companyId ? [companyId] : []);
    const mapped = rows.map(r => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      required_roles: r.required_roles,
      required_count: r.required_count,
      requested_by: r.requested_by,
      flag: { id: r.flag_id, key: r.flag_key, name: r.flag_name },
      flag_key: r.flag_key
    }));
    res.json(mapped);
  } catch (e) {
    console.error('GET /flags/approvals/pending failed:', e);
    res.status(500).json({ error: 'failed_to_list_pending' });
  }
});

// Submit a decision (approve/reject)
router.post('/approvals/:id/decision', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, role, comment } = req.body || {};
    if (!['approve','reject'].includes(String(decision))) {
      return res.status(400).json({ error: 'invalid_decision' });
    }
    const actorId = req.user?.id || req.user?.email || 'unknown';
    const ap = await addDecision({ id, actorId, role, decision, comment });
    if (!ap) return res.status(404).json({ error: 'not_found' });

    await logAudit({
      actorId, action: 'APPROVAL_DECIDED',
      entityType: 'approval', entityId: String(id),
      payload: { decision, role, comment, status: ap.status }
    });
    res.json(ap);
  } catch (e) {
    console.error('POST /approvals/:id/decision failed:', e);
    res.status(500).json({ error: 'failed_to_update_approval' });
  }
});

// Legacy PATCH for dashboard (status -> decision)
router.patch('/flags/:flagId/approvals/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body || {};
    const s = String(status || '').toLowerCase();
    const decision = s === 'approved' ? 'approve' : s === 'rejected' ? 'reject' : null;
    if (!decision) return res.status(400).json({ error: 'invalid_status' });

    const actorId = req.user?.id || req.user?.email || 'unknown';
    const ap = await addDecision({ id, actorId, decision, comment });
    if (!ap) return res.status(404).json({ error: 'not_found' });

    await logAudit({
      actorId, action: 'APPROVAL_DECIDED',
      entityType: 'approval', entityId: String(id),
      payload: { decision, comment, status: ap.status }
    });
    res.json(ap);
  } catch (e) {
    console.error('PATCH /flags/:flagId/approvals/:id failed:', e);
    res.status(500).json({ error: 'failed_to_update_approval' });
  }
});

module.exports = router;
