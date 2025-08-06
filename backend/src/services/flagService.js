const { FeatureFlag, FlagState, FlagMetric, AuditLog } = require('../models');
const logger = require('../utils/logger');
const crypto = require('crypto');

class FlagService {
  /**
   * Evaluate if a feature flag is active for a user
   * This is the core function that determines flag state
   */
  async evaluateFlag(flagName, user = {}, environment = 'production') {
    try {
      // Get flag and its state for the environment
      const flag = await FeatureFlag.findOne({
        where: { name: flagName, is_active: true },
        include: [{
          model: FlagState,
          as: 'states',
          where: { environment },
          required: false
        }]
      });

      if (!flag) {
        return {
          active: false,
          reason: 'flag_not_found',
          metadata: { flagName, environment }
        };
      }

      const state = flag.states?.[0];
      
      if (!state || !state.is_enabled) {
        return {
          active: false,
          reason: 'flag_disabled',
          metadata: { flagName, environment }
        };
      }

      // Apply targeting rules
      const targetingResult = this.evaluateTargeting(state.targeting_rules || {}, user);
      if (!targetingResult.matches) {
        return {
          active: false,
          reason: 'targeting_rules_not_met',
          metadata: { 
            flagName, 
            environment, 
            rule: targetingResult.failedRule 
          }
        };
      }

      // Apply rollout percentage
      const rolloutResult = this.evaluateRollout(state.rollout_percentage, user, flagName);
      if (!rolloutResult.included) {
        return {
          active: false,
          reason: 'not_in_rollout_percentage',
          metadata: { 
            flagName, 
            environment, 
            percentage: state.rollout_percentage,
            userHash: rolloutResult.userHash
          }
        };
      }

      // Flag is active!
      return {
        active: true,
        reason: 'flag_active',
        metadata: { 
          flagName, 
          environment, 
          rollout_percentage: state.rollout_percentage
        }
      };

    } catch (error) {
      logger.error('Flag evaluation error:', error, { flagName, environment, userId: user.id });
      
      // Always fail safe
      return {
        active: false,
        reason: 'evaluation_error',
        error: error.message
      };
    }
  }

  /**
   * Evaluate targeting rules against a user
   */
  evaluateTargeting(targetingRules, user) {
    try {
      // If no rules, everyone matches
      if (!targetingRules || Object.keys(targetingRules).length === 0) {
        return { matches: true };
      }

      // Check each targeting rule
      for (const [attribute, condition] of Object.entries(targetingRules)) {
        const userValue = this.getUserAttribute(user, attribute);
        
        if (!this.evaluateCondition(userValue, condition)) {
          return { 
            matches: false, 
            failedRule: `${attribute}: ${JSON.stringify(condition)}` 
          };
        }
      }

      return { matches: true };
    } catch (error) {
      logger.error('Targeting evaluation error:', error);
      return { matches: false, failedRule: 'evaluation_error' };
    }
  }

  /**
   * Get user attribute for targeting
   */
  getUserAttribute(user, attribute) {
    const attributeMap = {
      'user_id': user.id,
      'email': user.email,
      'country': user.country,
      'user_type': user.user_type,
      'plan': user.plan,
      'company': user.company,
      'beta_user': user.beta_user,
      'signup_date': user.signup_date
    };

    return attributeMap[attribute] || user[attribute];
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(userValue, condition) {
    if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
      return userValue === condition;
    }

    if (Array.isArray(condition)) {
      return condition.includes(userValue);
    }

    if (typeof condition === 'object') {
      // Handle operators like { "in": ["US", "CA"] }, { ">=": 18 }
      for (const [operator, value] of Object.entries(condition)) {
        switch (operator) {
          case 'in':
            return Array.isArray(value) && value.includes(userValue);
          case 'not_in':
            return Array.isArray(value) && !value.includes(userValue);
          case 'equals':
            return userValue === value;
          case 'not_equals':
            return userValue !== value;
          case 'greater_than':
          case '>':
            return Number(userValue) > Number(value);
          case 'greater_than_or_equal':
          case '>=':
            return Number(userValue) >= Number(value);
          case 'less_than':
          case '<':
            return Number(userValue) < Number(value);
          case 'less_than_or_equal':
          case '<=':
            return Number(userValue) <= Number(value);
          case 'contains':
            return String(userValue).toLowerCase().includes(String(value).toLowerCase());
          case 'starts_with':
            return String(userValue).toLowerCase().startsWith(String(value).toLowerCase());
          case 'ends_with':
            return String(userValue).toLowerCase().endsWith(String(value).toLowerCase());
          case 'regex':
            try {
              const regex = new RegExp(value);
              return regex.test(String(userValue));
            } catch (e) {
              return false;
            }
          default:
            return false;
        }
      }
    }

    return false;
  }

