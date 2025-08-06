const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const router = express.Router();

// Simple demo login (no password for MVP demo)
router.post('/login', async (req, res) => {
  try {
    const { username, role = 'pm' } = req.body;

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

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY }
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
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Login failed',
      message: error.message
    });
  }
});

// Get all users (for demo)
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
    res.status(500).json({
      error: 'Failed to fetch users',
      message: error.message
    });
  }
});

module.exports = router;