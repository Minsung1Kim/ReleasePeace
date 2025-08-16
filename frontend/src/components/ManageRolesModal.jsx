import { useEffect, useRef, useState } from "react";
import { apiRequest } from '../utils/api';

const ROLE_OPTIONS = ["owner", "admin", "pm", "engineer", "qa", "viewer"];

export default function ManageRolesModal({ open, companyId, onClose }) {
  const overlayRef = useRef(null);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!open || !companyId) return;
    apiRequest(`companies/${companyId}/members`, {
      headers: { 'X-Company-Id': companyId }
    })
      .then(setMembers)
      .catch(console.error);
  }, [open, companyId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose?.();
  };

  function changeRole(userId, role) {
    apiRequest(`/companies/${companyId}/members/${userId}/role`, {
      method: 'PATCH',
      body: { role },
      headers: { 'X-Company-Id': companyId }
    })
      .then(() => {
        setMembers(m => m.map(x => (x.id === userId || x.user_id === userId) ? { ...x, role } : x));
      })
      .catch(console.error);
  }

  function remove(userId) {
    apiRequest(`/companies/${companyId}/members/${userId}`, {
      method: 'DELETE',
      headers: { 'X-Company-Id': companyId }
    })
      .then(() => setMembers(m => m.filter(x => (x.id ?? x.user_id) !== userId)))
      .catch(console.error);
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Manage Roles</h2>
        </div>

        <div className="p-2 max-h-[70vh] overflow-y-auto">
          {members.length <= 1 && (
            <div className="mx-3 my-2 rounded-lg border border-yellow-300/40 bg-yellow-50/30 p-3 text-sm">
              You’re the only member of this company. Invite someone to enable transfer or removal.
            </div>
          )}
          <ul className="divide-y">
            {members.map((m) => (
              <MemberRow
                key={m.id ?? m.user_id}
                member={m}
                onChangeRole={changeRole}
                onRemoveMember={remove}
              />
            ))}
          </ul>
        </div>

        <div className="p-3 flex justify-end gap-2 border-t">
          <button
            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
            onClick={() => onClose?.()}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, onChangeRole, onRemoveMember }) {
  const btnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 224 });

  const id = member.user_id ?? member.id ?? member.user?.id;
  const name =
    member.display_name ||
    member.name ||
    member.user?.display_name ||
    member.user?.name ||
    member.username ||
    member.user?.username ||
    member.email ||
    member.user?.email ||
    String(id || '').slice(0, 8);
  const email = member.email || member.user?.email || '';
  const isOwner = member.role === "owner";

  const doChangeRole = async (role) => {
    setMenuOpen(false);
    if (!onChangeRole || role === member.role) return;
    if (isOwner && role !== "owner") {
      alert("Owner cannot be changed here.");
      return;
    }
    await onChangeRole(id, role);
  };

  const doRemove = async () => {
    setMenuOpen(false);
    if (!onRemoveMember || isOwner) {
      if (isOwner) alert("Cannot remove current owner.");
      return;
    }
    if (!confirm(`Remove ${email || name} from this company?`)) return;
    await onRemoveMember(id);
  };

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{name}</div>
        {email && <div className="text-xs text-gray-500 truncate">{email}</div>}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">
          {member.role || 'member'}
        </span>

        <button
          ref={btnRef}
          type="button"
          onClick={() => {
            const r = btnRef.current.getBoundingClientRect();
            setMenuPos({ top: r.bottom + 6, left: r.right - 224, width: 224 });
            setMenuOpen(v => !v);
          }}
          className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-[999]" onMouseDown={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="fixed z-[1000] rounded-xl border bg-white shadow-xl p-1"
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            >
              <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500">
                Change role
              </div>
              {ROLE_OPTIONS.map((r) => (
                <MenuItem
                  key={r}
                  onClick={() => doChangeRole(r)}
                  disabled={isOwner && r !== "owner"}
                  selected={member.role === r}
                >
                  {member.role === r ? "✓ " : ""}{r}
                </MenuItem>
              ))}
              <div className="my-1 border-t" />
              <MenuItem onClick={doRemove} disabled={isOwner}>
                Remove from company
              </MenuItem>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function MenuItem({ children, onClick, disabled, selected }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={[
        "w-full text-left px-3 py-2 rounded-lg text-sm",
        disabled ? "text-gray-300 cursor-not-allowed" : "hover:bg-gray-100",
        selected ? "font-semibold" : "",
      ].join(" ")}
      disabled={disabled}
      role="menuitem"
    >
      {children}
    </button>
  );
}
