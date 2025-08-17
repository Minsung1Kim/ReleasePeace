// backend/src/services/auditService.js
const db = require('../utils/db');

let hasNewSchema = null;

async function detectSchema() {
  if (hasNewSchema !== null) return hasNewSchema;
  try {
    const cols = await db('information_schema.columns')
      .select('column_name')
      .where({ table_schema: 'public', table_name: 'audit_logs' });

    const names = cols.map(c => c.column_name);
    hasNewSchema = names.includes('actor_id') && names.includes('payload');
    return hasNewSchema;
  } catch {
    hasNewSchema = false;
    return false;
  }
}

async function logAudit({ actorId, action, entityType, entityId, payload }) {
  try {
    const canUseNew = await detectSchema();

    if (canUseNew) {
      await db('audit_logs').insert({
        actor_id: actorId || null,
        action,
        entity_type: entityType,
        entity_id: String(entityId ?? ''),
        // knex will send JSON; DB column is jsonb
        payload: payload ?? {},
      });
    } else {
      // legacy/compat path—write only the columns that exist everywhere
      await db('audit_logs').insert({
        action,
        entity_type: entityType,
        entity_id: String(entityId ?? ''),
      });
    }
  } catch (e) {
    // Never block user actions because of logging
    console.warn('audit log failed (ignored):', e.message);
  }
}

module.exports = { logAudit };
