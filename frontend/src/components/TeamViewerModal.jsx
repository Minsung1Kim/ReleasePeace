
import { useEffect, useState, useRef } from "react";
import { apiRequest } from '../utils/api';

const TeamViewerModal = ({ open, companyId, onClose, tab = 'members' }) => {
  const overlayRef = useRef(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!open || !companyId || tab !== 'invite') return;
    apiRequest(`companies/${companyId}/invite-code`, {
      headers: { 'X-Company-Id': companyId }
    })
      .then(r => setCode(r.invite_code || r.inviteCode || ''))
      .catch(console.error);
  }, [open, companyId, tab]);

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

        {/* Members Section (placeholder) */}
        {tab === 'members' && (
          <>
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Team Members</h2>
              <p className="text-xs text-gray-500 mt-1">List of team members will appear here.</p>
            </div>
            <div className="p-4">
              {/* TODO: Render actual members list here */}
              <div className="text-gray-500">Members view coming soon.</div>
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
