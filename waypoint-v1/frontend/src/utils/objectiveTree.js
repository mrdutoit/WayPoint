// Builds a parent/child tree from a flat list of Objectives carrying
// parentObjectiveId (every Objective list endpoint returns this field).
// Shared by AlignmentMap.jsx and Objectives.jsx's hierarchy view so both
// group Objectives into a cascade the same way, in exactly one place.
export function buildObjectiveTree(objectives) {
  const byId = new Map(objectives.map((o) => [o.id, { ...o, children: [] }]));
  const roots = [];
  for (const obj of byId.values()) {
    if (obj.parentObjectiveId && byId.has(obj.parentObjectiveId)) {
      byId.get(obj.parentObjectiveId).children.push(obj);
    } else {
      roots.push(obj);
    }
  }
  return roots;
}
