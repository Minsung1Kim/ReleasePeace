import React, { useEffect, useRef } from "react";
import { getAuth } from 'firebase/auth';

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
  const auth = getAuth();

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

  function memberLabel(m) {
    const u = m?.user || {};
    const me = auth.currentUser;

    const pick = (...vals) =>
      vals.find(v => typeof v === 'string' && v.trim() && !/^unknown/i.test(v));

    // If this row is the OWNER and we’re logged in, always show our email/name
    if (String(m.role).toLowerCase() === 'owner' && me) {
      const mine = pick(me.displayName, me.email);
      if (mine) return mine;
    }

    // Normal fallbacks: display name → name/username → email (from either nesting)
    const label = pick(
      m.display_name, m.displayName, m.name,
      u.display_name, u.displayName, u.name,
      m.username, u.username,
      m.email, u.email,
      // try common invite fields if your backend stored them
      m.invited_email, m.pending_email
    );

    // Last resort: show a short id so it’s not blank
    return label || String(m.user_id || m.id || '').slice(0, 8) || 'Pending member';
  }

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
                    {members.map(member => {
                      return (
                        <div key={member.user_id} className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            {/* replace the display cell with email-first fallback */}
                            <span className="truncate">
                              {member.email || member.name || (member.user_id ? String(member.user_id).slice(0, 8) : (member.id ? String(member.id).slice(0, 8) : 'pending member'))}
                            </span>

                            {member.email && member.email.trim() && (
                              <div className="text-xs text-gray-500 truncate mt-1">{member.email}</div>
                            )}
                            {member.username && member.username.trim() && member.username !== memberLabel(member) && (
                              <div className="text-xs text-gray-400 truncate">@{member.username}</div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            {canManage ? (
                              <select
                                className="border rounded px-2 py-1 text-sm min-w-[100px]"
                                value={member.role || 'member'}
                                onChange={(e) => onChangeRole?.(member.user_id ?? member.id ?? member.user?.id, e.target.value)}
                              >
                                {ROLE_OPTIONS.map(role => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="px-2 py-1 text-sm bg-gray-100 rounded">
                                {member.role || 'member'}
                              </span>
                            )}
                            
                            {canManage && member.role !== 'owner' && (
                              <button 
                                className="px-2 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50"
                                onClick={() => onRemoveMember?.(member.user_id ?? member.id ?? member.user?.id)}
                                title="Remove member"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
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