  /**
   * Evaluate rollout percentage using consistent hashing
   * This ensures the same user always gets the same result for a flag
   */
  evaluateRollout(percentage, user, flagName) {
    try {
      // 0% rollout - nobody gets it
      if (percentage === 0) {
        return { included: false, userHash: null };
      }

      // 100% rollout - everyone gets it
      if (percentage >= 100) {
        return { included: true, userHash: null };
      }

      // Generate consistent hash for user + flag combination
      const userId = user.id || user.email || user.username || 'anonymous';
      const hashInput = `${flagName}:${userId}`;
      const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
      
      // Convert first 8 characters of hash to integer
      const hashInt = parseInt(hash.substring(0, 8), 16);
      
      // Convert to percentage (0-100)
      const userPercentile = (hashInt % 10000) / 100;
      
      return {
        included: userPercentile < percentage,
        userHash: hashInt,
        userPercentile
      };
    } catch (error) {
      logger.error('Rollout evaluation error:', error);
      return { included: false, userHash: null };
    }
  }

  /**
   * Track a business metric for a flag
   */
  async trackMetric(flagName, user, event, value, environment = 'production') {
    try {
      const flag = await FeatureFlag.findOne({
        where: { name: flagName }
      });

      if (!flag) {
        logger.warn(`Attempted to track metric for non-existent flag: ${flagName}`);
        return;
      }

      await FlagMetric.create({
        flag_id: flag.id,
        environment,
        metric_name: event,
        metric_value: value,
        user_segment: {
          user_id: user.id,
          user_type: user.user_type,
          country: user.country,
          plan: user.plan
        }
      });

      logger.debug('Metric tracked successfully', {
        flagName,
        event,
        value,
        userId: user.id,
        environment
      });

    } catch (error) {
      logger.error('Error tracking metric:', error);
      throw error;
    }
  }

