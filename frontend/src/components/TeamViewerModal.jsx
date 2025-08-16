import React, { useEffect, useRef } from "react";
import { getAuth } from 'firebase/auth';

const ROLE_OPTIONS = ["owner", "admin", "pm", "engineer", "qa", "legal", "member"];

export default function TeamViewerModal({
  open,
  onClose,
  companyId,
  view = 'invite', // 'invite' | 'team'
  members = [],
  loading = false,
  error = "",
  canManage = false,
  onChangeRole,         // (userId, newRole) => Promise<void>
  onRemoveMember,       // (userId) => Promise<void>
  inviteCode = "",
  onLoadInvite,         // () => Promise<void>
  onRegenerateInvite,   // () => Promise<void>
  copyInvite,           // () => Promise<void>
}) {
  const overlayRef = useRef(null);
  const auth = getAuth();

  useEffect(() => { if (open) onLoadInvite?.(); }, [open]);
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

  const pick = (...vals) =>
    vals.find(v => typeof v === 'string' && v.trim() && !/^unknown/i.test(v));

  function memberLabel(m) {
    const u = m?.user || {};
    const me = auth.currentUser;

    if (String(m.role).toLowerCase() === 'owner' && me) {
      const mine = pick(me.displayName, me.email);
      if (mine) return mine;
    }

    return (
      pick(
        m.display_name, m.displayName, m.name,
        u.display_name, u.displayName, u.name,
        m.username, u.username,
        m.email, u.email,
        m.invited_email, m.pending_email
      ) ||
      String(m.user_id ?? m.id ?? '').slice(0, 8) ||
      'Pending member'
    );
  }

  const getEmail = (m) => pick(m.email, m.user?.email, m.invited_email, m.pending_email);
  const getUsername = (m) => pick(m.username, m.user?.username);

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
                      const id = m.user_id ?? m.id ?? m.user?.id;
                      const email = getEmail(m);
                      const username = getUsername(m);
                      return (
                        <div key={id} className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <span className="truncate">{memberLabel(m)}</span>
                            {email && <div className="text-xs text-gray-500 truncate mt-1">{email}</div>}
                            {username && <div className="text-xs text-gray-400 truncate">@{username}</div>}
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            {canManage ? (
                              <select
                                className="border rounded px-2 py-1 text-sm min-w-[100px]"
                                value={m.role || 'member'}
                                onChange={(e) => onChangeRole?.(id, e.target.value)}
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
                                onClick={() => onRemoveMember?.(id)}
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
