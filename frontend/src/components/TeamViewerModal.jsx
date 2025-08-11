import React, { useEffect, useRef } from "react";

const ROLE_OPTIONS = ["owner", "admin", "pm", "engineer", "qa", "legal", "member"];

export default function TeamViewerModal({
  open,
  onClose,
  companyId,

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
}) {
  const overlayRef = useRef(null);

  // Load invite code when the modal opens (only if user can manage)
  useEffect(() => {
    if (open && canManage && typeof onLoadInvite === "function") {
      onLoadInvite().catch(() => {});
    }
  }, [open, canManage, onLoadInvite]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyInvite = async () => {
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
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Team & Invites</h3>
          <button className="px-3 py-1 border rounded" onClick={onClose}>
            Close
          </button>
        </div>

        {/* Invite section (owners/admins only) */}
        {canManage && (
          <div className="mb-5 p-3 border rounded-lg">
            <div className="font-medium text-sm mb-2">Invite Code</div>
            <div className="flex gap-2">
              <input
                readOnly
                value={inviteCode || ""}
                placeholder="No code yet"
                className="flex-1 px-2 py-1 border rounded text-sm bg-gray-50"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyInvite}
                disabled={!inviteCode}
                className="px-2 py-1 border rounded text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                Copy
              </button>
              <button
                onClick={() => onRegenerateInvite?.()}
                className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
              >
                Regenerate
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Share this code with a teammate. They can join via the “Join Company” screen.
            </div>
          </div>
        )}

        {/* Members list */}
        <div className="mb-2">
          <div className="font-semibold text-sm mb-2">Team Members</div>

          {loading && <div className="text-sm text-gray-500 p-2">Loading…</div>}

          {!loading && error && (
            <div className="text-sm text-red-600 p-2">{error}</div>
          )}

          {!loading && !error && (members?.length ?? 0) === 0 && (
            <div className="text-sm text-gray-500 p-2">No members yet.</div>
          )}

          {!loading && !error && (members?.length ?? 0) > 0 && (
            <ul className="divide-y">
              {members.map((m) => {
                // be flexible with backend shapes
                const id =
                  m.id || m.user_id || m.userId || m.uid || m.user?.id || m.user?.uid;
                const name =
                  m.display_name ||
                  m.username ||
                  m.email ||
                  m.user?.display_name ||
                  m.user?.username ||
                  m.user?.email ||
                  "Unknown";
                const role =
                  (m.role || m.user_role || m.user?.role || "member").toLowerCase();
                const isSelf = m.is_current_user === true; // Dashboard can set this flag

                const onChange = async (e) => {
                  const newRole = e.target.value;
                  if (!id || !onChangeRole) return;
                  try {
                    await onChangeRole(id, newRole);
                  } catch (err) {
                    alert(err?.message || "Failed to update role");
                  }
                };

                const onRemove = async () => {
                  if (!id || !onRemoveMember) return;
                  if (!confirm("Remove this member from the company?")) return;
                  try {
                    await onRemoveMember(id);
                  } catch (err) {
                    alert(err?.message || "Failed to remove member");
                  }
                };

                return (
                  <li key={id || name} className="py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="text-xs text-gray-500 truncate">{m.email || m.user?.email}</div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="px-2 py-1 border rounded text-xs"
                        disabled={!canManage || isSelf} // prevent self-demote here
                        value={ROLE_OPTIONS.includes(role) ? role : "member"}
                        onChange={onChange}
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>

                      {canManage && !isSelf && role !== "owner" && (
                        <button
                          className="px-2 py-1 border rounded text-xs text-red-600 hover:bg-red-50"
                          onClick={onRemove}
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
        </div>

        {/* Footer */}
        <div className="pt-3 border-t flex justify-end">
          <button className="px-4 py-2 border rounded hover:bg-gray-50" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
