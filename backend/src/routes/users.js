// backend/src/routes/users.js - COMPLETE FILE
const express = require('express');
const jwt = require('jsonwebtoken');
const { User, Company, UserCompany } = require('../models');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Login with company selection
router.post('/login', async (req, res) => {
  try {
    const { username, role = 'pm', company_id } = req.body;

    if (!username) {
      return res.status(400).json({
        error: 'Username is required'
      });
    }

    // Find or create user for demo
    let user = await User.findOne({ where: { username } });
    
    if (!user) {
      user = await User.create({
        username,
        email: `${username}@demo.com`,
        display_name: username,
        role: role
      });
    }

    // Get user's companies
    const userCompanies = await UserCompany.findAll({
      where: { user_id: user.id, status: 'active' },
      include: [{
        model: Company,
        as: 'company',
        where: { is_active: true }
      }]
    });

    const companies = userCompanies.map(uc => ({
      id: uc.company.id,
      name: uc.company.name,
      subdomain: uc.company.subdomain,
      role: uc.role
    }));

    // If specific company requested and user has access
    let selectedCompany = null;
    if (company_id) {
      selectedCompany = companies.find(c => c.id === company_id);
      if (!selectedCompany) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'User is not a member of the specified company'
        });
      }
    }

    // Generate JWT token
    const tokenPayload = { 
      userId: user.id, 
      username: user.username
    };
    
    // Add company to token if selected
    if (selectedCompany) {
      tokenPayload.company_id = selectedCompany.id;
    }

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        email: user.email
      },
      companies,
      selected_company: selectedCompany
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

// Switch company (for users in multiple companies)
router.post('/switch-company', authMiddleware, async (req, res) => {
  try {
    const { company_id } = req.body;
    const user = req.user;

    if (!company_id) {
      return res.status(400).json({
        error: 'Company ID is required'
      });
    }

    // Verify user has access to this company
    const userCompany = await UserCompany.findOne({
      where: {
        user_id: user.id,
        company_id,
        status: 'active'
      },
      include: [{
        model: Company,
        as: 'company',
        where: { is_active: true }
      }]
    });

    if (!userCompany) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'User is not a member of this company'
      });
    }

    // Generate new token with company context
    const newToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        company_id: company_id
      },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    res.json({
      success: true,
      token: newToken,
      company: {
        id: userCompany.company.id,
        name: userCompany.company.name,
        subdomain: userCompany.company.subdomain,
        role: userCompany.role
      }
    });

  } catch (error) {
    console.error('Company switch error:', error);
    res.status(500).json({
      error: 'Company switch failed',
      message: error.message
    });
  }
});

// Get current user info
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // Get user's companies
    const userCompanies = await UserCompany.findAll({
      where: { user_id: user.id, status: 'active' },
      include: [{
        model: Company,
        as: 'company',
        where: { is_active: true }
      }]
    });

    const companies = userCompanies.map(uc => ({
      id: uc.company.id,
      name: uc.company.name,
      subdomain: uc.company.subdomain,
      role: uc.role
    }));

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        email: user.email
      },
      companies
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message
    });
  }
});

// Get all users (for demo - no company filtering)
router.get('/', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'display_name', 'role', 'email', 'created_at'],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      users,
      total: users.length
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: error.message
    });
  }
});

module.exports = router;