  /**
   * Get flag analytics/metrics
   */
  async getFlagAnalytics(flagName, environment = 'production', timeRange = '7d') {
    try {
      const flag = await FeatureFlag.findOne({
        where: { name: flagName }
      });

      if (!flag) {
        throw new Error('Flag not found');
      }

      // Calculate time range
      const now = new Date();
      const timeRangeMap = {
        '1h': 1 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      const startTime = new Date(now.getTime() - (timeRangeMap[timeRange] || timeRangeMap['7d']));

      // Get metrics
      const metrics = await FlagMetric.findAll({
        where: {
          flag_id: flag.id,
          environment,
          timestamp: {
            [require('sequelize').Op.gte]: startTime
          }
        },
        order: [['timestamp', 'ASC']]
      });

      // Aggregate metrics
      const analytics = {
        flag_name: flagName,
        environment,
        time_range: timeRange,
        total_events: metrics.length,
        unique_users: new Set(metrics.map(m => m.user_segment?.user_id).filter(Boolean)).size,
        events_by_type: {},
        conversion_rate: 0,
        revenue_impact: 0
      };

      // Group by event type
      metrics.forEach(metric => {
        const eventType = metric.metric_name;
        if (!analytics.events_by_type[eventType]) {
          analytics.events_by_type[eventType] = {
            count: 0,
            total_value: 0,
            avg_value: 0
          };
        }
        analytics.events_by_type[eventType].count += 1;
        analytics.events_by_type[eventType].total_value += parseFloat(metric.metric_value || 0);
      });

      // Calculate averages
      Object.keys(analytics.events_by_type).forEach(eventType => {
        const event = analytics.events_by_type[eventType];
        event.avg_value = event.count > 0 ? event.total_value / event.count : 0;
      });

      // Calculate conversion rate (if we have both 'view' and 'convert' events)
      if (analytics.events_by_type.view && analytics.events_by_type.convert) {
        analytics.conversion_rate = (analytics.events_by_type.convert.count / analytics.events_by_type.view.count) * 100;
      }

      return analytics;

    } catch (error) {
      logger.error('Error getting flag analytics:', error);
      throw error;
    }
  }

  /**
   * Create audit log entry
   */
  async logAction(flagId, userId, action, oldState, newState, reason, req = null) {
    try {
      await AuditLog.create({
        flag_id: flagId,
        user_id: userId,
        action,
        old_state: oldState,
        new_state: newState,
        reason,
        ip_address: req?.ip || null,
        user_agent: req?.get('User-Agent') || null,
        environment: newState?.environment || null
      });

      logger.info('Audit log created', {
        flagId,
        userId,
        action,
        reason
      });

    } catch (error) {
      logger.error('Error creating audit log:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Emergency flag disable (circuit breaker)
   */
  async emergencyDisable(flagName, reason, userId) {
    try {
      logger.warn(`Emergency disable triggered for flag: ${flagName}`, {
        reason,
        userId
      });

      const flag = await FeatureFlag.findOne({
        where: { name: flagName }
      });

      if (!flag) {
        throw new Error('Flag not found');
      }

      // Disable flag in all environments
      await FlagState.update(
        { is_enabled: false },
        { 
          where: { flag_id: flag.id },
          returning: true
        }
      );

      // Log the action
      await this.logAction(
        flag.id,
        userId,
        'emergency_disable',
        { is_enabled: true },
        { is_enabled: false },
        reason
      );

      return {
        success: true,
        flag_name: flagName,
        reason,
        disabled_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Emergency disable failed:', error);
      throw error;
    }
  }

  /**
   * Check if flag needs circuit breaker activation
   * This would be called by a background job monitoring error rates
   */
  async checkCircuitBreaker(flagName, environment = 'production') {
    try {
      const flag = await FeatureFlag.findOne({
        where: { 
          name: flagName,
          auto_disable_on_error: true
        },
        include: [{
          model: FlagState,
          as: 'states',
          where: { environment, is_enabled: true }
        }]
      });

      if (!flag || !flag.states?.[0]) {
        return { shouldDisable: false, reason: 'flag_not_found_or_disabled' };
      }

      // Get recent error metrics (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const errorMetrics = await FlagMetric.findAll({
        where: {
          flag_id: flag.id,
          environment,
          metric_name: 'error',
          timestamp: {
            [require('sequelize').Op.gte]: fiveMinutesAgo
          }
        }
      });

      const totalMetrics = await FlagMetric.findAll({
        where: {
          flag_id: flag.id,
          environment,
          metric_name: ['view', 'request', 'evaluation'],
          timestamp: {
            [require('sequelize').Op.gte]: fiveMinutesAgo
          }
        }
      });

      if (totalMetrics.length === 0) {
        return { shouldDisable: false, reason: 'no_traffic' };
      }

      const errorRate = errorMetrics.length / totalMetrics.length;
      const threshold = flag.error_threshold || 0.05;

      if (errorRate > threshold) {
        return {
          shouldDisable: true,
          reason: `error_rate_exceeded`,
          error_rate: errorRate,
          threshold,
          error_count: errorMetrics.length,
          total_count: totalMetrics.length
        };
      }

      return { shouldDisable: false, reason: 'within_threshold' };

    } catch (error) {
      logger.error('Circuit breaker check failed:', error);
      return { shouldDisable: false, reason: 'check_error' };
    }
  }
}

module.exports = new FlagService();