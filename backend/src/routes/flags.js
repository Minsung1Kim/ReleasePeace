// backend/src/routes/flags.js - COMPLETE FILE
const express = require('express');
const { requireRole } = require('../middleware/roles');

const { authMiddleware, requireRole } = require('../middleware/auth');
const { extractCompanyContext, requireCompanyMembership } = require('../middleware/company');
const { FeatureFlag, FlagState, User } = require('../models');

const router = express.Router();

// Get all flags for a company (requires company context)
router.get('/', authMiddleware, extractCompanyContext, requireCompanyMembership, async (req, res) => {
  try {
const { requireRole } = require('../middleware/roles'); // <-- keep THIS one (company-aware)
    const flags = await FeatureFlag.findAll({
      where: { 
        company_id: req.companyId  // FILTER BY COMPANY
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'display_name']
        },
        {
          model: FlagState,
          as: 'states'
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      flags,
      total: flags.length,
      company_id: req.companyId
    });
  } catch (error) {
    console.error('Error fetching flags:', error);
    res.status(500).json({
      error: 'Failed to fetch flags',
      message: error.message
    });
  }
});

// Get specific flag (company-aware)
router.get('/:id', authMiddleware, extractCompanyContext, requireCompanyMembership, async (req, res) => {
  try {
    const flag = await FeatureFlag.findOne({
      where: { 
        id: req.params.id,
        company_id: req.companyId  // FILTER BY COMPANY
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'display_name']
        },
        {
          model: FlagState,
          as: 'states'
        }
      ]
    });

    if (!flag) {
      return res.status(404).json({
        error: 'Flag not found'
      });
    }

    res.json({
      success: true,
      flag
    });
  } catch (error) {
    console.error('Error fetching flag:', error);
    res.status(500).json({
      error: 'Failed to fetch flag',
      message: error.message
    });
  }
});

// CREATE new flag
router.post('/', authMiddleware, extractCompanyContext, requireRole('owner','pm'), async (req, res) => {
  try {
    const { name, description, flag_type, risk_level, tags, metadata } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Flag name is required'
      });
    }

    // Check if flag name already exists in this company
    const existingFlag = await FeatureFlag.findOne({
      where: { 
        name, 
        company_id: req.companyId 
      }
    });

    if (existingFlag) {
      return res.status(400).json({
        error: 'Flag name already exists in this company'
      });
    }

    const flag = await FeatureFlag.create({
      name,
      description,
      flag_type,
      risk_level,
      tags,
      metadata,
      company_id: req.companyId,  // SET COMPANY ID
      created_by: req.user.id
    });

    // Create initial flag states for all environments
    const environments = ['development', 'staging', 'production'];
    const flagStates = environments.map(env => ({
      flag_id: flag.id,
      environment: env,
      is_enabled: false,
      rollout_percentage: 0,
      targeting_rules: {},
      updated_by: req.user.id
    }));

    await FlagState.bulkCreate(flagStates);

    // Fetch the flag with states and creator
    const createdFlag = await FeatureFlag.findByPk(flag.id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'display_name']
        },
        {
          model: FlagState,
          as: 'states'
        }
      ]
    });

    res.status(201).json({
      success: true,
      flag: createdFlag
    });

  } catch (error) {
    console.error('Error creating flag:', error);
    res.status(500).json({
      error: 'Failed to create flag',
      message: error.message
    });
  }
});

// UPDATE flag
router.put('/:id', authMiddleware, extractCompanyContext, requireCompanyMembership, async (req, res) => {
  try {
    const { name, description, flag_type, risk_level, tags, metadata } = req.body;

    const flag = await FeatureFlag.findOne({
      where: { 
        id: req.params.id,
        company_id: req.companyId
      }
    });

    if (!flag) {
      return res.status(404).json({
        error: 'Flag not found'
      });
    }

    // Check for duplicate name (excluding current flag)
    if (name && name !== flag.name) {
      const existingFlag = await FeatureFlag.findOne({
        where: { 
          name, 
          company_id: req.companyId,
          id: { [require('sequelize').Op.ne]: flag.id }
        }
      });

      if (existingFlag) {
        return res.status(400).json({
          error: 'Flag name already exists in this company'
        });
      }
    }

    await flag.update({
      name: name || flag.name,
      description: description || flag.description,
      flag_type: flag_type || flag.flag_type,
      risk_level: risk_level || flag.risk_level,
      tags: tags || flag.tags,
      metadata: metadata || flag.metadata
    });

    // Fetch updated flag with relations
    const updatedFlag = await FeatureFlag.findByPk(flag.id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'display_name']
        },
        {
          model: FlagState,
          as: 'states'
        }
      ]
    });

    res.json({
      success: true,
      flag: updatedFlag
    });

  } catch (error) {
    console.error('Error updating flag:', error);
    res.status(500).json({
      error: 'Failed to update flag',
      message: error.message
    });
  }
});

// DELETE flag
router.delete('/:id', authMiddleware, extractCompanyContext, requireCompanyMembership, async (req, res) => {
  try {
    const flag = await FeatureFlag.findOne({
      where: { 
        id: req.params.id,
        company_id: req.companyId
      }
    });

    if (!flag) {
      return res.status(404).json({
        error: 'Flag not found'
      });
    }

    // Soft delete by setting is_active to false
    await flag.update({ is_active: false });

    res.json({
      success: true,
      message: 'Flag deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting flag:', error);
    res.status(500).json({
      error: 'Failed to delete flag',
      message: error.message
    });
  }
});

// UPDATE flag state for specific environment
router.put('/:flagId/state/:environment', authMiddleware, extractCompanyContext, requireRole('owner','pm','engineer'), async (req, res) => {
  try {
    const { id, environment } = req.params;
    const { is_enabled, rollout_percentage, targeting_rules } = req.body;

    // Verify flag belongs to company
    const flag = await FeatureFlag.findOne({
      where: { 
        id,
        company_id: req.companyId
      }
    });

    if (!flag) {
      return res.status(404).json({
        error: 'Flag not found'
      });
    }

    // Find or create flag state
    let flagState = await FlagState.findOne({
      where: { flag_id: id, environment }
    });

    if (!flagState) {
      flagState = await FlagState.create({
        flag_id: id,
        environment,
        is_enabled: false,
        rollout_percentage: 0,
        targeting_rules: {},
        updated_by: req.user.id
      });
    }

    // Update flag state
    await flagState.update({
      is_enabled: is_enabled !== undefined ? is_enabled : flagState.is_enabled,
      rollout_percentage: rollout_percentage !== undefined ? rollout_percentage : flagState.rollout_percentage,
      targeting_rules: targeting_rules !== undefined ? targeting_rules : flagState.targeting_rules,
      updated_by: req.user.id
    });

    res.json({
      success: true,
      flag_state: flagState
    });

  } catch (error) {
    console.error('Error updating flag state:', error);
    res.status(500).json({
      error: 'Failed to update flag state',
      message: error.message
    });
  }
});

module.exports = router;