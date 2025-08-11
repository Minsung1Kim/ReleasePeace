const express = require('express');
const { createApproval, listForFlag, addDecision } = require('../services/approvalService');
const { authMiddleware } = require('../middleware/auth');
const { Flag } = require('../models');
const { logAudit } = (() => {
  try { return require('../services/auditService'); }
  catch { return { logAudit: async () => {} }; }
})();

const router = express.Router();

// Resolve :flagIdOrKey to an actual Flag and expose req.flag + req.flagKey
router.param('flagIdOrKey', async (req, res, next, val) => {
  let flag = await Flag.findByPk(val);
  if (!flag) flag = await Flag.findOne({ where: { key: val } });
  if (!flag) return res.status(404).json({ error: 'Flag not found' });
  req.flag = flag;
  req.flagKey = flag.key;
  next();
});

// POST /api/flags/:flagIdOrKey/approvals -> request approval(s)
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
      actorId, action: 'APPROVAL_REQUESTED', entityType: 'approval', entityId: String(ap.id),
      payload: { flagKey: req.flagKey, requiredRoles, requiredCount }
    });

    res.status(201).json(ap);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed_to_create_approval' });
  }
});

// GET /api/flags/:flagIdOrKey/approvals
router.get('/flags/:flagIdOrKey/approvals', authMiddleware, async (req, res) => {
  res.json(await listForFlag(req.flagKey));
});

// POST /api/approvals/:id/decision { decision, role, comment } (unchanged)
router.post('/approvals/:id/decision', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { decision, role, comment } = req.body || {};
  if (!['approve','reject'].includes(String(decision))) {
    return res.status(400).json({ error: 'invalid_decision' });
  }
  const actorId = req.user?.id || req.user?.email || 'unknown';
  const ap = await addDecision({ id, actorId, role, decision, comment });
  if (!ap) return res.status(404).json({ error: 'not_found' });

  await logAudit({
    actorId, action: 'APPROVAL_DECIDED', entityType: 'approval', entityId: String(id),
    payload: { decision, role, comment, status: ap.status }
  });

  res.json(ap);
});

module.exports = router;
