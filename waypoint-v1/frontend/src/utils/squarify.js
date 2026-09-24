// Squarified treemap layout (Bruls, Huizing & van Wijk, 2000) — lays
// weighted items into a rectangle keeping tiles as close to square as
// possible, which is what keeps small tiles readable. Hand-rolled (~40
// lines) rather than pulling in d3-hierarchy for one function. Pure and
// unit-tested (tests/squarify.test.js).
//
// items: [{ value, ...anything }]  rect: { x, y, w, h }
// returns the same items (value > 0 only, largest first) with x, y, w, h.

function worst(row, side) {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

export function squarify(items, rect) {
  const valid = items.filter((it) => Number(it.value) > 0).sort((a, b) => b.value - a.value);
  const total = valid.reduce((sum, it) => sum + Number(it.value), 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const areas = valid.map((it) => Number(it.value) * scale);

  const out = [];
  let free = { ...rect };
  let row = [];
  let rowItems = [];

  const layoutRow = () => {
    const sum = row.reduce((a, b) => a + b, 0);
    if (free.w >= free.h) {
      const colW = sum / free.h;
      let y = free.y;
      row.forEach((area, i) => { const h = area / colW; out.push({ ...rowItems[i], x: free.x, y, w: colW, h }); y += h; });
      free = { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h };
    } else {
      const rowH = sum / free.w;
      let x = free.x;
      row.forEach((area, i) => { const w = area / rowH; out.push({ ...rowItems[i], x, y: free.y, w, h: rowH }); x += w; });
      free = { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH };
    }
    row = [];
    rowItems = [];
  };

  let i = 0;
  while (i < areas.length) {
    const side = Math.min(free.w, free.h);
    if (row.length === 0 || worst([...row, areas[i]], side) <= worst(row, side)) {
      row.push(areas[i]);
      rowItems.push(valid[i]);
      i += 1;
    } else {
      layoutRow();
    }
  }
  if (row.length) layoutRow();
  return out;
}
