import { useEffect, useState } from 'react';

export default function ApprovalBadge({ flagKey, token }) {
  const [items, setItems] = useState([]);

  const headers = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  async function refresh() {
    const r = await fetch(`/api/flags/${flagKey}/approvals`, { headers });
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [flagKey]);

  async function requestApproval() {
    await fetch(`/api/flags/${flagKey}/approvals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requiredRoles: ['QA','LEGAL'], requiredCount: 2 })
    });
    await refresh();
  }

  const latest = items?.[0];
  const status = latest?.status || 'none';
  const color = status === 'approved' ? '#16a34a' : status === 'rejected' ? '#dc2626' : '#d97706';

  return (
    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
      <span style={{ padding:'2px 8px', border:`1px solid ${color}`, borderRadius:8, color }}>{`Approvals: ${status}`}</span>
      <button onClick={requestApproval} style={{ padding:'4px 10px', borderRadius:8, border:'1px solid #555' }}>
        Request approval
      </button>
    </div>
  );
}
