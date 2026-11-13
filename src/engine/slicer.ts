import * as THREE from "three";

export type PrintSegment = { a: THREE.Vector3; b: THREE.Vector3; layer: number; extrusion: boolean };
export type SliceResult = { layers: PrintSegment[][]; layerHeight: number; totalLayers: number; bounds: THREE.Box3 };

type Point2 = { x: number; y: number };
type Edge = { a: Point2; b: Point2; used: boolean };

const distance2 = (a: Point2, b: Point2) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Join triangle intersections into closed layer contours using a spatially quantized vertex graph. */
function stitchContours(raw: Edge[], tolerance: number): Point2[][] {
  const key = (p: Point2) => `${Math.round(p.x / tolerance)},${Math.round(p.y / tolerance)}`;
  const nodes = new Map<string, number[]>();
  raw.forEach((edge, i) => {
    for (const p of [edge.a, edge.b]) {
      const k = key(p);
      const list = nodes.get(k) ?? [];
      list.push(i);
      nodes.set(k, list);
    }
  });
  const loops: Point2[][] = [];
  const tol2 = tolerance * tolerance * 4;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].used) continue;
    raw[i].used = true;
    const points: Point2[] = [raw[i].a, raw[i].b];
    let current = raw[i].b;
    let closed = false;
    for (let guard = 0; guard < raw.length + 2; guard++) {
      if (distance2(current, points[0]) <= tol2 && points.length >= 4) {
        closed = true;
        break;
      }
      const candidates = nodes.get(key(current)) ?? [];
      let next = -1;
      let nextPoint: Point2 | null = null;
      let best = tol2;
      for (const candidate of candidates) {
        const edge = raw[candidate];
        if (edge.used) continue;
        const da = distance2(current, edge.a);
        const db = distance2(current, edge.b);
        if (da < best) { best = da; next = candidate; nextPoint = edge.b; }
        if (db < best) { best = db; next = candidate; nextPoint = edge.a; }
      }
      if (next < 0 || !nextPoint) break;
      raw[next].used = true;
      current = nextPoint;
      points.push(current);
    }
    if (closed) {
      points.pop();
      if (points.length >= 3) loops.push(points);
    }
  }
  return loops;
}

function offsetLoop(loop: Point2[], distance: number): Point2[] {
  if (loop.length < 3 || distance <= 0) return loop;
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    area += a.x * b.y - b.x * a.y;
  }
  const orientation = area >= 0 ? 1 : -1;
  const result: Point2[] = [];
  const cross = (a: Point2, b: Point2) => a.x * b.y - a.y * b.x;
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i + loop.length - 1) % loop.length];
    const curr = loop[i];
    const next = loop[(i + 1) % loop.length];
    const e1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const e2 = { x: next.x - curr.x, y: next.y - curr.y };
    const l1 = Math.hypot(e1.x, e1.y), l2 = Math.hypot(e2.x, e2.y);
    if (l1 < 1e-8 || l2 < 1e-8) continue;
    const n1 = { x: -e1.y / l1 * orientation, y: e1.x / l1 * orientation };
    const n2 = { x: -e2.y / l2 * orientation, y: e2.x / l2 * orientation };
    const p1 = { x: curr.x + n1.x * distance, y: curr.y + n1.y * distance };
    const p2 = { x: curr.x + n2.x * distance, y: curr.y + n2.y * distance };
    const denominator = cross(e1, e2);
    if (Math.abs(denominator) < 1e-8) {
      const nx = n1.x + n2.x, ny = n1.y + n2.y;
      const nl = Math.hypot(nx, ny) || 1;
      result.push({ x: curr.x + nx / nl * distance, y: curr.y + ny / nl * distance });
      continue;
    }
    const t = cross({ x: p2.x - p1.x, y: p2.y - p1.y }, e2) / denominator;
    const hit = { x: p1.x + e1.x * t, y: p1.y + e1.y * t };
    const miter = Math.hypot(hit.x - curr.x, hit.y - curr.y);
    if (!Number.isFinite(miter) || miter > distance * 4) {
      const nx = n1.x + n2.x, ny = n1.y + n2.y;
      const nl = Math.hypot(nx, ny) || 1;
      result.push({ x: curr.x + nx / nl * distance, y: curr.y + ny / nl * distance });
    } else result.push(hit);
  }
  return result.length >= 3 ? result : [];
}

