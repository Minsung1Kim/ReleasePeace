import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

export default function ApprovalsPanel({ onClose, role = 'QA' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const companyId = localStorage.getItem('rp_company_id') || '';

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const ts = Date.now(); // cache buster so we don't get 304 with empty body
      const data = await apiRequest(
        `approvals/recent?status=pending&t=${ts}`,
        { headers: companyId ? { 'X-Company-Id': companyId, 'Cache-Control': 'no-cache' } : {} }
      );
      const list = Array.isArray(data) ? data : (data?.approvals || []);
      setItems(list);
    } catch (e) {
      setErr(e?.message || 'Failed to load approvals');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // load on open

  async function decide(id, decision) {
    try {
      await apiRequest(`approvals/${id}/decision`, {
        method: 'POST',
        body: { decision, role },
        headers: companyId ? { 'X-Company-Id': companyId } : {}
      });
      await load();
    } catch (e) {
      setErr(e?.message || 'Failed to submit decision');
    }
  }

  return (
    <div style={{ border:'1px solid #333', borderRadius:12, padding:12, minWidth:420 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ fontWeight:600 }}>Pending Approvals</div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={load}>Refresh</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>

      {err && <div style={{ color:'#e66', marginBottom:8, fontSize:12 }}>{err}</div>}

      {loading ? (
        <div style={{ opacity:.7 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ opacity:.7 }}>No pending approvals.</div>
      ) : (
        items.map(a => (
          <div key={a.id} style={{ border:'1px solid #444', borderRadius:10, padding:10, marginBottom:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
              <div>
                <div style={{ fontWeight:600 }}>
                  #{a.id} • {a.flag_key || a.flagId || 'unknown-flag'}
                </div>
                <div style={{ fontSize:12, opacity:.8 }}>
                  status: {a.status || 'pending'}
                  {Array.isArray(a.required_roles) && (
                    <> • required: {a.required_roles.join(', ')} ({a.required_count || 1})</>
                  )}
                </div>
                {a.requested_by && (
                  <div style={{ fontSize:12, opacity:.8 }}>
                    requested by: {a.requested_by_email || a.requested_by}
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => decide(a.id, 'approve')}>Approve</button>
                <button onClick={() => decide(a.id, 'reject')}>Reject</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
