import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

// Use EITHER flagId OR flagKey. We guard so we never hit /undefined/...
export default function ApprovalBadge({ flagId, flagKey }) {
  const idOrKey = flagId ?? flagKey;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!idOrKey) return; // <- hard guard
    try {
      const data = await apiRequest(`/api/flags/${idOrKey}/approvals`);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('approvals refresh failed', e);
    }
  }

  useEffect(() => { refresh(); }, [idOrKey]);

  async function requestApproval() {
    if (!idOrKey) return;
    setLoading(true);
    try {
      await apiRequest(`/api/flags/${idOrKey}/approvals`, { method: 'POST', body: {} });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  // simple UI
  const latest = items?.[0];
  const status = latest?.status || 'none';

  return (
    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
      <span style={{ padding:'2px 8px', border:'1px solid #555', borderRadius:8 }}>
        {`Approvals: ${status}`}
      </span>
      <button onClick={requestApproval} disabled={loading || !idOrKey}
        style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #555', opacity: (loading || !idOrKey) ? 0.6 : 1 }}>
        {loading ? 'Requesting…' : 'Request approval'}
      </button>
    </div>
  );
}
