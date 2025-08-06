const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

// Database connection - Railway uses DATABASE_URL
let sequelize;

if (process.env.DATABASE_URL) {
  // Railway/Production: Use DATABASE_URL
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: process.env.NODE_ENV === 'production' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    define: {
      underscored: true,
      timestamps: true
    }
  });
} else {
  // Local development: Use individual variables
  sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'releasepeace',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    
    define: {
      underscored: true,
      timestamps: true
    }
  });
}

// Users model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  display_name: {
    type: DataTypes.STRING
  },
  avatar_url: {
    type: DataTypes.TEXT
  },
  role: {
    type: DataTypes.ENUM('admin', 'pm', 'engineer', 'qa', 'legal', 'viewer'),
    defaultValue: 'engineer'
  },
  permissions: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  last_login_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'users',
  indexes: [
    { fields: ['email'] },
    { fields: ['username'] },
    { fields: ['role'] }
  ]
});

// Feature Flags model
const FeatureFlag = sequelize.define('FeatureFlag', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT
  },
  flag_type: {
    type: DataTypes.ENUM('killswitch', 'experiment', 'rollout', 'permission'),
    defaultValue: 'rollout'
  },
  risk_level: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium'
  },
  requires_approval: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  auto_disable_on_error: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  error_threshold: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.05
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'feature_flags',
  indexes: [
    { fields: ['name'] },
    { fields: ['flag_type'] },
    { fields: ['risk_level'] },
    { fields: ['created_by'] },
    { fields: ['is_active'] }
  ]
});

// Flag States model (environment-specific states)
const FlagState = sequelize.define('FlagState', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  flag_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'feature_flags',
      key: 'id'
    }
  },
  environment: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'development'
  },
  is_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  rollout_percentage: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  targeting_rules: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  updated_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'flag_states',
  indexes: [
    { fields: ['flag_id', 'environment'], unique: true },
    { fields: ['environment'] },
    { fields: ['is_enabled'] }
  ]
});

// Flag Approvals model
const FlagApproval = sequelize.define('FlagApproval', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  flag_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'feature_flags',
      key: 'id'
    }
  },
  requested_by: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approver_role: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  comments: {
    type: DataTypes.TEXT
  },
  approved_by: {
    type: DataTypes.UUID,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approved_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'flag_approvals',
  indexes: [
    { fields: ['flag_id'] },
    { fields: ['status'] },
    { fields: ['approver_role'] }
  ]
});

// ADD THIS RIGHT AFTER FlagMetric model definition (around line 200+)

// Companies model
const Company = sequelize.define('Company', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  subdomain: {
    type: DataTypes.STRING(50),
    unique: true,
    validate: {
      isLowercase: true,
      is: /^[a-z0-9-]+$/ // Only lowercase letters, numbers, hyphens
    }
  },
  domain: {
    type: DataTypes.STRING(100),
    unique: true
  },
  invite_code: {
    type: DataTypes.STRING(20),
    unique: true
  },
  owner_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  plan: {
    type: DataTypes.ENUM('starter', 'pro', 'enterprise'),
    defaultValue: 'starter'
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
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
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'companies',
  indexes: [
    { fields: ['subdomain'] },
    { fields: ['domain'] },
    { fields: ['invite_code'] },
    { fields: ['owner_id'] },
    { fields: ['is_active'] }
  ]
});

// User-Company relationship model
const UserCompany = sequelize.define('UserCompany', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  company_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('owner', 'admin', 'member'),
    defaultValue: 'member'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending'),
    defaultValue: 'active'
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_companies',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['company_id'] },
    { fields: ['user_id', 'company_id'], unique: true }
  ]
});

// Audit Log model
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  flag_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'feature_flags',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  old_state: {
    type: DataTypes.JSONB
  },
  new_state: {
    type: DataTypes.JSONB
  },
  reason: {
    type: DataTypes.TEXT
  },
  ip_address: {
    type: DataTypes.INET
  },
  user_agent: {
    type: DataTypes.TEXT
  },
  environment: {
    type: DataTypes.STRING(20)
  }
}, {
  tableName: 'audit_logs',
  indexes: [
    { fields: ['flag_id'] },
    { fields: ['user_id'] },
    { fields: ['action'] },
    { fields: ['created_at'] }
  ]
});

// Flag Metrics model (for tracking business impact)
const FlagMetric = sequelize.define('FlagMetric', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  flag_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'feature_flags',
      key: 'id'
    }
  },
  environment: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  metric_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  metric_value: {
    type: DataTypes.DECIMAL(15, 4)
  },
  user_segment: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'flag_metrics',
  indexes: [
    { fields: ['flag_id', 'environment'] },
    { fields: ['metric_name'] },
    { fields: ['timestamp'] }
  ]
});

// Define associations
User.hasMany(FeatureFlag, { foreignKey: 'created_by', as: 'created_flags' });
User.hasMany(FlagState, { foreignKey: 'updated_by', as: 'updated_states' });
User.hasMany(FlagApproval, { foreignKey: 'requested_by', as: 'requested_approvals' });
User.hasMany(FlagApproval, { foreignKey: 'approved_by', as: 'approved_approvals' });
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'audit_logs' });

FeatureFlag.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
FeatureFlag.hasMany(FlagState, { foreignKey: 'flag_id', as: 'states' });
FeatureFlag.hasMany(FlagApproval, { foreignKey: 'flag_id', as: 'approvals' });
FeatureFlag.hasMany(AuditLog, { foreignKey: 'flag_id', as: 'audit_logs' });
FeatureFlag.hasMany(FlagMetric, { foreignKey: 'flag_id', as: 'metrics' });

FlagState.belongsTo(FeatureFlag, { foreignKey: 'flag_id', as: 'flag' });
FlagState.belongsTo(User, { foreignKey: 'updated_by', as: 'updater' });

FlagApproval.belongsTo(FeatureFlag, { foreignKey: 'flag_id', as: 'flag' });
FlagApproval.belongsTo(User, { foreignKey: 'requested_by', as: 'requester' });
FlagApproval.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

AuditLog.belongsTo(FeatureFlag, { foreignKey: 'flag_id', as: 'flag' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

FlagMetric.belongsTo(FeatureFlag, { foreignKey: 'flag_id', as: 'flag' });

module.exports = {
  sequelize,
  User,
  FeatureFlag,
  FlagState,
  FlagApproval,
  AuditLog,
  FlagMetric
};