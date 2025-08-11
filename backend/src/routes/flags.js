// backend/src/routes/flags.js

const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

// ✅ Safe-import company middlewares (fallback to no-op so Express never gets `undefined`)
let extractCompanyContext = (req, _res, next) => next();
let requireCompanyMembership = (req, _res, next) => next();
try {
  const companyMw = require('../middleware/company');
  if (typeof companyMw.extractCompanyContext === 'function') {
    extractCompanyContext = companyMw.extractCompanyContext;
  }
  if (typeof companyMw.requireCompanyMembership === 'function') {
    requireCompanyMembership = companyMw.requireCompanyMembership;
  }
} catch {}

// ✅ Safe-import approval gate
let requireApprovalIfRisky = (req, _res, next) => next();
try {
  const ra = require('../middleware/requireApproval');
  if (typeof ra.requireApprovalIfRisky === 'function') {
    requireApprovalIfRisky = ra.requireApprovalIfRisky;
  }
} catch {}

// ✅ Define the guard used later in the file
const asMw = (name, fn) =>
  (typeof fn === 'function'
    ? fn
    : (req, _res, next) => { console.warn(`[flags] missing middleware "${name}", skipping`); next(); });

// Safe audit logger import
let logAudit = async () => {};
try {
  logAudit = require('../services/auditService').logAudit || logAudit;
} catch {}

const { FeatureFlag, FlagState, FlagApproval, AuditLog, User } = require('../models');
const { Op } = require('sequelize');

/* ------------ helpers ------------ */

async function writeAudit({ flagId, userId, action, oldState = null, newState = null, reason = '', environment = null, req }) {
  try {
    await AuditLog.create({
      flag_id: flagId,
      user_id: userId,
      action,
      old_state: oldState,
      new_state: newState,
      reason: reason || null,
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || '',
      environment: environment || null
    });
  } catch (e) {
    console.warn('AuditLog failed:', e?.message);
  }
}

/* ------------ list flags ------------ */

// list flags
router.get('/',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  async (req, res, next) => {
    try {
      const flags = await FeatureFlag.findAll({
        where: { company_id: req.companyId },
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ],
        order: [['created_at', 'DESC']],
      });
      res.json({ success: true, flags, total: flags.length, company_id: req.companyId });
    } catch (err) {
      next(err);
    }
  }
);

/* ------------ get one ------------ */

// get one flag
router.get('/:id',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  async (req, res, next) => {
    try {
      const flag = await FeatureFlag.findOne({
        where: { id: req.params.id, company_id: req.companyId },
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ],
      });
      if (!flag) return res.status(404).json({ error: 'Not found' });
      res.json(flag);
    } catch (err) {
      next(err);
    }
  }
);

/* ------------ create ------------ */

router.post(
  '/',
  authMiddleware,
  extractCompanyContext,
  requireRole(['owner', 'pm']),
  async (req, res) => {
    try {
      const {
        name, description, flag_type, risk_level, tags, metadata,
        requires_approval, auto_disable_on_error, error_threshold
      } = req.body;

      if (!name) return res.status(400).json({ error: 'Flag name is required' });

      const existingFlag = await FeatureFlag.findOne({ where: { name, company_id: req.companyId } });
      if (existingFlag) return res.status(400).json({ error: 'Flag name already exists in this company' });

      const flag = await FeatureFlag.create({
        name,
        description,
        flag_type,
        risk_level,
        tags,
        metadata,
        requires_approval: !!requires_approval,
        auto_disable_on_error: !!auto_disable_on_error,
        error_threshold: error_threshold ?? 0.05,
        company_id: req.companyId,
        created_by: req.user.id
      });

      const environments = ['development', 'staging', 'production'];
      const states = environments.map(env => ({
        flag_id: flag.id,
        environment: env,
        is_enabled: false,
        rollout_percentage: 0,
        targeting_rules: {},
        updated_by: req.user.id
      }));
      await FlagState.bulkCreate(states);

      const createdFlag = await FeatureFlag.findByPk(flag.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ]
      });

      await writeAudit({
        flagId: flag.id,
        userId: req.user.id,
        action: 'flag:create',
        oldState: null,
        newState: createdFlag.toJSON(),
        reason: req.body.reason || '',
        environment: null,
        req
      });

      res.status(201).json({ success: true, flag: createdFlag });
    } catch (error) {
      console.error('Error creating flag:', error);
      res.status(500).json({ error: 'Failed to create flag', message: error.message });
    }
  }
);

