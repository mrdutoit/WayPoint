/*
 * Mock API for the browser smoke tests. Shapes mirror the real services
 * (reportingService, objectiveService, …) closely enough for every page
 * to render its full, data-bearing state. When a service's response
 * shape changes, update the matching fixture here — a page that renders
 * against a stale fixture is the failure mode these tests exist to catch.
 */
import { expect } from '@playwright/test';

const today = new Date();
const iso = (daysAgo) => new Date(today.getTime() - daysAgo * 86400000).toISOString();
const day = (daysAgo) => iso(daysAgo).slice(0, 10);

// A Cycle that always contains "today", so day-of-Cycle maths is exercised.
export const CYCLE = { id: 'c1', name: 'Q3 2026', startDate: day(60), endDate: day(-30) };

const LEVELS = [
  { id: 'L1', label: 'Company', level_index: 1 }, { id: 'L2', label: 'Division', level_index: 2 },
  { id: 'L3', label: 'Team', level_index: 3 }, { id: 'L4', label: 'Individual', level_index: 4 },
];
const RUBRIC = { id: 'r1', name: 'Default', levels: [
  { id: 'R1', levelIndex: 1, label: 'Off Track' }, { id: 'R2', levelIndex: 2, label: 'At Risk' },
  { id: 'R3', levelIndex: 3, label: 'On Track' }, { id: 'R4', levelIndex: 4, label: 'Achieved' },
] };

const ci = (daysAgo, scoreLabel, confidence, comment = '') => ({ submittedAt: iso(daysAgo), scoreLabel, confidence, comment });

const SCORECARD = {
  person: { id: 'u-fred', firstName: 'Fred', lastName: 'Steinberg', avatarOption: null },
  cycle: CYCLE,
  objectives: [
    { id: 'o-co', title: 'Grow net revenue by 20%', status: 'On Track', inputsReporting: 3, inputsTotal: 5, keyResults: [
      { id: 'kr1', title: 'Close R12m in new ARR', weighting: '3', status: 'Achieved', checkInHistory: [ci(40, 'At Risk', 2), ci(20, 'On Track', 3), ci(3, 'Achieved', 5, 'Closed early')] },
      { id: 'kr2', title: 'Lift gross margin to 42%', weighting: '2', status: 'On Track', checkInHistory: [ci(25, 'On Track', 4)] },
      { id: 'kr3', title: 'Reduce churn below 3%', weighting: '1', status: 'Not Started', checkInHistory: [] },
    ] },
  ],
};
for (const o of SCORECARD.objectives) {
  for (const kr of o.keyResults) kr.confidenceTrend = kr.checkInHistory.map((c) => ({ submittedAt: c.submittedAt, confidence: c.confidence }));
}

const ALIGN_OBJECTIVES = [
  { id: 'o-co', title: 'Grow net revenue by 20%', status: 'On Track', parentObjectiveId: null, cascadeLevel: 'Company', cascadeLevelIndex: 1, ownerFirstName: 'Fred', ownerLastName: 'Steinberg', inputsReporting: 3, inputsTotal: 5 },
  { id: 'o-div', title: 'Expand territory reach', status: 'At Risk', parentObjectiveId: 'o-co', cascadeLevel: 'Division', cascadeLevelIndex: 2, ownerFirstName: 'Joe', ownerLastName: 'Soap', inputsReporting: 1, inputsTotal: 2 },
  { id: 'o-team', title: 'Open three regions', status: 'Off Track', parentObjectiveId: 'o-div', cascadeLevel: 'Team', cascadeLevelIndex: 3, ownerFirstName: 'Amahle', ownerLastName: 'Dlamini', inputsReporting: 1, inputsTotal: 1 },
  { id: 'o-ind', title: 'Grow my sales pipeline', status: 'Not Started', parentObjectiveId: 'o-team', cascadeLevel: 'Individual', cascadeLevelIndex: 4, ownerFirstName: 'Joe', ownerLastName: 'Soap', inputsReporting: 0, inputsTotal: 1 },
  { id: 'o-orphan', title: 'Unlinked individual goal', status: 'Not Started', parentObjectiveId: null, cascadeLevel: 'Individual', cascadeLevelIndex: 4, ownerFirstName: 'Sipho', ownerLastName: 'Nkosi', inputsReporting: 0, inputsTotal: 0 },
];

