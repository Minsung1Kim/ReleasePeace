const db = require('../utils/db');

async function logAudit({ actorId, action, entityType, entityId, payload = {} }) {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorId || null, action, entityType, entityId, payload]
  );
}
module.exports = { logAudit };
