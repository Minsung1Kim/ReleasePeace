import { useEffect, useRef, useState } from "react";

// Adjust to your roles:
const ROLE_OPTIONS = ["owner", "admin", "pm", "engineer", "qa", "viewer"];

export default function ManageRolesModal({
  members = [],
  onClose,
  onChangeRole,
  onTransferOwnership,  // optional
  onRemoveMember,       // optional
  currentUserId,        // optional: to disable transfer to self
  readOnly = false,     // NEW
}) {
  const overlayRef = useRef(null);

  // Close on ESC
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Close on outside click
  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose?.();
  };

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
                key={m.id}
                member={m}
                onChangeRole={onChangeRole}
                onTransferOwnership={onTransferOwnership}
                onRemoveMember={onRemoveMember}
                currentUserId={currentUserId}
                readOnly={readOnly}
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

function MemberRow({
  member,
  onChangeRole,
  onTransferOwnership,
  onRemoveMember,
  currentUserId,
  readOnly = false,
}) {
  const btnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 224 }); // px

  const isOwner = member.role === "owner";
  const isSelf = currentUserId && member.id === currentUserId;

  const doChangeRole = async (role) => {
    setMenuOpen(false);
    if (!onChangeRole) return;
    if (role === member.role) return;
    // Prevent demoting owner via quick menu (optional rule)
    if (member.role === "owner" && role !== "owner") {
      alert("Owner cannot be changed here.");
      return;
    }
    await onChangeRole(member.id, role);
  };

  const doTransfer = async () => {
    setMenuOpen(false);
    if (!onTransferOwnership) return;
    if (!confirm(`Transfer ownership to ${member.email}?`)) return;
    await onTransferOwnership(member.id);
  };

  const doRemove = async () => {
    setMenuOpen(false);
    if (!onRemoveMember) return;
    if (isOwner) {
      alert("Cannot remove current owner.");
      return;
    }
    if (!confirm(`Remove ${member.email} from this company?`)) return;
    await onRemoveMember(member.id);
  };

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {member.name || member.email}
        </div>
        <div className="text-xs text-gray-500 truncate">{member.email}</div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">
          {member.role}
        </span>
        {/* Only show actions if not readOnly */}
        {!readOnly && (
          <>
            <button
              ref={btnRef}
              type="button"
              onClick={() => {
                const r = btnRef.current.getBoundingClientRect();
                setMenuPos({
                  top: r.bottom + 6,
                  left: r.right - 224,
                  width: 224,
                });
                setMenuOpen((v) => !v);
              }}
              className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <svg
                className="w-5 h-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 6.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                {/* click-away layer */}
                <div
                  className="fixed inset-0 z-[999]"
                  onMouseDown={() => setMenuOpen(false)}
                />
                {/* the menu */}
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
                      disabled={member.role === "owner" && r !== "owner"}
                      selected={member.role === r}
                    >
                      {member.role === r ? "✓ " : ""}
                      {r}
                    </MenuItem>
                  ))}
                  <div className="my-1 border-t" />
                  <MenuItem
                    onClick={doTransfer}
                    disabled={!onTransferOwnership || isSelf || isOwner}
                  >
                    Transfer ownership
                  </MenuItem>
                  <MenuItem
                    onClick={doRemove}
                    disabled={!onRemoveMember || isOwner}
                  >
                    Remove from company
                  </MenuItem>
                </div>
              </>
            )}
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
        disabled
          ? "text-gray-300 cursor-not-allowed"
          : "hover:bg-gray-100",
        selected ? "font-semibold" : "",
      ].join(" ")}
      disabled={disabled}
      role="menuitem"
    >
      {children}
    </button>
  );
}
