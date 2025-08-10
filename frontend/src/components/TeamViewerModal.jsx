import { useEffect, useRef } from "react";

export default function TeamViewerModal({ members = [], onClose }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose?.()}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Team</h2>
          <p className="text-xs text-gray-500 mt-1">View-only list of members and roles</p>
        </div>

        <div className="p-2 max-h-[70vh] overflow-y-auto">
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.name || m.email}</div>
                  <div className="text-xs text-gray-500 truncate">{m.email}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 border">{m.role}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-3 flex justify-end gap-2 border-t">
          <button className="px-4 py-2 rounded-lg border hover:bg-gray-50" onClick={() => onClose?.()}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
