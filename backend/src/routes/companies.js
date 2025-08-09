// backend/src/routes/companies.js

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { ensureCompanyRole } = require('../middleware/roles');

// If you attach a db instance on req (e.g., in middleware), keep using req.db.*
// Otherwise, import your models and replace the req.db calls below.
function getDb(req) {
  if (!req.db) throw new Error('DB handle (req.db) not found. Attach it in middleware or swap to models.');
  return req.db;
}

// GET /api/companies/:companyId/members
router.get('/:companyId/members',
  requireAuth,
  ensureCompanyRole('viewer'),
  async (req, res, next) => {
    try {
      const db = getDb(req);
      const members = await db.getCompanyMembers(req.params.companyId);
      res.json(members);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/companies/:companyId/members/:userId/role
router.patch('/:companyId/members/:userId/role',
  requireAuth,
  ensureCompanyRole('admin'),
  async (req, res, next) => {
    try {
      const { role } = req.body;
      const allowed = ['owner','admin','pm','qa','viewer'];
      if (!allowed.includes(role)) return res.status(400).json({ error: 'invalid role' });

      const db = getDb(req);
      await db.setMemberRole(req.params.companyId, req.params.userId, role);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/companies/:companyId/ownership
router.post('/:companyId/ownership',
  requireAuth,
  ensureCompanyRole('owner'),
  async (req, res, next) => {
    try {
      const { userId } = req.body;
      const db = getDb(req);
      await db.transferOwnership(req.params.companyId, userId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/companies/:companyId/members/:userId
router.delete('/:companyId/members/:userId',
  requireAuth,
  ensureCompanyRole('admin'),
  async (req, res, next) => {
    try {
      const db = getDb(req);
      await db.removeMember(req.params.companyId, req.params.userId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
