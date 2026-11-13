import * as THREE from "three";

export type PrintSegment = { a: THREE.Vector3; b: THREE.Vector3; layer: number; extrusion: boolean };
export type SliceResult = { layers: PrintSegment[][]; layerHeight: number; totalLayers: number; bounds: THREE.Box3 };

/**
 * Browser-side triangle/plane intersection slicer.
 * Produces perimeter intersection segments plus optional rectilinear infill.
 * This is a visualization-grade slicer, not a production G-code generator.
 */
export function sliceGeometry(source: THREE.BufferGeometry, layerHeight: number, infillDensity: number): SliceResult {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox?.clone() ?? new THREE.Box3();
  const position = geometry.getAttribute("position");
  const minZ = bounds.min.z;
  const maxZ = bounds.max.z;
  const requestedLayers = Math.max(1, Math.ceil((maxZ - minZ) / layerHeight));
  if (position.count > 450_000) throw new Error("مدل بیش از ۱۵۰ هزار مثلث دارد؛ لطفاً فایل سبک‌تری انتخاب کنید.");
  if (requestedLayers > 1200) throw new Error("تعداد لایه‌ها بیش از حد مجاز است؛ ارتفاع لایه را افزایش دهید.");
  const totalLayers = requestedLayers;
  const layers: PrintSegment[][] = [];
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);

  for (let layer = 0; layer < totalLayers; layer++) {
    const z = minZ + (layer + 0.5) * layerHeight;
    const segments: PrintSegment[] = [];
    const intersections: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i += 3) {
      const tri = [v(i), v(i + 1), v(i + 2)];
      intersections.length = 0;
      for (let e = 0; e < 3; e++) {
        const p = tri[e], q = tri[(e + 1) % 3];
        const dz1 = p.z - z, dz2 = q.z - z;
        if ((dz1 <= 0 && dz2 > 0) || (dz2 <= 0 && dz1 > 0)) {
          const t = (z - p.z) / (q.z - p.z);
          intersections.push(new THREE.Vector3(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, z));
        }
      }
      if (intersections.length >= 2) {
        segments.push({ a: intersections[0].clone(), b: intersections[1].clone(), layer, extrusion: true });
      }
    }

    // Sparse, deterministic rectilinear infill inside the layer's XY bounds.
    if (infillDensity > 0 && layer % 2 === 0) {
      const spacing = Math.max(layerHeight * 2, 1.2 / Math.max(0.08, infillDensity));
      const y = bounds.min.y + spacing / 2;
      for (let yy = y; yy < bounds.max.y; yy += spacing) {
        segments.push({
          a: new THREE.Vector3(bounds.min.x, yy, z),
          b: new THREE.Vector3(bounds.max.x, yy, z),
          layer, extrusion: true
        });
      }
    }
    layers.push(segments);
  }
  geometry.dispose();
  return { layers, layerHeight, totalLayers, bounds };
}

export function flattenSegments(layers: PrintSegment[][]): PrintSegment[] {
  return layers.flatMap(layer => layer);
}
