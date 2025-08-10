const { hasRecentApproval } = require('../services/approvalService');

async function requireApprovalIfRisky(req, res, next) {
  // treat req.body.risk = 'high'|'gdpr'|'risky' as gated
  const risk = String(req.body?.risk || '').toLowerCase();
  const isRisky = ['high','gdpr','risky'].includes(risk);
  if (!isRisky) return next();

  const flagKey = req.params.flagKey || req.body.flagKey;
  if (!flagKey) return res.status(400).json({ error: 'missing_flag_key' });

  const ok = await hasRecentApproval(flagKey, 7);
  if (!ok) return res.status(403).json({ error: 'approval_required', message: 'High-risk toggles require a recent approval.' });

  next();
}

module.exports = { requireApprovalIfRisky };
