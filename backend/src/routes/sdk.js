const express = require('express');
const rateLimit = require('express-rate-limit');
const flagService = require('../services/flagService');
const logger = require('../utils/logger');

const router = express.Router();

// Heavy rate limiting for SDK endpoints (they'll be called frequently)
const sdkLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10000, // 10k requests per minute per IP
  message: 'Too many SDK requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false
});

router.use(sdkLimiter);

// SDK Info endpoint
router.get('/', (req, res) => {
  res.json({
    service: 'ReleasePeace SDK API',
    version: '1.0.0',
    endpoints: {
      evaluate: 'POST /sdk/evaluate/:flagName',
      bulk_evaluate: 'POST /sdk/evaluate-bulk',
      track: 'POST /sdk/track/:flagName'
    },
    documentation: 'https://docs.releasepeace.com/sdk'
  });
});

// Client SDK download endpoints
router.get('/client/javascript', (req, res) => {
  // In a real implementation, this would serve the actual JS SDK file
  res.set('Content-Type', 'application/javascript');
  res.send(`
// ReleasePeace JavaScript SDK v1.0.0
class ReleasePeace {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.baseURL = options.baseURL || 'http://localhost:5000';
    this.environment = options.environment || 'production';
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60000; // 60 seconds
  }

  async isActive(flagName, user = {}) {
    try {
      const cacheKey = \`\${flagName}:\${JSON.stringify(user)}\`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.result;
      }

      const response = await fetch(\`\${this.baseURL}/sdk/evaluate/\${flagName}\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${this.apiKey}\`
        },
        body: JSON.stringify({
          user,
          environment: this.environment
        })
      });

      const data = await response.json();
      const result = data.active || false;

      // Cache the result
      this.cache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      console.warn('ReleasePeace: Flag evaluation failed, returning false:', error);
      return false; // Fail safe
    }
  }

  async track(flagName, user, event, value = null) {
    try {
      await fetch(\`\${this.baseURL}/sdk/track/\${flagName}\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${this.apiKey}\`
        },
        body: JSON.stringify({
          user,
          event,
          value,
          environment: this.environment
        })
      });
    } catch (error) {
      console.warn('ReleasePeace: Tracking failed:', error);
    }
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReleasePeace;
} else {
  window.ReleasePeace = ReleasePeace;
}
  `);
});

// Python SDK
router.get('/client/python', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`
# ReleasePeace Python SDK v1.0.0
import requests
import json
import time
from functools import lru_cache
from typing import Dict, Any, Optional

class ReleasePeace:
    def __init__(self, api_key: str, base_url: str = "http://localhost:5000", environment: str = "production"):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.environment = environment
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        })

    def is_active(self, flag_name: str, user: Dict[str, Any] = None) -> bool:
        """Check if feature flag is active for user"""
        try:
            response = self.session.post(
                f'{self.base_url}/sdk/evaluate/{flag_name}',
                json={
                    'user': user or {},
                    'environment': self.environment
                },
                timeout=0.1  # Fast timeout
            )
            return response.json().get('active', False)
        except Exception as e:
            print(f"ReleasePeace: Flag evaluation failed, returning False: {e}")
            return False  # Fail safe

    def track(self, flag_name: str, user: Dict[str, Any], event: str, value: Optional[float] = None):
        """Track business metric for flag"""
        try:
            self.session.post(
                f'{self.base_url}/sdk/track/{flag_name}',
                json={
                    'user': user,
                    'event': event,
                    'value': value,
                    'environment': self.environment
                },
                timeout=1.0
            )
        except Exception as e:
            print(f"ReleasePeace: Tracking failed: {e}")

# Example usage:
# rp = ReleasePeace('your_api_key')
# if rp.is_active('new_checkout', {'id': '123', 'plan': 'premium'}):
#     # New checkout flow
#     process_checkout_v2()
#     rp.track('new_checkout', user, 'checkout_completed', 49.99)
# else:
#     # Old checkout flow
#     process_checkout_v1()
  `);
});

// Get SDK statistics
router.get('/stats', async (req, res) => {
  try {
    // This would track SDK usage statistics in a real implementation
    res.json({
      total_evaluations_today: Math.floor(Math.random() * 100000),
      avg_response_time: '0.8ms',
      success_rate: '99.97%',
      active_flags: Math.floor(Math.random() * 50) + 10,
      environments: ['development', 'staging', 'production']
    });
  } catch (error) {
    logger.error('SDK stats error:', error);
    res.status(500).json({
      error: 'Failed to get SDK statistics'
    });
  }
});

module.exports = router;