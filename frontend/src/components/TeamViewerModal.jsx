import React, { useEffect, useRef } from "react";

const ROLE_OPTIONS = ["owner", "admin", "pm", "engineer", "qa", "legal", "member"];

export default function TeamViewerModal({
  open,
  onClose,
  companyId,
  view = 'invite', // 'invite' | 'team'

  // roster
  members = [],
  loading = false,
  error = "",

  // permissions
  canManage = false,

  // role / membership mutations
  onChangeRole,         // (userId, newRole) => Promise<void>
  onRemoveMember,       // (userId) => Promise<void>

  // invite
  inviteCode = "",
  onLoadInvite,         // () => Promise<void>
  onRegenerateInvite,   // () => Promise<void>
  copyInvite,           // () => Promise<void>
}) {
  const overlayRef = useRef(null);

  // Load invite code once when the modal opens
  useEffect(() => {
    if (!open) return;
    onLoadInvite?.();
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const localCopyInvite = async () => {
    if (!inviteCode) return;
    try { await navigator.clipboard.writeText(inviteCode); } catch {}
  };

  const handleBackdrop = (e) => {
    if (e.target === overlayRef.current) onClose?.();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* INVITE SECTION */}
        {view === 'invite' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Invite Code</h3>
              <button className="px-3 py-1 border rounded" onClick={onClose}>Close</button>
            </div>

            <input
              className="w-full border rounded px-3 py-2 mb-2 bg-white text-gray-900 font-mono"
              readOnly
              value={inviteCode || 'No code yet'}
              onFocus={(e) => e.target.select()}
            />
            <div className="flex gap-2">
              <button className="px-3 py-1 border rounded" onClick={copyInvite || localCopyInvite} disabled={!inviteCode}>Copy</button>
              <button className="px-3 py-1 border rounded" onClick={onRegenerateInvite}>Regenerate</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Share this code with a teammate. They can join via the “Join Company” screen.
            </p>
          </>
        )}

        {/* TEAM SECTION */}
        {view === 'team' && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Team Members</h3>
              <button className="px-3 py-1 border rounded" onClick={onClose}>Close</button>
            </div>

            {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
            {loading ? (
              <div className="text-sm text-gray-500 p-2">Loading…</div>
            ) : (
              <ul className="divide-y">
                {(members || []).map(m => (
                  <li key={m.id} className="py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {(m.display_name && m.display_name.trim())
                          || (m.name && m.name.trim())
                          || m.username
                          || m.email
                          || 'Unknown'}
                      </div>
                      {m.email && <div className="text-xs text-gray-500 truncate">{m.email}</div>}
                    </div>

                    <div className="flex items-center gap-2">
                      {canManage && (
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={m.role}
                          onChange={(e) => onChangeRole?.(m.id, e.target.value)}
                        >
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="pm">pm</option>
                          <option value="engineer">engineer</option>
                          <option value="qa">qa</option>
                          <option value="legal">legal</option>
                          <option value="member">member</option>
                        </select>
                      )}
                      {canManage && m.role !== 'owner' && (
                        <button className="px-2 py-1 border rounded text-xs"
                                onClick={() => onRemoveMember?.(m.id)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
