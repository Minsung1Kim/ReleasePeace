
import { useEffect, useState, useRef } from "react";
import { apiRequest, getMembers } from '../utils/api';


const TeamViewerModal = ({ open, companyId, onClose, tab = 'members' }) => {
  const overlayRef = useRef(null);
  const [code, setCode] = useState('');
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !companyId || tab !== 'invite') return;
    apiRequest(`companies/${companyId}/invite-code`, {
      headers: { 'X-Company-Id': companyId }
    })
      .then(r => setCode(r.invite_code || r.inviteCode || ''))
      .catch(console.error);
  }, [open, companyId, tab]);

  useEffect(() => {
    if (tab !== 'members' || !companyId) return;
    let alive = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const list = await getMembers(companyId);
        if (alive) setMembers(Array.isArray(list?.members) ? list.members : (list || []));
      } catch (e) {
        if (alive) setError(e.message || 'Failed to load members');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tab, companyId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const regenerate = () =>
    apiRequest(`companies/${companyId}/regenerate-invite`, {
      method: 'POST',
      headers: { 'X-Company-Id': companyId }
    })
      .then(r => setCode(r.invite_code || r.inviteCode || ''))
      .catch(console.error);

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose?.()}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl">
        {/* Invite Code Section */}
        {tab === 'invite' && (
          <>
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Invite Code</h2>
              <p className="text-xs text-gray-500 mt-1">Share this code to invite teammates</p>
            </div>
            <div className="p-4">
              <div className="mb-2">
                <input
                  readOnly
                  value={code}
                  className="w-full px-3 py-2 border rounded text-lg font-mono bg-gray-50"
                />
              </div>
              <button
                className="px-3 py-2 rounded border bg-blue-50 text-blue-700 mr-2"
                onClick={regenerate}
              >
                Regenerate
              </button>
              <button
                className="px-3 py-2 rounded border bg-gray-50 text-gray-700"
                onClick={() => navigator.clipboard.writeText(code)}
              >
                Copy
              </button>
            </div>
          </>
        )}

        {/* Members Section */}
        {tab === 'members' && (
          <>
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Team Members</h2>
            </div>
            <div className="p-4">
              {loading && <div className="text-sm text-gray-500 p-3">Loading…</div>}
              {error && <div className="text-sm text-red-600 p-3">{error}</div>}
              {!loading && !error && members.length === 0 && (
                <div className="text-sm text-gray-500 p-3">No members yet.</div>
              )}
              {!loading && !error && members.length > 0 && (
                <ul className="divide-y">
                  {members.map(m => (
                    <li key={m.id} className="py-2 flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {m.display_name || m.username || m.email}
                        </div>
                        <div className="text-xs text-gray-500">{m.role}</div>
                      </div>
                      {/* (optional) role actions if owner/admin */}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="p-3 flex justify-end gap-2 border-t">
          <button className="px-4 py-2 rounded-lg border hover:bg-gray-50" onClick={() => onClose?.()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeamViewerModal;