/* ------------ update meta ------------ */

router.put(
  '/:id',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  async (req, res) => {
    try {
      const flag = await FeatureFlag.findOne({ where: { id: req.params.id, company_id: req.companyId } });
      if (!flag) return res.status(404).json({ error: 'Flag not found' });

      const { name } = req.body;
      if (name && name !== flag.name) {
        const dup = await FeatureFlag.findOne({
          where: { name, company_id: req.companyId, id: { [Op.ne]: flag.id } }
        });
        if (dup) return res.status(400).json({ error: 'Flag name already exists in this company' });
      }

      const before = flag.toJSON();
      await flag.update({
        name: req.body.name ?? flag.name,
        description: req.body.description ?? flag.description,
        flag_type: req.body.flag_type ?? flag.flag_type,
        risk_level: req.body.risk_level ?? flag.risk_level,
        tags: req.body.tags ?? flag.tags,
        metadata: req.body.metadata ?? flag.metadata,
        requires_approval: req.body.requires_approval ?? flag.requires_approval,
        auto_disable_on_error: req.body.auto_disable_on_error ?? flag.auto_disable_on_error,
        error_threshold: req.body.error_threshold ?? flag.error_threshold
      });

      const after = await FeatureFlag.findByPk(flag.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ]
      });

      await writeAudit({
        flagId: flag.id,
        userId: req.user.id,
        action: 'flag:update',
        oldState: before,
        newState: after.toJSON(),
        reason: req.body.reason || '',
        environment: null,
        req
      });

      res.json({ success: true, flag: after });
    } catch (error) {
      console.error('Error updating flag:', error);
      res.status(500).json({ error: 'Failed to update flag', message: error.message });
    }
  }
);

/* ------------ delete (soft) ------------ */

router.delete(
  '/:id',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  async (req, res) => {
    try {
      const flag = await FeatureFlag.findOne({ where: { id: req.params.id, company_id: req.companyId } });
      if (!flag) return res.status(404).json({ error: 'Flag not found' });

      const before = flag.toJSON();
      await flag.update({ is_active: false });

      await writeAudit({
        flagId: flag.id,
        userId: req.user.id,
        action: 'flag:delete',
        oldState: before,
        newState: flag.toJSON(),
        reason: req.body.reason || '',
        environment: null,
        req
      });

      res.json({ success: true, message: 'Flag deleted successfully' });
    } catch (error) {
      console.error('Error deleting flag:', error);
      res.status(500).json({ error: 'Failed to delete flag', message: error.message });
    }
  }
);

/* ------------ toggle state ------------ */

