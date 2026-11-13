import * as THREE from "three";

export type SampleModel = { id: string; name: string; english: string; description: string; geometry: THREE.BufferGeometry; color: string };

function normalizeGeometry(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  const box = g.boundingBox!;
  g.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
  g.computeVertexNormals();
  return g;
}
function gearGeometry(teeth = 16, radius = 13, inner = 5, depth = 4) {
  const shape = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const angle = i / steps * Math.PI * 2;
    const r = radius * ([1, 1, 0.91, 0.91][i % 4]);
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, inner, 0, Math.PI * 2, true); shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .35, bevelThickness: .35 });
}
function vaseGeometry() {
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    points.push(new THREE.Vector2(7 + 5 * Math.sin(t * Math.PI) + 2 * Math.sin(t * Math.PI * 4), t * 48));
  }
  const geometry = new THREE.LatheGeometry(points, 96);
  geometry.rotateX(Math.PI / 2); // orient the lathe axis vertically along Z
  return geometry;
}
function dragonGeometry() {
  const body = new THREE.SphereGeometry(9, 24, 18); body.scale(1.25, .7, .75); body.translate(0, 0, 13);
  const neck = new THREE.CylinderGeometry(3.5, 5, 14, 16); neck.rotateX(Math.PI / 2); neck.translate(0, 0, 22);
  const head = new THREE.SphereGeometry(5, 20, 16); head.scale(1.25, .7, .7); head.translate(0, 0, 29);
  const tail = new THREE.ConeGeometry(4, 15, 12); tail.rotateX(Math.PI / 2); tail.translate(0, 0, 2);
  const wingL = new THREE.ConeGeometry(10, 18, 3); wingL.rotateZ(.8); wingL.rotateX(.4); wingL.translate(-10, 0, 17);
  const wingR = wingL.clone(); wingR.rotateZ(-1.6); wingR.translate(20, 0, 0);
  const merged = new THREE.BufferGeometry();
  // Keep components as a single display mesh via a group-compatible geometry merge-free fallback.
  const group = new THREE.Group();
  [body, neck, head, tail, wingL, wingR].forEach(g => { const m = new THREE.Mesh(g); group.add(m); });
  const geometries = group.children.map((m: any) => { const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
  const positions: number[] = [], normals: number[] = [];
  geometries.forEach(g => {
    const p = g.getAttribute("position"), n = g.getAttribute("normal");
    for (let i = 0; i < p.count; i++) { positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i)); }
    g.dispose();
  });
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}
function architectureGeometry() {
  const g = new THREE.BufferGeometry();
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(34, 28, 3); base.translate(0, 0, 1.5); parts.push(base);
  for (let i = 0; i < 4; i++) { const c = new THREE.BoxGeometry(5, 5, 22 + (i % 2) * 8); c.translate((i < 2 ? -12 : 12), (i % 2 ? 9 : -9), 12); parts.push(c); }
  const roof = new THREE.ConeGeometry(24, 9, 4); roof.rotateZ(Math.PI / 4); roof.translate(0, 0, 29); parts.push(roof);
  const pos: number[] = [];
  parts.forEach(p => { const a = p.getAttribute("position"); for (let i=0;i<a.count;i++) pos.push(a.getX(i),a.getY(i),a.getZ(i)); p.dispose(); });
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
export function createSamples(): SampleModel[] {
  const cube = new THREE.BoxGeometry(20, 20, 20);
  const benchy = new THREE.Group();
  const hull = new THREE.ConeGeometry(11, 32, 5); hull.rotateX(Math.PI / 2); hull.scale(1, .7, 1); hull.translate(0, 0, 6);
  const cabin = new THREE.BoxGeometry(13, 10, 12); cabin.translate(0, 0, 17);
  const chimney = new THREE.CylinderGeometry(2, 2, 7, 12); chimney.rotateX(Math.PI / 2); chimney.translate(-3, 0, 26);
  // Benchy components are combined into a position buffer for a single printable mesh.
  const bp: number[] = [];
  [hull, cabin, chimney].forEach(g => { const a=g.getAttribute("position"); for(let i=0;i<a.count;i++) bp.push(a.getX(i),a.getY(i),a.getZ(i)); g.dispose(); });
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position",new THREE.Float32BufferAttribute(bp,3)); bg.computeVertexNormals();
  const samples: SampleModel[] = [
    {id:"cube",name:"مکعب کالیبراسیون",english:"Calibration Cube",description:"مدل استاندارد برای بررسی ابعاد و دقت محورهای چاپ",geometry:normalizeGeometry(cube),color:"#56d6b0"},
    {id:"benchy",name:"قایق بنچی",english:"3D Benchy",description:"مدل مرجع برای ارزیابی کیفیت چاپ و پل‌زنی",geometry:normalizeGeometry(bg),color:"#e5a45b"},
    {id:"dragon",name:"اژدهای Low Poly",english:"Low Poly Dragon",description:"مدل تزئینی چندبخشی با جزئیات هندسی",geometry:normalizeGeometry(dragonGeometry()),color:"#b69aff"},
    {id:"gear",name:"چرخ‌دنده مکانیکی",english:"Mechanical Gear",description:"نمونه قطعه مکانیکی با دندانه و حفره مرکزی",geometry:normalizeGeometry(gearGeometry()),color:"#69b9e9"},
    {id:"architecture",name:"مدل معماری",english:"Architecture Model",description:"حجم معماری چندبخشی برای بررسی سطوح و ارتفاع",geometry:normalizeGeometry(architectureGeometry()),color:"#d5d9df"},
    {id:"vase",name:"گلدان پارامتریک",english:"Detailed Vase",description:"سطح منحنی با پروفایل چرخشی و لایه‌های پیوسته",geometry:normalizeGeometry(vaseGeometry()),color:"#e58eaa"}
  ];
  return samples;
}
