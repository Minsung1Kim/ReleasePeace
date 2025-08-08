// backend/src/routes/companies.js - COMPLETE FILE
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { extractCompanyContext, optionalCompanyContext } = require('../middleware/company');
const { Company, UserCompany, User } = require('../models');
const crypto = require('crypto');

const router = express.Router();

// Create company
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, subdomain, domain } = req.body;
    const userId = req.user.id;

    if (!name) {
      return res.status(400).json({
        error: 'Company name is required'
      });
    }

    // Generate unique invite code
    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Create company
    const company = await Company.create({
      name,
      subdomain: subdomain || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      domain,
      invite_code: inviteCode,
      owner_id: userId,
      plan: 'starter'
    });

    // Create user-company relationship (owner)
    await UserCompany.create({
      user_id: userId,
      company_id: company.id,
      role: 'owner',
      status: 'active'
    });

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        subdomain: company.subdomain,
        invite_code: inviteCode,
        role: 'owner'
      }
    });

  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        error: 'Company subdomain or domain already exists'
      });
    }
    
    console.error('Error creating company:', error);
    res.status(500).json({
      error: 'Failed to create company'
    });
  }
});

// Get user's companies
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const userCompanies = await UserCompany.findAll({
      where: {
        user_id: userId,
        status: 'active'
      },
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
      role: uc.role,
      joined_at: uc.joined_at,
      plan: uc.company.plan
    }));

    res.json({
      success: true,
      companies
    });

  } catch (error) {
    console.error('Error fetching user companies:', error);
    res.status(500).json({
      error: 'Failed to fetch companies'
    });
  }
});

// Join company by invite code
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { invite_code } = req.body;
    const userId = req.user.id;

    if (!invite_code) {
      return res.status(400).json({
        error: 'Invite code is required'
      });
    }

    // Find company by invite code
    const company = await Company.findOne({
      where: {
        invite_code: invite_code.toUpperCase(),
        is_active: true
      }
    });

    if (!company) {
      return res.status(404).json({
        error: 'Invalid invite code'
      });
    }

    // Check if already a member
    const existingMember = await UserCompany.findOne({
      where: {
        user_id: userId,
        company_id: company.id
      }
    });

    if (existingMember) {
      return res.status(400).json({
        error: 'Already a member of this company'
      });
    }

    // Add user as member
    await UserCompany.create({
      user_id: userId,
      company_id: company.id,
      role: 'member',
      status: 'active'
    });

    res.json({
      success: true,
      message: 'Successfully joined company',
      company: {
        id: company.id,
        name: company.name,
        role: 'member'
      }
    });

  } catch (error) {
    console.error('Error joining company:', error);
    res.status(500).json({
      error: 'Failed to join company'
    });
  }
});

// Get company details (requires company context)
router.get('/:companyId', authMiddleware, extractCompanyContext, async (req, res) => {
  try {
    const company = req.company;

    // Get company members
    const members = await UserCompany.findAll({
      where: {
        company_id: company.id,
        status: 'active'
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'email', 'display_name']
      }]
    });

    const memberList = members.map(m => ({
      id: m.user.id,
      username: m.user.username,
      email: m.user.email,
      display_name: m.user.display_name,
      role: m.role,
      joined_at: m.joined_at
    }));

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        subdomain: company.subdomain,
        domain: company.domain,
        plan: company.plan,
        invite_code: company.invite_code,
        settings: company.settings,
        member_count: memberList.length,
        members: memberList
      }
    });

  } catch (error) {
    console.error('Error fetching company details:', error);
    res.status(500).json({
      error: 'Failed to fetch company details'
    });
  }
});

// Regenerate invite code (owner only)
router.post('/:companyId/regenerate-invite', authMiddleware, extractCompanyContext, async (req, res) => {
  try {
    const company = req.company;
    const userId = req.user.id;

    // Check if user is owner
    if (company.owner_id !== userId) {
      return res.status(403).json({
        error: 'Only company owner can regenerate invite codes'
      });
    }

    const newInviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    await company.update({
      invite_code: newInviteCode
    });

    res.json({
      success: true,
      invite_code: newInviteCode
    });

  } catch (error) {
    console.error('Error regenerating invite code:', error);
    res.status(500).json({
      error: 'Failed to regenerate invite code'
    });
  }
});

// PATCH /companies/:companyId/users/:userId/role
router.patch('/:companyId/users/:userId/role', authMiddleware, extractCompanyContext, async (req, res) => {
  const { userId, companyId } = req.params;
  const { new_role } = req.body;

  if (!['owner', 'pm', 'engineer', 'viewer'].includes(new_role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const actingUser = req.user;
    const company = req.company;

    // Only owner can update roles
    if (company.owner_id !== actingUser.id) {
      return res.status(403).json({ error: 'Only the owner can change roles' });
    }

    const membership = await UserCompany.findOne({
      where: {
        user_id: userId,
        company_id: company.id
      }
    });

    if (!membership) return res.status(404).json({ error: 'User not found in company' });

    membership.role = new_role;
    await membership.save();

    res.json({ success: true, message: 'Role updated', role: new_role });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

module.exports = router;