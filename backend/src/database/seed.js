const { sequelize, User, FeatureFlag, FlagState, FlagMetric } = require('../models');
const logger = require('../utils/logger');

async function seedDatabase() {
  try {
    logger.info('🌱 Starting database seeding...');

    // Create demo users with different roles
    const users = await User.bulkCreate([
      {
        username: 'alice_pm',
        email: 'alice@demo.com',
        display_name: 'Alice Johnson',
        role: 'pm',
        avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616b4e2b8d0?w=150'
      },
      {
        username: 'bob_engineer',
        email: 'bob@demo.com',
        display_name: 'Bob Chen',
        role: 'engineer',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'
      },
      {
        username: 'carol_qa',
        email: 'carol@demo.com',
        display_name: 'Carol Rodriguez',
        role: 'qa',
        avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150'
      },
      {
        username: 'david_legal',
        email: 'david@demo.com',
        display_name: 'David Kim',
        role: 'legal',
        avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
      },
      {
        username: 'emma_admin',
        email: 'emma@demo.com',
        display_name: 'Emma Wilson',
        role: 'admin',
        avatar_url: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=150'
      }
    ], { returning: true });

    logger.info(`✅ Created ${users.length} demo users`);

    // Create demo feature flags with realistic scenarios
    const flags = await FeatureFlag.bulkCreate([
      {
        name: 'new_checkout_flow',
        description: 'New streamlined checkout process with one-click payments',
        flag_type: 'experiment',
        risk_level: 'high',
        requires_approval: true,
        auto_disable_on_error: true,
        error_threshold: 0.03,
        tags: ['checkout', 'payments', 'conversion'],
        created_by: users.find(u => u.role === 'pm').id,
        metadata: {
          jira_ticket: 'SHOP-1234',
          slack_channel: '#checkout-team',
          launch_date: '2025-02-01'
        }
      },
      {
        name: 'dark_mode_ui',
        description: 'Dark mode theme for better user experience',
        flag_type: 'rollout',
        risk_level: 'low',
        requires_approval: false,
        auto_disable_on_error: false,
        tags: ['ui', 'theme', 'accessibility'],
        created_by: users.find(u => u.role === 'engineer').id,
        metadata: {
          design_spec: 'https://figma.com/dark-mode',
          accessibility_tested: true
        }
      },
      {
        name: 'premium_features',
        description: 'Advanced features for premium subscribers',
        flag_type: 'permission',
        risk_level: 'medium',
        requires_approval: false,
        auto_disable_on_error: false,
        tags: ['premium', 'monetization', 'features'],
        created_by: users.find(u => u.role === 'pm').id,
        metadata: {
          revenue_impact: 'high',
          pricing_model: 'subscription'
        }
      },
      {
        name: 'ai_recommendations',
        description: 'ML-powered product recommendations engine',
        flag_type: 'experiment',
        risk_level: 'medium',
        requires_approval: true,
        auto_disable_on_error: true,
        error_threshold: 0.05,
        tags: ['ai', 'ml', 'recommendations', 'personalization'],
        created_by: users.find(u => u.role === 'engineer').id,
        metadata: {
          model_version: 'v2.1',
          training_data_cutoff: '2025-01-15',
          ab_test_groups: ['control', 'treatment']
        }
      },
      {
        name: 'gdpr_compliance_mode',
        description: 'Enhanced privacy controls for EU users',
        flag_type: 'killswitch',
        risk_level: 'critical',
        requires_approval: true,
        auto_disable_on_error: false,
        tags: ['privacy', 'gdpr', 'compliance', 'legal'],
        created_by: users.find(u => u.role === 'legal').id,
        metadata: {
          legal_review_required: true,
          compliance_framework: 'GDPR',
          audit_trail: true
        }
      },
      {
        name: 'mobile_push_notifications',
        description: 'Push notification system for mobile apps',
        flag_type: 'rollout',
        risk_level: 'medium',
        requires_approval: false,
        auto_disable_on_error: true,
        error_threshold: 0.02,
        tags: ['mobile', 'notifications', 'engagement'],
        created_by: users.find(u => u.role === 'pm').id,
        metadata: {
          platforms: ['iOS', 'Android'],
          notification_types: ['marketing', 'transactional', 'alerts']
        }
      }
    ], { returning: true });

    logger.info(`✅ Created ${flags.length} demo feature flags`);

    // Create flag states for different environments
    const environments = ['development', 'staging', 'production'];
    const flagStates = [];

    for (const flag of flags) {
      for (const env of environments) {
        let isEnabled, rolloutPercentage, targetingRules;

        // Realistic state progression: dev -> staging -> prod
        switch (env) {
          case 'development':
            isEnabled = true;
            rolloutPercentage = 100;
            targetingRules = {};
            break;
          case 'staging':
            isEnabled = Math.random() > 0.3; // 70% chance enabled
            rolloutPercentage = isEnabled ? (Math.random() > 0.5 ? 100 : 50) : 0;
            targetingRules = isEnabled && Math.random() > 0.5 ? {
              user_type: { in: ['internal', 'beta'] }
            } : {};
            break;
          case 'production':
            // Production rollout based on flag risk level
            const prodRollout = {
              'low': { enabled: 0.8, percentage: 75 },
              'medium': { enabled: 0.6, percentage: 25 },
              'high': { enabled: 0.4, percentage: 10 },
              'critical': { enabled: 0.2, percentage: 5 }
            };
            
            const config = prodRollout[flag.risk_level];
            isEnabled = Math.random() < config.enabled;
            rolloutPercentage = isEnabled ? Math.min(config.percentage + Math.random() * 25, 100) : 0;
            
            // Add realistic targeting rules for production
            targetingRules = {};
            if (flag.name === 'premium_features') {
              targetingRules = { plan: { in: ['premium', 'enterprise'] } };
            } else if (flag.name === 'gdpr_compliance_mode') {
              targetingRules = { country: { in: ['DE', 'FR', 'NL', 'ES', 'IT'] } };
            } else if (rolloutPercentage < 50) {
              targetingRules = { user_type: { in: ['beta', 'early_adopter'] } };
            }
            break;
        }

        flagStates.push({
          flag_id: flag.id,
          environment: env,
          is_enabled: isEnabled,
          rollout_percentage: Math.round(rolloutPercentage),
          targeting_rules: targetingRules,
          updated_by: users.find(u => u.role === 'pm').id
        });
      }
    }

    await FlagState.bulkCreate(flagStates);
    logger.info(`✅ Created ${flagStates.length} flag states across environments`);

    // Generate realistic metrics data for the past 30 days
    const metrics = [];
    const now = new Date();

    for (const flag of flags) {
      for (let day = 30; day >= 0; day--) {
        const date = new Date(now.getTime() - (day * 24 * 60 * 60 * 1000));
        
        // Generate different types of metrics
        const dailyViews = Math.floor(Math.random() * 1000) + 100;
        const conversionRate = 0.02 + Math.random() * 0.08; // 2-10%
        const conversions = Math.floor(dailyViews * conversionRate);
        const errors = Math.floor(dailyViews * (Math.random() * 0.02)); // 0-2% error rate
        
        // View metrics
        metrics.push({
          flag_id: flag.id,
          environment: 'production',
          metric_name: 'view',
          metric_value: dailyViews,
          user_segment: {},
          timestamp: date
        });

        // Conversion metrics
        if (conversions > 0) {
          metrics.push({
            flag_id: flag.id,
            environment: 'production',
            metric_name: 'conversion',
            metric_value: conversions,
            user_segment: {},
            timestamp: date
          });
        }

        // Error metrics
        if (errors > 0) {
          metrics.push({
            flag_id: flag.id,
            environment: 'production',
            metric_name: 'error',
            metric_value: errors,
            user_segment: {},
            timestamp: date
          });
        }

        // Revenue metrics for relevant flags
        if (['new_checkout_flow', 'premium_features', 'ai_recommendations'].includes(flag.name)) {
          const revenue = conversions * (20 + Math.random() * 80); // $20-100 per conversion
          metrics.push({
            flag_id: flag.id,
            environment: 'production',
            metric_name: 'revenue',
            metric_value: revenue,
            user_segment: {},
            timestamp: date
          });
        }
      }
    }

    await FlagMetric.bulkCreate(metrics);
    logger.info(`✅ Created ${metrics.length} demo metrics`);

    logger.info('🎉 Database seeding completed successfully!');
    
    // Print summary
    logger.info('📊 Demo data summary:');
    logger.info(`   Users: ${users.length} (roles: pm, engineer, qa, legal, admin)`);
    logger.info(`   Flags: ${flags.length} (covering different risk levels and use cases)`);
    logger.info(`   States: ${flagStates.length} (across dev/staging/prod environments)`);
    logger.info(`   Metrics: ${metrics.length} (30 days of realistic usage data)`);
    
    logger.info('🚀 Ready for demo! Try these credentials:');
    logger.info('   PM: alice_pm');
    logger.info('   Engineer: bob_engineer');
    logger.info('   QA: carol_qa');
    logger.info('   Legal: david_legal');
    logger.info('   Admin: emma_admin');

    return { users, flags, flagStates, metrics };

  } catch (error) {
    logger.error('❌ Database seeding failed:', error);
    throw error;
  }
}

// Run seeding if called directly
if (require.main === module) {
  sequelize.sync({ force: true })
    .then(() => seedDatabase())
    .then(() => {
      logger.info('✅ Seeding complete, exiting...');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };