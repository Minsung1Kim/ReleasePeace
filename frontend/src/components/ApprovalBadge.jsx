import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

export default function ApprovalBadge({ flag }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Use whichever is available: flag.id or flag.key
  const flagIdOrKey = flag?.id || flag?.key;

  async function refresh() {
    try {
      const r = await apiRequest(`/api/flags/${flagIdOrKey}/approvals`);
      setItems(Array.isArray(r) ? r : []);
    } catch (e) {
      console.error('approvals refresh failed', e);
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [flagIdOrKey]);

  async function requestApproval() {
    setLoading(true);
    try {
      await apiRequest(`/api/flags/${flagIdOrKey}/approvals`, {
        method: 'POST',
        body: JSON.stringify({ requiredRoles: ['QA','LEGAL'], requiredCount: 2 })
      });
      await refresh();
    } catch (e) {
      console.error('requestApproval failed', e);
    } finally {
      setLoading(false);
    }
  }

  const latest = items?.[0];
  const status = latest?.status || 'none';
  const color = status === 'approved' ? '#16a34a' : status === 'rejected' ? '#dc2626' : '#d97706';

  return (
    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
      <span style={{ padding:'2px 8px', border:`1px solid ${color}`, borderRadius:8, color }}>
        {`Approvals: ${status}`}
      </span>
      <button onClick={requestApproval} disabled={loading}
        style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #555', opacity: loading ? 0.6 : 1 }}>
        {loading ? 'Requesting…' : 'Request approval'}
      </button>
    </div>
  );
}
