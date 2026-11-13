import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  Activity, Box, ChevronDown, ChevronLeft, CircleHelp, Clock3, Download, FileUp, Gauge,
  Layers3, Maximize2, Pause, Play, RotateCcw, Settings2, SlidersHorizontal,
  Thermometer, UploadCloud, X, Zap
} from "lucide-react";
import { createSamples, type SampleModel } from "./engine/sampleModels";
import { flattenSegments, sliceGeometry, type PrintSegment } from "./engine/slicer";

type PrintSettings = { layerHeight: number; nozzle: number; filament: number; speed: number; infill: number; wallCount: number; nozzleTemp: number; bedTemp: number };
type SceneApi = { setModel: (geometry: THREE.BufferGeometry, color: string) => void; setProgress: (value: number) => void; setLayerView: (value: boolean) => void; setNozzleDiameter: (value: number) => void; fit: () => void; dispose: () => void };

const initialSettings: PrintSettings = { layerHeight: .2, nozzle: .4, filament: 1.75, speed: 50, infill: 20, wallCount: 2, nozzleTemp: 205, bedTemp: 60 };
const fmt = (n: number, digits = 1) => new Intl.NumberFormat("fa-IR", { maximumFractionDigits: digits }).format(n);
const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${fmt(Math.floor(s / 3600), 0)}:${fmt(Math.floor((s % 3600) / 60), 0).padStart(2, "۰")}:${fmt(s % 60, 0).padStart(2, "۰")}`;
};
function geometryStats(g: THREE.BufferGeometry) {
  const box = new THREE.Box3().setFromBufferAttribute(g.getAttribute("position") as THREE.BufferAttribute);
  const size = new THREE.Vector3(); box.getSize(size);
  const p = g.getAttribute("position");
  let volume = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return { size, volume: Math.abs(volume), triangles: Math.floor(p.count / 3) };
}

export default function App() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sceneApi = useRef<SceneApi | null>(null);
  const samples = useMemo(() => createSamples(), []);
  const [model, setModel] = useState<SampleModel | null>(samples[0]);
  const [modelName, setModelName] = useState("Calibration Cube");
  const [stats, setStats] = useState(() => geometryStats(samples[0].geometry));
  const [settings, setSettings] = useState(initialSettings);
  const [layers, setLayers] = useState<PrintSegment[][]>([]);
  const [segments, setSegments] = useState<PrintSegment[]>([]);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("مدل آماده چاپ است");
  const [error, setError] = useState("");
  const [layerView, setLayerView] = useState(false);
  const total = segments.length;
  const totalPathLength = useMemo(() => segments.reduce((sum, segment) => sum + segment.a.distanceTo(segment.b), 0), [segments]);
  const extrusionVolume = totalPathLength * settings.nozzle * settings.layerHeight * 0.9;
  const filamentArea = Math.PI * Math.pow(settings.filament / 2, 2);
  const filamentLength = filamentArea > 0 ? extrusionVolume / filamentArea : 0;
  const filamentWeight = extrusionVolume * 1.24 / 1000;
  const currentLayer = layers.length ? Math.min(layers.length, Math.floor(progress * layers.length) + (progress >= 1 ? 0 : 1)) : 0;
  const remaining = totalPathLength ? (1 - progress) * totalPathLength / Math.max(1, settings.speed * speed) : 0;

  const prepareGeometry = useCallback((source: THREE.BufferGeometry, color: string, name: string) => {
    const geometry = source.clone();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z);
    geometry.computeVertexNormals();
    const nextStats = geometryStats(geometry);
    setStats(nextStats);
    setModelName(name);
    setError("");
    setProgress(0); setElapsed(0); setPlaying(false);
    setMessage("در حال محاسبه مسیرهای لایه‌ای…");
    try {
      const sliced = sliceGeometry(geometry, settings.layerHeight, settings.infill / 100, settings.nozzle, settings.wallCount);
      const flat = flattenSegments(sliced.layers);
      if (!flat.length) throw new Error("برای این هندسه مسیر قابل برشی پیدا نشد.");
      setLayers(sliced.layers); setSegments(flat);
      sceneApi.current?.setModel(geometry, color);
      sceneApi.current?.setProgress(0);
      setMessage(`${fmt(sliced.totalLayers, 0)} لایه و ${fmt(flat.length, 0)} حرکت چاپ آماده شد`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در پردازش مدل");
      setMessage("پردازش مدل ناموفق بود");
    }
    geometry.dispose();
  }, [settings.layerHeight, settings.infill, settings.nozzle, settings.wallCount]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const host = viewportRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a1011");
    scene.fog = new THREE.Fog("#0a1011", 170, 360);
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, .1, 1000);
    camera.up.set(0, 0, 1); camera.position.set(95, -120, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .06; controls.target.set(0, 0, 20); controls.maxPolarAngle = Math.PI * .49;

    scene.add(new THREE.HemisphereLight("#b9d9d2", "#172021", 2.1));
    const key = new THREE.DirectionalLight("#fff0d9", 3.4); key.position.set(65, -55, 110); key.castShadow = true; scene.add(key);
    const fill = new THREE.PointLight("#39d9b0", 85, 180); fill.position.set(-60, 45, 55); scene.add(fill);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(120, 120, 3), new THREE.MeshStandardMaterial({ color: "#202a2a", metalness: .65, roughness: .38 }));
    bed.position.z = -1.5; bed.receiveShadow = true; scene.add(bed);
    const grid = new THREE.GridHelper(120, 24, "#3c5b55", "#263a37"); grid.rotation.x = Math.PI / 2; grid.position.z = .08; scene.add(grid);
    const build = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(100, 100, 150)), new THREE.LineBasicMaterial({ color: "#31534c", transparent: true, opacity: .45 }));
    build.position.z = 75; scene.add(build);
    const axes = new THREE.AxesHelper(22); axes.position.set(-55, -55, .2); scene.add(axes);

    const modelMaterial = new THREE.MeshPhysicalMaterial({ color: "#56d6b0", metalness: .12, roughness: .31, clearcoat: .35, transparent: true, opacity: .32, side: THREE.DoubleSide });
    let modelMesh: THREE.Mesh | null = null;
    const pathGeometry = new THREE.BufferGeometry();
    pathGeometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    const pathMaterial = new THREE.LineBasicMaterial({ color: "#48e7bb", transparent: true, opacity: .98 });
    const printed = new THREE.LineSegments(pathGeometry, pathMaterial); printed.frustumCulled = false; scene.add(printed);
    const extrusionGeometry = new THREE.CylinderGeometry(.5, .5, 1, 7, 1, false);
    const extrusionMaterial = new THREE.MeshStandardMaterial({ color: "#36cda5", roughness: .48, metalness: .04 });
    let extrusionMesh = new THREE.InstancedMesh(extrusionGeometry, extrusionMaterial, 1);
    extrusionMesh.count = 0; extrusionMesh.frustumCulled = false; scene.add(extrusionMesh);
    const instance = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    let extrusionRadius = .4;
    const nozzleGroup = new THREE.Group();
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(2.4, 7, 6), new THREE.MeshStandardMaterial({ color: "#e5b96e", metalness: .8, roughness: .24 }));
    nozzle.rotation.x = -Math.PI / 2; nozzle.position.z = 0; nozzleGroup.add(nozzle);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 7, 12), new THREE.MeshStandardMaterial({ color: "#73817f", metalness: .85, roughness: .25 }));
    neck.rotation.x = Math.PI / 2; neck.position.z = 6; nozzleGroup.add(neck); scene.add(nozzleGroup);
    const headRail = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-58,0,145),new THREE.Vector3(58,0,145)]),new THREE.LineBasicMaterial({color:"#596c69"})); scene.add(headRail);

    let segmentData: PrintSegment[] = [];
    let frame = 0;
    let lastUi = 0;
    const sim = { progress: 0 };
    const api: SceneApi = {
      setModel: (g, color) => {
        if (modelMesh) { scene.remove(modelMesh); modelMesh.geometry.dispose(); (modelMesh.material as THREE.Material).dispose(); }
        const mat = modelMaterial.clone(); mat.color.set(color); modelMesh = new THREE.Mesh(g.clone(), mat); modelMesh.castShadow = true; modelMesh.receiveShadow = true; scene.add(modelMesh);
        controls.target.set(0, 0, Math.max(10, (g.boundingBox?.max.z ?? 40) / 2)); controls.update();
      },
      setProgress: value => {
        sim.progress = value;
        const count = segmentData.length;
        const visible = Math.floor(count * value);
        pathGeometry.setDrawRange(0, visible * 2);
        extrusionMesh.count = visible;
        if (count) {
          const idx = Math.min(count - 1, Math.floor(value * count));
          const s = segmentData[idx]; const t = value >= 1 ? 1 : value * count - idx;
          nozzleGroup.position.lerpVectors(s.a, s.b, Math.max(0, Math.min(1, t)));
          nozzleGroup.position.z += 4.5;
        }
      },
      setLayerView: value => { if (modelMesh) modelMesh.visible = !value; },
      setNozzleDiameter: value => { nozzle.scale.setScalar(value / .4); extrusionRadius = value; },
      fit: () => { camera.position.set(95,-120,100); controls.target.set(0,0,20); controls.update(); },
      dispose: () => { cancelAnimationFrame(frame); controls.dispose(); renderer.dispose(); pathGeometry.dispose(); pathMaterial.dispose(); extrusionGeometry.dispose(); extrusionMaterial.dispose(); modelMaterial.dispose(); }
    };
    sceneApi.current = api;
    const resize = () => { const w=host.clientWidth,h=host.clientHeight; camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h); };
    const observer = new ResizeObserver(resize); observer.observe(host);
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate);
      controls.update();
      if (time - lastUi > 90) { pathGeometry.setDrawRange(0, Math.floor(segmentData.length * sim.progress) * 2); lastUi = time; }
      renderer.render(scene,camera);
    };
    frame = requestAnimationFrame(animate);
    const setSegmentsForScene = (next: PrintSegment[]) => {
      segmentData = next;
      const coords: number[] = [];
      scene.remove(extrusionMesh);
      extrusionMesh = new THREE.InstancedMesh(extrusionGeometry, extrusionMaterial, Math.max(1, next.length));
      extrusionMesh.count = 0; extrusionMesh.frustumCulled = false; scene.add(extrusionMesh);
      next.forEach((s, i) => {
        coords.push(s.a.x,s.a.y,s.a.z,s.b.x,s.b.y,s.b.z);
        const direction = new THREE.Vector3().subVectors(s.b, s.a);
        const length = direction.length();
        if (length > 1e-6) {
          instance.position.copy(s.a).add(s.b).multiplyScalar(.5);
          instance.quaternion.setFromUnitVectors(up, direction.normalize());
          instance.scale.set(extrusionRadius, length, extrusionRadius);
          instance.updateMatrix();
          extrusionMesh.setMatrixAt(i, instance.matrix);
        }
      });
      extrusionMesh.instanceMatrix.needsUpdate = true;
      pathGeometry.setAttribute("position",new THREE.Float32BufferAttribute(coords,3));
      pathGeometry.computeBoundingSphere(); pathGeometry.setDrawRange(0,0);
    };
    (api as any).setSegments = setSegmentsForScene;
    return () => { observer.disconnect(); api.dispose(); sceneApi.current=null; host.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => { (sceneApi.current as any)?.setSegments?.(segments); sceneApi.current?.setProgress(progress); }, [segments, progress]);
  useEffect(() => { sceneApi.current?.setNozzleDiameter(settings.nozzle); }, [settings.nozzle]);
  useEffect(() => { sceneApi.current?.setLayerView(layerView); }, [layerView]);
  useEffect(() => { if (model) prepareGeometry(model.geometry, model.color, model.english); }, [model, prepareGeometry]);
  useEffect(() => { if (!model || !segments.length) return; const timer = window.setTimeout(() => prepareGeometry(model.geometry, model.color, model.english), 250); return () => clearTimeout(timer); }, [settings.layerHeight, settings.infill, settings.nozzle, settings.wallCount, model, prepareGeometry]);

  useEffect(() => {
    let raf = 0, previous = 0, ui = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!playing || !total) { previous = now; return; }
      if (!previous) previous = now;
      const dt = Math.min(.1, (now - previous) / 1000); previous = now;
      setElapsed(v => v + dt);
      setProgress(p => {
        const next = Math.min(1, p + dt * settings.speed * speed / Math.max(1, totalPathLength));
        sceneApi.current?.setProgress(next);
        if (next >= 1) { setPlaying(false); setMessage("چاپ شبیه‌سازی‌شده با موفقیت به پایان رسید"); }
        return next;
      });
      ui = now;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, totalPathLength, settings.speed, speed]);

  const chooseSample = (sample: SampleModel) => { setModel(sample); setShowLibrary(false); };
  const loadFile = (file?: File) => {
    if (!file) return;
    if (!/\.stl$/i.test(file.name)) { setError("فرمت فایل باید STL باشد."); return; }
    if (file.size > 80 * 1024 * 1024) { setError("حجم فایل بیشتر از سقف ۸۰ مگابایت است."); return; }
    setMessage("در حال بارگذاری فایل STL…"); setError("");
    const reader = new FileReader();
    reader.onerror = () => setError("خواندن فایل با خطا مواجه شد.");
    reader.onload = () => {
      try {
        const loader = new STLLoader();
        const geometry = loader.parse(reader.result as ArrayBuffer);
        geometry.computeVertexNormals();
        if (!geometry.getAttribute("position")?.count) throw new Error("فایل STL فاقد هندسه معتبر است.");
        const item: SampleModel = { id: "upload", name: file.name, english: file.name, description: "فایل واردشده توسط کاربر", geometry, color: "#56d6b0" };
        setModel(item);
      } catch (e) { setError(e instanceof Error ? e.message : "فایل STL قابل پردازش نیست."); }
    };
    reader.readAsArrayBuffer(file);
  };
  const updateSetting = (key: keyof PrintSettings, value: number) => setSettings(s => ({ ...s, [key]: value }));
  const reset = () => { setPlaying(false); setProgress(0); setElapsed(0); sceneApi.current?.setProgress(0); setMessage("شبیه‌سازی از ابتدا آماده است"); };
  const togglePlay = () => { if (progress >= 1) reset(); else { setPlaying(v => !v); setMessage(playing ? "شبیه‌سازی متوقف شد" : "چاپ در حال اجراست"); } };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); };
  const downloadPath = () => {
    const rows = ["; مسیرهای نمایشی — G-code تأییدشده برای دستگاه نیست", "; X Y Z F E"];
    segments.forEach(s => rows.push(`G1 X${s.b.x.toFixed(3)} Y${s.b.y.toFixed(3)} Z${s.b.z.toFixed(3)} F${settings.speed * 60} E1`));
    const blob = new Blob([rows.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="visual-toolpath-preview.txt"; a.click(); URL.revokeObjectURL(url);
  };

  return <main className="app-shell" onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}>
    {dragging && <div className="drop-overlay"><UploadCloud size={42}/><strong>فایل STL را اینجا رها کنید</strong><span>حداکثر حجم فایل: ۸۰ مگابایت</span></div>}
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Box size={22}/></div><div><strong>PRINTER<span>LAB</span></strong><small>3D PRINT SIMULATOR</small></div></div>
      <div className="top-center"><span className="live-dot"/><span>محیط شبیه‌سازی</span><i/> <span className="muted">کنترل و تحلیل فرایند چاپ</span></div>
      <div className="top-actions"><button className="icon-button" title="راهنما" onClick={()=>setMessage("فایل STL را بکشید و رها کنید؛ سپس تنظیمات و شروع چاپ را انتخاب کنید.")}><CircleHelp size={18}/></button><button className="upload-button" onClick={()=>fileRef.current?.click()}><FileUp size={17}/> بارگذاری STL</button><input ref={fileRef} hidden type="file" accept=".stl,model/stl" onChange={e=>loadFile(e.target.files?.[0])}/></div>
    </header>

    <div className="workspace">
      <section className="center-stage">
        <div className="viewport-toolbar"><div className="view-label"><span className="status-pill"><span/> آماده</span><strong>{modelName}</strong></div><div className="view-tools"><button onClick={()=>sceneApi.current?.fit()} title="نمایش کامل"><Maximize2 size={16}/></button><button onClick={()=>setLayerView(v=>!v)} className={layerView?"selected":""} title="نمایش لایه‌ها"><Layers3 size={16}/></button><span className="axis-label">X <b>Y</b> Z</span></div></div>
        <div className="viewport" ref={viewportRef}>
          <div className="viewport-hint"><span>DRAG</span> چرخش <i/> SCROLL زوم <i/> SHIFT + DRAG جابه‌جایی</div>
          <div className="build-label">BUILD VOLUME <span>100 × 100 × 150 mm</span></div>
          {error && <div className="error-toast"><X size={15}/>{error}</div>}
        </div>
        <div className="scene-footer"><div><span className="legend-dot model-dot"/> مدل سه‌بعدی <span className="legend-dot path-dot"/> مسیر اکستروژن <span className="legend-dot nozzle-dot"/> نازل</div><button onClick={downloadPath} disabled={!segments.length}><Download size={14}/> خروجی مسیر نمایشی</button></div>
        <div className="timeline-panel">
          <div className="timeline-head"><div><span className="eyebrow">PRINT PROGRESS</span><strong>پیشرفت شبیه‌سازی</strong></div><strong className="progress-number">{fmt(progress*100,0)}<small>٪</small></strong></div>
          <input className="progress-slider" type="range" min="0" max="1000" value={Math.round(progress*1000)} onChange={e=>{setPlaying(false);const p=Number(e.target.value)/1000;setProgress(p);sceneApi.current?.setProgress(p);}} style={{"--progress":`${progress*100}%`} as CSSProperties}/>
          <div className="timeline-meta"><span>شروع</span><span>لایه {fmt(currentLayer,0)} از {fmt(layers.length,0)}</span><span>پایان</span></div>
          <div className="transport">
            <button className="reset-btn" onClick={reset} title="شروع مجدد"><RotateCcw size={17}/></button>
            <button className="play-btn" onClick={togglePlay}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}{playing?"توقف موقت":progress>0&&progress<1?"ادامه چاپ":"شروع چاپ"}</button>
            <div className="speed-control"><Gauge size={16}/><select value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.25,.5,1,2,4,8].map(v=><option key={v} value={v}>{v}x</option>)}</select><ChevronDown size={13}/></div>
            <button className="step-btn" onClick={()=>{setPlaying(false);const p=Math.max(0,progress-1/Math.max(1,layers.length));setProgress(p);sceneApi.current?.setProgress(p);}}><ChevronLeft size={15}/> لایه قبل</button><button className="step-btn" onClick={()=>{setPlaying(false);const p=Math.min(1,progress+1/Math.max(1,layers.length));setProgress(p);sceneApi.current?.setProgress(p);}}><Layers3 size={16}/> لایه بعد</button>
          </div>
        </div>
      </section>

      <aside className="right-panel">
        <div className="panel-section model-section"><div className="section-title"><div><Box size={17}/><strong>مدل انتخاب‌شده</strong></div><button onClick={()=>setShowLibrary(v=>!v)}>{showLibrary?"بستن":"کتابخانه"} <ChevronDown size={14}/></button></div>
          {showLibrary ? <div className="sample-grid">{samples.map(s=><button className="sample-card" key={s.id} onClick={()=>chooseSample(s)}><div className="sample-preview"><Box size={25}/></div><strong>{s.name}</strong><small>{s.english}</small></button>)}</div> : <div className="model-card"><div className="model-preview"><Box size={35}/><span>STL / 3D</span></div><div className="model-info"><strong>{model?.name ?? modelName}</strong><small>{model?.description ?? "مدل بارگذاری‌شده"}</small><button onClick={()=>setShowLibrary(true)}>انتخاب مدل نمونه <ChevronDown size={13}/></button></div></div>}
          <div className="dimensions"><div><small>عرض X</small><strong>{fmt(stats.size.x)} <i>mm</i></strong></div><div><small>عمق Y</small><strong>{fmt(stats.size.y)} <i>mm</i></strong></div><div><small>ارتفاع Z</small><strong>{fmt(stats.size.z)} <i>mm</i></strong></div></div>
        </div>
        <div className="panel-section"><div className="section-title"><div><SlidersHorizontal size={17}/><strong>پارامترهای چاپ</strong></div><span className="parameter-count">۸ پارامتر قابل تنظیم</span><button onClick={()=>setShowSettings(v=>!v)}><Settings2 size={15}/></button></div>
          {showSettings && <div className="settings-list">
            <Setting label="ارتفاع لایه" detail="Layer Height" description="ضخامت هر لایه در محور Z؛ مقدار کمتر جزئیات سطح را بیشتر و تعداد لایه‌ها و زمان پردازش را افزایش می‌دهد." value={settings.layerHeight} min={.08} max={.4} step={.02} unit="mm" onChange={v=>updateSetting("layerHeight",v)}/>
            <Setting label="قطر نازل" detail="Nozzle Diameter" description="عرض اسمی خروجی نازل؛ در فاصله خطوط داخلی و سطح مقطع تقریبی رشته اکستروژن استفاده می‌شود." value={settings.nozzle} min={.2} max={1} step={.05} unit="mm" onChange={v=>updateSetting("nozzle",v)}/>
            <Setting label="قطر فیلامنت" detail="Filament Diameter" description="قطر رشته ورودی؛ برای تبدیل حجم ماده تخمینی به طول فیلامنت مصرفی به کار می‌رود." value={settings.filament} min={1.5} max={3} step={.05} unit="mm" onChange={v=>updateSetting("filament",v)}/>
            <Setting label="تعداد دیواره" detail="Wall Count" description="تعداد مسیرهای پیرامونی هر لایه؛ با افزایش آن، مسیرهای مرزی بیشتری در داخل پوسته ساخته می‌شود." value={settings.wallCount} min={1} max={5} step={1} unit="خط" onChange={v=>updateSetting("wallCount",v)}/>
            <Setting label="سرعت چاپ" detail="Print Speed" description="سرعت حرکت هد در شبیه‌سازی؛ روی سرعت پخش مسیر و زمان باقی‌مانده اثر مستقیم دارد." value={settings.speed} min={15} max={120} step={5} unit="mm/s" onChange={v=>updateSetting("speed",v)}/>
            <Setting label="تراکم داخلی" detail="Infill Density" description="درصد پرشدگی فضای داخلی؛ صفر یعنی بدون پرشدگی و مقدار بیشتر یعنی خطوط داخلی متراکم‌تر." value={settings.infill} min={0} max={80} step={5} unit="٪" onChange={v=>updateSetting("infill",v)}/>
            <Setting label="دمای نازل" detail="Nozzle Temperature" description="دمای هدف برای اکسترودر؛ در این نسخه به‌عنوان مقدار تنظیمی نمایش داده می‌شود و شبیه‌سازی انتقال حرارت انجام نمی‌شود." value={settings.nozzleTemp} min={180} max={250} step={5} unit="°C" onChange={v=>updateSetting("nozzleTemp",v)}/>
            <Setting label="دمای صفحه" detail="Bed Temperature" description="دمای هدف صفحه ساخت؛ برای ثبت تنظیمات فرایند استفاده می‌شود و مدل حرارتی واقعی صفحه در محاسبات وجود ندارد." value={settings.bedTemp} min={0} max={100} step={5} unit="°C" onChange={v=>updateSetting("bedTemp",v)}/>
          </div>}
          <div className="setting-note"><Zap size={13}/> تغییر ارتفاع لایه، قطر نازل، تعداد دیواره و تراکم داخلی مسیرها را دوباره می‌سازد. سرعت، قطر فیلامنت و ابعاد مسیر در برآورد زمان و مصرف ماده استفاده می‌شوند. دماها فعلاً نقاط تنظیم هستند، نه شبیه‌سازی حرارتی.</div>
        </div>
        <div className="panel-section stats-section"><div className="section-title"><div><Activity size={17}/><strong>آمار فرایند</strong></div><span className="estimate-tag">تخمینی</span></div>
          <div className="stat-grid"><Stat icon={<Layers3/>} label="تعداد لایه‌ها" value={fmt(layers.length,0)}/><Stat icon={<Clock3/>} label="زمان باقی‌مانده" value={formatTime(remaining)}/><Stat icon={<Thermometer/>} label="دمای هدف نازل" value={`${fmt(settings.nozzleTemp,0)}°C`}/><Stat icon={<Thermometer/>} label="دمای هدف صفحه" value={`${fmt(settings.bedTemp,0)}°C`}/></div>
          <div className="material-row"><span>طول کل مسیر اکستروژن</span><strong>{fmt(totalPathLength/1000,2)} m</strong></div>
          <div className="material-row"><span>مصرف فیلامنت (تخمین PLA)</span><strong>{fmt(filamentLength/1000,2)} m · {fmt(filamentWeight,1)} g</strong></div>
          <div className="material-row"><span>حجم هندسی مدل</span><strong>{fmt(stats.volume/1000,2)} cm³</strong></div>
          <div className="material-row"><span>زمان سپری‌شده</span><strong>{formatTime(elapsed)}</strong></div>
        </div>
        <div className="panel-status"><span className={playing?"live-dot":""}/><span>{message}</span></div>
      </aside>
    </div>
    <footer className="app-footer"><span>PRINTER LAB <i>•</i> شبیه‌ساز تعاملی چاپ سه‌بعدی</span><span className="creator-credit">Created by <strong>Armin Mehraein</strong></span><span>پردازش محلی در مرورگر <b>●</b></span></footer>
  </main>;
}

function Setting({label,detail,description,value,min,max,step,unit,onChange}:{label:string;detail:string;description:string;value:number;min:number;max:number;step:number;unit:string;onChange:(v:number)=>void}) {
  return <div className="setting-row"><div className="setting-label"><label>{label}<small className="setting-detail">{detail}</small></label><strong>{fmt(value,2)} <small>{unit}</small></strong></div><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/><p className="setting-description">{description}</p></div>;
}
function Stat({icon,label,value}:{icon:ReactNode;label:string;value:string}) {
  return <div className="stat-card"><div className="stat-icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div>;
}
