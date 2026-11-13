import * as THREE from "three";

export type PrintSegment = { a: THREE.Vector3; b: THREE.Vector3; layer: number; extrusion: boolean };
export type SliceResult = { layers: PrintSegment[][]; layerHeight: number; totalLayers: number; bounds: THREE.Box3 };

/**
 * Visualization-grade triangle/plane slicer.
 * Each triangle is visited only for the layers intersecting its Z range.
 * Output is intended for interactive preview, not production G-code.
 */
export function sliceGeometry(source: THREE.BufferGeometry, layerHeight: number, infillDensity: number): SliceResult {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox?.clone() ?? new THREE.Box3();
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) {
    geometry.dispose();
    throw new Error("هندسه فایل معتبر نیست.");
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
  const vertex = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);
  const tri: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

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
      const intersections: THREE.Vector3[] = [];
      for (let edge = 0; edge < 3; edge++) {
        const p = tri[edge], q = tri[(edge + 1) % 3];
        const dz1 = p.z - z, dz2 = q.z - z;
        if ((dz1 <= 0 && dz2 > 0) || (dz2 <= 0 && dz1 > 0)) {
          const t = (z - p.z) / (q.z - p.z);
          intersections.push(new THREE.Vector3(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, z));
        }
      }
      if (intersections.length >= 2) {
        layers[layer].push({ a: intersections[0], b: intersections[1], layer, extrusion: true });
      }
    }
  }

  // Sparse rectilinear infill preview. It is intentionally not a contour-clipped slicer infill.
  if (infillDensity > 0) {
    const spacing = Math.max(layerHeight * 2, 1.2 / Math.max(0.08, infillDensity));
    for (let layer = 0; layer < totalLayers; layer += 2) {
      const z = minZ + (layer + 0.5) * layerHeight;
      for (let y = bounds.min.y + spacing / 2; y < bounds.max.y; y += spacing) {
        layers[layer].push({
          a: new THREE.Vector3(bounds.min.x, y, z),
          b: new THREE.Vector3(bounds.max.x, y, z),
          layer, extrusion: true
        });
      }
    }
  }

  geometry.dispose();
  return { layers, layerHeight, totalLayers, bounds };
}

export function flattenSegments(layers: PrintSegment[][]): PrintSegment[] {
  return layers.flatMap(layer => layer);
}
