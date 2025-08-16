// backend/src/services/approvalService.js
const db = require('../utils/db');

// Parse required_roles column whether JSON array or CSV string
function parseRoles(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch {}
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

async function createApproval({ flagKey, requestedBy, requiredRoles = ['QA','LEGAL'], requiredCount = 1 }) {
  const now = new Date();
  const payload = {
    flag_key: flagKey,
    requested_by: requestedBy || null,
    required_roles: JSON.stringify(requiredRoles),
    required_count: requiredCount,
    status: 'pending',
    created_at: now,
    updated_at: now,
  };
  const [row] = await db('approvals').insert(payload).returning('*');
  return row || payload;
}

async function listForFlag(flagKey) {
  return db('approvals').where({ flag_key: flagKey }).orderBy('created_at','desc');
}

/**
 * Pending = approvals that are NOT fully approved and NOT rejected.
 * This works even if approvals.status was 'open' because we compute from decisions.
 */
async function listPending({ companyId = null, limit = 50 }) {
  const base = db('approvals as a')
    .join('flags as f', 'f.key', 'a.flag_key')
    .leftJoin('approval_decisions as d', 'd.approval_id', 'a.id')
    .select(
      'a.*',
      'f.id as flag_id',
      'f.key as flag_key',
      'f.name as flag_name',
      db.raw("coalesce(a.required_roles, '[]') as required_roles_raw"),
      db.raw("sum(case when d.decision='reject' then 1 else 0 end) as any_reject"),
      db.raw("count(distinct case when d.decision='approve' then d.role end) as distinct_approves")
    )
    .modify(q => { if (companyId) q.where('f.company_id', companyId); })
    .groupBy('a.id','f.id','f.key','f.name')
    .orderBy('a.created_at','desc')
    .limit(limit);

  const rows = await base;

  // Filter in JS using computed numbers + required_count
  return rows.filter(r => {
    const reqRoles = parseRoles(r.required_roles_raw);
    const need = Number(r.required_count || 1);
    const approvedDistinct = Number(r.distinct_approves || 0);
    const rejected = Number(r.any_reject || 0) > 0;

    if (rejected) return false;
    return approvedDistinct < Math.max(1, need);
  }).map(r => ({
    id: r.id,
    status: r.status || 'pending',
    created_at: r.created_at,
    required_roles: parseRoles(r.required_roles_raw),
    required_count: r.required_count,
    requested_by: r.requested_by,
    flag: { id: r.flag_id, key: r.flag_key, name: r.flag_name },
    flag_key: r.flag_key,
  }));
}

async function addDecision({ id, actorId, role = null, decision, comment = null }) {
  const ap = await db('approvals').where({ id }).first();
  if (!ap) return null;

  await db('approval_decisions').insert({
    approval_id: id,
    actor_id: actorId || null,
    role: role || null,
    decision, // 'approve' | 'reject'
    comment: comment || null,
    created_at: new Date(),
  });

  // Recompute state
  const decisions = await db('approval_decisions').where({ approval_id: id });
  const rolesApproved = new Set(
    decisions.filter(d => d.decision === 'approve').map(d => (d.role || '').toLowerCase())
  );
  const anyReject = decisions.some(d => d.decision === 'reject');

  const need = Number(ap.required_count || 1);
  const nextStatus = anyReject ? 'rejected' : (rolesApproved.size >= Math.max(1, need) ? 'approved' : 'pending');

  if (nextStatus !== ap.status) {
    await db('approvals').where({ id }).update({ status: nextStatus, updated_at: new Date() });
    ap.status = nextStatus;
  }
  return ap;
}

module.exports = {
  createApproval,
  listForFlag,
  listPending,
  addDecision,
};
