const { hasRecentApproval } = require('../services/approvalService');

async function requireApprovalIfRisky(req, res, next) {
  const risk = String(req.body?.risk || '').toLowerCase();
  const isRisky = ['high', 'gdpr', 'risky'].includes(risk);
  if (!isRisky) return next();

  // Support both styles: :flagId (your flags route) and :flagKey (the approvals router)
  const idOrKey =
    req.params.flagId ||
    req.params.flagKey ||
    req.body.flagId ||
    req.body.flagKey;

  if (!idOrKey) {
    return res.status(400).json({ error: 'missing_flag_key', message: 'Provide flagId or flagKey.' });
  }

  // We store approvals under whatever identifier you pass (id or key) – just be consistent
  const ok = await hasRecentApproval(String(idOrKey), 7);
  if (!ok) {
    return res.status(403).json({
      error: 'approval_required',
      message: 'High-risk toggles require a recent approval.'
    });
  }

  next();
}

module.exports = { requireApprovalIfRisky };
