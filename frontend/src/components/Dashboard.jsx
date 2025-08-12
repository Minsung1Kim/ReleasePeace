// frontend/src/components/Dashboard.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAuth, onIdTokenChanged } from 'firebase/auth';

import { companies, getMembers } from '../utils/api';
import * as api from '../utils/api';
import { config } from '../config';

import TeamViewerModal from './TeamViewerModal.jsx';
import ApprovalBadge from './ApprovalBadge';
import ApprovalsPanel from './ApprovalsPanel';

// ---------- Small recent-activity popover (bell) ----------
function ActivityBell({ authedFetch }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef(null);

  const timeAgo = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleDateString();
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await authedFetch(`/api/flags/audit/recent?limit=10`);
      setLogs(data.items || data.logs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  useEffect(() => {
    const onDown = (e) => e.key === 'Escape' && setOpen(false);
    const onClickAway = (e) => {
      if (!open) return;
      if (btnRef.current && !btnRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onDown);
    document.addEventListener('mousedown', onClickAway);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('mousedown', onClickAway);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className="w-9 h-9 inline-flex items-center justify-center rounded-lg border hover:bg-gray-100"
        title="Recent activity"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[22rem] rounded-xl border bg-white shadow-xl z-50">
          <div className="px-3 py-2 border-b text-sm font-semibold">Recent Activity</div>
          <div className="max-h-80 overflow-auto">
            {loading ? (
              <div className="p-3 text-xs text-gray-500">Loading…</div>
            ) : logs.length === 0 ? (
              <div className="p-3 text-xs text-gray-500">No activity yet.</div>
            ) : (
              <ul className="divide-y">
                {logs.slice(0, 10).map(l => (
                  <li key={l.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="truncate">
                        <span className="font-medium">
                          {l.user?.display_name || l.user?.username || l.user?.email || 'Unknown'}
                        </span>
                        <span className="mx-1">·</span>
                        <span className="truncate">{l.action}</span>
                        {l.environment && <span className="ml-1 rp-badge">{l.environment}</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 ml-2 shrink-0">{timeAgo(l.created_at)}</div>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {(l.flag?.name || '')}{l.reason ? ` — “${l.reason}”` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Main Dashboard ----------
export default function Dashboard(props) {
  // --- TDZ guard: ensure k exists before any usage ---
  let k;
  // Destructure props safely
  const {
    company: companyProp = null,
    user = {},
    token = null,
    getToken = null,
    onSwitchCompany = null,
    onLogout = () => {}
  } = props || {};

  // --- unified people modal state (Invite | Team) ---
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleView, setPeopleView] = useState('invite'); // 'invite' | 'team'
  // core state
  const [activeCompany, setActiveCompany] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking...');
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeEnvironment, setActiveEnvironment] = useState('production');
  const [showCreateFlag, setShowCreateFlag] = useState(false);

  // approvals + audit
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRows, setAuditRows] = useState([]);
  const [auditForFlag, setAuditForFlag] = useState(null);

  // recent
  const [recent, setRecent] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);

  // team/invite
  const [members, setMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const inviteLoadInFlight = useRef(false);

  const loadInvite = useCallback(async () => {
    const company = activeCompany || companyProp || null;
    if (!company?.id || inviteLoadInFlight.current) return;
    inviteLoadInFlight.current = true;
    try {
      const c = await companies.get(company.id);
      let code = (c?.invite_code || '').trim();
      // Generate once if missing
      if (!code) {
        const r = await companies.regenerateInvite(company.id);
        code = (r?.invite_code || '').trim();
      }
      setInviteCode(code);
    } finally {
      inviteLoadInFlight.current = false;
    }
  }, [activeCompany, companyProp]);

  const copyInvite = useCallback(async () => {
    if (!inviteCode) return;
    try { await navigator.clipboard.writeText(inviteCode); } catch {}
  }, [inviteCode]);

  const onRegenerateInvite = useCallback(async () => {
    const company = activeCompany || companyProp || null;
    if (!company?.id) return;
    const r = await companies.regenerateInvite(company.id);
    setInviteCode((r?.invite_code || '').trim());
  }, [activeCompany, companyProp]);

  // --- derived values ---
  const company = activeCompany || companyProp || null;
  const effectiveRole = (company?.role || user?.role || '').toLowerCase();
  const userRole = effectiveRole;
  const canCreate = ['owner','admin','pm'].includes(effectiveRole);
  const canToggle = ['owner','admin','pm','engineer'].includes(effectiveRole);
  const canManage = ['owner','admin'].includes(effectiveRole);
  const environments = ['development', 'staging', 'production'];
  const companyId = company?.id || (typeof localStorage !== 'undefined' ? localStorage.getItem('rp_company_id') : undefined) || undefined;

  // --- helpers ---
  const companyPathParam = () => {
    const id = company?.id || '';
    const sub = company?.subdomain || '';
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRe.test(id) ? id : (sub || id);
  };

  const getFreshToken = useCallback(async () => {
    const auth = getAuth();
    const u = auth.currentUser;
    if (!u) return null;
    try {
      return await u.getIdToken(true); // force refresh
    } catch {
      return await u.getIdToken();
    }
  }, []);

  const authedFetch = useCallback(async (path, opts = {}) => {
    const id = company?.id || (typeof localStorage !== 'undefined' ? localStorage.getItem('rp_company_id') : undefined) || undefined;
    const t = (typeof getToken === 'function')
      ? await getToken(true)
      : await getFreshToken();
    return api.apiRequest(path, {
      ...opts,
      headers: {
        Authorization: t ? `Bearer ${t}` : undefined,
        ...(opts.headers || {}),
        ...(id ? { 'X-Company-Id': id } : {}),
      },
    });
  }, [company?.id, getToken, getFreshToken]);

  const normalizeCompany = (resp) => {
    if (!resp) return null;
    if (resp.id) return resp;
    if (resp.company) return resp.company;
    if (Array.isArray(resp.companies) && resp.companies.length) {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('rp_company_id') : null;
      return resp.companies.find(c => c.id === saved) || resp.companies[0];
    }
    if (resp.companyId) return { id: resp.companyId, role: resp.role };
    return null;
  };

  const loadActiveCompany = useCallback(async () => {
    try {
      const mine = await authedFetch('/api/companies/mine');
      const normalized = mine?.company ? {...mine.company, role: mine.role} : mine;
      if (!normalized?.id) return;

      const full = await authedFetch(`/api/companies/${normalized.id}`);
      const c = normalizeCompany(full) || normalized;

      setActiveCompany(c);
      if (c?.id) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('releasepeace_company', JSON.stringify(c));
          localStorage.setItem('rp_company_id', c.id);
        }
      }
    } catch (e) {
      console.warn('loadActiveCompany failed', e);
    }
  }, [authedFetch]);
  // --- boot + token refresh + role sync ---
  useEffect(() => {
    setActiveCompany(companyProp || null);
    if (companyProp?.id && typeof localStorage !== 'undefined') localStorage.setItem('rp_company_id', companyProp.id);
  }, [companyProp?.id]);

  useEffect(() => { loadActiveCompany(); }, [loadActiveCompany]);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (u) {
        try { await u.getIdToken(true); } catch {}
        loadActiveCompany();
      }
    });
    return unsub;
  }, [loadActiveCompany]);

  useEffect(() => {
    let timer;
    const syncRole = async () => {
      try {
        const resp = await authedFetch('/api/companies/mine');
        const list = resp?.companies || (resp ? [resp] : []);
        const latest = list.find(c => c.id === company?.id);
        if (latest && latest.role && latest.role !== company?.role) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('releasepeace_company', JSON.stringify(latest));
          }
          window.location.reload();
        }
      } catch {}
    };
    syncRole();
    timer = setInterval(syncRole, 30000);
    return () => clearInterval(timer);
  }, [company?.id, authedFetch, company?.role]);

  // --- health + initial data ---
  useEffect(() => {
    fetch(`${config.apiUrl}/health`)
      .then(() => setApiStatus('✅ Connected!'))
      .catch(() => setApiStatus('❌ Connection failed'));
    fetchFlags();
    loadRecent();
    if (company?.id && typeof localStorage !== 'undefined') localStorage.setItem('rp_company_id', company.id);
  }, [company, token]); // eslint-disable-line

  // --- loaders ---
  const fetchFlags = async () => {
    try {
      setLoading(true);
      const data = await authedFetch('/api/flags');
      setFlags(data.flags ?? data ?? []);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load flags');
      console.error('Failed to load flags:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecent = async () => {
    setRecentLoading(true);
    try {
      const audit = await authedFetch('/api/flags/audit/recent?limit=20');
      setRecent(audit.items ?? audit.logs ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setRecentLoading(false);
    }
  };

  const loadPendingApprovals = async () => {
    try {
      const data = await authedFetch(`/api/flags/approvals/pending?limit=100`);
      setPendingApprovals(data.pending || []);
    } catch (e) {
      alert(e.message || 'Failed to load approvals');
    }
  };

  const decideApproval = async (flagId, approvalId, status) => {
    const comments = window.prompt(`${status.toUpperCase()} — add a note (optional):`) || '';
    const data = await authedFetch(`/api/flags/${flagId}/approvals/${approvalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, comments })
    });
    if (!data.success) {
      alert(data.message || 'Failed to update approval');
      return;
    }
    await loadPendingApprovals();
    alert(`Approval ${status}.`);
  };

  const openApprovals = () => {
    loadPendingApprovals();
    setApprovalsOpen(true);
  };

  const openAudit = async (flag) => {
    setAuditForFlag(flag);
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const data = await authedFetch(`/api/flags/${flag.id}/audit?limit=200`);
      setAuditRows(data.items || data.logs || []);
    } catch (e) {
      alert(e.message || 'Failed to load audit');
    } finally {
      setAuditLoading(false);
    }
  };

  // --- team & invite ---
  const refreshMembers = useCallback(async () => {
    const company = activeCompany || companyProp || null;
    if (!company?.id) return;
    setTeamLoading(true);
    setTeamError('');
    try {
      const list = await getMembers(company.id);
      const raw = list?.members || list || [];
      const normalized = raw.map(m => ({
        ...m,
        display_name: m.display_name || m.user?.display_name || m.user?.name || '',
        username:     m.username     || m.user?.username     || '',
        email:        m.email        || m.user?.email        || '',
      }));
      setMembers(normalized);
    } catch (e) {
      setTeamError(e.message || 'Failed to load members.');
    } finally {
      setTeamLoading(false);
    }
  }, [activeCompany, companyProp]);

  const openInvite = async () => {
    const company = activeCompany || companyProp || null;
    if (!company?.id) return alert('Select or create a company first.');
    await loadInvite();
    setPeopleView('invite');
    setPeopleOpen(true);
  };

  const openTeam = async () => {
    const company = activeCompany || companyProp || null;
    if (!company?.id) return alert('Select or create a company first.');
    await refreshMembers();
    setPeopleView('team');
    setPeopleOpen(true);
  };

  const handleRoleChange = async (userId, newRole) => {
    const company = activeCompany || companyProp || null;
    try {
      await api.updateMemberRole(company.id, userId, newRole);
      await refreshMembers();
    } catch (e) {
      alert(e.message || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId) => {
    const company = activeCompany || companyProp || null;
    if (!window.confirm('Remove this member from the company?')) return;
    try {
      await api.removeMember(company.id, userId);
      await refreshMembers();
    } catch (e) {
      alert(e.message || 'Failed to remove member');
    }
  };
  // --- flags actions ---
  const createFlag = async (flagData) => {
    try {
      const data = await authedFetch('/api/flags', {
        method: 'POST',
        body: flagData
      });
      const newFlag = data.flag || data;
      if (!data?.success && !newFlag?.id) {
        throw new Error(data?.message || 'Failed to create flag');
      }
      // optimistic and then refresh for correctness
      if (newFlag?.id) setFlags(prev => [newFlag, ...prev]);
      await fetchFlags();
      setShowCreateFlag(false);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to create flag');
    }
  };

  const toggleFlagState = async (flagId, environment, currentState, flag) => {
    try {
      const enabling = !currentState.is_enabled;
      let reason = '';
      if (enabling) {
        const needsReason =
          environment === 'production' &&
          (flag?.risk_level === 'high' || flag?.risk_level === 'critical');
        reason = window.prompt(
          needsReason
            ? 'Change justification (required for high/critical in production):'
            : 'Optional: reason for this change?'
        ) || '';
        if (needsReason && !reason.trim()) {
          alert('A justification is required to enable this flag in production.');
          return;
        }
      }
      const data = await authedFetch(`/api/flags/${flagId}/state/${environment}`, {
        method: 'PUT',
        body: { is_enabled: enabling, reason }
      });

      if (!data.success) throw new Error(data.message || 'Failed to update flag state');
      await fetchFlags();
    } catch (err) {
      console.error('Failed to toggle flag:', err);
      alert(err.message || 'Failed to toggle flag');
    }
  };

  const rollbackFlag = async (flagId) => {
    const why = window.prompt('Emergency reason for rollback (disables in all environments):') || '';
    if (!window.confirm('Disable this flag in ALL environments?')) return;
    try {
      const data = await authedFetch(`/api/flags/${flagId}/rollback`, {
        method: 'POST',
        body: { reason: why }
      });
      if (!data?.success) throw new Error(data?.message || 'Rollback failed');
      await fetchFlags();
      alert('Rollback completed.');
    } catch (e) {
      alert(e.message || 'Rollback failed');
    }
  };

  // --- UI helpers ---
  const getRiskColor = (risk) => {
    switch (risk) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  const getTypeColor = (type) => {
    switch (type) {
      case 'killswitch': return 'bg-red-100 text-red-800';
      case 'experiment': return 'bg-purple-100 text-purple-800';
      case 'rollout': return 'bg-blue-100 text-blue-800';
      case 'permission': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  const getEnvironmentStats = (flag) => {
    const envs = flag.states || [];
    const enabled = envs.filter(s => s.is_enabled).length;
    const total = envs.length;
    return { enabled, total };
  };

  // --- Early exit if no company yet ---
  if (!company) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-lg mb-3">No company selected</div>
          <div className="text-sm mb-4">Create or join a company to get started.</div>
          <button
            onClick={() => setPeopleOpen(true)}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            Open Team / Invite
          </button>
        </div>
      </div>
    );
  }

  // --- Render ---
  return (
    <div className="min-h-screen bg-[var(--rp-bg)] text-[var(--rp-fg)]">
      {/* Header */}
      <header className="bg-[var(--rp-card-bg)] border-b border-[var(--rp-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold rp-heading">ReleasePeace</h1>
              <div className="ml-6 flex items-center space-x-4">
                <div className="text-sm text-gray-500">
                  <span className="font-medium">{company?.name || 'No company selected'}</span>
                  <span className="mx-2">•</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    company?.plan === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                    company?.plan === 'pro' ? 'bg-blue-100 text-blue-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {company?.plan || 'starter'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="text-sm text-gray-500">API: {apiStatus}</div>
              <ActivityBell authedFetch={authedFetch} />

              {/* Separate buttons as requested */}
              <button
                type="button"
                onClick={openInvite}
                disabled={!company?.id}
                className="px-3 py-2 rounded-md border text-sm hover:bg-gray-100"
              >
                Invite
              </button>
              <button
                type="button"
                onClick={openTeam}
                disabled={!company?.id}
                className="px-3 py-2 rounded-md border text-sm hover:bg-gray-100"
              >
                Team
              </button>

              {['qa','legal','owner','admin'].includes(userRole) && (
                <button
                  onClick={openApprovals}
                  className="px-3 py-2 rounded-md border text-sm hover:bg-gray-100"
                >
                  Approvals
                </button>
              )}

              <button
                onClick={() => onSwitchCompany && onSwitchCompany()}
                className="text-sm text-blue-600 hover:text-blue-500 px-3 py-1 border border-blue-200 rounded-md hover:bg-blue-50"
              >
                Switch Company
              </button>

              <div className="text-sm text-gray-500 border-l pl-4">
                <div className="font-medium">{user?.display_name || user?.username || 'User'}</div>
                <div className="text-xs">{userRole || 'member'}</div>
              </div>
              <button
                onClick={onLogout}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{flags.length}</div>
            <div className="text-sm text-gray-600">Total Flags</div>
          </div>
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {flags.filter(f => f.states?.some(s => s.is_enabled)).length}
            </div>
            <div className="text-sm text-gray-600">Active Flags</div>
          </div>
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {flags.filter(f => f.risk_level === 'high' || f.risk_level === 'critical').length}
            </div>
            <div className="text-sm text-gray-600">High Risk</div>
          </div>
          <div className="rp-card p-6 text-center">
            <div className="text-3xl font-bold text-purple-600">3</div>
            <div className="text-sm text-gray-600">Environments</div>
          </div>
        </div>

        {/* Environment Selector */}
        <div className="rp-card p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">Environment:</span>
              <div className="flex space-x-2">
                {environments.map(env => (
                  <button
                    key={env}
                    onClick={() => setActiveEnvironment(env)}
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      activeEnvironment === env
                        ? 'bg-[var(--rp-accent)] text-[var(--rp-fg)] border border-[var(--rp-border)]'
                        : 'text-[var(--rp-muted)] hover:bg-[var(--rp-accent)] border border-[var(--rp-border)]'
                    }`}
                  >
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {canCreate && (
              <button
                onClick={() => setShowCreateFlag(true)}
                className="px-4 py-2 rp-btn-primary rounded-md text-sm font-semibold"
              >
                + Create Flag
              </button>
            )}
          </div>
        </div>

        {/* Create Flag Modal */}
        {showCreateFlag && (
          <CreateFlagModal
            onClose={() => setShowCreateFlag(false)}
            onCreate={createFlag}
          />
        )}

        {/* Flags List */}
        <div className="rp-card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold">Feature Flags ({flags.length})</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading flags...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="text-red-600 mb-2">⚠️ Error</div>
              <p className="text-gray-600">{error}</p>
              <button
                onClick={fetchFlags}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : flags.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {flags.map((flag) => {
                const envStats = getEnvironmentStats(flag);
                const currentEnvState = flag.states?.find(s => s.environment === activeEnvironment);
                return (
                  <div key={flag.id} className="p-6 hover:bg-[var(--rp-accent)] transition">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{flag.name}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(flag.risk_level)}`}>
                            {flag.risk_level} risk
                          </span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getTypeColor(flag.flag_type)}`}>
                            {flag.flag_type}
                          </span>
                          {flag.requires_approval && (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              approval required
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{flag.description}</p>
                        {flag.tags && flag.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {flag.tags.map((tag, index) => (
                              <span key={index} className="rp-badge text-xs">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          Created by {flag.creator?.display_name || flag.creator?.username || 'Unknown'} •{' '}
                          {envStats.enabled}/{envStats.total} environments enabled
                        </div>

                        {/* Approval status helper */}
                        <ApprovalBadge flagId={flag.id} companyId={company?.id} />
                      </div>

                      <div className="ml-6 text-right">
                        <div className="text-sm font-medium text-gray-900 mb-3">
                          {activeEnvironment.charAt(0).toUpperCase() + activeEnvironment.slice(1)} Environment
                        </div>
                        {currentEnvState ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full ${
                                currentEnvState.is_enabled ? 'bg-[var(--rp-primary)]' : 'bg-gray-500/50'
                              }`}></span>
                              <span className="text-sm text-gray-600">
                                {currentEnvState.is_enabled ? `${currentEnvState.rollout_percentage}% enabled` : 'Disabled'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => canToggle
                                  ? toggleFlagState(flag.id, activeEnvironment, currentEnvState, flag)
                                  : alert('You do not have permission to toggle flags.')
                                }
                                className="px-3 py-1 rounded text-xs font-medium rp-btn-primary disabled:opacity-50"
                                disabled={!canToggle}
                              >
                                {currentEnvState.is_enabled ? 'Disable' : 'Enable'}
                              </button>

                              {['owner','pm'].includes(userRole) && (
                                <button
                                  onClick={() => rollbackFlag(flag.id)}
                                  className="px-3 py-1 rounded text-xs font-medium border border-red-300 hover:bg-red-50 ml-2"
                                  title="Disable in all environments"
                                >
                                  Rollback
                                </button>
                              )}

                              <button
                                onClick={() => openAudit(flag)}
                                className="px-3 py-1 rounded text-xs font-medium border ml-2 hover:bg-gray-100"
                                title="View audit history"
                              >
                                History
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">No state</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">🎯</div>
              <p className="text-gray-600 mb-4">No feature flags yet</p>
              <p className="text-sm text-gray-500 mb-4">
                Create your first feature flag to get started with controlled releases.
              </p>
              <button
                onClick={() => setShowCreateFlag(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create Your First Flag
              </button>
            </div>
          )}
        </div>

        {/* QA ApprovalsPanel (optional extra view) */}
        {user?.roles?.includes?.('QA') && (
          <div style={{ marginTop: 16 }}>
            <ApprovalsPanel token={token} role="QA" />
          </div>
        )}
      </div>

      {/* Modals */}

      {/* Unified Team + Invite modal */}
      {peopleOpen && (
        <TeamViewerModal
          open
          view={peopleView}                 // 'invite' or 'team'
          onClose={() => setPeopleOpen(false)}
          companyId={companyId}
          // invite props
          inviteCode={inviteCode}
          onLoadInvite={loadInvite}
          onRegenerateInvite={onRegenerateInvite}
          copyInvite={copyInvite}
          // team props
          members={members}
          loading={teamLoading}
          error={teamError}
          canManage={canManage}
          onChangeRole={handleRoleChange}
          onRemoveMember={handleRemoveMember}
        />
      )}
      {/* Approvals panel */}
      {approvalsOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={() => setApprovalsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Pending Approvals</h3>
              <div className="flex gap-2">
                <button className="px-3 py-1 border rounded" onClick={loadPendingApprovals}>
                  Refresh
                </button>
                <button className="px-3 py-1 border rounded" onClick={() => setApprovalsOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            {pendingApprovals.length === 0 ? (
              <div className="text-sm text-gray-500 p-4">No pending approvals.</div>
            ) : (
              <ul className="divide-y">
                {pendingApprovals.map(p => (
                  <li key={p.id} className="py-3 px-1 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {p.flag?.name}{' '}
                        <span className="text-xs ml-2 opacity-70">({p.approver_role})</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Requested by{' '}
                        {p.requester?.display_name || p.requester?.username || p.requester?.email} •{' '}
                        {new Date(p.created_at).toLocaleString()}
                      </div>
                      {p.comments && (
                        <div className="text-xs mt-1 opacity-90">“{p.comments}”</div>
                      )}
                      {p.flag?.requires_approval && (
                        <span className="rp-badge mt-1 inline-block text-[10px]">
                          requires approval
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="px-3 py-1 border rounded hover:bg-gray-100"
                        onClick={() => decideApproval(p.flag.id, p.id, 'approved')}
                      >
                        Approve
                      </button>
                      <button
                        className="px-3 py-1 border rounded hover:bg-gray-100"
                        onClick={() => decideApproval(p.flag.id, p.id, 'rejected')}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Audit drawer */}
      {auditOpen && (
        <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setAuditOpen(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">History — {auditForFlag?.name}</h3>
              <button className="px-3 py-1 border rounded" onClick={() => setAuditOpen(false)}>
                Close
              </button>
            </div>
            {auditLoading ? (
              <div className="p-6 text-sm text-gray-500">Loading…</div>
            ) : auditRows.length === 0 ? (
              <div className="p-6 text-sm text-gray-500">No audit entries.</div>
            ) : (
              <ul className="divide-y">
                {auditRows.map(r => (
                  <li key={r.id} className="py-3">
                    <div className="text-sm">
                      <span className="font-medium">{r.action}</span>
                      {r.environment ? (
                        <span className="ml-2 text-xs opacity-70">[{r.environment}]</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(r.created_at).toLocaleString()} •{' '}
                      {r.user?.display_name || r.user?.username || r.user?.email}
                    </div>
                    {r.reason && <div className="text-xs mt-1">Reason: {r.reason}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Create Flag Modal ----------
function CreateFlagModal({ onClose, onCreate }) {
  const [formData, setFormData] = React.useState({
    name: '',
    description: '',
    flag_type: 'rollout',
    risk_level: 'medium',
    tags: '',
    requires_approval: false
  });
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const toSend = {
        ...formData,
        tags: formData.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
      };
      await onCreate(toSend);
      onClose();
    } catch (err) {
      console.error('Create flag error:', err);
      alert(err.message || 'Failed to create flag');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Feature Flag</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Flag Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
              placeholder="my_new_feature"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
              rows="3"
              placeholder="Describe what this flag controls..."
              disabled={loading}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={formData.flag_type}
                onChange={(e) => setFormData({ ...formData, flag_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
                disabled={loading}
              >
                <option value="rollout">Rollout</option>
                <option value="experiment">Experiment</option>
                <option value="permission">Permission</option>
                <option value="killswitch">Kill Switch</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
              <select
                value={formData.risk_level}
                onChange={(e) => setFormData({ ...formData, risk_level: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
                disabled={loading}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none"
              placeholder="ui, checkout, experiment"
              disabled={loading}
            />
          </div>
          <div className="flex items-center">
            <input
              id="requires_approval"
              type="checkbox"
              checked={formData.requires_approval}
              onChange={(e) =>
                setFormData({ ...formData, requires_approval: e.target.checked })
              }
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              disabled={loading}
            />
            <label htmlFor="requires_approval" className="ml-2 block text-sm text-gray-700">
              Requires approval before changes
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Flag'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