const TEAM = {
  cycle: CYCLE,
  rows: [
    { employeeId: 'u-joe', employeeFirstName: 'Joe', employeeLastName: 'Soap', employeeAvatarOption: null, objectiveId: 'o-div', objectiveTitle: 'Expand territory reach', objectiveStatus: 'At Risk', keyResultId: 'k1', keyResultTitle: 'Open Durban', status: 'At Risk', weighting: '1', levelIndex: 2, latestConfidence: 2, lastCheckInAt: iso(16) },
    { employeeId: 'u-joe', employeeFirstName: 'Joe', employeeLastName: 'Soap', employeeAvatarOption: null, objectiveId: 'o-ind', objectiveTitle: 'Grow my sales pipeline', objectiveStatus: 'Not Started', keyResultId: 'k2', keyResultTitle: 'Book 40 calls', status: 'Not Started', weighting: '1', levelIndex: 0, latestConfidence: null, lastCheckInAt: null },
  ],
  checkIns: [
    { employeeId: 'u-joe', objectiveId: 'o-div', objectiveTitle: 'Expand territory reach', keyResultId: 'k1', keyResultTitle: 'Open Durban', submittedAt: iso(16), confidence: 2, comment: 'Lease delayed', scoreLabel: 'At Risk' },
  ],
};

const COMPLIANCE = { cycle: CYCLE, byOwner: [
  { employeeId: 'u-joe', employeeFirstName: 'Joe', employeeLastName: 'Soap', employeeAvatarOption: null,
    keyResults: [{ keyResultId: 'k1', keyResultTitle: 'Open Durban', hasCheckedIn: true }, { keyResultId: 'k2', keyResultTitle: 'Book 40 calls', hasCheckedIn: false }],
    checkInsByDate: [{ date: day(16), count: 1 }] },
] };

const OBJ_LIST = ALIGN_OBJECTIVES.map((o) => ({
  id: o.id, title: o.title, status: o.status, parentObjectiveId: o.parentObjectiveId,
  cascadeLevelId: `L${o.cascadeLevelIndex}`, cycleId: 'c1', ownerId: o.ownerFirstName === 'Fred' ? 'u-fred' : 'other',
  ownerFirstName: o.ownerFirstName, ownerLastName: o.ownerLastName, inputsReporting: o.inputsReporting, inputsTotal: o.inputsTotal,
}));

const OBJ_DETAIL = {
  objective: { ...OBJ_LIST[0], canEdit: true },
  keyResults: SCORECARD.objectives[0].keyResults.map((kr) => ({ id: kr.id, objectiveId: 'o-co', title: kr.title, weighting: kr.weighting, status: kr.status, lastCheckInAt: kr.checkInHistory.at(-1)?.submittedAt ?? null })),
};

const CHECKINS = { checkIns: [
  { id: 'ci1', rubricLevelId: 'R2', confidence: 2, comment: '', submittedAt: iso(40), submittedByFirstName: 'Fred', submittedByLastName: 'Steinberg' },
  { id: 'ci2', rubricLevelId: 'R4', confidence: 5, comment: 'Closed early', submittedAt: iso(3), submittedByFirstName: 'Fred', submittedByLastName: 'Steinberg' },
] };

