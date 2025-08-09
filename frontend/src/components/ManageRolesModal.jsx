import { useState } from "react";
import PropTypes from "prop-types";
import {
  Dialog, DialogTitle, DialogContent, IconButton, Menu, MenuItem,
  List, ListItem, ListItemText, Chip, Stack, Tooltip, Divider, Snackbar, Alert
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import * as api from "../utils/api";

const ROLE_OPTIONS = ["owner","admin","pm","qa","viewer"]; // adjust to your roles

function MemberRow({ member, companyId, onChanged }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const open = Boolean(anchorEl);
  const handleMenu = (e) => setAnchorEl(e.currentTarget);
  const closeMenu = () => setAnchorEl(null);

  async function changeRole(nextRole) {
    closeMenu();
    if (member.role === nextRole) return;
    try {
      setBusy(true);
      await api.updateMemberRole(companyId, member.id, nextRole);
      setToast({ sev: "success", msg: `Role changed to ${nextRole}` });
      onChanged();
    } catch (e) {
      setToast({ sev: "error", msg: e?.message || "Failed to change role" });
    } finally {
      setBusy(false);
    }
  }

  async function transferOwnership() {
    closeMenu();
    if (!window.confirm(`Transfer ownership to ${member.email}? This can't be undone here.`)) return;
    try {
      setBusy(true);
      await api.transferOwnership(companyId, member.id);
      setToast({ sev: "success", msg: "Ownership transferred" });
      onChanged();
    } catch (e) {
      setToast({ sev: "error", msg: e?.message || "Failed to transfer ownership" });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember() {
    closeMenu();
    if (!window.confirm(`Remove ${member.email} from this company?`)) return;
    try {
      setBusy(true);
      await api.removeMember(companyId, member.id);
      setToast({ sev: "success", msg: "Member removed" });
      onChanged();
    } catch (e) {
      setToast({ sev: "error", msg: e?.message || "Failed to remove member" });
    } finally {
      setBusy(false);
    }
  }

  const isSelf = member.id === (window.__AUTH?.userId || "");
  const isOwner = member.role === "owner";

  return (
    <>
      <ListItem
        secondaryAction={
          <>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={member.role} size="small" />
              <Tooltip title="More actions">
                <span>
                  <IconButton onClick={handleMenu} disabled={busy} size="small">
                    <MoreVertIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            <Menu anchorEl={anchorEl} open={open} onClose={closeMenu}>
              <MenuItem disabled>Change role</MenuItem>
              <Divider />
              {ROLE_OPTIONS.map((r) => (
                <MenuItem
                  key={r}
                  onClick={() => changeRole(r)}
                  disabled={busy || (member.role === "owner" && r !== "owner")}
                >
                  {r === member.role ? `✓ ${r}` : r}
                </MenuItem>
              ))}
              <Divider />
              <MenuItem
                onClick={transferOwnership}
                disabled={busy || isSelf || isOwner}
              >
                Transfer ownership
              </MenuItem>
              <MenuItem
                onClick={removeMember}
                disabled={busy || isOwner}
              >
                Remove from company
              </MenuItem>
            </Menu>
          </>
        }
      >
        <ListItemText
          primary={member.name || member.email}
          secondary={member.email}
        />
      </ListItem>
      <Snackbar
        open={!!toast}
        autoHideDuration={2500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toast?.sev || "info"}>{toast?.msg}</Alert>
      </Snackbar>
    </>
  );
}

MemberRow.propTypes = {
  member: PropTypes.object.isRequired,
  companyId: PropTypes.string.isRequired,
  onChanged: PropTypes.func.isRequired,
};

export default function ManageRolesModal({ open, onClose, company, members, refresh }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Manage Roles</DialogTitle>
      <DialogContent dividers>
        <List dense>
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              companyId={company.id}
              onChanged={refresh}
            />
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}

ManageRolesModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  company: PropTypes.object.isRequired,
  members: PropTypes.array.isRequired,
  refresh: PropTypes.func.isRequired,
};
