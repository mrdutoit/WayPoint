import { useEffect, useState } from 'react';
import { useRole } from '../context/RoleContext.jsx';
import { useWindowSize } from '../hooks/useWindowSize.js';
import { auditLogApi, tenantsApi } from '../services/api.js';
import { s, colors } from '../styles/tokens.js';
import DatePicker from '../components/DatePicker.jsx';

// FR-031 — the read side that didn't exist anywhere before 2026-09-17
// (auditService.js used to only export recordAuditEvent; nothing read
// events back, for any role, confirmed by grep rather than assumed).
// Tenant Administrator: their own tenant only. Platform Administrator:
// every tenant by default, or one specific tenant via the filter below.
export default function AuditLog() {
  const { isPlatformAdmin, isTenantAdmin } = useRole();
  const { isMobile } = useWindowSize();
  const pageStyle = isMobile ? s.pageMobile : s.page;

  const [tenants, setTenants] = useState([]);
  const [tenantFilter, setTenantFilter] = useState(''); // PlatformAdmin only; '' = all tenants
  const [events, setEvents] = useState(null);
  const [nextBefore, setNextBefore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);

  useEffect(() => {
    if (isPlatformAdmin) {
      tenantsApi.list().then((r) => setTenants(r?.tenants ?? [])).catch(() => setTenants([]));
    }
  }, [isPlatformAdmin]);

  function load() {
    setError(null);
    setEvents(null);
    auditLogApi.list({ tenantId: tenantFilter || undefined })
      .then((result) => {
        setEvents(result?.events ?? []);
        setNextBefore(result?.nextBefore ?? null);
      })
      .catch((err) => setError(err.message ?? 'Failed to load the audit log'));
  }
  useEffect(() => { load(); }, [tenantFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const result = await auditLogApi.list({ tenantId: tenantFilter || undefined, before: nextBefore });
      setEvents((prev) => [...(prev ?? []), ...(result?.events ?? [])]);
      setNextBefore(result?.nextBefore ?? null);
    } catch (err) {
      setError(err.message ?? 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleExport(format) {
    setExporting(format);
    setExportError(null);
    try {
      await auditLogApi.export({
        format, tenantId: tenantFilter || undefined,
        startDate: startDate || undefined, endDate: endDate || undefined,
      });
    } catch (err) {
      setExportError(err.message ?? 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  if (!isPlatformAdmin && !isTenantAdmin) {
    return (
      <div style={pageStyle}>
        <p style={{ color: colors.ink500 }}>
          This page is only available to Tenant Administrators and Platform Administrators.
        </p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4, color: colors.ink900 }}>Audit Log</h1>
      <p style={{ fontSize: 13, color: colors.ink500, marginBottom: 20 }}>
        {isPlatformAdmin
          ? 'Significant actions across the platform (FR-007), filterable by tenant.'
          : "Significant actions in your organisation (FR-007)."}
      </p>

      {isPlatformAdmin && (
        <div style={{ marginBottom: 16, maxWidth: 280 }}>
          <label style={s.label} htmlFor="audit-tenant-filter">Tenant</label>
          <select
            id="audit-tenant-filter" style={s.select}
            value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}
          >
            <option value="">All tenants</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div style={{ ...s.card, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.ink900, marginBottom: 12 }}>Export</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={s.label}>From (optional)</label>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>
          <div>
            <label style={s.label}>To (optional)</label>
            <DatePicker value={endDate} onChange={setEndDate} />
          </div>
          <button type="button" onClick={() => handleExport('json')} disabled={exporting !== null} style={s.btnSecondary}>
            {exporting === 'json' ? 'Preparing…' : 'Export as JSON'}
          </button>
          <button type="button" onClick={() => handleExport('csv')} disabled={exporting !== null} style={s.btnSecondary}>
            {exporting === 'csv' ? 'Preparing…' : 'Export as CSV'}
          </button>
        </div>
        {exportError && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginTop: 10 }}>{exportError}</div>}
      </div>

      {error && <div style={{ ...s.chip(colors.danger, colors.dangerBg), marginBottom: 16 }}>{error}</div>}
      {events === null && !error && <div style={{ fontSize: 13, color: colors.ink500 }}>Loading…</div>}
      {events && events.length === 0 && <div style={{ fontSize: 13, color: colors.ink500 }}>No audit events yet.</div>}

      {events && events.length > 0 && (
        <>
          <div style={s.tableCard}>
            <table style={{ ...s.table, minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={s.th}>Timestamp</th>
                  <th style={s.th}>Actor</th>
                  <th style={s.th}>Action</th>
                  <th style={s.th}>Entity</th>
                  {isPlatformAdmin && <th style={s.th}>Tenant</th>}
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td style={s.td}>{new Date(e.timestamp).toLocaleString()}</td>
                    <td style={s.td}>{e.actorFirstName ? `${e.actorFirstName} ${e.actorLastName}` : '—'}</td>
                    <td style={s.td}>{e.action}</td>
                    <td style={s.td}>{e.entityType}{e.entityId ? ` (${e.entityId})` : ''}</td>
                    {isPlatformAdmin && <td style={s.td}>{e.tenantName ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextBefore && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={handleLoadMore} disabled={loadingMore} style={s.btnSecondary}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
