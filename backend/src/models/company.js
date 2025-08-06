// backend/src/models/company.js
// Following your Upstand company creation pattern

const { DataTypes } = require('sequelize');

const defineCompanyModel = (sequelize) => {
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

  return Company;
};

// User-Company relationship (following your member pattern)
const defineUserCompanyModel = (sequelize) => {
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

  return UserCompany;
};

module.exports = {
  defineCompanyModel,
  defineUserCompanyModel
};