function pointInLoops(point: Point2, loops: Point2[][]): boolean {
  let inside = false;
  for (const loop of loops) {
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const a = loop[i], b = loop[j];
      if ((a.y > point.y) !== (b.y > point.y) &&
          point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

/** Intersect a horizontal/vertical scanline with all contours and retain only inside intervals (even/odd fill rule). */
function clippedInfill(loops: Point2[][], z: number, layer: number, spacing: number, vertical: boolean): PrintSegment[] {
  const out: PrintSegment[] = [];
  if (!loops.length) return out;
  let min = Infinity, max = -Infinity;
  for (const loop of loops) for (const p of loop) {
    const value = vertical ? p.x : p.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const start = Math.ceil(min / spacing) * spacing + spacing * 0.5;
  for (let scan = start; scan < max; scan += spacing) {
    const hits: number[] = [];
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        const av = vertical ? a.x : a.y;
        const bv = vertical ? b.x : b.y;
        if ((av <= scan && bv > scan) || (bv <= scan && av > scan)) {
          const t = (scan - av) / (bv - av);
          hits.push(vertical ? a.y + (b.y - a.y) * t : a.x + (b.x - a.x) * t);
        }
      }
    }
    hits.sort((a, b) => a - b);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      const lo = hits[i], hi = hits[i + 1];
      if (hi - lo < spacing * 0.2) continue;
      const mid = (lo + hi) / 2;
      const test = vertical ? { x: scan, y: mid } : { x: mid, y: scan };
      if (!pointInLoops(test, loops)) continue;
      const p1 = vertical ? new THREE.Vector3(scan, lo, z) : new THREE.Vector3(lo, scan, z);
      const p2 = vertical ? new THREE.Vector3(scan, hi, z) : new THREE.Vector3(hi, scan, z);
      out.push({ a: p1, b: p2, layer, extrusion: true });
    }
  }
  return out;
}

/**
 * Browser-side mesh slicer for visualization.
 * Builds connected contours per layer and clips infill to the actual polygon silhouette.
 * This is not a substitute for a validated manufacturing slicer or production G-code.
 */
export function sliceGeometry(
  source: THREE.BufferGeometry,
  layerHeight: number,
  infillDensity: number,
  nozzleWidth = 0.4,
  wallCount = 2
): SliceResult {
  if (!(layerHeight > 0) || !(nozzleWidth > 0)) throw new Error("تنظیمات ارتفاع لایه یا قطر نازل معتبر نیست.");
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox?.clone() ?? new THREE.Box3();
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) {
    geometry.dispose();
    throw new Error("هندسه فایل معتبر نیست.");
  }
  if (position.count % 3 !== 0) {
    geometry.dispose();
    throw new Error("ساختار مثلث‌های فایل STL معتبر نیست.");
  }
  const minZ = bounds.min.z;
  const maxZ = bounds.max.z;
  const requestedLayers = Math.max(1, Math.ceil((maxZ - minZ) / layerHeight));
  if (position.count > 900_000) {
    geometry.dispose();
    throw new Error("مدل بیش از ۳۰۰ هزار مثلث دارد؛ لطفاً فایل سبک‌تری انتخاب کنید.");
  }
  if (requestedLayers > 1500) {
    geometry.dispose();
    throw new Error("تعداد لایه‌ها بیش از حد مجاز است؛ ارتفاع لایه را افزایش دهید.");
  }

  const totalLayers = requestedLayers;
  const layers: PrintSegment[][] = Array.from({ length: totalLayers }, () => []);
  const tri: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const scale = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, 1);
  const tolerance = Math.max(scale * 1e-5, 1e-5);
  const density = Math.max(0, Math.min(0.8, infillDensity));
  const spacing = nozzleWidth / Math.max(density, 0.01);

  for (let i = 0; i < position.count; i += 3) {
    tri[0].fromBufferAttribute(position, i);
    tri[1].fromBufferAttribute(position, i + 1);
    tri[2].fromBufferAttribute(position, i + 2);
    const low = Math.min(tri[0].z, tri[1].z, tri[2].z);
    const high = Math.max(tri[0].z, tri[1].z, tri[2].z);
    if (high - low < 1e-8) continue;

    const first = Math.max(0, Math.ceil((low - minZ) / layerHeight - 0.5));
    const last = Math.min(totalLayers - 1, Math.floor((high - minZ) / layerHeight - 0.5));
    for (let layer = first; layer <= last; layer++) {
      const z = minZ + (layer + 0.5) * layerHeight;
      const hits: Point2[] = [];
      for (let edge = 0; edge < 3; edge++) {
        const p = tri[edge], q = tri[(edge + 1) % 3];
        const dz1 = p.z - z, dz2 = q.z - z;
        if ((dz1 <= 0 && dz2 > 0) || (dz2 <= 0 && dz1 > 0)) {
          const t = (z - p.z) / (q.z - p.z);
          hits.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
        }
      }
      if (hits.length >= 2 && distance2(hits[0], hits[1]) > tolerance * tolerance) {
        const layerEdges = (layers[layer] as any).__edges as Edge[] | undefined;
        const edge: Edge = { a: hits[0], b: hits[1], used: false };
        if (layerEdges) layerEdges.push(edge);
        else (layers[layer] as any).__edges = [edge];
      }
    }
  }

  for (let layer = 0; layer < totalLayers; layer++) {
    const z = minZ + (layer + 0.5) * layerHeight;
    const edges = ((layers[layer] as any).__edges ?? []) as Edge[];
    delete (layers[layer] as any).__edges;
    const loops = stitchContours(edges, tolerance);
    const paths: PrintSegment[] = [];
    const safeWalls = Math.max(1, Math.min(5, Math.round(wallCount)));
    for (const loop of loops) {
      for (let wall = 0; wall < safeWalls; wall++) {
        const perimeter = offsetLoop(loop, nozzleWidth * (wall + 0.5));
        for (let i = 0; i < perimeter.length; i++) {
          const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
          paths.push({ a: new THREE.Vector3(a.x, a.y, z), b: new THREE.Vector3(b.x, b.y, z), layer, extrusion: true });
        }
      }
    }
    if (density > 0 && loops.length) {
      const infillLoops = loops.map(loop => offsetLoop(loop, nozzleWidth * (safeWalls + 0.5))).filter(loop => loop.length >= 3);
      paths.push(...clippedInfill(infillLoops, z, layer, spacing, layer % 2 === 1));
    }
    layers[layer] = paths;
  }

  geometry.dispose();
  return { layers, layerHeight, totalLayers, bounds };
}

export function flattenSegments(layers: PrintSegment[][]): PrintSegment[] {
  return layers.flatMap(layer => layer);
}
