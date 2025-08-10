const db = require('../database/db');

async function createApproval({ flagKey, requestedBy, requiredRoles = ['QA','LEGAL'], requiredCount = 1 }) {
  const q = `
    INSERT INTO approvals (flag_key, requested_by, required_roles, required_count)
    VALUES ($1,$2,$3,$4) RETURNING *`;
  const { rows } = await db.query(q, [flagKey, requestedBy, requiredRoles, requiredCount]);
  return rows[0];
}

async function listForFlag(flagKey) {
  const { rows } = await db.query(
    `SELECT * FROM approvals WHERE flag_key=$1 ORDER BY created_at DESC`, [flagKey]
  );
  return rows;
}

async function addDecision({ id, actorId, role, decision, comment }) {
  const q1 = `
    UPDATE approvals
    SET decisions = decisions || jsonb_build_array(jsonb_build_object(
          'user_id',$1,'role',$2,'decision',$3,'comment',$4,'at', NOW()
        )),
        updated_at = NOW()
    WHERE id=$5
    RETURNING *`;
  const r1 = await db.query(q1, [actorId, role || null, decision, comment || null, id]);
  if (!r1.rowCount) return null;
  const ap = r1.rows[0];

  // compute status
  const approvalsByRole = {};
  (ap.decisions || []).forEach(d => {
    if (d.decision === 'approve' && d.role) approvalsByRole[d.role] = true;
  });
  const distinctApprovedRoles = Object.keys(approvalsByRole)
    .filter(r => ap.required_roles.includes(r)).length;

  let newStatus = ap.status;
  if (decision === 'reject') newStatus = 'rejected';
  else if (distinctApprovedRoles >= ap.required_count) newStatus = 'approved';

  if (newStatus !== ap.status) {
    await db.query(`UPDATE approvals SET status=$1, updated_at=NOW() WHERE id=$2`, [newStatus, id]);
    ap.status = newStatus;
  }
  return ap;
}

async function hasRecentApproval(flagKey, days = 7) {
  const { rows } = await db.query(
    `SELECT 1 FROM approvals
     WHERE flag_key=$1 AND status='approved'
       AND created_at >= NOW() - ($2 || ' days')::interval
     LIMIT 1`, [flagKey, String(days)]
  );
  return rows.length > 0;
}

module.exports = { createApproval, listForFlag, addDecision, hasRecentApproval };