router.put(
  '/:flagId/state/:environment',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireRole', requireRole(['owner', 'pm', 'engineer'])),
  asMw('requireApprovalIfRisky', requireApprovalIfRisky),
  async (req, res) => {
    try {
      const { flagId, environment } = req.params;
      const { is_enabled, rollout_percentage, targeting_rules, reason, risk } = req.body || {};

      const flag = await FeatureFlag.findOne({ where: { id: flagId, company_id: req.companyId } });
      if (!flag) return res.status(404).json({ error: 'Flag not found' });

      let state = await FlagState.findOne({ where: { flag_id: flagId, environment } });
      if (!state) {
        state = await FlagState.create({
          flag_id: flagId,
          environment,
          is_enabled: false,
          rollout_percentage: 0,
          targeting_rules: {},
          updated_by: req.user.id
        });
      }

      const before = state.toJSON();
      const nextEnabled = (typeof is_enabled === 'boolean') ? is_enabled : state.is_enabled;

      // Approval gate for prod enables
      if (flag.requires_approval && environment === 'production' && !state.is_enabled && nextEnabled) {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const approved = await FlagApproval.findOne({
          where: { flag_id: flag.id, status: 'approved', approved_at: { [Op.gte]: cutoff } }
        });
        if (!approved) {
          return res.status(403).json({ error: 'Approval required', message: 'This flag requires approval to enable in production.' });
        }
      }

      // Reason required for high/critical in prod
      if (environment === 'production' && !state.is_enabled && nextEnabled && (flag.risk_level === 'high' || flag.risk_level === 'critical')) {
        if (!reason || !String(reason).trim()) {
          return res.status(400).json({ error: 'reason_required', message: 'Please provide a change justification for enabling high/critical flags in production.' });
        }
      }

      await state.update({
        is_enabled: nextEnabled,
        rollout_percentage: (typeof rollout_percentage === 'number') ? rollout_percentage : state.rollout_percentage,
        targeting_rules: (typeof targeting_rules === 'object' && targeting_rules !== null) ? targeting_rules : state.targeting_rules,
        updated_by: req.user.id
      });

      await writeAudit({
        flagId: flag.id,
        userId: req.user.id,
        action: nextEnabled ? 'state:enable' : 'state:disable',
        oldState: before,
        newState: state.toJSON(),
        reason: reason || '',
        environment,
        req
      });

      // AuditService log
      const actorId = req.user?.id || req.user?.email || 'unknown';
      await logAudit({
        actorId,
        action: nextEnabled ? 'FLAG_TOGGLED_ON' : 'FLAG_TOGGLED_OFF',
        entityType: 'flag',
        entityId: flagId,
        payload: { newState: nextEnabled ? 'on' : 'off', risk: risk || flag.risk_level || null }
      });

      res.json({ success: true, flag_state: state });
    } catch (error) {
      console.error('Error updating flag state:', error);
      res.status(500).json({ error: 'Failed to update flag state', message: error.message });
    }
  }
);

/* ------------ one-click rollback ------------ */

router.post('/:flagId/rollback', authMiddleware, extractCompanyContext, requireRole(['owner', 'pm']), async (req, res) => {
  try {
    const { flagId } = req.params;
    const { reason } = req.body || {};

    const flag = await FeatureFlag.findOne({ where: { id: flagId, company_id: req.companyId } });
    if (!flag) return res.status(404).json({ error: 'Flag not found' });

    const states = await FlagState.findAll({ where: { flag_id: flagId } });
    for (const st of states) {
      const before = st.toJSON();
      await st.update({ is_enabled: false, updated_by: req.user.id });
      await writeAudit({
        flagId: flag.id,
        userId: req.user.id,
        action: 'rollback:disable',
        oldState: before,
        newState: st.toJSON(),
        reason: reason || 'Emergency rollback',
        environment: st.environment,
        req
      });
    }

    res.json({ success: true, disabled: states.length });
  } catch (error) {
    console.error('Rollback failed:', error);
    res.status(500).json({ error: 'Rollback failed', message: error.message });
  }
});

/* ------------ approvals CRUD ------------ */

// request approval (engineer/pm)
router.post(
  '/:flagId/approvals',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  asMw('requireRole', requireRole(['engineer', 'pm'])),
  async (req, res) => {
    try {
      const { flagId } = req.params;
      const { approver_role = 'qa', comments = '' } = req.body || {};

      const flag = await FeatureFlag.findOne({ where: { id: flagId, company_id: req.companyId } });
      if (!flag) return res.status(404).json({ error: 'Flag not found' });

      const approval = await FlagApproval.create({
        flag_id: flag.id,
        requested_by: req.user.id,
        approver_role,
        status: 'pending',
        comments
      });

      await writeAudit({
        flagId: flag.id,
        userId: req.user.id,
        action: 'approval:request',
        oldState: null,
        newState: approval.toJSON(),
        reason: comments || '',
        environment: null,
        req
      });

      res.status(201).json({ success: true, approval });
    } catch (error) {
      console.error('Create approval failed:', error);
      res.status(500).json({ error: 'Create approval failed', message: error.message });
    }
  }
);

