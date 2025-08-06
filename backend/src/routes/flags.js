const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const flagService = require('../services/flagService');
const { FeatureFlag, FlagState, User } = require('../models');

const router = express.Router();

// For now, we'll create basic CRUD routes
// We'll expand these as we build the frontend

// Get all flags (public endpoint for demo)
router.get('/', async (req, res) => {
  try {
    const flags = await FeatureFlag.findAll({
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
      total: flags.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch flags',
      message: error.message
    });
  }
});

// Get specific flag
router.get('/:id', async (req, res) => {
  try {
    const flag = await FeatureFlag.findByPk(req.params.id, {
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
    res.status(500).json({
      error: 'Failed to fetch flag',
      message: error.message
    });
  }
});

module.exports = router;