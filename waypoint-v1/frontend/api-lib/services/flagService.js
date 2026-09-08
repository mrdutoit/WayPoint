/**
 * Feature flags are either platform-wide (tenant_id IS NULL — e.g. a
 * maintenance-mode switch) or tenant-scoped (billing mode, SSO,
 * field-level encryption, AI Settings visibility — see FR-002). A
 * tenant-scoped row overrides a platform-wide row with the same flagKey.
 */
function coerceFlagValue(valueType, rawValue) {
  if (valueType === 'boolean') {
    return rawValue === '1' || rawValue === 'true';
  }
  return rawValue; // enum / string — passed through as-is
}

export async function getFlagsForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT flag_key, value_type, value
     FROM okr.feature_flag
     WHERE tenant_id IS NULL OR tenant_id = $1
     ORDER BY tenant_id ASC NULLS FIRST`, // platform-wide rows first, tenant rows override
    [tenantId]
  );
  const flags = {};
  for (const row of rows) {
    flags[row.flag_key] = coerceFlagValue(row.value_type, row.value);
  }
  return flags;
}

export async function setTenantFlag(client, { tenantId, flagKey, valueType, value }) {
  // Two different partial/composite unique targets depending on whether
  // this is a platform-wide (tenant_id IS NULL) or tenant-scoped flag —
  // see db/schema.sql for why a single ON CONFLICT target can't cover both.
  if (tenantId === null) {
    await client.query(
      `INSERT INTO okr.feature_flag (id, tenant_id, flag_key, value_type, value, is_phase2)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3, false)
       ON CONFLICT (flag_key) WHERE tenant_id IS NULL
       DO UPDATE SET value = EXCLUDED.value, value_type = EXCLUDED.value_type`,
      [flagKey, valueType, String(value)]
    );
    return;
  }
  await client.query(
    `INSERT INTO okr.feature_flag (id, tenant_id, flag_key, value_type, value, is_phase2)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, false)
     ON CONFLICT (tenant_id, flag_key)
     DO UPDATE SET value = EXCLUDED.value, value_type = EXCLUDED.value_type`,
    [tenantId, flagKey, valueType, String(value)]
  );
}
