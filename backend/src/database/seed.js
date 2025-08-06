// backend/src/database/seed.js - COMPLETE FILE
const { sequelize, User, Company, UserCompany, FeatureFlag, FlagState, FlagMetric } = require('../models');
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

    // CREATE DEMO COMPANIES
    const companies = await Company.bulkCreate([
      {
        name: 'TechCorp Inc',
        subdomain: 'techcorp',
        invite_code: 'TECH2024',
        owner_id: users.find(u => u.role === 'admin').id,
        plan: 'enterprise',
        settings: {
          max_flags: 100,
          max_users: 50,
          max_environments: 5,
          features: {
            advanced_targeting: true,
            approval_workflows: true,
            audit_logs: true,
            api_access: true
          }
        }
      },
      {
        name: 'StartupXYZ',
        subdomain: 'startupxyz',
        invite_code: 'START123',
        owner_id: users.find(u => u.role === 'pm').id,
        plan: 'pro',
        settings: {
          max_flags: 75,
          max_users: 25,
          max_environments: 4,
          features: {
            advanced_targeting: true,
            approval_workflows: false,
            audit_logs: true,
            api_access: true
          }
        }
      },
      {
        name: 'DevShop',
        subdomain: 'devshop',
        invite_code: 'DEVS456',
        owner_id: users.find(u => u.role === 'engineer').id,
        plan: 'starter',
        settings: {
          max_flags: 50,
          max_users: 10,
          max_environments: 3,
          features: {
            advanced_targeting: false,
            approval_workflows: false,
            audit_logs: true,
            api_access: true
          }
        }
      }
    ], { returning: true });

    logger.info(`✅ Created ${companies.length} demo companies`);

    // CREATE USER-COMPANY RELATIONSHIPS
    const userCompanies = [];
    
    // TechCorp - all users are members
    for (const user of users) {
      userCompanies.push({
        user_id: user.id,
        company_id: companies[0].id, // TechCorp
        role: user.role === 'admin' ? 'owner' : 'member',
        status: 'active'
      });
    }

    // StartupXYZ - subset of users
    for (const user of users.slice(0, 3)) {
      userCompanies.push({
        user_id: user.id,
        company_id: companies[1].id, // StartupXYZ
        role: user.username === 'alice_pm' ? 'owner' : 'member',
        status: 'active'
      });
    }

    // DevShop - smaller team
    for (const user of users.slice(1, 3)) {
      userCompanies.push({
        user_id: user.id,
        company_id: companies[2].id, // DevShop  
        role: user.username === 'bob_engineer' ? 'owner' : 'member',
        status: 'active'
      });
    }

    await UserCompany.bulkCreate(userCompanies);
    logger.info(`✅ Created ${userCompanies.length} user-company relationships`);

    // CREATE FEATURE FLAGS FOR EACH COMPANY
    const flagsData = [
      // TechCorp flags
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
        company_id: companies[0].id, // TechCorp
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
        company_id: companies[0].id, // TechCorp
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
        company_id: companies[0].id, // TechCorp
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
        company_id: companies[0].id, // TechCorp
        metadata: {
          model_version: 'v2.1',
          training_data_cutoff: '2025-01-15',
          ab_test_groups: ['control', 'treatment']
        }
      },

      // StartupXYZ flags
      {
        name: 'startup_onboarding',
        description: 'Simplified onboarding for new startup customers',
        flag_type: 'rollout',
        risk_level: 'medium',
        requires_approval: false,
        auto_disable_on_error: false,
        tags: ['onboarding', 'ux'],
        created_by: users.find(u => u.role === 'pm').id,
        company_id: companies[1].id, // StartupXYZ
        metadata: {
          conversion_goal: 'increase_signup_completion',
          target_improvement: '15%'
        }
      },
      {
        name: 'social_login',
        description: 'Google and GitHub OAuth integration',
        flag_type: 'rollout',
        risk_level: 'low',
        requires_approval: false,
        auto_disable_on_error: false,
        tags: ['auth', 'social', 'ux'],
        created_by: users.find(u => u.role === 'engineer').id,
        company_id: companies[1].id, // StartupXYZ
        metadata: {
          oauth_providers: ['google', 'github'],
          security_review: 'completed'
        }
      },

      // DevShop flags
      {
        name: 'dev_tools_beta',
        description: 'Beta developer tools for power users',
        flag_type: 'experiment',
        risk_level: 'low',
        requires_approval: false,
        auto_disable_on_error: false,
        tags: ['dev-tools', 'beta'],
        created_by: users.find(u => u.role === 'engineer').id,
        company_id: companies[2].id, // DevShop
        metadata: {
          beta_users: ['internal', 'power-users'],
          feedback_channel: '#dev-tools-feedback'
        }
      },
      {
        name: 'code_review_automation',
        description: 'Automated code review suggestions',
        flag_type: 'experiment',
        risk_level: 'medium',
        requires_approval: false,
        auto_disable_on_error: true,
        error_threshold: 0.02,
        tags: ['automation', 'code-review', 'productivity'],
        created_by: users.find(u => u.role === 'engineer').id,
        company_id: companies[2].id, // DevShop
        metadata: {
          ai_model: 'code-review-v1',
          languages: ['javascript', 'python', 'java']
        }
      }
    ];

    const flags = await FeatureFlag.bulkCreate(flagsData, { returning: true });
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
            } else if (flag.name.includes('beta')) {
              targetingRules = { user_type: { in: ['beta', 'early_adopter'] } };
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
    logger.info(`✅ Created ${metrics.length} demo metrics records`);

    logger.info('🎉 Database seeding completed successfully!');
    
  } catch (error) {
    logger.error('❌ Database seeding failed:', error);
    throw error;
  }
}

module.exports = { seedDatabase };