// list approvals for a flag
router.get(
  '/:flagId/approvals',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  async (req, res) => {
    try {
      const { flagId } = req.params;
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

      const flag = await FeatureFlag.findOne({ where: { id: flagId, company_id: req.companyId } });
      if (!flag) return res.status(404).json({ error: 'Flag not found' });

      const approvals = await FlagApproval.findAll({
        where: { flag_id: flagId },
        include: [{ model: User, as: 'requester', attributes: ['id', 'display_name', 'username', 'email'] },
                  { model: User, as: 'approver', attributes: ['id', 'display_name', 'username', 'email'] }],
        order: [['created_at', 'DESC']],
        limit
      });
      res.json({ success: true, approvals });
    } catch (e) {
      res.status(500).json({ error: 'Failed to list approvals', message: e.message });
    }
  }
);

// approve/reject (qa/legal/owner/admin)
router.patch(
  '/:flagId/approvals/:approvalId',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  asMw('requireRole', requireRole(['qa', 'legal', 'owner', 'admin'])),
  async (req, res) => {
    try {
      const { flagId, approvalId } = req.params;
      const { status, comments = '' } = req.body || {};
      if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

      const approval = await FlagApproval.findOne({ where: { id: approvalId, flag_id: flagId } });
      if (!approval) return res.status(404).json({ error: 'Approval not found' });

      await approval.update({ status, approved_by: req.user.id, approved_at: new Date(), comments });

      await writeAudit({
        flagId,
        userId: req.user.id,
        action: `approval:${status}`,
        oldState: null,
        newState: approval.toJSON(),
        reason: comments || '',
        environment: null,
        req
      });

      res.json({ success: true, approval });
    } catch (error) {
      console.error('Update approval failed:', error);
      res.status(500).json({ error: 'Update approval failed', message: error.message });
    }
  }
);

/* ------------ approvals: pending for this company ------------ */

router.get('/approvals/pending',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  asMw('requireRole', requireRole(['qa', 'legal', 'owner', 'admin'])),
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
      const rows = await FlagApproval.findAll({
        where: { status: 'pending' },
        include: [
          {
            model: FeatureFlag,
            as: 'flag',
            where: { company_id: req.companyId },
            attributes: ['id', 'name', 'risk_level', 'requires_approval']
          },
          { model: User, as: 'requester', attributes: ['id', 'display_name', 'username', 'email'] }
        ],
        order: [['created_at', 'DESC']],
        limit
      });

      res.json({
        success: true,
        pending: rows.map(r => ({
          id: r.id,
          created_at: r.created_at,
          approver_role: r.approver_role,
          comments: r.comments,
          flag: r.flag,
          requester: r.requester
        }))
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load pending approvals', message: e.message });
    }
  }
);

/* ------------ audit: per flag & recent for company ------------ */

router.get('/:flagId/audit',
  asMw('authMiddleware', authMiddleware),
  asMw('extractCompanyContext', extractCompanyContext),
  asMw('requireCompanyMembership', requireCompanyMembership),
  async (req, res) => {
    try {
      const { flagId } = req.params;
      const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);

      const flag = await FeatureFlag.findOne({ where: { id: flagId, company_id: req.companyId } });
      if (!flag) return res.status(404).json({ error: 'Flag not found' });

      const logs = await AuditLog.findAll({
        where: { flag_id: flagId },
        include: [{ model: User, as: 'user', attributes: ['id', 'display_name', 'username', 'email'] }],
        order: [['created_at', 'DESC']],
        limit
      });

      res.json({
        success: true,
        logs: logs.map(l => ({
          id: l.id,
          created_at: l.created_at,
          action: l.action,
          environment: l.environment,
          user: l.user,
          reason: l.reason,
          old_state: l.old_state,
          new_state: l.new_state
        }))
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to load audit', message: e.message });
    }
  }
);

// recent audit
router.get('/audit/recent', authMiddleware, extractCompanyContext, requireCompanyMembership, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const rows = await AuditLog.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'display_name'] },
        { model: FeatureFlag, as: 'flag', where: { company_id: req.companyId }, attributes: ['id', 'name', 'company_id'] }
      ],
      order: [['created_at', 'DESC']],
      limit
    });
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
