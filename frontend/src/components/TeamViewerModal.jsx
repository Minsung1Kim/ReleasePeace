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

  // Helper function to get display name for a member
  const getMemberDisplayName = (member) => {
    // Try display_name first, then name, then username, then email, then fallback
    return (
      (member.display_name && member.display_name.trim() && member.display_name !== 'Unknown') ||
      (member.name && member.name.trim()) ||
      (member.username && member.username.trim()) ||
      (member.email && member.email.trim()) ||
      'Unknown User'
    );
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
              Share this code with a teammate. They can join via the "Join Company" screen.
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
              <>
                {(!members || members.length === 0) ? (
                  <div className="text-sm text-gray-500 p-4 text-center">No team members found</div>
                ) : (
                  <ul className="divide-y">
                    {members.map(m => {
                      const displayName = getMemberDisplayName(m);
                      const memberId = m.id || m.user_id;
                      
                      return (
                        <li key={memberId} className="py-3 flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {displayName}
                            </div>
                            {m.email && m.email.trim() && (
                              <div className="text-xs text-gray-500 truncate mt-1">{m.email}</div>
                            )}
                            {m.username && m.username.trim() && m.username !== displayName && (
                              <div className="text-xs text-gray-400 truncate">@{m.username}</div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            {canManage ? (
                              <select
                                className="border rounded px-2 py-1 text-sm min-w-[100px]"
                                value={m.role || 'member'}
                                onChange={(e) => onChangeRole?.(memberId, e.target.value)}
                              >
                                {ROLE_OPTIONS.map(role => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="px-2 py-1 text-sm bg-gray-100 rounded">
                                {m.role || 'member'}
                              </span>
                            )}
                            
                            {canManage && m.role !== 'owner' && (
                              <button 
                                className="px-2 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50"
                                onClick={() => onRemoveMember?.(memberId)}
                                title="Remove member"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}