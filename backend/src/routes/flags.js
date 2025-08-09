// backend/src/routes/flags.js
const express = require('express');

const { requireRole } = require('../middleware/roles');
const { authMiddleware } = require('../middleware/auth');
const { extractCompanyContext, requireCompanyMembership } = require('../middleware/company');
const { FeatureFlag, FlagState, User } = require('../models');

const router = express.Router();

/** GET all flags for current company */
router.get(
  '/',
  authMiddleware,
  extractCompanyContext,
  requireCompanyMembership,
  async (req, res) => {
    try {
      const flags = await FeatureFlag.findAll({
        where: { company_id: req.companyId, is_active: true },
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ],
        order: [['created_at', 'DESC']]
      });

      res.json({ success: true, flags, total: flags.length, company_id: req.companyId });
    } catch (err) {
      console.error('Error fetching flags:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch flags' });
    }
  }
);

/** GET single flag */
router.get(
  '/:id',
  authMiddleware,
  extractCompanyContext,
  requireCompanyMembership,
  async (req, res) => {
    try {
      const flag = await FeatureFlag.findOne({
        where: { id: req.params.id, company_id: req.companyId, is_active: true },
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ]
      });
      if (!flag) return res.status(404).json({ success: false, error: 'Flag not found' });
      res.json({ success: true, flag });
    } catch (err) {
      console.error('Error fetching flag:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch flag' });
    }
  }
);

/** CREATE flag (owner/pm) */
router.post(
  '/',
  authMiddleware,
  extractCompanyContext,
  requireRole('owner', 'pm'),
  async (req, res) => {
    try {
      const { name, description, flag_type, risk_level, tags, metadata, requires_approval } = req.body;
      if (!name || !/^[a-z0-9_\-\.]+$/i.test(name)) {
        return res.status(400).json({ success: false, error: 'Valid flag name is required' });
      }

      const dup = await FeatureFlag.findOne({ where: { name, company_id: req.companyId, is_active: true } });
      if (dup) return res.status(400).json({ success: false, error: 'Flag name already exists in this company' });

      const flag = await FeatureFlag.create({
        name,
        description: description || '',
        flag_type: flag_type || 'rollout',
        risk_level: risk_level || 'medium',
        tags: Array.isArray(tags) ? tags : [],
        metadata: metadata || {},
        requires_approval: !!requires_approval,
        company_id: req.companyId,
        created_by: req.user.id,
        is_active: true
      });

      // seed three environments
      const envs = ['development', 'staging', 'production'].map(env => ({
        flag_id: flag.id,
        environment: env,
        is_enabled: false,
        rollout_percentage: 0,
        targeting_rules: {},
        updated_by: req.user.id
      }));
      await FlagState.bulkCreate(envs);

      const created = await FeatureFlag.findByPk(flag.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ]
      });

      // 201 is correct, but 200 also works with fetch(); keep 201 for clarity
      res.status(201).json({ success: true, flag: created });
    } catch (err) {
      console.error('Error creating flag:', err);
      res.status(500).json({ success: false, error: 'Failed to create flag' });
    }
  }
);

/** UPDATE flag (must belong to company) */
router.put(
  '/:id',
  authMiddleware,
  extractCompanyContext,
  requireCompanyMembership,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, flag_type, risk_level, tags, metadata, requires_approval } = req.body;

      const flag = await FeatureFlag.findOne({ where: { id, company_id: req.companyId, is_active: true } });
      if (!flag) return res.status(404).json({ success: false, error: 'Flag not found' });

      if (name && name !== flag.name) {
        const dup = await FeatureFlag.findOne({
          where: { name, company_id: req.companyId, is_active: true, id: { [Op.ne]: flag.id } }
        });
        if (dup) return res.status(400).json({ success: false, error: 'Flag name already exists in this company' });
      }

      await flag.update({
        name: name ?? flag.name,
        description: description ?? flag.description,
        flag_type: flag_type ?? flag.flag_type,
        risk_level: risk_level ?? flag.risk_level,
        tags: Array.isArray(tags) ? tags : flag.tags,
        metadata: metadata ?? flag.metadata,
        requires_approval: typeof requires_approval === 'boolean' ? requires_approval : flag.requires_approval
      });

      const updated = await FeatureFlag.findByPk(flag.id, {
        include: [
          { model: User, as: 'creator', attributes: ['id', 'username', 'display_name'] },
          { model: FlagState, as: 'states' }
        ]
      });

      res.json({ success: true, flag: updated });
    } catch (err) {
      console.error('Error updating flag:', err);
      res.status(500).json({ success: false, error: 'Failed to update flag' });
    }
  }
);

/** SOFT DELETE flag */
router.delete(
  '/:id',
  authMiddleware,
  extractCompanyContext,
  requireCompanyMembership,
  async (req, res) => {
    try {
      const flag = await FeatureFlag.findOne({ where: { id: req.params.id, company_id: req.companyId, is_active: true } });
      if (!flag) return res.status(404).json({ success: false, error: 'Flag not found' });
      await flag.update({ is_active: false });
      res.json({ success: true, message: 'Flag deleted' });
    } catch (err) {
      console.error('Error deleting flag:', err);
      res.status(500).json({ success: false, error: 'Failed to delete flag' });
    }
  }
);

/** UPDATE state (owner/pm/engineer) */
router.put(
  '/:flagId/state/:environment',
  authMiddleware,
  extractCompanyContext,
  requireRole('owner','pm','engineer'),
  async (req, res) => {
    try {
      const { flagId, environment } = req.params;
      const { is_enabled, rollout_percentage, targeting_rules } = req.body;

      const flag = await FeatureFlag.findOne({
        where: { id: flagId, company_id: req.companyId }
      });
      if (!flag) return res.status(404).json({ error: 'Flag not found' });

      let flagState = await FlagState.findOne({ where: { flag_id: flagId, environment } });
      if (!flagState) {
        flagState = await FlagState.create({
          flag_id: flagId,
          environment,
          is_enabled: false,
          rollout_percentage: 0,
          targeting_rules: {},
          updated_by: req.user.id
        });
      }

      await flagState.update({
        is_enabled: is_enabled ?? flagState.is_enabled,
        rollout_percentage: rollout_percentage ?? flagState.rollout_percentage,
        targeting_rules: targeting_rules ?? flagState.targeting_rules,
        updated_by: req.user.id
      });

      res.json({ success: true, flag_state: flagState });
    } catch (err) {
      console.error('Error updating flag state:', err);
      res.status(500).json({ error: 'Failed to update flag state', message: err.message });
    }
  }
);

module.exports = router;
