import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../utils/api";

const ROLE_OPTIONS = ["owner", "admin", "pm", "engineer", "qa", "legal", "member"];

export default function TeamViewerModal({
  open,
  onClose,
  companyId,
  canManage = false,
  view = "team",
  inviteCode = "",
  onLoadInvite,
  onRegenerateInvite,
  copyInvite,
}) {
  const overlayRef = useRef(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Fetch fresh members whenever the modal opens for a company
  useEffect(() => {
    if (!open || !companyId || view !== "team") return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiRequest(`companies/${companyId}/members`, {
          headers: { "X-Company-Id": companyId },
        });
        const list = Array.isArray(data) ? data : data?.members || [];
        if (!cancelled) setMembers(list);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load members");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, companyId, view]);

  // Keep invite code behavior intact when view === 'invite'
  useEffect(() => {
    if (open && view === "invite") onLoadInvite?.();
  }, [open, view, onLoadInvite]);

  if (!open) return null;

  const handleBackdrop = (e) => { if (e.target === overlayRef.current) onClose?.(); };
  const pick = (...vals) => vals.find(v => typeof v === "string" && v.trim() && !/^unknown/i.test(v));

  // Build a label strictly from the member data (no “current user” override)
  function memberLabel(m) {
    const u = m?.user || {};
    return (
      pick(
        m.display_name, m.displayName, m.name,
        u.display_name, u.displayName, u.name,
        m.username, u.username,
        m.email, u.email,
        m.invited_email, m.pending_email
      ) ||
      String(m.user_id ?? m.id ?? "").slice(0, 8) ||
      "Member"
    );
  }

  async function changeRole(userId, role) {
    try {
      await apiRequest(`/companies/${companyId}/members/${userId}/role`, {
        method: "PATCH",
        headers: { "X-Company-Id": companyId },
        body: { role },
      });
      setMembers(prev => prev.map(m =>
        (m.user_id === userId || m.id === userId || m.user?.id === userId)
          ? { ...m, role }
          : m
      ));
    } catch (e) {
      alert(e?.message || "Failed to update role");
    }
  }

  async function removeMember(userId) {
    try {
      await apiRequest(`/companies/${companyId}/members/${userId}`, {
        method: "DELETE",
        headers: { "X-Company-Id": companyId },
      });
      setMembers(prev => prev.filter(m => (m.user_id ?? m.id ?? m.user?.id) !== userId));
    } catch (e) {
      alert(e?.message || "Failed to remove member");
    }
  }

  const InviteView = () => (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Invite Code</h3>
        <button className="px-3 py-1 border rounded" onClick={onClose}>Close</button>
      </div>
      <input
        className="w-full border rounded px-3 py-2 mb-2 bg-white text-gray-900 font-mono"
        readOnly
        value={inviteCode || "No code yet"}
        onFocus={(e) => e.target.select()}
      />
      <div className="flex gap-2">
        <button
          className="px-3 py-1 border rounded"
          onClick={copyInvite || (async () => inviteCode && navigator.clipboard.writeText(inviteCode))}
          disabled={!inviteCode}
        >
          Copy
        </button>
        <button className="px-3 py-1 border rounded" onClick={onRegenerateInvite}>Regenerate</button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Share this code with a teammate. They can join via the "Join Company" screen.
      </p>
    </>
  );

  const TeamView = () => (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Team Members</h3>
        <button className="px-3 py-1 border rounded" onClick={onClose}>Close</button>
      </div>

      {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
      {loading ? (
        <div className="text-sm text-gray-500 p-2">Loading…</div>
      ) : members.length === 0 ? (
        <div className="text-sm text-gray-500 p-4 text-center">No team members found</div>
      ) : (
        <ul className="divide-y">
          {members.map((m) => {
            const id = m.user_id ?? m.id ?? m.user?.id;
            const email = pick(m.email, m.user?.email, m.invited_email, m.pending_email);
            return (
              <li key={id} className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <span className="truncate">{memberLabel(m)}</span>
                  {email && <div className="text-xs text-gray-500 truncate mt-1">{email}</div>}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {canManage ? (
                    <select
                      className="border rounded px-2 py-1 text-sm min-w-[100px]"
                      value={m.role || "member"}
                      onChange={(e) => changeRole(id, e.target.value)}
                    >
                      {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="px-2 py-1 text-sm bg-gray-100 rounded">{m.role || "member"}</span>
                  )}
                  {canManage && m.role !== "owner" && (
                    <button
                      className="px-2 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50"
                      onClick={() => removeMember(id)}
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
  );

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
        {view === "invite" ? <InviteView /> : <TeamView />}
      </div>
    </div>
  );
}
