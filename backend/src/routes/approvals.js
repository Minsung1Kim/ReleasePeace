// backend/src/routes/approvals.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { Flag } = require('../models');
const db = require('../utils/db');
const {
  createApproval,
  listForFlag,
  listPending,
  addDecision,
} = require('../services/approvalService');

const { logAudit } = (() => {
  try { return require('../services/auditService'); }
  catch { return { logAudit: async () => {} }; }
})();

// Resolve :flagIdOrKey to a Flag and expose req.flagKey
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

// POST /api/flags/:flagIdOrKey/approvals  -> create approval request
router.post('/flags/:flagIdOrKey/approvals', authMiddleware, async (req, res) => {
  try {
    const { requiredRoles = ['QA', 'LEGAL'], requiredCount = 1 } = req.body || {};
    const actorId = req.user?.id || req.user?.email || 'unknown';

    const ap = await createApproval({
      flagKey: req.flagKey,
      requestedBy: actorId,
      requiredRoles,
      requiredCount,
    });

    await logAudit({
      actorId,
      action: 'APPROVAL_REQUESTED',
      entityType: 'approval',
      entityId: String(ap.id),
      payload: { flagKey: req.flagKey, requiredRoles, requiredCount },
    });

    res.status(201).json(ap);
  } catch (e) {
    console.error('create approval error:', e);
    res.status(500).json({ error: 'failed_to_create_approval' });
  }
});

// GET /api/flags/:flagIdOrKey/approvals  -> list approvals for one flag
router.get('/flags/:flagIdOrKey/approvals', authMiddleware, async (req, res, next) => {
  try {
    const rows = await listForFlag(req.flagKey);
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/approvals/pending  -> pending for company (or all)
router.get('/approvals/pending', authMiddleware, async (req, res) => {
  try {
    const companyId = req.get('X-Company-Id') || req.query.companyId || null;
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const rows = await listPending({ companyId, limit });
    // respond with multiple keys so different UIs can consume
    res.json({ pending: rows, approvals: rows, items: rows, data: rows });
  } catch (e) {
    console.error('GET /approvals/pending failed:', e);
    res.status(500).json({ error: 'failed_to_list_pending' });
  }
});

// Backward-compat alias used by some panels
router.get('/approvals/recent', authMiddleware, async (req, res) => {
  try {
    const companyId = req.get('X-Company-Id') || req.query.companyId || null;
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const rows = await listPending({ companyId, limit });
    res.json({ pending: rows, approvals: rows, items: rows, data: rows });
  } catch (e) {
    console.error('GET /approvals/recent failed:', e);
    res.status(500).json({ error: 'failed_to_list_recent' });
  }
});

// Legacy array endpoint some dashboards call
router.get('/flags/approvals/pending', authMiddleware, async (req, res) => {
  try {
    const companyId = req.get('X-Company-Id') || req.query.companyId || null;
    const rows = await listPending({ companyId, limit: 200 });
    res.json(rows);
  } catch (e) {
    console.error('GET /flags/approvals/pending failed:', e);
    res.status(500).json({ error: 'failed_to_list_pending' });
  }
});

// POST /api/approvals/:id/decision  -> approve/reject
router.post('/approvals/:id/decision', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, role, comment } = req.body || {};
    const d = String(decision || '').toLowerCase();
    if (!['approve', 'reject'].includes(d)) return res.status(400).json({ error: 'invalid_decision' });

    const actorId = req.user?.id || req.user?.email || 'unknown';
    const updated = await addDecision({ id, actorId, role, decision: d, comment });
    if (!updated) return res.status(404).json({ error: 'not_found' });

    await logAudit({
      actorId,
      action: 'APPROVAL_DECIDED',
      entityType: 'approval',
      entityId: String(id),
      payload: { decision: d, role, comment, status: updated.status },
    });

    res.json(updated);
  } catch (e) {
    console.error('POST /approvals/:id/decision failed:', e);
    res.status(500).json({ error: 'failed_to_update_approval' });
  }
});

// PATCH /api/flags/:flagId/approvals/:id  -> legacy: status -> decision
router.patch('/flags/:flagId/approvals/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const s = String(req.body?.status || '').toLowerCase();
    const decision = s === 'approved' ? 'approve' : s === 'rejected' ? 'reject' : null;
    if (!decision) return res.status(400).json({ error: 'invalid_status' });

    const actorId = req.user?.id || req.user?.email || 'unknown';
    const updated = await addDecision({ id, actorId, decision, comment: req.body?.comment });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json(updated);
  } catch (e) {
    console.error('PATCH legacy decision failed:', e);
    res.status(500).json({ error: 'failed_to_update_approval' });
  }
});

module.exports = router;
