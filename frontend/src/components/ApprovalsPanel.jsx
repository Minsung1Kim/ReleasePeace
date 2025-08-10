import { useEffect, useState } from 'react';

export default function ApprovalsPanel({ token, role = 'QA' }) {
  const [flagKey, setFlagKey] = useState('');
  const [items, setItems] = useState([]);

  const headers = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };

  async function load() {
    if (!flagKey) return setItems([]);
    const r = await fetch(`/api/flags/${flagKey}/approvals`, { headers });
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [flagKey]);

  async function decide(id, decision) {
    await fetch(`/api/approvals/${id}/decision`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ decision, role })
    });
    await load();
  }

  return (
    <div style={{ border:'1px solid #333', borderRadius:12, padding:12 }}>
      <div style={{ marginBottom:8, fontWeight:600 }}>Approvals ({role})</div>
      <input
        placeholder="flag key"
        value={flagKey}
        onChange={(e) => setFlagKey(e.target.value)}
        style={{ padding:8, borderRadius:8, border:'1px solid #444', width:'100%', marginBottom:12 }}
      />
      {items.map(a => (
        <div key={a.id} style={{ border:'1px solid #444', borderRadius:10, padding:10, marginBottom:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <div>#{a.id} • {a.flag_key} • status: {a.status}</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => decide(a.id, 'approve')}>Approve</button>
              <button onClick={() => decide(a.id, 'reject')}>Reject</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