/** Route table: first match wins. Each entry is [method, RegExp on the /api path, body or (url) => body]. */
function routes(role) {
  return [
    ['GET', /^\/me/, { profile: { firstName: 'Fred', lastName: 'Steinberg', email: 'fred@example.co.za', theme: 'light', role } }],
    ['GET', /^\/flags/, { flags: [
      { flagKey: 'billing.mode', value: 'manual', valueType: 'enum' },
      { flagKey: 'auth.sso.enabled', value: 'false', valueType: 'boolean' },
      { flagKey: 'security.fieldEncryption.enabled', value: 'false', valueType: 'boolean' },
      { flagKey: 'ai.settingsMenu.enabled', value: 'false', valueType: 'boolean' },
    ] }],
    ['GET', /^\/settings\/terminology/, { terms: {}, overrides: {} }],
    ['GET', /^\/settings\/cascade-levels/, { levels: LEVELS }],
    ['GET', /^\/settings\/rubric/, { rubric: RUBRIC }],
    ['GET', /^\/settings\/cadences/, { cadences: [{ id: 'cd1', label: 'Quarterly', months: 3 }] }],
    ['GET', /^\/settings\/okr-elements/, { elements: ['objective', 'keyResult', 'initiative', 'checkIn', 'reflection'].map((elementKey) => ({ elementKey, isEnabled: true })) }],
    ['GET', /^\/cycles/, { cycles: [{ ...CYCLE, status: 'Active', cadenceLabel: 'Quarterly' }] }],
    ['GET', /^\/reports\/scorecard\//, SCORECARD],
    ['GET', /^\/reports\/team-progress/, TEAM],
    ['GET', /^\/reports\/alignment-map/, { cycle: CYCLE, objectives: ALIGN_OBJECTIVES }],
    ['GET', /^\/reports\/checkin-compliance/, COMPLIANCE],
    ['GET', /^\/objectives\/[^/]+\/reflections/, { reflections: [{ id: 'rf1', content: 'Legal review earlier helped.', submittedAt: iso(2) }] }],
    ['GET', /^\/objectives\/[^/]+$/, OBJ_DETAIL],
    ['GET', /^\/objectives/, { objectives: OBJ_LIST }],
    ['GET', /^\/key-results\/[^/]+\/check-ins/, CHECKINS],
    ['GET', /^\/key-results\/[^/]+\/initiatives/, { initiatives: [{ id: 'i1', title: 'Run the roadshow', status: 'In Progress', dueDate: day(-5) }] }],
    ['GET', /^\/key-results\/[^/]+$/, { keyResult: { ...OBJ_DETAIL.keyResults[0], canEdit: true } }],
    ['GET', /^\/users/, { users: [
      { id: 'u-fred', firstName: 'Fred', lastName: 'Steinberg', email: 'fred@example.co.za', role: 'Manager', managerId: null, lockedUntil: null },
      { id: 'u-joe', firstName: 'Joe', lastName: 'Soap', email: 'joe@example.co.za', role: 'Employee', managerId: 'u-fred', lockedUntil: null },
    ] }],
    ['GET', /^\/tenants/, { tenants: [{ id: 't1', name: 'Acme Holdings', region: 'eu-central', billingMode: 'manual', createdAt: iso(20) }] }],
    ['GET', /^\/audit-log/, { events: [{ id: 'a1', timestamp: iso(1), actorFirstName: 'Fred', actorLastName: 'Steinberg', action: 'checkIn.created', entityType: 'checkIn', entityId: 'x', entityLabel: 'Close R12m in new ARR', changes: [], tenantName: 'Acme Holdings' }], nextBefore: null }],
    ['GET', /^\/health/, { status: 'ok' }],
  ];
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** A structurally valid, unsigned JWT — the frontend only decodes it; the mocked API never verifies it. */
export function fakeToken(role, { expiresInSeconds = 3600 } = {}) {
  const tenantId = role === 'PlatformAdmin' ? null : 't1';
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'u-fred', tenantId, role, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })}.sig`;
}

/** Answer every /api/* call from the fixtures; unknown endpoints fail loudly as 501 so a missing fixture is visible. */
export async function mockApi(page, role) {
  const table = routes(role);
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const hit = table.find(([method, re]) => method === req.method() && re.test(path));
    if (!hit) return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: `No e2e fixture for GET ${path}` }) });
    const body = typeof hit[2] === 'function' ? hit[2](req.url()) : hit[2];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  // Fonts are cosmetic; never let the tests depend on Google being reachable.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
}

/** Sign in as `role` by planting a token the way services/api.js stores it. */
export async function signInAs(page, role) {
  await mockApi(page, role);
  await page.goto('/login');
  await page.evaluate((t) => localStorage.setItem('waypoint.token', t), fakeToken(role));
}

/** Collect uncaught page errors and console errors for the life of the page. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // The browser logs every non-2xx fetch; the pages handle those deliberately.
    if (/Failed to load resource/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** The assertions every page must pass: rendered, not the error boundary, nothing thrown. */
export async function expectHealthyPage(page, errors, heading) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  if (heading) await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading);
  await expect(page.getByText('This page failed to load')).toHaveCount(0);
  await page.waitForTimeout(300); // let late renders (charts, lazy panels) settle
  expect(errors, errors.join('\n')).toEqual([]);
}
