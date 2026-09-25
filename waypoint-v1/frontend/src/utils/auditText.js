// Plain-English rendering of audit log codes (2026-09-25). The log stores
// raw codes ("checkIn.created") and the Audit Log page used to show them
// verbatim. Every code the services currently record is listed below;
// anything new falls back to a tidied version of the code rather than
// disappearing. Tested in tests/auditText.test.js.

const ACTIONS = {
  'auditLog.exported': 'Exported the audit log',
  'cadence.created': 'Created a cadence',
  'cadence.deleted': 'Deleted a cadence',
  'cadence.updated': 'Updated a cadence',
  'cascadeLevels.updated': 'Changed the cascade levels',
  'checkIn.created': 'Checked in',
  'cycle.created': 'Created a cycle',
  'flag.updated': 'Changed a feature flag',
  'initiative.created': 'Added an initiative',
  'initiative.updated': 'Updated an initiative',
  'keyResult.created': 'Added a Key Result',
  'keyResult.updated': 'Updated a Key Result',
  'objective.created': 'Created an objective',
  'objective.updated': 'Updated an objective',
  'okrElement.updated': 'Switched an OKR element',
  'reflection.created': 'Added a reflection',
  'rubric.updated': 'Changed the scoring rubric',
  'tenant.created': 'Created a tenant',
  'tenant.exported': 'Exported tenant data',
  'terminology.updated': 'Changed the terminology',
  'user.invited': 'Invited a user',
  'user.login': 'Signed in',
  'user.manager_changed': 'Changed a manager',
  'user.password_changed': 'Changed their password',
  'user.password_force_reset': 'Force-reset a password',
  'user.password_reset': 'Reset a password',
  'user.role_changed': 'Changed a role',
  'user.unlocked': 'Unlocked an account',
};

const ENTITIES = {
  check_in: 'Check-in', checkIn: 'Check-in', key_result: 'Key Result', keyResult: 'Key Result',
  objective: 'Objective', initiative: 'Initiative', reflection: 'Reflection', user_account: 'User',
  user: 'User', tenant: 'Tenant', cycle: 'Cycle', cadence: 'Cadence', flag: 'Feature flag',
  feature_flag: 'Feature flag', rubric: 'Scoring rubric', scoring_rubric: 'Scoring rubric',
  cascadeLevels: 'Cascade levels', cascade_level: 'Cascade level', terminology: 'Terminology',
  okrElement: 'OKR element', okr_element: 'OKR element', auditLog: 'Audit log', audit_log: 'Audit log',
};

function tidy(code) {
  return String(code)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.]/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

export function entityName(type) {
  if (!type) return '';
  return ENTITIES[type] ?? tidy(type);
}

export function describeAction(action) {
  if (!action) return '';
  if (ACTIONS[action]) return ACTIONS[action];
  const [entity, ...rest] = String(action).split('.');
  return rest.length ? `${tidy(rest.join(' '))}: ${entityName(entity).toLowerCase()}` : entityName(entity);
}
