const express = require('express');
const flagService = require('../services/flagService');

const router = express.Router();

// Get flag analytics
router.get('/flags/:flagName', async (req, res) => {
  try {
    const { flagName } = req.params;
    const { environment = 'production', timeRange = '7d' } = req.query;

    const analytics = await flagService.getFlagAnalytics(flagName, environment, timeRange);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch analytics',
      message: error.message
    });
  }
});

module.exports = router;