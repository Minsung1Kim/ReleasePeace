const express = require('express');
const { createApproval, listForFlag, addDecision } = require('../services/approvalService');
const { logAudit } = (() => {
  try { return require('../services/auditService'); } 
  catch { return { logAudit: async () => {} }; }
})();

const router = express.Router();

// POST /api/flags/:flagKey/approvals  -> request approval(s)
router.post('/flags/:flagKey/approvals', async (req, res) => {
  try {
    const { flagKey } = req.params;
    const { requiredRoles = ['QA','LEGAL'], requiredCount = 1 } = req.body || {};
    const actorId = req.user?.id || req.user?.email || 'unknown';

    const ap = await createApproval({ flagKey, requestedBy: actorId, requiredRoles, requiredCount });
    await logAudit({ actorId, action:'APPROVAL_REQUESTED', entityType:'approval', entityId:String(ap.id),
      payload:{ flagKey, requiredRoles, requiredCount } });

    res.status(201).json(ap);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed_to_create_approval' });
  }
});

// GET /api/flags/:flagKey/approvals -> list approvals for a flag
router.get('/flags/:flagKey/approvals', async (req, res) => {
  const { flagKey } = req.params;
  res.json(await listForFlag(flagKey));
});

// POST /api/approvals/:id/decision { decision:'approve'|'reject', role, comment }
router.post('/approvals/:id/decision', async (req, res) => {
  const { id } = req.params;
  const { decision, role, comment } = req.body || {};
  if (!['approve','reject'].includes(String(decision))) return res.status(400).json({ error:'invalid_decision' });

  const actorId = req.user?.id || req.user?.email || 'unknown';
  const ap = await addDecision({ id, actorId, role, decision, comment });
  if (!ap) return res.status(404).json({ error: 'not_found' });

  await logAudit({ actorId, action:'APPROVAL_DECIDED', entityType:'approval', entityId:String(id),
    payload:{ decision, role, comment, status: ap.status } });

  res.json(ap);
});

module.exports = router;
